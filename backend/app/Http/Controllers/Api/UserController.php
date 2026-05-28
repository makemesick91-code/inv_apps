<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Room;
use App\Models\StockOpname;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $requester = $request->user();
        $allowed = $requester->scopedBranchIds();

        $query = User::with(['room.branch', 'branch'])
            ->orderBy('role')
            ->orderBy('name');

        if ($allowed !== null) {
            // Non-Owner Kepala: only see users in their branch.
            // A user is "in" a branch if:
            //  - their direct branch_id matches, OR
            //  - their room belongs to a matching branch.
            $query->where(function ($q) use ($allowed) {
                $q->whereIn('branch_id', $allowed)
                    ->orWhereHas('room', fn ($r) => $r->whereIn('branch_id', $allowed));
            });
        }

        return response()->json([
            'data' => $query->get()->map(fn ($u) => $this->serialize($u))->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:6',
            'role' => 'required|in:Kepala_Cabang,Perawat',
            'room_id' => 'nullable|integer|exists:rooms,id',
            'branch_id' => 'nullable|integer|exists:branches,id',
        ]);

        $this->enforceRoleRoomConsistency($data);
        $this->ensureCanManage($request, $data);

        $user = User::create($data);

        return response()->json(['data' => $this->serialize($user->load(['room.branch', 'branch']))], 201);
    }

    public function show(Request $request, User $user): JsonResponse
    {
        $this->ensureUserInScope($request, $user);

        return response()->json(['data' => $this->serialize($user->load(['room.branch', 'branch']))]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $this->ensureUserInScope($request, $user);

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => "required|email|max:255|unique:users,email,{$user->id}",
            'password' => 'nullable|string|min:6',
            'role' => 'required|in:Kepala_Cabang,Perawat',
            'room_id' => 'nullable|integer|exists:rooms,id',
            'branch_id' => 'nullable|integer|exists:branches,id',
        ]);

        $this->enforceRoleRoomConsistency($data);
        $this->ensureCanManage($request, $data);

        // Block demoting the last Kepala Cabang to Perawat
        if (
            $user->role === 'Kepala_Cabang'
            && $data['role'] === 'Perawat'
            && User::where('role', 'Kepala_Cabang')->where('id', '!=', $user->id)->count() === 0
        ) {
            throw new HttpException(
                422,
                'Tidak dapat mengubah role: minimal harus ada 1 Kepala Cabang aktif.'
            );
        }

        // Only Owner can change branch_id (move user across branches)
        if (! $request->user()->isOwner() && (int) ($data['branch_id'] ?? 0) !== (int) ($user->branch_id ?? 0)) {
            throw new HttpException(403, 'Hanya Owner yang dapat memindahkan user antar cabang.');
        }

        if (empty($data['password'])) {
            unset($data['password']);
        }

        $user->update($data);

        return response()->json(['data' => $this->serialize($user->fresh()->load(['room.branch', 'branch']))]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->ensureUserInScope($request, $user);

        if ($user->id === $request->user()->id) {
            throw new HttpException(422, 'Tidak dapat menghapus akun Anda sendiri.');
        }

        if (
            $user->role === 'Kepala_Cabang'
            && User::where('role', 'Kepala_Cabang')->where('id', '!=', $user->id)->count() === 0
        ) {
            throw new HttpException(
                422,
                'Tidak dapat menghapus: minimal harus ada 1 Kepala Cabang aktif.'
            );
        }

        $txCount = Transaction::where('user_id', $user->id)->count();
        $opnameCount = StockOpname::where('user_id', $user->id)->count();
        if ($txCount > 0 || $opnameCount > 0) {
            throw new HttpException(
                422,
                "Tidak dapat menghapus: pengguna ini memiliki {$txCount} transaksi dan {$opnameCount} opname tercatat. Riwayatnya tidak boleh hilang."
            );
        }

        $user->delete();

        return response()->json(['message' => 'Pengguna berhasil dihapus.']);
    }

    private function enforceRoleRoomConsistency(array &$data): void
    {
        if ($data['role'] === 'Perawat') {
            if (empty($data['room_id'])) {
                throw new HttpException(422, 'Perawat wajib ditugaskan ke salah satu ruangan.');
            }
            // Perawat's branch is inherited from their room — clear any direct branch_id
            $data['branch_id'] = null;
        }
        if ($data['role'] === 'Kepala_Cabang') {
            $data['room_id'] = null;
            // branch_id stays as provided (NULL = Owner; specific id = scoped Kepala)
        }
    }

    /**
     * Non-Owner Kepala can only create/modify users whose effective branch
     * falls within their own scoped branch(es). For Perawat, the effective
     * branch comes from the assigned room; for Kepala, from branch_id.
     */
    private function ensureCanManage(Request $request, array $data): void
    {
        $requester = $request->user();
        $allowed = $requester->scopedBranchIds();
        if ($allowed === null) {
            return; // Owner: anything goes
        }

        $targetBranchId = null;
        if (($data['role'] ?? null) === 'Perawat' && ! empty($data['room_id'])) {
            $targetBranchId = Room::where('id', $data['room_id'])->value('branch_id');
        } elseif (($data['role'] ?? null) === 'Kepala_Cabang') {
            $targetBranchId = $data['branch_id'] ?? null;
            if ($targetBranchId === null) {
                throw new HttpException(403, 'Hanya Owner yang dapat membuat Kepala lain tanpa cabang spesifik.');
            }
        }

        if ($targetBranchId !== null && ! in_array((int) $targetBranchId, $allowed, true)) {
            throw new HttpException(403, 'Target pengguna berada di luar cabang Anda.');
        }
    }

    private function ensureUserInScope(Request $request, User $user): void
    {
        $requester = $request->user();
        $allowed = $requester->scopedBranchIds();
        if ($allowed === null) {
            return; // Owner sees all
        }

        $userBranches = [];
        if ($user->branch_id) {
            $userBranches[] = (int) $user->branch_id;
        }
        if ($user->room_id) {
            $bid = Room::where('id', $user->room_id)->value('branch_id');
            if ($bid) {
                $userBranches[] = (int) $bid;
            }
        }

        if (empty(array_intersect($userBranches, $allowed))) {
            throw new HttpException(403, 'Pengguna ini di luar cabang Anda.');
        }
    }

    private function serialize(User $u): array
    {
        return [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'role' => $u->role,
            'is_owner' => $u->isOwner(),
            'branch' => $u->branch ? [
                'id' => $u->branch->id,
                'branch_name' => $u->branch->branch_name,
            ] : null,
            'room' => $u->room ? [
                'id' => $u->room->id,
                'room_name' => $u->room->room_name,
                'branch' => $u->room->branch ? [
                    'id' => $u->room->branch->id,
                    'branch_name' => $u->room->branch->branch_name,
                ] : null,
            ] : null,
            'created_at' => $u->created_at?->toIso8601String(),
        ];
    }
}
