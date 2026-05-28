<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;

class InsufficientStockException extends Exception
{
    public function __construct(
        public readonly float $available,
        public readonly float $requested,
        ?string $message = null,
    ) {
        parent::__construct(
            $message ?? sprintf(
                'Stok tidak mencukupi. Tersedia: %s, diminta: %s.',
                self::format($available),
                self::format($requested),
            ),
        );
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'errors' => [
                'quantity' => [$this->getMessage()],
            ],
            'available' => $this->available,
            'requested' => $this->requested,
        ], 422);
    }

    private static function format(float $value): string
    {
        // Show up to 3 decimals, strip trailing zeros for cleaner messages.
        return rtrim(rtrim(number_format($value, 3, '.', ''), '0'), '.');
    }
}
