<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Kredensial tidak valid.'],
            ]);
        }

        $tokenResult = $user->createToken('api-token');
        $token = $tokenResult->plainTextToken;
        $expirationMinutes = config('sanctum.expiration');
        $expiresAt = $expirationMinutes ? now()->addMinutes((int) $expirationMinutes) : null;

        AuditLog::record('login', null, null, [
            'user_id' => $user->id,
            'type' => 'User',
            'id' => $user->id,
            'label' => $user->name,
            'force' => true,
        ]);

        return response()->json([
            'user' => $this->userPayload($user),
            'token' => $token,
            'token_expires_at' => $expiresAt?->toIso8601String(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        AuditLog::record('logout', null, null, [
            'type' => 'User',
            'id' => $user->id,
            'label' => $user->name,
        ]);

        $user->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->userPayload($request->user()));
    }

    private function userPayload(User $user): array
    {
        $user->load(['room.branch', 'branch']);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'is_owner' => $user->isOwner(),
            'branch' => $user->branch ? [
                'id' => $user->branch->id,
                'branch_name' => $user->branch->branch_name,
            ] : null,
            'room' => $user->room ? [
                'id' => $user->room->id,
                'room_name' => $user->room->room_name,
                'branch' => $user->room->branch ? [
                    'id' => $user->room->branch->id,
                    'branch_name' => $user->room->branch->branch_name,
                ] : null,
            ] : null,
        ];
    }
}
