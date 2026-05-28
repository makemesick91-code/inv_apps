<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryBatch;
use App\Models\Room;
use App\Models\Transaction;
use App\Models\User;
use App\Services\StockMovementService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class TransactionController extends Controller
{
    public function __construct(private readonly StockMovementService $stock)
    {
    }

    public function storeIn(Request $request): JsonResponse
    {
        $data = $request->validate([
            'room_id' => 'required|exists:rooms,id',
            'item_id' => 'required|exists:items,id',
            'batch_code' => 'nullable|string|max:255',
            'quantity' => 'required|numeric|gt:0',
            'expiration_date' => 'nullable|date|after_or_equal:today',
            'transaction_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        $this->ensureRoomInScope($request->user(), (int) $data['room_id']);

        $transaction = $this->stock->recordIn(
            roomId: (int) $data['room_id'],
            itemId: (int) $data['item_id'],
            batchCode: $data['batch_code'] ?? null,
            quantity: (float) $data['quantity'],
            expirationDate: isset($data['expiration_date']) ? Carbon::parse($data['expiration_date']) : null,
            userId: $request->user()->id,
            transactionDate: Carbon::parse($data['transaction_date']),
            notes: $data['notes'] ?? null,
        );

        return response()->json([
            'data' => $transaction->load('batch.item'),
            'message' => 'Barang masuk berhasil dicatat.',
        ], 201);
    }

    public function storeOut(Request $request): JsonResponse
    {
        $data = $request->validate([
            'batch_id' => 'required|exists:inventory_batches,id',
            'quantity' => 'required|numeric|gt:0',
            'transaction_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        $user = $request->user();
        $batch = InventoryBatch::findOrFail($data['batch_id']);

        $this->ensureBatchAccessible($user, $batch, 'mengeluarkan stok');

        $transaction = $this->stock->recordOut(
            batchId: (int) $data['batch_id'],
            quantity: (float) $data['quantity'],
            userId: $user->id,
            transactionDate: Carbon::parse($data['transaction_date']),
            notes: $data['notes'] ?? null,
        );

        return response()->json([
            'data' => $transaction->load('batch.item'),
            'message' => 'Pemakaian stok berhasil dicatat.',
        ], 201);
    }

    public function storeWriteOff(Request $request): JsonResponse
    {
        $data = $request->validate([
            'batch_id' => 'required|exists:inventory_batches,id',
            'quantity' => 'required|numeric|gt:0',
            'reason' => 'required|in:Rusak,Kadaluarsa,Hilang,Lainnya',
            'transaction_date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        $user = $request->user();
        $batch = InventoryBatch::findOrFail($data['batch_id']);

        $this->ensureBatchAccessible($user, $batch, 'menghapus stok');

        $noteParts = ["[{$data['reason']}]"];
        if (! empty($data['notes'])) {
            $noteParts[] = $data['notes'];
        }

        $transaction = $this->stock->recordWriteOff(
            batchId: (int) $data['batch_id'],
            quantity: (float) $data['quantity'],
            userId: $user->id,
            transactionDate: Carbon::parse($data['transaction_date']),
            notes: implode(' ', $noteParts),
        );

        return response()->json([
            'data' => $transaction->load('batch.item'),
            'message' => 'Penghapusan stok berhasil dicatat.',
        ], 201);
    }

    public function report(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date|after_or_equal:date_from',
            'types' => 'nullable|array',
            'types.*' => 'in:in,out,adjustment_in,adjustment_out,transfer_in,transfer_out,write_off',
            'branch_id' => 'nullable|integer|exists:branches,id',
            'room_id' => 'nullable|integer|exists:rooms,id',
            'item_id' => 'nullable|integer|exists:items,id',
            'user_id' => 'nullable|integer|exists:users,id',
            'per_page' => 'nullable|integer|min:1|max:200',
        ]);

        $user = $request->user();
        $allowedBranchIds = $user->scopedBranchIds();

        $query = Transaction::query();

        if (! empty($data['date_from'])) {
            $query->whereDate('transaction_date', '>=', $data['date_from']);
        }
        if (! empty($data['date_to'])) {
            $query->whereDate('transaction_date', '<=', $data['date_to']);
        }
        if (! empty($data['types'])) {
            $query->whereIn('type', $data['types']);
        }
        if (! empty($data['user_id'])) {
            $query->where('user_id', $data['user_id']);
        }
        if (! empty($data['branch_id'])) {
            // If non-Owner asked for a specific branch outside their scope → 403
            if ($allowedBranchIds !== null && ! in_array((int) $data['branch_id'], $allowedBranchIds, true)) {
                throw new HttpException(403, 'Cabang tersebut di luar jangkauan akses Anda.');
            }
            $query->whereHas('batch.room', fn ($q) => $q->where('branch_id', $data['branch_id']));
        } elseif ($allowedBranchIds !== null) {
            // Otherwise enforce caller's scope
            $query->whereHas('batch.room', fn ($q) => $q->whereIn('branch_id', $allowedBranchIds));
        }
        if (! empty($data['room_id'])) {
            $this->ensureRoomInScope($user, (int) $data['room_id']);
            $query->whereHas('batch', fn ($q) => $q->where('room_id', $data['room_id']));
        }
        if (! empty($data['item_id'])) {
            $query->whereHas('batch', fn ($q) => $q->where('item_id', $data['item_id']));
        }

        $summary = (clone $query)
            ->select('type', DB::raw('COUNT(*) as count'), DB::raw('SUM(quantity) as total_qty'))
            ->groupBy('type')
            ->get()
            ->map(fn ($r) => [
                'type' => $r->type,
                'count' => (int) $r->count,
                'total_qty' => (int) $r->total_qty,
            ])
            ->keyBy('type')
            ->all();

        $paginated = $query
            ->with([
                'batch:id,room_id,item_id,batch_code',
                'batch.item:id,item_name,sku,unit',
                'batch.room:id,branch_id,room_name',
                'batch.room.branch:id,branch_name',
                'user:id,name',
            ])
            ->orderByDesc('transaction_date')
            ->orderByDesc('id')
            ->paginate($data['per_page'] ?? 50);

        return response()->json([
            'data' => $paginated->items(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
            'summary' => $summary,
        ]);
    }

    public function writeOffHistory(Request $request): JsonResponse
    {
        $user = $request->user();
        $allowedBranchIds = $user->scopedBranchIds();

        $query = Transaction::where('type', 'write_off')
            ->with([
                'batch:id,room_id,item_id,batch_code',
                'batch.item:id,item_name,unit',
                'batch.room:id,branch_id,room_name',
                'batch.room.branch:id,branch_name',
                'user:id,name',
            ])
            ->orderByDesc('transaction_date')
            ->orderByDesc('id');

        if ($user->isPerawat()) {
            if (! $user->room_id) {
                return response()->json(['data' => []]);
            }
            $query->whereHas('batch', fn ($q) => $q->where('room_id', $user->room_id));
        } elseif ($allowedBranchIds !== null) {
            $query->whereHas('batch.room', fn ($q) => $q->whereIn('branch_id', $allowedBranchIds));
        }

        return response()->json($query->limit(50)->get()->map(fn ($t) => [
            'id' => $t->id,
            'quantity' => $t->quantity,
            'transaction_date' => $t->transaction_date?->toDateString(),
            'notes' => $t->notes,
            'batch' => [
                'id' => $t->batch->id,
                'batch_code' => $t->batch->batch_code,
                'item' => $t->batch->item ? [
                    'id' => $t->batch->item->id,
                    'item_name' => $t->batch->item->item_name,
                    'unit' => $t->batch->item->unit,
                ] : null,
                'room' => $t->batch->room ? [
                    'id' => $t->batch->room->id,
                    'room_name' => $t->batch->room->room_name,
                    'branch_name' => $t->batch->room->branch?->branch_name,
                ] : null,
            ],
            'user' => $t->user ? ['id' => $t->user->id, 'name' => $t->user->name] : null,
        ])->all());
    }

    private function ensureRoomInScope(User $user, int $roomId): void
    {
        $allowedBranchIds = $user->scopedBranchIds();
        if ($allowedBranchIds === null) {
            return;
        }
        $branchId = Room::where('id', $roomId)->value('branch_id');
        if (! in_array((int) $branchId, $allowedBranchIds, true)) {
            throw new HttpException(403, 'Ruangan ini di luar jangkauan akses Anda.');
        }
    }

    /**
     * Combined check for batch-targeting actions (out / write-off).
     * - Perawat: must match their assigned room exactly
     * - Scoped Kepala: batch's branch must be in their scope
     * - Owner: passes through
     */
    private function ensureBatchAccessible(User $user, InventoryBatch $batch, string $verb): void
    {
        if ($user->isPerawat()) {
            if ($batch->room_id !== $user->room_id) {
                throw new HttpException(403, "Anda hanya dapat {$verb} dari ruangan tugas Anda.");
            }
            return;
        }
        $this->ensureRoomInScope($user, (int) $batch->room_id);
    }
}
