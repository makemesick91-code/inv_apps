<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockOpnameItem extends Model
{
    protected $fillable = [
        'stock_opname_id',
        'batch_id',
        'system_qty',
        'physical_qty',
        'difference',
        'notes',
    ];

    protected $casts = [
        'system_qty' => 'float',
        'physical_qty' => 'float',
        'difference' => 'float',
    ];

    public function opname(): BelongsTo
    {
        return $this->belongsTo(StockOpname::class, 'stock_opname_id');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(InventoryBatch::class, 'batch_id');
    }
}
