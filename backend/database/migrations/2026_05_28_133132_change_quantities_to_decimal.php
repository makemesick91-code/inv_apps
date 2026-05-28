<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Switch all quantity columns from integer to decimal(12,3) so clinic users
 * can record fractional amounts (½ ampul, 2.5 ml, ¾ tube, etc).
 *
 * Format: 12 total digits, 3 after decimal → max value 999,999,999.999
 * (plenty for any clinic). 3 decimals match common pharmacy precision and
 * avoid floating-point ambiguity that float/double would introduce.
 *
 * `transactions.quantity` and the four batch/inventory/transfer/opname qty
 * columns stay UNSIGNED (direction is encoded in `type` or `difference`).
 * `stock_opname_items.difference` becomes SIGNED decimal since it can be
 * negative (shortage) or positive (surplus).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->decimal('quantity', 12, 3)->unsigned()->default(0)->change();
        });

        Schema::table('inventory_batches', function (Blueprint $table) {
            $table->decimal('quantity', 12, 3)->unsigned()->default(0)->change();
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->decimal('quantity', 12, 3)->unsigned()->change();
        });

        Schema::table('stock_opname_items', function (Blueprint $table) {
            $table->decimal('system_qty', 12, 3)->unsigned()->change();
            $table->decimal('physical_qty', 12, 3)->unsigned()->change();
            $table->decimal('difference', 13, 3)->change();
        });

        Schema::table('stock_transfers', function (Blueprint $table) {
            $table->decimal('quantity', 12, 3)->unsigned()->change();
        });

        Schema::table('items', function (Blueprint $table) {
            $table->decimal('min_stock_level', 12, 3)->unsigned()->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->unsignedInteger('quantity')->default(0)->change();
        });

        Schema::table('inventory_batches', function (Blueprint $table) {
            $table->unsignedInteger('quantity')->default(0)->change();
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->unsignedInteger('quantity')->change();
        });

        Schema::table('stock_opname_items', function (Blueprint $table) {
            $table->unsignedInteger('system_qty')->change();
            $table->unsignedInteger('physical_qty')->change();
            $table->integer('difference')->change();
        });

        Schema::table('stock_transfers', function (Blueprint $table) {
            $table->unsignedInteger('quantity')->change();
        });

        Schema::table('items', function (Blueprint $table) {
            $table->unsignedInteger('min_stock_level')->default(0)->change();
        });
    }
};
