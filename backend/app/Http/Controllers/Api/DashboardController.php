<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryBatch;
use App\Models\Item;
use App\Models\Transaction;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    private const EXPIRY_THRESHOLD_DAYS = 30;
    private const LIST_LIMIT = 8;

    public function index(Request $request): JsonResponse
    {
        $today = Carbon::today();
        $expiryCutoff = $today->copy()->addDays(self::EXPIRY_THRESHOLD_DAYS);
        $weekAgo = $today->copy()->subDays(7);

        $allowedBranchIds = $request->user()->scopedBranchIds();

        return response()->json([
            'stats' => $this->stats($expiryCutoff, $weekAgo, $allowedBranchIds),
            'critical_items' => $this->criticalItems($allowedBranchIds),
            'expiring_batches' => $this->expiringBatches($expiryCutoff, $allowedBranchIds),
        ]);
    }

    private function stats(Carbon $expiryCutoff, Carbon $weekAgo, ?array $allowedBranchIds): array
    {
        // Items are global (no branch scoping on the catalog), so total_items
        // is the same for all roles — that reflects the master catalog.
        $totalItems = Item::count();

        $lowStockCount = $this->criticalItemsQuery($allowedBranchIds)->count();

        $expiringSoonCount = $this->batchesWithinScope($allowedBranchIds)
            ->where('quantity', '>', 0)
            ->whereNotNull('expiration_date')
            ->whereDate('expiration_date', '<=', $expiryCutoff)
            ->count();

        $txQuery = Transaction::query()->where('transaction_date', '>=', $weekAgo);
        if ($allowedBranchIds !== null) {
            $txQuery->whereHas('batch.room', fn ($q) => $q->whereIn('branch_id', $allowedBranchIds));
        }

        return [
            'total_items' => $totalItems,
            'low_stock_count' => $lowStockCount,
            'expiring_soon_count' => $expiringSoonCount,
            'transactions_7d' => $txQuery->count(),
        ];
    }

    /**
     * Items whose summed quantity (within the user's scoped branches) is at
     * or below their min_stock_level. For Owner, this is system-wide. For
     * scoped Kepala, the sum is restricted to batches in their branch only.
     */
    private function criticalItems(?array $allowedBranchIds): array
    {
        return $this->criticalItemsQuery($allowedBranchIds)
            ->orderByRaw('(items.min_stock_level - coalesce((
                ' . $this->scopedBatchSumSubquery($allowedBranchIds) . '
            ), 0)) desc')
            ->limit(self::LIST_LIMIT)
            ->get(['items.id', 'items.item_name', 'items.sku', 'items.unit', 'items.min_stock_level'])
            ->map(function ($item) use ($allowedBranchIds) {
                $totalStock = (float) $this->batchesWithinScope($allowedBranchIds)
                    ->where('item_id', $item->id)
                    ->sum('quantity');

                return [
                    'id' => $item->id,
                    'item_name' => $item->item_name,
                    'sku' => $item->sku,
                    'unit' => $item->unit,
                    'min_stock_level' => (float) $item->min_stock_level,
                    'total_stock' => $totalStock,
                ];
            })
            ->all();
    }

    private function criticalItemsQuery(?array $allowedBranchIds): \Illuminate\Database\Eloquent\Builder
    {
        $sumSql = $this->scopedBatchSumSubquery($allowedBranchIds);

        return Item::query()
            ->where('min_stock_level', '>', 0)
            ->whereRaw("min_stock_level >= ({$sumSql})");
    }

    /**
     * SQL fragment computing the scoped batch sum for an item. Used inside
     * raw `whereRaw`/`orderByRaw` clauses where Eloquent's relations don't
     * apply. Branch filter is inlined as a literal IN list (the values come
     * from server-side `scopedBranchIds()`, never from request input).
     */
    private function scopedBatchSumSubquery(?array $allowedBranchIds): string
    {
        $base = 'select coalesce(sum(quantity), 0)
            from inventory_batches
            where inventory_batches.item_id = items.id';

        if ($allowedBranchIds === null) {
            return $base;
        }

        if (empty($allowedBranchIds)) {
            return $base . ' and 1=0';
        }

        $ids = implode(',', array_map('intval', $allowedBranchIds));
        return $base . " and inventory_batches.room_id in (
            select id from rooms where branch_id in ({$ids})
        )";
    }

    private function expiringBatches(Carbon $expiryCutoff, ?array $allowedBranchIds): array
    {
        return $this->batchesWithinScope($allowedBranchIds)
            ->where('quantity', '>', 0)
            ->whereNotNull('expiration_date')
            ->whereDate('expiration_date', '<=', $expiryCutoff)
            ->with(['item:id,item_name,sku,unit', 'room.branch:id,branch_name'])
            ->orderBy('expiration_date')
            ->limit(self::LIST_LIMIT)
            ->get()
            ->map(fn ($batch) => [
                'id' => $batch->id,
                'batch_code' => $batch->batch_code,
                'quantity' => (float) $batch->quantity,
                'expiration_date' => $batch->expiration_date?->toDateString(),
                'item' => [
                    'id' => $batch->item->id,
                    'item_name' => $batch->item->item_name,
                    'unit' => $batch->item->unit,
                ],
                'room' => [
                    'id' => $batch->room->id,
                    'room_name' => $batch->room->room_name,
                    'branch_name' => $batch->room->branch?->branch_name,
                ],
            ])
            ->all();
    }

    private function batchesWithinScope(?array $allowedBranchIds): \Illuminate\Database\Eloquent\Builder
    {
        $query = InventoryBatch::query();
        if ($allowedBranchIds !== null) {
            $query->whereHas('room', fn ($q) => $q->whereIn('branch_id', $allowedBranchIds));
        }
        return $query;
    }
}
