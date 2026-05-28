<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Daily cleanup of expired Sanctum personal access tokens. Keeps the
// personal_access_tokens table from growing unbounded as users log in
// repeatedly with TTL-based tokens.
Schedule::command('sanctum:prune-expired --hours=24')
    ->daily()
    ->onOneServer();

// Weekly inventory consistency scan (Mondays 08:00). Reports only — never
// auto-fixes (corrupted aggregates could cascade if blindly overwritten).
// Output is appended to storage/logs/drift-check.log for audit.
// The same drift is also surfaced live in the in-app notification bell
// (NotificationController::dataDriftAlerts), so users who log in between
// scheduled runs still see the issue.
Schedule::command('inventories:resync')
    ->weekly()
    ->mondays()
    ->at('08:00')
    ->onOneServer()
    ->appendOutputTo(storage_path('logs/drift-check.log'));

// Daily inventory digest email to every Kepala_Cabang user. Sent at 07:00
// so it lands before clinic opens. Recipients with no scoped alerts are
// skipped — no empty-summary spam. Output is logged for audit.
Schedule::command('inventories:send-digest')
    ->dailyAt('07:00')
    ->onOneServer()
    ->appendOutputTo(storage_path('logs/inventory-digest.log'));
