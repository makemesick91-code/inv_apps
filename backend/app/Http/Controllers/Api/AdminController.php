<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Room;
use App\Services\InventoryConsistencyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AdminController extends Controller
{
    public function __construct(private readonly InventoryConsistencyService $consistency)
    {
    }

    public function inventoryDriftScan(Request $request): JsonResponse
    {
        $this->ensureOwner($request);
        return response()->json($this->withLabels($this->consistency->scan()));
    }

    public function inventoryDriftFix(Request $request): JsonResponse
    {
        $this->ensureOwner($request);

        $data = $request->validate([
            'selection' => 'nullable|array',
            'selection.mismatched' => 'nullable|array',
            'selection.mismatched.*.room_id' => 'required_with:selection.mismatched|integer',
            'selection.mismatched.*.item_id' => 'required_with:selection.mismatched|integer',
            'selection.missing' => 'nullable|array',
            'selection.missing.*.room_id' => 'required_with:selection.missing|integer',
            'selection.missing.*.item_id' => 'required_with:selection.missing|integer',
            'selection.orphan' => 'nullable|array',
            'selection.orphan.*' => 'integer',
        ]);

        $result = $this->consistency->fix($data['selection'] ?? null);
        $after = $this->consistency->scan();

        return response()->json([
            'message' => sprintf(
                '%d mismatch diperbaiki, %d aggregate dibuat, %d orphan di-nol-kan.',
                $result['mismatchedFixed'],
                $result['missingCreated'],
                $result['orphanZeroed'],
            ),
            'result' => $result,
            'after' => $this->withLabels($after),
        ]);
    }

    private function ensureOwner(Request $request): void
    {
        if (! $request->user()->isOwner()) {
            throw new HttpException(403, 'Diagnostik konsistensi hanya dapat diakses oleh Owner.');
        }
    }

    private function withLabels(array $drift): array
    {
        $rooms = Room::pluck('room_name', 'id');
        $items = Item::pluck('item_name', 'id');

        return [
            'mismatched' => array_map(fn ($r) => $r + [
                'room_name' => $rooms[$r['room_id']] ?? "#{$r['room_id']}",
                'item_name' => $items[$r['item_id']] ?? "#{$r['item_id']}",
            ], $drift['mismatched']),
            'missing' => array_map(fn ($r) => $r + [
                'room_name' => $rooms[$r['room_id']] ?? "#{$r['room_id']}",
                'item_name' => $items[$r['item_id']] ?? "#{$r['item_id']}",
            ], $drift['missing']),
            'orphan' => array_map(fn ($r) => $r + [
                'room_name' => $rooms[$r['room_id']] ?? "#{$r['room_id']}",
                'item_name' => $items[$r['item_id']] ?? "#{$r['item_id']}",
            ], $drift['orphan']),
            'total' => count($drift['mismatched']) + count($drift['missing']) + count($drift['orphan']),
        ];
    }
}
