<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CategoryController extends Controller
{
    private const ALLOWED_COLORS = ['blue', 'emerald', 'amber', 'red', 'violet', 'slate'];

    public function index(): JsonResponse
    {
        $categories = Category::query()
            ->withCount('items')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $categories]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:categories,name',
            'color' => 'nullable|in:' . implode(',', self::ALLOWED_COLORS),
        ]);

        $category = Category::create([
            'name' => trim($data['name']),
            'color' => $data['color'] ?? 'slate',
        ]);

        return response()->json(['data' => $category], 201);
    }

    public function show(Category $category): JsonResponse
    {
        $category->loadCount('items');
        return response()->json(['data' => $category]);
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate([
            'name' => "required|string|max:255|unique:categories,name,{$category->id}",
            'color' => 'nullable|in:' . implode(',', self::ALLOWED_COLORS),
        ]);

        $category->update([
            'name' => trim($data['name']),
            'color' => $data['color'] ?? $category->color,
        ]);

        return response()->json(['data' => $category]);
    }

    public function destroy(Category $category): JsonResponse
    {
        $itemCount = $category->items()->count();
        if ($itemCount > 0) {
            throw new HttpException(
                422,
                "Tidak dapat menghapus: kategori ini masih dipakai oleh {$itemCount} item. Pindahkan item ke kategori lain terlebih dahulu."
            );
        }

        $category->delete();

        return response()->json(['message' => 'Kategori berhasil dihapus.']);
    }
}
