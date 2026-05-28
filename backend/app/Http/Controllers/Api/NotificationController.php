<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryBatch;
use App\Models\Item;
use App\Services\InventoryConsistencyService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    private const EXPIRY_THRESHOLD_DAYS = 30;
    private const LIST_LIMIT = 30;

    public function __construct(private readonly InventoryConsistencyService $consistency)
    {
    }

    /**
     * Aggregates current alerts (stock critical + batches near/past expiry).
     * Generated on-the-fly from current state — no persistence layer.
     *
     * Kepala_Cabang sees system-wide alerts.
     * Perawat sees only batches in their assigned room (no global critical-stock
     * alerts, since min_stock_level is a per-item global threshold).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $today = Carbon::today();
        $expiryCutoff = $today->copy()->addDays(self::EXPIRY_THRESHOLD_DAYS);
        $allowedBranchIds = $user->scopedBranchIds();

        $items = [];

        if ($user->isKepala()) {
            // Drift is a system-wide concern — only Owner sees it.
            if ($user->isOwner()) {
                $items = array_merge($items, $this->dataDriftAlerts());
            }
            $items = array_merge($items, $this->criticalStockAlerts($allowedBranchIds));
        }

        $items = array_merge(
            $items,
            $this->expiringBatchAlerts(
                $expiryCutoff,
                $today,
                $user->isPerawat() ? $user->room_id : null,
                $allowedBranchIds,
            ),
        );

        // Sort: high severity first, then by sort_key (date / shortage amount)
        usort($items, function ($a, $b) {
            $severityOrder = ['high' => 0, 'medium' => 1, 'low' => 2];
            $sa = $severityOrder[$a['severity']] ?? 9;
            $sb = $severityOrder[$b['severity']] ?? 9;
            return $sa <=> $sb;
        });

        $items = array_slice($items, 0, self::LIST_LIMIT);

        return response()->json([
            'count' => count($items),
            'by_severity' => [
                'high' => count(array_filter($items, fn ($i) => $i['severity'] === 'high')),
                'medium' => count(array_filter($items, fn ($i) => $i['severity'] === 'medium')),
            ],
            'items' => $items,
        ]);
    }

    /**
     * Detects inventory aggregate drift (inventories.quantity vs sum of batches).
     * Surfaces a single high-severity alert linking to the diagnostics page so
     * Kepala_Cabang can review before applying the fix.
     */
    private function dataDriftAlerts(): array
    {
        $drift = $this->consistency->scan();
        $total = count($drift['mismatched']) + count($drift['missing']) + count($drift['orphan']);

        if ($total === 0) {
            return [];
        }

        $parts = [];
        if (! empty($drift['mismatched'])) $parts[] = count($drift['mismatched']) . ' mismatched';
        if (! empty($drift['missing'])) $parts[] = count($drift['missing']) . ' missing';
        if (! empty($drift['orphan'])) $parts[] = count($drift['orphan']) . ' orphan';

        return [[
            'type' => 'data_drift',
            'severity' => 'high',
            'title' => "Inkonsistensi data stok terdeteksi ({$total})",
            'body' => 'Agregat tidak cocok dengan batch: ' . implode(' · ', $parts) . '. Buka Diagnostik untuk review.',
            'link' => '/diagnostics',
        ]];
    }

    private function criticalStockAlerts(?array $allowedBranchIds): array
    {
        $sumSql = 'select coalesce(sum(quantity), 0)
            from inventory_batches
            where inventory_batches.item_id = items.id';

        if ($allowedBranchIds !== null) {
            if (empty($allowedBranchIds)) {
                return [];
            }
            $ids = implode(',', array_map('intval', $allowedBranchIds));
            $sumSql .= " and inventory_batches.room_id in (
                select id from rooms where branch_id in ({$ids})
            )";
        }

        $items = Item::query()
            ->where('min_stock_level', '>', 0)
            ->selectRaw("items.*, ({$sumSql}) as total_stock")
            ->whereRaw("min_stock_level >= ({$sumSql})")
            ->orderBy('item_name')
            ->limit(self::LIST_LIMIT)
            ->get();

        $out = [];
        foreach ($items as $item) {
            $stock = (float) ($item->total_stock ?? 0);
            $isOut = abs($stock) < 0.0005;
            $out[] = [
                'type' => $isOut ? 'stock_out' : 'low_stock',
                'severity' => $isOut ? 'high' : 'medium',
                'title' => $isOut
                    ? "{$item->item_name} habis"
                    : "{$item->item_name} di bawah minimum",
                'body' => sprintf(
                    '%s %s · minimum %s',
                    self::formatQty($stock),
                    $item->unit,
                    self::formatQty((float) $item->min_stock_level),
                ),
                'link' => '/inventori',
            ];
        }

        return $out;
    }

    private function expiringBatchAlerts(
        Carbon $cutoff,
        Carbon $today,
        ?int $roomFilterId,
        ?array $allowedBranchIds,
    ): array {
        $query = InventoryBatch::query()
            ->where('quantity', '>', 0)
            ->whereNotNull('expiration_date')
            ->whereDate('expiration_date', '<=', $cutoff)
            ->with([
                'item:id,item_name,unit',
                'room:id,branch_id,room_name',
                'room.branch:id,branch_name',
            ])
            ->orderBy('expiration_date');

        if ($roomFilterId) {
            $query->where('room_id', $roomFilterId);
        } elseif ($allowedBranchIds !== null) {
            $query->whereHas('room', fn ($q) => $q->whereIn('branch_id', $allowedBranchIds));
        }

        return $query->limit(self::LIST_LIMIT)->get()->map(function ($batch) use ($today) {
            $daysLeft = $batch->expiration_date->diffInDays($today, false);
            $isExpired = $daysLeft > 0;
            $daysAbs = abs($daysLeft);

            $location = $batch->room->room_name;
            if ($batch->room->branch) {
                $location = $batch->room->branch->branch_name . ' · ' . $location;
            }

            return [
                'type' => $isExpired ? 'expired' : 'expiring_soon',
                'severity' => $isExpired ? 'high' : ($daysAbs <= 7 ? 'medium' : 'low'),
                'title' => $isExpired
                    ? "{$batch->item->item_name} sudah kadaluarsa"
                    : "{$batch->item->item_name} hampir kadaluarsa",
                'body' => sprintf(
                    '%s %s · %s · %s',
                    self::formatQty((float) $batch->quantity),
                    $batch->item->unit,
                    $location,
                    $isExpired ? "lewat {$daysAbs} hari" : "{$daysAbs} hari lagi",
                ),
                'link' => '/inventori',
            ];
        })->all();
    }

    /**
     * Format quantity: up to 3 decimals, strip trailing zeros so "5.500" → "5.5".
     */
    private static function formatQty(float $value): string
    {
        return rtrim(rtrim(number_format($value, 3, '.', ''), '0'), '.');
    }
}
