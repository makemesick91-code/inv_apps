<?php

namespace App\Models;

use App\Models\Traits\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    use Auditable;

    protected $fillable = ['name', 'color'];

    public function items(): HasMany
    {
        return $this->hasMany(Item::class);
    }
}
