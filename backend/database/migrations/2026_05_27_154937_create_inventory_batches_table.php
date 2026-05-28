<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->string('batch_code')->nullable();
            $table->unsignedInteger('quantity')->default(0);
            $table->date('expiration_date')->nullable();
            $table->timestamps();

            $table->index(['room_id', 'item_id']);
            $table->index('expiration_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_batches');
    }
};
