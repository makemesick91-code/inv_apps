<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockTransfer extends Model
{
    protected $fillable = [
        'source_batch_id',
        'dest_batch_id',
        'user_id',
        'quantity',
        'transfer_date',
        'notes',
    ];

    protected $casts = [
        'transfer_date' => 'date',
        'quantity' => 'float',
    ];

    public function sourceBatch(): BelongsTo
    {
        return $this->belongsTo(InventoryBatch::class, 'source_batch_id');
    }

    public function destBatch(): BelongsTo
    {
        return $this->belongsTo(InventoryBatch::class, 'dest_batch_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
