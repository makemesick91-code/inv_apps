<?php

namespace App\Console\Commands;

use App\Models\Item;
use App\Models\Room;
use App\Services\InventoryConsistencyService;
use Illuminate\Console\Command;

class InventoryResyncCommand extends Command
{
    protected $signature = 'inventories:resync {--fix : Apply corrections (default is dry-run)}';

    protected $description = 'Compare inventories.quantity with sum(inventory_batches.quantity) and report or fix drift.';

    public function handle(InventoryConsistencyService $service): int
    {
        $drift = $service->scan();
        $mismatched = $drift['mismatched'];
        $missing = $drift['missing'];
        $orphan = $drift['orphan'];

        $total = count($mismatched) + count($missing) + count($orphan);

        if ($total === 0) {
            $this->info('OK — semua aggregate inventories konsisten dengan inventory_batches.');
            return self::SUCCESS;
        }

        $rooms = Room::pluck('room_name', 'id');
        $items = Item::pluck('item_name', 'id');

        if (! empty($mismatched)) {
            $this->warn(count($mismatched) . ' baris mismatched (quantity tercatat ≠ jumlah batch):');
            $this->table(
                ['Ruangan', 'Item', 'Tercatat', 'Aktual', 'Delta'],
                array_map(fn ($r) => [
                    $rooms[$r['room_id']] ?? "#{$r['room_id']}",
                    $items[$r['item_id']] ?? "#{$r['item_id']}",
                    $r['recorded'],
                    $r['actual'],
                    $r['delta'] > 0 ? '+' . $r['delta'] : (string) $r['delta'],
                ], $mismatched),
            );
        }

        if (! empty($missing)) {
            $this->warn(count($missing) . ' baris missing (batch ada tapi tidak ada baris inventories):');
            $this->table(
                ['Ruangan', 'Item', 'Akan dibuat dengan qty'],
                array_map(fn ($r) => [
                    $rooms[$r['room_id']] ?? "#{$r['room_id']}",
                    $items[$r['item_id']] ?? "#{$r['item_id']}",
                    $r['actual'],
                ], $missing),
            );
        }

        if (! empty($orphan)) {
            $this->warn(count($orphan) . ' baris orphan (inventories punya quantity > 0 tapi tidak ada batch sama sekali):');
            $this->table(
                ['Ruangan', 'Item', 'Tercatat (akan dijadikan 0)'],
                array_map(fn ($r) => [
                    $rooms[$r['room_id']] ?? "#{$r['room_id']}",
                    $items[$r['item_id']] ?? "#{$r['item_id']}",
                    $r['recorded'],
                ], $orphan),
            );
        }

        if (! $this->option('fix')) {
            $this->newLine();
            $this->info("Total {$total} masalah ditemukan. Jalankan dengan --fix untuk memperbaiki.");
            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Menerapkan perbaikan...');
        $result = $service->fix();
        $this->info(sprintf(
            'Selesai: %d mismatch diperbaiki, %d aggregate dibuat, %d orphan di-nol-kan.',
            $result['mismatchedFixed'],
            $result['missingCreated'],
            $result['orphanZeroed'],
        ));

        return self::SUCCESS;
    }
}
