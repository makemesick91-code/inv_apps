<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryBatch;
use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class InventoryController extends Controller
{
    /**
     * List active batches (quantity > 0) in a room, with item info.
     * Ordered FEFO (earliest expiration first, then by id).
     *
     * - Kepala_Cabang: must pass ?room_id
     * - Perawat: room_id is forced to their assigned room
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->isPerawat()) {
            if (! $user->room_id) {
                return response()->json([
                    'data' => [],
                    'message' => 'Anda belum ditugaskan ke ruangan manapun.',
                ]);
            }
            $roomId = $user->room_id;
        } else {
            $roomId = $request->query('room_id');
            if (! $roomId) {
                throw new HttpException(422, 'Parameter room_id wajib diisi.');
            }

            // Non-Owner Kepala must own the requested room's branch
            $allowedBranchIds = $user->scopedBranchIds();
            if ($allowedBranchIds !== null) {
                $branchId = \App\Models\Room::where('id', $roomId)->value('branch_id');
                if (! in_array((int) $branchId, $allowedBranchIds, true)) {
                    throw new HttpException(403, 'Ruangan ini di luar jangkauan akses Anda.');
                }
            }
        }

        $batches = InventoryBatch::where('room_id', (int) $roomId)
            ->where('quantity', '>', 0)
            ->with('item:id,item_name,sku,unit,min_stock_level')
            ->orderByRaw('expiration_date IS NULL, expiration_date ASC')
            ->orderBy('id')
            ->get();

        return response()->json(['data' => $batches]);
    }

    /**
     * Full transaction history for a single batch, oldest-first so callers
     * can render a running-balance timeline. Includes counter-party batch
     * info for transfer events (where this batch was the source/dest).
     *
     * Access rules mirror the rest of the inventory surface:
     *   - Perawat: batch must be in their assigned room
     *   - Scoped Kepala: batch's room must be in their branch
     *   - Owner: any batch
     */
    public function batchHistory(Request $request, InventoryBatch $batch): JsonResponse
    {
        $user = $request->user();
        $batch->load(['item:id,item_name,sku,unit', 'room.branch:id,branch_name']);

        if ($user->isPerawat()) {
            if ($batch->room_id !== $user->room_id) {
                throw new HttpException(403, 'Batch ini di luar ruangan tugas Anda.');
            }
        } else {
            $allowed = $user->scopedBranchIds();
            if ($allowed !== null && ! in_array((int) $batch->room->branch_id, $allowed, true)) {
                throw new HttpException(403, 'Batch ini di luar jangkauan akses Anda.');
            }
        }

        $transactions = Transaction::where('batch_id', $batch->id)
            ->with([
                'user:id,name',
                'transfer:id,source_batch_id,dest_batch_id',
                'transfer.sourceBatch:id,room_id,batch_code',
                'transfer.sourceBatch.room:id,branch_id,room_name',
                'transfer.sourceBatch.room.branch:id,branch_name',
                'transfer.destBatch:id,room_id,batch_code',
                'transfer.destBatch.room:id,branch_id,room_name',
                'transfer.destBatch.room.branch:id,branch_name',
            ])
            ->orderBy('transaction_date')
            ->orderBy('id')
            ->get();

        // Compute running balance forward from 0 (the only batch state we know
        // historically — the current quantity is the cumulative result, so
        // running balance is internally consistent with batch.quantity).
        $running = 0;
        $items = $transactions->map(function ($t) use (&$running, $batch) {
            $signed = match ($t->type) {
                'in', 'adjustment_in', 'transfer_in' => (float) $t->quantity,
                'out', 'adjustment_out', 'transfer_out', 'write_off' => -(float) $t->quantity,
                default => 0,
            };
            $running += $signed;

            $counterpart = null;
            if ($t->transfer) {
                $counterBatch = $t->type === 'transfer_out'
                    ? $t->transfer->destBatch
                    : $t->transfer->sourceBatch;
                if ($counterBatch && $counterBatch->id !== $batch->id) {
                    $counterpart = [
                        'batch_code' => $counterBatch->batch_code,
                        'room_name' => $counterBatch->room?->room_name,
                        'branch_name' => $counterBatch->room?->branch?->branch_name,
                    ];
                }
            }

            return [
                'id' => $t->id,
                'type' => $t->type,
                'quantity' => (float) $t->quantity,
                'signed_delta' => $signed,
                'running_balance' => $running,
                'transaction_date' => $t->transaction_date?->toDateString(),
                'created_at' => $t->created_at?->toIso8601String(),
                'notes' => $t->notes,
                'user' => $t->user ? ['id' => $t->user->id, 'name' => $t->user->name] : null,
                'transfer_counterpart' => $counterpart,
            ];
        })->all();

        return response()->json([
            'batch' => [
                'id' => $batch->id,
                'batch_code' => $batch->batch_code,
                'quantity' => (float) $batch->quantity,
                'expiration_date' => $batch->expiration_date?->toDateString(),
                'item' => $batch->item ? [
                    'id' => $batch->item->id,
                    'item_name' => $batch->item->item_name,
                    'sku' => $batch->item->sku,
                    'unit' => $batch->item->unit,
                ] : null,
                'room' => $batch->room ? [
                    'id' => $batch->room->id,
                    'room_name' => $batch->room->room_name,
                    'branch_name' => $batch->room->branch?->branch_name,
                ] : null,
            ],
            'transactions' => $items,
            'total_movements' => count($items),
        ]);
    }
}
