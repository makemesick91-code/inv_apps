<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Extend the type enum to include transfer markers
        DB::statement("
            ALTER TABLE transactions
            MODIFY COLUMN type ENUM(
                'in', 'out', 'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out'
            ) NOT NULL
        ");

        Schema::table('transactions', function (Blueprint $table) {
            $table->foreignId('transfer_id')
                ->nullable()
                ->after('user_id')
                ->constrained('stock_transfers')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('transfer_id');
        });

        DB::statement("
            ALTER TABLE transactions
            MODIFY COLUMN type ENUM('in', 'out', 'adjustment_in', 'adjustment_out') NOT NULL
        ");
    }
};
