<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryBatch;
use App\Models\Room;
use App\Models\StockTransfer;
use App\Services\StockMovementService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class StockTransferController extends Controller
{
    public function __construct(private readonly StockMovementService $stock)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $allowedBranchIds = $user->scopedBranchIds();

        $query = StockTransfer::with([
            'sourceBatch.item:id,item_name,unit',
            'sourceBatch.room.branch:id,branch_name',
            'destBatch.room.branch:id,branch_name',
            'user:id,name',
        ])
            ->orderByDesc('transfer_date')
            ->orderByDesc('id');

        if ($allowedBranchIds !== null) {
            // Show transfers where either side touched a branch in scope.
            $query->where(function ($q) use ($allowedBranchIds) {
                $q->whereHas('sourceBatch.room', fn ($r) => $r->whereIn('branch_id', $allowedBranchIds))
                    ->orWhereHas('destBatch.room', fn ($r) => $r->whereIn('branch_id', $allowedBranchIds));
            });
        }

        return response()->json($query->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'source_batch_id' => 'required|exists:inventory_batches,id',
            'dest_room_id' => 'required|exists:rooms,id',
            'quantity' => 'required|numeric|gt:0',
            'transfer_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        $user = $request->user();
        $allowedBranchIds = $user->scopedBranchIds();

        if ($allowedBranchIds !== null) {
            $sourceBatch = InventoryBatch::findOrFail($data['source_batch_id']);
            $sourceBranchId = (int) Room::where('id', $sourceBatch->room_id)->value('branch_id');
            $destBranchId = (int) Room::where('id', $data['dest_room_id'])->value('branch_id');

            $sourceInScope = in_array($sourceBranchId, $allowedBranchIds, true);
            $destInScope = in_array($destBranchId, $allowedBranchIds, true);

            if (! $sourceInScope || ! $destInScope) {
                throw new HttpException(
                    403,
                    'Sumber dan tujuan transfer harus berada di cabang Anda. Transfer lintas-cabang hanya dapat dilakukan oleh Owner.'
                );
            }
        }

        $transfer = $this->stock->recordTransfer(
            sourceBatchId: (int) $data['source_batch_id'],
            destRoomId: (int) $data['dest_room_id'],
            quantity: (float) $data['quantity'],
            userId: $user->id,
            transferDate: Carbon::parse($data['transfer_date']),
            notes: $data['notes'] ?? null,
        );

        return response()->json([
            'data' => $transfer->load([
                'sourceBatch.item',
                'sourceBatch.room.branch',
                'destBatch.room.branch',
                'user:id,name',
            ]),
            'message' => 'Transfer berhasil dilakukan.',
        ], 201);
    }
}
