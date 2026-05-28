<?php

namespace App\Models;

use App\Models\Traits\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Branch extends Model
{
    use Auditable;

    protected $fillable = ['branch_name', 'location'];

    public function rooms(): HasMany
    {
        return $this->hasMany(Room::class);
    }
}
