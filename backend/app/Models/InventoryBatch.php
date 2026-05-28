<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryBatch extends Model
{
    protected $fillable = ['room_id', 'item_id', 'batch_code', 'quantity', 'expiration_date'];

    protected $casts = [
        'expiration_date' => 'date',
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

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class, 'batch_id');
    }
}
