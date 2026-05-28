<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryBatch;
use App\Models\Room;
use App\Models\StockOpname;
use App\Models\StockOpnameItem;
use App\Services\StockMovementService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class StockOpnameController extends Controller
{
    public function __construct(private readonly StockMovementService $stock)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = StockOpname::with(['room.branch', 'user:id,name'])
            ->withCount('items')
            ->orderByDesc('opname_date')
            ->orderByDesc('id');

        if ($user->isPerawat()) {
            if (! $user->room_id) {
                return response()->json(['data' => [], 'message' => 'Belum ditugaskan ke ruangan.'], 200);
            }
            $query->where('room_id', $user->room_id);
        } else {
            $allowedBranchIds = $user->scopedBranchIds();
            if ($allowedBranchIds !== null) {
                $query->whereHas('room', fn ($q) => $q->whereIn('branch_id', $allowedBranchIds));
            }
        }

        return response()->json($query->paginate(20));
    }

    public function prepare(Request $request): JsonResponse
    {
        $data = $request->validate([
            'room_id' => 'required|exists:rooms,id',
        ]);

        $this->ensureUserCanAccessRoom($request, (int) $data['room_id']);

        $room = Room::with('branch')->findOrFail($data['room_id']);

        $batches = InventoryBatch::where('room_id', $room->id)
            ->with('item:id,item_name,sku,unit')
            ->orderBy('expiration_date')
            ->orderBy('id')
            ->get(['id', 'room_id', 'item_id', 'batch_code', 'quantity', 'expiration_date']);

        return response()->json([
            'room' => [
                'id' => $room->id,
                'room_name' => $room->room_name,
                'branch' => $room->branch ? [
                    'id' => $room->branch->id,
                    'branch_name' => $room->branch->branch_name,
                ] : null,
            ],
            'batches' => $batches,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'room_id' => 'required|exists:rooms,id',
            'opname_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
            'items' => 'required|array|min:1',
            'items.*.batch_id' => 'required|exists:inventory_batches,id',
            'items.*.physical_qty' => 'required|numeric|min:0',
            'items.*.notes' => 'nullable|string|max:255',
        ]);

        $this->ensureUserCanAccessRoom($request, (int) $data['room_id']);

        $userId = $request->user()->id;
        $roomId = (int) $data['room_id'];
        $opnameDate = Carbon::parse($data['opname_date']);

        $opname = DB::transaction(function () use ($data, $userId, $roomId, $opnameDate) {
            $opname = StockOpname::create([
                'room_id' => $roomId,
                'user_id' => $userId,
                'opname_date' => $opnameDate,
                'notes' => $data['notes'] ?? null,
                'total_items' => count($data['items']),
                'total_discrepancies' => 0,
            ]);

            $discrepancies = 0;

            foreach ($data['items'] as $line) {
                $batch = InventoryBatch::where('id', $line['batch_id'])
                    ->where('room_id', $roomId)
                    ->firstOrFail();

                $systemQty = (float) $batch->quantity;
                $physicalQty = (float) $line['physical_qty'];

                StockOpnameItem::create([
                    'stock_opname_id' => $opname->id,
                    'batch_id' => $batch->id,
                    'system_qty' => $systemQty,
                    'physical_qty' => $physicalQty,
                    'difference' => $physicalQty - $systemQty,
                    'notes' => $line['notes'] ?? null,
                ]);

                $adjustmentTx = $this->stock->applyOpnameAdjustment(
                    batchId: $batch->id,
                    physicalQty: $physicalQty,
                    userId: $userId,
                    transactionDate: $opnameDate,
                    notes: "Stock opname #{$opname->id}",
                );

                if ($adjustmentTx) {
                    $discrepancies++;
                }
            }

            $opname->update(['total_discrepancies' => $discrepancies]);

            return $opname;
        });

        return response()->json([
            'data' => $opname->load(['items.batch.item', 'room.branch', 'user:id,name']),
            'message' => 'Stock opname berhasil dicatat.',
        ], 201);
    }

    public function show(Request $request, StockOpname $stockOpname): JsonResponse
    {
        $this->ensureUserCanAccessRoom($request, (int) $stockOpname->room_id);

        return response()->json([
            'data' => $stockOpname->load([
                'room.branch',
                'user:id,name',
                'items.batch.item',
            ]),
        ]);
    }

    private function ensureUserCanAccessRoom(Request $request, int $roomId): void
    {
        $user = $request->user();

        if ($user->isPerawat()) {
            if ($user->room_id !== $roomId) {
                throw new HttpException(403, 'Anda hanya dapat melakukan opname di ruangan yang ditugaskan.');
            }
            return;
        }

        $allowedBranchIds = $user->scopedBranchIds();
        if ($allowedBranchIds === null) {
            return;
        }

        $branchId = \App\Models\Room::where('id', $roomId)->value('branch_id');
        if (! in_array((int) $branchId, $allowedBranchIds, true)) {
            throw new HttpException(403, 'Ruangan ini di luar jangkauan akses Anda.');
        }
    }
}
