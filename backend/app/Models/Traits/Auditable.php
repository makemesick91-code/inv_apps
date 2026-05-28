<?php

namespace App\Models\Traits;

use App\Models\AuditLog;

/**
 * Apply to any Eloquent model whose lifecycle should be captured in audit_logs.
 * Hooks into created/updated/deleted events; logging is skipped when there is
 * no authenticated user (e.g., during seeding).
 */
trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(function ($model) {
            AuditLog::record('created', $model);
        });

        static::updated(function ($model) {
            AuditLog::record('updated', $model, $model->getOriginal());
        });

        static::deleted(function ($model) {
            AuditLog::record('deleted', $model);
        });
    }
}
