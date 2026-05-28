<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Traits\Auditable;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use Auditable, HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'room_id',
        'branch_id',
    ];

    public function isKepala(): bool
    {
        return $this->role === 'Kepala_Cabang';
    }

    public function isPerawat(): bool
    {
        return $this->role === 'Perawat';
    }

    /**
     * Owner = Kepala_Cabang without a specific branch assignment.
     * Has global visibility & write access across all branches.
     * Acts as the system administrator / clinic owner.
     */
    public function isOwner(): bool
    {
        return $this->isKepala() && $this->branch_id === null;
    }

    /**
     * Branch IDs the user is allowed to see/affect.
     *  - Owner   → null (means "all")
     *  - Kepala  → [their branch_id]
     *  - Perawat → [their room's branch_id]
     *
     * Returns `null` to signal unrestricted access — callers should
     * treat `null` as "no filter needed", not "no access".
     */
    public function scopedBranchIds(): ?array
    {
        if ($this->isOwner()) {
            return null;
        }
        if ($this->isKepala() && $this->branch_id) {
            return [(int) $this->branch_id];
        }
        if ($this->isPerawat()) {
            $bid = $this->room?->branch_id;
            return $bid ? [(int) $bid] : [];
        }
        return [];
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
