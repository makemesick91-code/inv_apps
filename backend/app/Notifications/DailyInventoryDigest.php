<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Daily summary email of inventory alerts (critical stock + expiring batches)
 * scoped to the recipient's branch visibility. Sent only when at least one
 * alert is present — the command skips users with no relevant alerts.
 */
class DailyInventoryDigest extends Notification
{
    use Queueable;

    /**
     * @param  array<int, array{item_name:string,unit:string,total_stock:int,min_stock_level:int}>  $criticalItems
     * @param  array<int, array{item_name:string,batch_code:?string,expiration_date:string,quantity:int,unit:string,location:string,days_left:int}>  $expiringBatches
     */
    public function __construct(
        public readonly array $criticalItems,
        public readonly array $expiringBatches,
        public readonly ?string $scopeLabel = null,
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $totalCritical = count($this->criticalItems);
        $totalExpiring = count($this->expiringBatches);
        $totalAlerts = $totalCritical + $totalExpiring;
        $today = now()->locale('id')->isoFormat('dddd, D MMMM Y');

        $frontendUrl = config('app.frontend_url') ?? env('FRONTEND_URL', 'http://localhost:3000');

        $msg = (new MailMessage)
            ->subject("Ringkasan Inventori — {$totalAlerts} peringatan aktif")
            ->greeting("Halo {$notifiable->name},")
            ->line("Berikut ringkasan inventori klinik per **{$today}**" . ($this->scopeLabel ? " (cakupan: {$this->scopeLabel})" : '') . ":");

        if ($totalCritical > 0) {
            $msg->line("---")
                ->line("**Stok Kritis ({$totalCritical}):**");
            foreach ($this->criticalItems as $item) {
                $msg->line(
                    sprintf(
                        '• %s — **%d %s** dari minimum %d',
                        $item['item_name'],
                        $item['total_stock'],
                        $item['unit'],
                        $item['min_stock_level'],
                    ),
                );
            }
        }

        if ($totalExpiring > 0) {
            $msg->line("---")
                ->line("**Batch Hampir Kadaluarsa ({$totalExpiring}):**");
            foreach ($this->expiringBatches as $b) {
                $batchInfo = $b['batch_code'] ? "batch {$b['batch_code']}" : '(tanpa kode batch)';
                $daysText = $b['days_left'] < 0
                    ? "**sudah lewat {$b['days_left']} hari**"
                    : "**{$b['days_left']} hari lagi**";
                $msg->line(
                    sprintf(
                        '• %s %s di %s — %d %s · exp %s · %s',
                        $b['item_name'],
                        $batchInfo,
                        $b['location'],
                        $b['quantity'],
                        $b['unit'],
                        $b['expiration_date'],
                        $daysText,
                    ),
                );
            }
        }

        return $msg
            ->action('Buka Dashboard', $frontendUrl)
            ->line('Email ini dikirim otomatis setiap pagi. Untuk pengaturan, hubungi admin.');
    }
}
