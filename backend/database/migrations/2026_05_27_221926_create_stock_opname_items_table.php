<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('stock_opname_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_opname_id')->constrained()->cascadeOnDelete();
            $table->foreignId('batch_id')->constrained('inventory_batches')->cascadeOnDelete();
            $table->unsignedInteger('system_qty');
            $table->unsignedInteger('physical_qty');
            $table->integer('difference');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('stock_opname_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_opname_items');
    }
};
