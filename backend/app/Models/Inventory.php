<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Inventory extends Model
{
    protected $fillable = ['room_id', 'item_id', 'quantity'];

    protected $casts = [
        'quantity' => 'float',
    ];

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function batches(): HasMany
    {
        return $this->hasMany(InventoryBatch::class, 'item_id', 'item_id')
            ->where('inventory_batches.room_id', $this->room_id);
    }
}
