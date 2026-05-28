<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class BranchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $allowed = $user->scopedBranchIds();

        $query = Branch::withCount('rooms')->orderBy('branch_name');
        if ($allowed !== null) {
            $query->whereIn('id', $allowed);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureOwner($request);

        $data = $request->validate([
            'branch_name' => 'required|string|max:255|unique:branches,branch_name',
            'location' => 'nullable|string|max:255',
        ]);

        $branch = Branch::create($data);

        return response()->json(['data' => $branch], 201);
    }

    public function show(Request $request, Branch $branch): JsonResponse
    {
        $this->ensureScopeAllows($request, $branch->id);

        return response()->json(['data' => $branch->load('rooms')]);
    }

    public function update(Request $request, Branch $branch): JsonResponse
    {
        $this->ensureOwner($request);

        $data = $request->validate([
            'branch_name' => "required|string|max:255|unique:branches,branch_name,{$branch->id}",
            'location' => 'nullable|string|max:255',
        ]);

        $branch->update($data);

        return response()->json(['data' => $branch]);
    }

    public function destroy(Request $request, Branch $branch): JsonResponse
    {
        $this->ensureOwner($request);

        $branch->delete();

        return response()->json(['message' => 'Cabang berhasil dihapus.']);
    }

    /**
     * Only the Owner (Kepala without branch_id) can create / edit / delete
     * branches. Otherwise a branch-scoped Kepala could create their own
     * branch and assign themselves outside their original scope.
     */
    private function ensureOwner(Request $request): void
    {
        if (! $request->user()->isOwner()) {
            throw new HttpException(403, 'Hanya pemilik (Kepala tanpa cabang spesifik) yang dapat mengelola cabang.');
        }
    }

    private function ensureScopeAllows(Request $request, int $branchId): void
    {
        $allowed = $request->user()->scopedBranchIds();
        if ($allowed !== null && ! in_array($branchId, $allowed, true)) {
            throw new HttpException(403, 'Cabang ini di luar jangkauan akses Anda.');
        }
    }
}
