<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            ALTER TABLE transactions
            MODIFY COLUMN type ENUM(
                'in', 'out',
                'adjustment_in', 'adjustment_out',
                'transfer_in', 'transfer_out',
                'write_off'
            ) NOT NULL
        ");
    }

    public function down(): void
    {
        DB::statement("
            ALTER TABLE transactions
            MODIFY COLUMN type ENUM(
                'in', 'out',
                'adjustment_in', 'adjustment_out',
                'transfer_in', 'transfer_out'
            ) NOT NULL
        ");
    }
};
