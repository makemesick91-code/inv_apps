<?php

namespace App\Services;

use App\Exceptions\InsufficientStockException;
use App\Models\Inventory;
use App\Models\InventoryBatch;
use App\Models\StockTransfer;
use App\Models\Transaction;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Single source of truth for all stock-mutating operations.
 *
 * Every public method acquires a row-level lock on the affected batch(es)
 * inside a DB transaction so that concurrent requests cannot oversell stock
 * or desync the cached aggregate in `inventories.quantity`.
 *
 * Negative stock is impossible: `inventory_batches.quantity` is `UNSIGNED`
 * (hard DB guard), and `recordOut()` validates against the locked snapshot
 * before mutating (soft guard with a clean 422 response).
 */
class StockMovementService
{
    /**
     * Add stock to a (room, item, batch_code) combination. Creates the batch if
     * missing, otherwise increments the existing batch.
     */
    public function recordIn(
        int $roomId,
        int $itemId,
        ?string $batchCode,
        float $quantity,
        ?CarbonInterface $expirationDate,
        int $userId,
        CarbonInterface $transactionDate,
        ?string $notes = null,
    ): Transaction {
        abort_if($quantity <= 0, 422, 'Jumlah harus lebih dari nol.');

        return DB::transaction(function () use (
            $roomId, $itemId, $batchCode, $quantity, $expirationDate, $userId, $transactionDate, $notes
        ) {
            $batch = InventoryBatch::where('room_id', $roomId)
                ->where('item_id', $itemId)
                ->where('batch_code', $batchCode)
                ->lockForUpdate()
                ->first();

            if ($batch) {
                $batch->increment('quantity', $quantity);
                if ($expirationDate && ! $batch->expiration_date) {
                    $batch->update(['expiration_date' => $expirationDate]);
                }
            } else {
                $batch = InventoryBatch::create([
                    'room_id' => $roomId,
                    'item_id' => $itemId,
                    'batch_code' => $batchCode,
                    'quantity' => $quantity,
                    'expiration_date' => $expirationDate,
                ]);
            }

            $this->syncInventoryAggregate($roomId, $itemId);

            return Transaction::create([
                'batch_id' => $batch->id,
                'user_id' => $userId,
                'type' => 'in',
                'quantity' => $quantity,
                'transaction_date' => $transactionDate,
                'notes' => $notes,
            ]);
        });
    }

    /**
     * Remove stock from a specific batch (normal usage / "barang keluar").
     * See decrementBatch() for the locking and validation semantics.
     */
    public function recordOut(
        int $batchId,
        float $quantity,
        int $userId,
        CarbonInterface $transactionDate,
        ?string $notes = null,
    ): Transaction {
        return $this->decrementBatch('out', $batchId, $quantity, $userId, $transactionDate, $notes);
    }

    /**
     * Write off stock that is not a normal usage — damaged, expired, lost, etc.
     * Same locking semantics as recordOut; only the transaction type differs so
     * reports can distinguish actual consumption from inventory loss.
     */
    public function recordWriteOff(
        int $batchId,
        float $quantity,
        int $userId,
        CarbonInterface $transactionDate,
        ?string $notes = null,
    ): Transaction {
        return $this->decrementBatch('write_off', $batchId, $quantity, $userId, $transactionDate, $notes);
    }

    /**
     * Throws InsufficientStockException if the locked batch holds less than
     * requested. Concurrency-safe: the batch row is locked before the check so
     * two parallel requests cannot both pass validation.
     */
    private function decrementBatch(
        string $type,
        int $batchId,
        float $quantity,
        int $userId,
        CarbonInterface $transactionDate,
        ?string $notes,
    ): Transaction {
        abort_if($quantity <= 0, 422, 'Jumlah harus lebih dari nol.');

        return DB::transaction(function () use ($type, $batchId, $quantity, $userId, $transactionDate, $notes) {
            $batch = InventoryBatch::where('id', $batchId)->lockForUpdate()->firstOrFail();

            if ((float) $batch->quantity < $quantity) {
                throw new InsufficientStockException(
                    available: (float) $batch->quantity,
                    requested: $quantity,
                );
            }

            $batch->decrement('quantity', $quantity);

            $this->syncInventoryAggregate($batch->room_id, $batch->item_id);

            return Transaction::create([
                'batch_id' => $batch->id,
                'user_id' => $userId,
                'type' => $type,
                'quantity' => $quantity,
                'transaction_date' => $transactionDate,
                'notes' => $notes,
            ]);
        });
    }

    /**
     * Used by stock opname: set a batch's quantity to an absolute physical
     * count. Records an `adjustment_in` or `adjustment_out` transaction
     * for the difference (or none if the count matches). Returns null when
     * no adjustment was needed.
     */
    public function applyOpnameAdjustment(
        int $batchId,
        float $physicalQty,
        int $userId,
        CarbonInterface $transactionDate,
        string $notes,
    ): ?Transaction {
        abort_if($physicalQty < 0, 422, 'Jumlah fisik tidak boleh negatif.');

        return DB::transaction(function () use ($batchId, $physicalQty, $userId, $transactionDate, $notes) {
            $batch = InventoryBatch::where('id', $batchId)->lockForUpdate()->firstOrFail();

            $diff = $physicalQty - (float) $batch->quantity;
            // Use small epsilon for float comparison to avoid spurious adjustments
            // from rounding noise (e.g., 0.001 input vs 0.000999999...).
            if (abs($diff) < 0.0005) {
                return null;
            }

            $batch->update(['quantity' => $physicalQty]);
            $this->syncInventoryAggregate($batch->room_id, $batch->item_id);

            return Transaction::create([
                'batch_id' => $batch->id,
                'user_id' => $userId,
                'type' => $diff > 0 ? 'adjustment_in' : 'adjustment_out',
                'quantity' => abs($diff),
                'transaction_date' => $transactionDate,
                'notes' => $notes,
            ]);
        });
    }

    /**
     * Transfer stock from one batch to another room atomically. The destination
     * batch is identified by matching (dest_room_id, item_id, batch_code) of
     * the source — found-or-created with the source batch's expiration_date so
     * batch identity is preserved across rooms.
     *
     * Both batches are locked before any mutation. Writes two transactions
     * (transfer_out + transfer_in) linked via transfer_id, and a single
     * StockTransfer header. All inside one DB transaction.
     */
    public function recordTransfer(
        int $sourceBatchId,
        int $destRoomId,
        float $quantity,
        int $userId,
        CarbonInterface $transferDate,
        ?string $notes = null,
    ): StockTransfer {
        abort_if($quantity <= 0, 422, 'Jumlah harus lebih dari nol.');

        return DB::transaction(function () use (
            $sourceBatchId, $destRoomId, $quantity, $userId, $transferDate, $notes
        ) {
            $source = InventoryBatch::where('id', $sourceBatchId)->lockForUpdate()->firstOrFail();

            if ($source->room_id === $destRoomId) {
                throw new HttpException(422, 'Ruangan tujuan harus berbeda dari ruangan asal.');
            }

            if ((float) $source->quantity < $quantity) {
                throw new InsufficientStockException(
                    available: (float) $source->quantity,
                    requested: $quantity,
                );
            }

            // Find existing matching batch at destination (same item + batch_code), or create new
            $dest = InventoryBatch::where('room_id', $destRoomId)
                ->where('item_id', $source->item_id)
                ->where('batch_code', $source->batch_code)
                ->lockForUpdate()
                ->first();

            if (! $dest) {
                $dest = InventoryBatch::create([
                    'room_id' => $destRoomId,
                    'item_id' => $source->item_id,
                    'batch_code' => $source->batch_code,
                    'quantity' => 0,
                    'expiration_date' => $source->expiration_date,
                ]);
            }

            $source->decrement('quantity', $quantity);
            $dest->increment('quantity', $quantity);

            $this->syncInventoryAggregate($source->room_id, $source->item_id);
            $this->syncInventoryAggregate($destRoomId, $source->item_id);

            $transfer = StockTransfer::create([
                'source_batch_id' => $source->id,
                'dest_batch_id' => $dest->id,
                'user_id' => $userId,
                'quantity' => $quantity,
                'transfer_date' => $transferDate,
                'notes' => $notes,
            ]);

            Transaction::create([
                'batch_id' => $source->id,
                'user_id' => $userId,
                'transfer_id' => $transfer->id,
                'type' => 'transfer_out',
                'quantity' => $quantity,
                'transaction_date' => $transferDate,
                'notes' => "Transfer #{$transfer->id}",
            ]);

            Transaction::create([
                'batch_id' => $dest->id,
                'user_id' => $userId,
                'transfer_id' => $transfer->id,
                'type' => 'transfer_in',
                'quantity' => $quantity,
                'transaction_date' => $transferDate,
                'notes' => "Transfer #{$transfer->id}",
            ]);

            return $transfer;
        });
    }

    /**
     * Recompute and cache `inventories.quantity` from the sum of its batches.
     * Called inside the same transaction as the batch mutation, so the
     * aggregate is always consistent with batch state.
     */
    private function syncInventoryAggregate(int $roomId, int $itemId): void
    {
        $total = (float) InventoryBatch::where('room_id', $roomId)
            ->where('item_id', $itemId)
            ->sum('quantity');

        Inventory::updateOrCreate(
            ['room_id' => $roomId, 'item_id' => $itemId],
            ['quantity' => $total]
        );
    }
}
