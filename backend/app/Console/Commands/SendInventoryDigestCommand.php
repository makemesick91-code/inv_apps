<?php

namespace App\Console\Commands;

use App\Models\InventoryBatch;
use App\Models\Item;
use App\Models\User;
use App\Notifications\DailyInventoryDigest;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * Iterates all Kepala_Cabang users with email and sends each one a
 * digest of alerts scoped to their branch visibility. Skips silently when
 * a user has no alerts — no point spamming inboxes with empty summaries.
 *
 * Mail driver is whatever's configured (`log` in dev → laravel.log;
 * `smtp` in prod). Uses Laravel's queue if `ShouldQueue` were applied;
 * for now the notification sends synchronously since the recipient list
 * is small (≤ tens of Kepala users).
 */
class SendInventoryDigestCommand extends Command
{
    private const EXPIRY_THRESHOLD_DAYS = 30;

    protected $signature = 'inventories:send-digest {--dry-run : Compute but do not send emails}';

    protected $description = 'Send daily inventory alert digest to all Kepala Cabang users';

    public function handle(): int
    {
        $today = Carbon::today();
        $cutoff = $today->copy()->addDays(self::EXPIRY_THRESHOLD_DAYS);
        $dryRun = (bool) $this->option('dry-run');

        $recipients = User::query()
            ->where('role', 'Kepala_Cabang')
            ->whereNotNull('email')
            ->with('branch:id,branch_name')
            ->get();

        if ($recipients->isEmpty()) {
            $this->warn('Tidak ada Kepala_Cabang user dengan email.');
            return self::SUCCESS;
        }

        $sent = 0;
        $skipped = 0;

        foreach ($recipients as $user) {
            $allowed = $user->scopedBranchIds();
            $critical = $this->getCriticalItems($allowed);
            $expiring = $this->getExpiringBatches($allowed, $today, $cutoff);

            if (empty($critical) && empty($expiring)) {
                $skipped++;
                $this->line("  - {$user->email}: skip (no alerts)");
                continue;
            }

            $scopeLabel = $user->isOwner()
                ? null
                : ($user->branch?->branch_name ?? 'belum ditugaskan');

            if ($dryRun) {
                $this->line("  - {$user->email}: would send (" . count($critical) . " critical, " . count($expiring) . " expiring)");
            } else {
                $user->notify(new DailyInventoryDigest($critical, $expiring, $scopeLabel));
                $this->line("  - {$user->email}: sent (" . count($critical) . " critical, " . count($expiring) . " expiring)");
            }
            $sent++;
        }

        $this->newLine();
        $verb = $dryRun ? 'Would send' : 'Sent';
        $this->info("{$verb}: {$sent} email(s). Skipped (no alerts): {$skipped}.");

        return self::SUCCESS;
    }

    /**
     * @return array<int, array{item_name:string,unit:string,total_stock:int,min_stock_level:int}>
     */
    private function getCriticalItems(?array $allowedBranchIds): array
    {
        $sumSql = 'select coalesce(sum(quantity), 0)
            from inventory_batches
            where inventory_batches.item_id = items.id';

        if ($allowedBranchIds !== null) {
            if (empty($allowedBranchIds)) {
                return [];
            }
            $ids = implode(',', array_map('intval', $allowedBranchIds));
            $sumSql .= " and inventory_batches.room_id in (
                select id from rooms where branch_id in ({$ids})
            )";
        }

        return Item::query()
            ->where('min_stock_level', '>', 0)
            ->selectRaw("items.*, ({$sumSql}) as total_stock")
            ->whereRaw("min_stock_level >= ({$sumSql})")
            ->orderBy('item_name')
            ->limit(50)
            ->get()
            ->map(fn ($i) => [
                'item_name' => $i->item_name,
                'unit' => $i->unit,
                'total_stock' => (int) ($i->total_stock ?? 0),
                'min_stock_level' => (int) $i->min_stock_level,
            ])
            ->all();
    }

    /**
     * @return array<int, array{item_name:string,batch_code:?string,expiration_date:string,quantity:int,unit:string,location:string,days_left:int}>
     */
    private function getExpiringBatches(?array $allowedBranchIds, Carbon $today, Carbon $cutoff): array
    {
        $query = InventoryBatch::query()
            ->where('quantity', '>', 0)
            ->whereNotNull('expiration_date')
            ->whereDate('expiration_date', '<=', $cutoff)
            ->with(['item:id,item_name,unit', 'room:id,branch_id,room_name', 'room.branch:id,branch_name'])
            ->orderBy('expiration_date');

        if ($allowedBranchIds !== null) {
            $query->whereHas('room', fn ($q) => $q->whereIn('branch_id', $allowedBranchIds));
        }

        return $query->limit(50)->get()->map(function ($batch) use ($today) {
            $days = (int) $batch->expiration_date->diffInDays($today, false);
            $location = $batch->room->branch
                ? $batch->room->branch->branch_name . ' · ' . $batch->room->room_name
                : $batch->room->room_name;

            return [
                'item_name' => $batch->item->item_name,
                'batch_code' => $batch->batch_code,
                'expiration_date' => $batch->expiration_date->toDateString(),
                'quantity' => (int) $batch->quantity,
                'unit' => $batch->item->unit,
                'location' => $location,
                'days_left' => $days,
            ];
        })->all();
    }
}
