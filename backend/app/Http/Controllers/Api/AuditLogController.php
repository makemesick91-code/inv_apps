<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Room;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date|after_or_equal:date_from',
            'user_id' => 'nullable|integer|exists:users,id',
            'action' => 'nullable|string|max:50',
            'type' => 'nullable|string|max:50',
            'per_page' => 'nullable|integer|min:1|max:200',
        ]);

        $query = AuditLog::query()
            ->with('user:id,name,role')
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        // Non-Owner Kepala: only see entries done by users whose effective
        // branch overlaps theirs. System (user_id NULL) actions are always
        // hidden from scoped Kepala — they're typically Owner-level events.
        $requester = $request->user();
        $allowedBranchIds = $requester->scopedBranchIds();
        if ($allowedBranchIds !== null) {
            $userIds = User::query()
                ->where(function ($q) use ($allowedBranchIds) {
                    $q->whereIn('branch_id', $allowedBranchIds)
                        ->orWhereIn('room_id', Room::whereIn('branch_id', $allowedBranchIds)->pluck('id'));
                })
                ->pluck('id')
                ->all();
            $query->whereIn('user_id', $userIds);
        }

        if (! empty($data['date_from'])) {
            $query->whereDate('created_at', '>=', $data['date_from']);
        }
        if (! empty($data['date_to'])) {
            $query->whereDate('created_at', '<=', $data['date_to']);
        }
        if (! empty($data['user_id'])) {
            $query->where('user_id', $data['user_id']);
        }
        if (! empty($data['action'])) {
            $query->where('action', $data['action']);
        }
        if (! empty($data['type'])) {
            $query->where('auditable_type', $data['type']);
        }

        return response()->json($query->paginate($data['per_page'] ?? 50));
    }
}
