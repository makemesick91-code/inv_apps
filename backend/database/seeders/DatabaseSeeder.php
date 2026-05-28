<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Inventory;
use App\Models\InventoryBatch;
use App\Models\Item;
use App\Models\Room;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Owner — Kepala without branch_id = unrestricted access
        User::updateOrCreate(
            ['email' => 'admin@klinik.test'],
            [
                'name' => 'Super Admin',
                'password' => Hash::make('admin123'),
                'role' => 'Kepala_Cabang',
                'room_id' => null,
                'branch_id' => null,
            ]
        );

        $branch = Branch::updateOrCreate(
            ['branch_name' => 'Cabang Pusat'],
            ['location' => 'Jakarta']
        );

        $branchSudirman = Branch::updateOrCreate(
            ['branch_name' => 'Cabang Sudirman'],
            ['location' => 'Jakarta Selatan']
        );

        $rooms = [];
        foreach (['Gudang Utama', 'Ruang Perawatan 1', 'Ruang Resepsionis'] as $name) {
            $rooms[$name] = Room::updateOrCreate(
                ['branch_id' => $branch->id, 'room_name' => $name]
            );
        }

        // Demo Kepala scoped to Cabang Sudirman (will only see that branch)
        User::updateOrCreate(
            ['email' => 'kepala.sudirman@klinik.test'],
            [
                'name' => 'Kepala Sudirman',
                'password' => Hash::make('admin123'),
                'role' => 'Kepala_Cabang',
                'room_id' => null,
                'branch_id' => $branchSudirman->id,
            ]
        );

        User::updateOrCreate(
            ['email' => 'perawat@klinik.test'],
            [
                'name' => 'Perawat Demo',
                'password' => Hash::make('perawat123'),
                'role' => 'Perawat',
                'room_id' => $rooms['Ruang Perawatan 1']->id,
            ]
        );

        $categoryDefs = [
            ['name' => 'Obat', 'color' => 'red'],
            ['name' => 'APD', 'color' => 'blue'],
            ['name' => 'BHP', 'color' => 'emerald'],
            ['name' => 'Sterilisasi', 'color' => 'violet'],
            ['name' => 'Alat', 'color' => 'amber'],
        ];
        $categoryMap = [];
        foreach ($categoryDefs as $cd) {
            $categoryMap[$cd['name']] = Category::updateOrCreate(['name' => $cd['name']], $cd);
        }

        $items = [
            ['item_name' => 'Lidocaine 2%', 'sku' => 'OBT-001', 'unit' => 'ampul', 'min_stock_level' => 20, 'category' => 'Obat'],
            ['item_name' => 'Sarung Tangan Steril', 'sku' => 'APD-001', 'unit' => 'pasang', 'min_stock_level' => 50, 'category' => 'APD'],
            ['item_name' => 'Masker N95', 'sku' => 'APD-002', 'unit' => 'pcs', 'min_stock_level' => 100, 'category' => 'APD'],
            ['item_name' => 'Composite Resin', 'sku' => 'BHN-001', 'unit' => 'syringe', 'min_stock_level' => 10, 'category' => 'BHP'],
        ];

        $itemModels = [];
        foreach ($items as $data) {
            $catName = $data['category'];
            unset($data['category']);
            $data['category_id'] = $categoryMap[$catName]->id;
            $itemModels[$data['sku']] = Item::updateOrCreate(['sku' => $data['sku']], $data);
        }

        $gudang = $rooms['Gudang Utama'];
        $perawatan = $rooms['Ruang Perawatan 1'];

        $batchSeed = [
            [$gudang, 'OBT-001', 'LDC-2026A', 80, '2026-12-31'],
            [$gudang, 'OBT-001', 'LDC-2026B', 40, '2027-06-30'],
            [$gudang, 'APD-001', null, 200, null],
            [$gudang, 'APD-002', 'N95-2026Q2', 150, null],
            [$perawatan, 'OBT-001', 'LDC-2026A', 15, '2026-12-31'],
            [$perawatan, 'BHN-001', 'CR-2026', 8, '2026-09-30'],
        ];

        foreach ($batchSeed as [$room, $sku, $code, $qty, $exp]) {
            $item = $itemModels[$sku];
            InventoryBatch::updateOrCreate(
                ['room_id' => $room->id, 'item_id' => $item->id, 'batch_code' => $code],
                ['quantity' => $qty, 'expiration_date' => $exp ? Carbon::parse($exp) : null]
            );
        }

        foreach ($itemModels as $item) {
            foreach ([$gudang, $perawatan] as $room) {
                $total = (int) InventoryBatch::where('room_id', $room->id)
                    ->where('item_id', $item->id)
                    ->sum('quantity');
                if ($total > 0) {
                    Inventory::updateOrCreate(
                        ['room_id' => $room->id, 'item_id' => $item->id],
                        ['quantity' => $total]
                    );
                }
            }
        }
    }
}
