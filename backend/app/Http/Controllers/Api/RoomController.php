<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class RoomController extends Controller
{
    public function indexAll(Request $request): JsonResponse
    {
        $user = $request->user();
        $allowed = $user->scopedBranchIds();

        $query = Room::with('branch')->orderBy('room_name');
        if ($allowed !== null) {
            $query->whereIn('branch_id', $allowed);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function index(Request $request, Branch $branch): JsonResponse
    {
        $this->ensureScope($request, $branch->id);

        $rooms = $branch->rooms()->orderBy('room_name')->get();

        return response()->json(['data' => $rooms]);
    }

    public function store(Request $request, Branch $branch): JsonResponse
    {
        $this->ensureScope($request, $branch->id);

        $data = $request->validate([
            'room_name' => [
                'required',
                'string',
                'max:255',
                function ($attribute, $value, $fail) use ($branch) {
                    if ($branch->rooms()->where('room_name', $value)->exists()) {
                        $fail('Nama ruangan sudah ada di cabang ini.');
                    }
                },
            ],
        ]);

        $room = $branch->rooms()->create($data);

        return response()->json(['data' => $room], 201);
    }

    public function show(Request $request, Room $room): JsonResponse
    {
        $this->ensureScope($request, $room->branch_id);

        return response()->json(['data' => $room->load('branch')]);
    }

    public function update(Request $request, Room $room): JsonResponse
    {
        $this->ensureScope($request, $room->branch_id);

        $data = $request->validate([
            'room_name' => [
                'required',
                'string',
                'max:255',
                function ($attribute, $value, $fail) use ($room) {
                    $exists = Room::where('branch_id', $room->branch_id)
                        ->where('room_name', $value)
                        ->where('id', '!=', $room->id)
                        ->exists();
                    if ($exists) {
                        $fail('Nama ruangan sudah ada di cabang ini.');
                    }
                },
            ],
        ]);

        $room->update($data);

        return response()->json(['data' => $room]);
    }

    public function destroy(Request $request, Room $room): JsonResponse
    {
        $this->ensureScope($request, $room->branch_id);

        $room->delete();

        return response()->json(['message' => 'Ruangan berhasil dihapus.']);
    }

    private function ensureScope(Request $request, int $branchId): void
    {
        $allowed = $request->user()->scopedBranchIds();
        if ($allowed !== null && ! in_array($branchId, $allowed, true)) {
            throw new HttpException(403, 'Cabang ini di luar jangkauan akses Anda.');
        }
    }
}
