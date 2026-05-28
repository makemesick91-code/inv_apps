<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Immutable record of "who did what when" for sensitive actions.
 *
 * Written automatically by the Auditable trait on `created`/`updated`/`deleted`
 * Eloquent events, and manually for non-model events like login/logout.
 *
 * `changes` JSON:
 *  - on `created`/`deleted`: full attribute snapshot (minus sensitive fields)
 *  - on `updated`: per-field `{ old, new }` diff (only fields that actually changed)
 *  - on `login`/`logout`: null (the action itself is the signal)
 */
class AuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'action',
        'auditable_type',
        'auditable_id',
        'auditable_label',
        'changes',
        'ip_address',
        'created_at',
    ];

    protected $casts = [
        'changes' => 'array',
        'created_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Record a model lifecycle event. No-op when there is no authenticated
     * user (e.g., during seeders or scheduled jobs) unless `force => true`
     * is passed in `$extra`.
     */
    public static function record(
        string $action,
        ?Model $model = null,
        ?array $original = null,
        ?array $extra = null,
    ): void {
        if (! Auth::check() && ! ($extra['force'] ?? false)) {
            return;
        }

        $type = null;
        $id = null;
        $label = null;
        $changes = $extra['changes'] ?? null;

        if ($model) {
            $type = class_basename($model);
            $id = $model->getKey();
            $label = static::extractLabel($model);

            if ($changes === null) {
                $hidden = static::hiddenFor($type);
                $skip = array_merge($hidden, ['created_at', 'updated_at']);

                if ($action === 'updated') {
                    $diff = [];
                    foreach ($model->getChanges() as $key => $newVal) {
                        if (in_array($key, $skip, true)) {
                            continue;
                        }
                        $diff[$key] = [
                            'old' => $original[$key] ?? null,
                            'new' => $newVal,
                        ];
                    }
                    $changes = ! empty($diff) ? $diff : null;
                } elseif ($action === 'created') {
                    $attrs = $model->getAttributes();
                    foreach ($skip as $h) {
                        unset($attrs[$h]);
                    }
                    $changes = ! empty($attrs) ? $attrs : null;
                } elseif ($action === 'deleted') {
                    $attrs = $model->getOriginal();
                    foreach ($skip as $h) {
                        unset($attrs[$h]);
                    }
                    $changes = ! empty($attrs) ? $attrs : null;
                }
            }
        }

        if ($action === 'updated' && $changes === null) {
            return; // nothing actually changed (e.g., model save() with no diff)
        }

        static::create([
            'user_id' => Auth::id() ?? ($extra['user_id'] ?? null),
            'action' => $action,
            'auditable_type' => $extra['type'] ?? $type,
            'auditable_id' => $extra['id'] ?? $id,
            'auditable_label' => $extra['label'] ?? $label,
            'changes' => $changes,
            'ip_address' => request()?->ip(),
            'created_at' => now(),
        ]);
    }

    private static function extractLabel(Model $model): string
    {
        foreach (['name', 'item_name', 'branch_name', 'room_name'] as $key) {
            $v = $model->getAttribute($key);
            if (! empty($v)) {
                return (string) $v;
            }
        }
        return '#' . $model->getKey();
    }

    private static function hiddenFor(string $type): array
    {
        return match ($type) {
            'User' => ['password', 'remember_token', 'email_verified_at'],
            default => [],
        };
    }
}
