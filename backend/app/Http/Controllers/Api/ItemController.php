<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\InventoryBatch;
use App\Models\Item;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $categoryId = $request->query('category_id');

        $items = Item::query()
            ->with('category:id,name,color')
            ->when($search !== '', function ($query) use ($search) {
                $like = '%' . $search . '%';
                $query->where(function ($q) use ($like) {
                    $q->where('item_name', 'like', $like)
                        ->orWhere('sku', 'like', $like);
                });
            })
            ->when($categoryId, fn ($q) => $q->where('category_id', $categoryId))
            ->withSum('batches as total_stock', 'quantity')
            ->orderBy('item_name')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_name' => 'required|string|max:255|unique:items,item_name',
            'sku' => 'nullable|string|max:100|unique:items,sku',
            'unit' => 'required|string|max:20',
            'min_stock_level' => 'required|numeric|min:0',
            'category_id' => 'nullable|integer|exists:categories,id',
        ]);

        $item = Item::create($data);

        return response()->json(['data' => $item->load('category:id,name,color')], 201);
    }

    public function show(Item $item): JsonResponse
    {
        $item->load('category:id,name,color');
        $item->loadSum('batches as total_stock', 'quantity');

        return response()->json(['data' => $item]);
    }

    public function update(Request $request, Item $item): JsonResponse
    {
        $data = $request->validate([
            'item_name' => "required|string|max:255|unique:items,item_name,{$item->id}",
            'sku' => "nullable|string|max:100|unique:items,sku,{$item->id}",
            'unit' => 'required|string|max:20',
            'min_stock_level' => 'required|numeric|min:0',
            'category_id' => 'nullable|integer|exists:categories,id',
        ]);

        $item->update($data);

        return response()->json(['data' => $item->load('category:id,name,color')]);
    }

    public function bulkImport(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => 'required|array|min:1|max:500',
            'items.*.item_name' => 'required|string|max:255',
            'items.*.sku' => 'nullable|string|max:100',
            'items.*.unit' => 'required|string|max:20',
            'items.*.min_stock_level' => 'nullable|numeric|min:0',
            'items.*.category_name' => 'nullable|string|max:255',
        ]);

        // Pre-resolve category lookups (case-insensitive)
        $categoryMap = Category::query()
            ->get(['id', 'name'])
            ->mapWithKeys(fn ($c) => [mb_strtolower($c->name) => $c->id])
            ->all();

        // Check uniqueness across DB + within the batch itself
        $existingNames = Item::query()
            ->select('item_name')
            ->get()
            ->map(fn ($r) => mb_strtolower($r->item_name))
            ->all();
        $existingSkus = Item::query()
            ->whereNotNull('sku')
            ->pluck('sku')
            ->all();

        $rowErrors = [];
        $seenNames = [];
        $seenSkus = [];

        foreach ($data['items'] as $idx => $row) {
            $errors = [];

            $name = trim($row['item_name']);
            $nameLower = mb_strtolower($name);
            if (in_array($nameLower, $existingNames, true)) {
                $errors['item_name'] = ['Nama sudah ada di katalog.'];
            } elseif (isset($seenNames[$nameLower])) {
                $errors['item_name'] = [
                    'Duplikat dengan baris #' . ($seenNames[$nameLower] + 1) . ' di file ini.',
                ];
            }
            $seenNames[$nameLower] = $idx;

            $sku = ! empty($row['sku']) ? trim($row['sku']) : null;
            if ($sku) {
                if (in_array($sku, $existingSkus, true)) {
                    $errors['sku'] = ['SKU sudah dipakai item lain.'];
                } elseif (isset($seenSkus[$sku])) {
                    $errors['sku'] = [
                        'Duplikat dengan baris #' . ($seenSkus[$sku] + 1) . ' di file ini.',
                    ];
                }
                $seenSkus[$sku] = $idx;
            }

            if (! empty($row['category_name'])) {
                $catKey = mb_strtolower(trim($row['category_name']));
                if (! isset($categoryMap[$catKey])) {
                    $errors['category_name'] = ["Kategori '{$row['category_name']}' tidak ditemukan. Buat dulu di menu Kategori."];
                }
            }

            if (! empty($errors)) {
                $rowErrors[$idx] = $errors;
            }
        }

        if (! empty($rowErrors)) {
            return response()->json([
                'message' => 'Ditemukan ' . count($rowErrors) . ' baris dengan error. Tidak ada item yang diimpor.',
                'row_errors' => $rowErrors,
            ], 422);
        }

        $imported = DB::transaction(function () use ($data, $categoryMap) {
            $count = 0;
            foreach ($data['items'] as $row) {
                $categoryId = null;
                if (! empty($row['category_name'])) {
                    $categoryId = $categoryMap[mb_strtolower(trim($row['category_name']))] ?? null;
                }
                Item::create([
                    'item_name' => trim($row['item_name']),
                    'sku' => ! empty($row['sku']) ? trim($row['sku']) : null,
                    'unit' => trim($row['unit']),
                    'min_stock_level' => (float) ($row['min_stock_level'] ?? 0),
                    'category_id' => $categoryId,
                ]);
                $count++;
            }
            return $count;
        });

        return response()->json([
            'message' => "Berhasil mengimpor {$imported} item.",
            'imported' => $imported,
        ], 201);
    }

    public function destroy(Item $item): JsonResponse
    {
        $activeStock = (int) InventoryBatch::where('item_id', $item->id)
            ->where('quantity', '>', 0)
            ->sum('quantity');

        if ($activeStock > 0) {
            throw new HttpException(
                422,
                "Item tidak dapat dihapus karena masih ada stok aktif sebanyak {$activeStock} unit di berbagai ruangan. Habiskan atau pindahkan stok terlebih dahulu."
            );
        }

        $item->delete();

        return response()->json(['message' => 'Item berhasil dihapus.']);
    }
}
