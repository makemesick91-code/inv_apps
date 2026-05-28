<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Inventory;
use Illuminate\Support\Facades\DB;

/**
 * Reconciles `inventories.quantity` (the cached aggregate) against the
 * authoritative sum of `inventory_batches.quantity`.
 *
 * Drift can appear if anything mutates batches without going through
 * StockMovementService (raw SQL, tinker, future bulk imports, etc).
 * This service is the single source for detect + fix logic, so the
 * artisan command and the admin UI endpoint stay in sync.
 *
 * Three drift categories:
 *  - mismatched: inventories row exists but quantity != sum(batches)
 *  - missing:    sum(batches) > 0 but no inventories row at all
 *  - orphan:     inventories row exists but no batches AND quantity > 0
 *                (or batches sum to 0)
 */
class InventoryConsistencyService
{
    /**
     * Scan only — no writes. Returns three arrays of drift entries.
     *
     * @return array{
     *   mismatched: array<int, array{room_id:int,item_id:int,recorded:int,actual:int,delta:int}>,
     *   missing:    array<int, array{room_id:int,item_id:int,actual:int}>,
     *   orphan:     array<int, array{id:int,room_id:int,item_id:int,recorded:int}>,
     * }
     */
    public function scan(): array
    {
        $aggregates = DB::table('inventory_batches')
            ->select('room_id', 'item_id', DB::raw('SUM(quantity) as actual'))
            ->groupBy('room_id', 'item_id')
            ->get()
            ->keyBy(fn ($r) => $r->room_id . ':' . $r->item_id);

        $inventories = DB::table('inventories')
            ->select('id', 'room_id', 'item_id', 'quantity')
            ->get()
            ->keyBy(fn ($r) => $r->room_id . ':' . $r->item_id);

        $mismatched = [];
        $orphan = [];

        foreach ($inventories as $key => $inv) {
            $actual = (int) ($aggregates[$key]->actual ?? 0);
            $recorded = (int) $inv->quantity;

            if ($actual === 0 && $recorded > 0) {
                $orphan[] = [
                    'id' => (int) $inv->id,
                    'room_id' => (int) $inv->room_id,
                    'item_id' => (int) $inv->item_id,
                    'recorded' => $recorded,
                ];
            } elseif ($actual !== $recorded) {
                $mismatched[] = [
                    'room_id' => (int) $inv->room_id,
                    'item_id' => (int) $inv->item_id,
                    'recorded' => $recorded,
                    'actual' => $actual,
                    'delta' => $actual - $recorded,
                ];
            }
        }

        $missing = [];
        foreach ($aggregates as $key => $agg) {
            if (! isset($inventories[$key]) && (int) $agg->actual > 0) {
                $missing[] = [
                    'room_id' => (int) $agg->room_id,
                    'item_id' => (int) $agg->item_id,
                    'actual' => (int) $agg->actual,
                ];
            }
        }

        return compact('mismatched', 'missing', 'orphan');
    }

    /**
     * Apply corrections atomically. Returns a summary count for each category.
     *
     * Writes an audit log entry (action: `inventory_resync`) with per-row
     * details when at least one correction is applied. The entry is created
     * inside the same DB transaction so it commits or rolls back with the
     * fixes themselves. Works for both UI-triggered (auth user) and
     * CLI-triggered (user_id NULL) runs.
     *
     * `$selection` (optional) lets the caller fix only a subset:
     *   [
     *     'mismatched' => [['room_id' => N, 'item_id' => N], ...],
     *     'missing'    => [['room_id' => N, 'item_id' => N], ...],
     *     'orphan'     => [id1, id2, ...],  // inventories.id values
     *   ]
     * Any category omitted (or null `$selection`) means "fix all in that
     * category". The scan is always re-run inside the transaction so we
     * don't act on a stale snapshot — selection just filters fresh drift.
     *
     * @return array{mismatchedFixed:int, missingCreated:int, orphanZeroed:int}
     */
    public function fix(?array $selection = null): array
    {
        return DB::transaction(function () use ($selection) {
            $drift = $this->scan();

            $mismatchedToFix = $this->filterByPair($drift['mismatched'], $selection['mismatched'] ?? null);
            $missingToFix = $this->filterByPair($drift['missing'], $selection['missing'] ?? null);
            $orphanToFix = $this->filterById($drift['orphan'], $selection['orphan'] ?? null);

            $details = [];

            foreach ($mismatchedToFix as $row) {
                Inventory::where('room_id', $row['room_id'])
                    ->where('item_id', $row['item_id'])
                    ->update(['quantity' => $row['actual']]);
                $details[] = [
                    'category' => 'mismatched',
                    'room_id' => $row['room_id'],
                    'item_id' => $row['item_id'],
                    'old' => $row['recorded'],
                    'new' => $row['actual'],
                ];
            }

            foreach ($missingToFix as $row) {
                Inventory::create([
                    'room_id' => $row['room_id'],
                    'item_id' => $row['item_id'],
                    'quantity' => $row['actual'],
                ]);
                $details[] = [
                    'category' => 'missing',
                    'room_id' => $row['room_id'],
                    'item_id' => $row['item_id'],
                    'old' => null,
                    'new' => $row['actual'],
                ];
            }

            foreach ($orphanToFix as $row) {
                Inventory::where('id', $row['id'])->update(['quantity' => 0]);
                $details[] = [
                    'category' => 'orphan',
                    'room_id' => $row['room_id'],
                    'item_id' => $row['item_id'],
                    'old' => $row['recorded'],
                    'new' => 0,
                ];
            }

            $summary = [
                'mismatchedFixed' => count($mismatchedToFix),
                'missingCreated' => count($missingToFix),
                'orphanZeroed' => count($orphanToFix),
            ];

            if (! empty($details)) {
                AuditLog::record('inventory_resync', null, null, [
                    'force' => true, // allow CLI runs (no auth user)
                    'type' => 'System',
                    'label' => "Perbaikan konsistensi inventori (" . count($details) . " baris)",
                    'changes' => [
                        'mismatched_fixed' => $summary['mismatchedFixed'],
                        'missing_created' => $summary['missingCreated'],
                        'orphan_zeroed' => $summary['orphanZeroed'],
                        'selection_mode' => $selection === null ? 'all' : 'selective',
                        'details' => $details,
                    ],
                ]);
            }

            return $summary;
        });
    }

    private function filterByPair(array $rows, ?array $selection): array
    {
        if ($selection === null) {
            return $rows;
        }
        $wanted = [];
        foreach ($selection as $sel) {
            if (isset($sel['room_id'], $sel['item_id'])) {
                $wanted[(int) $sel['room_id'] . ':' . (int) $sel['item_id']] = true;
            }
        }
        return array_values(array_filter(
            $rows,
            fn ($r) => isset($wanted[$r['room_id'] . ':' . $r['item_id']]),
        ));
    }

    private function filterById(array $rows, ?array $selection): array
    {
        if ($selection === null) {
            return $rows;
        }
        $wanted = array_flip(array_map('intval', $selection));
        return array_values(array_filter($rows, fn ($r) => isset($wanted[$r['id']])));
    }
}
