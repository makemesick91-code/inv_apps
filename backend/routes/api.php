<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\RoomController;
use App\Http\Controllers\Api\StockOpnameController;
use App\Http\Controllers\Api\StockTransferController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Kepala Cabang only
    Route::middleware('role:Kepala_Cabang')->group(function () {
        Route::apiResource('branches', BranchController::class);
        Route::apiResource('branches.rooms', RoomController::class)->shallow();
        Route::apiResource('categories', CategoryController::class);
        Route::post('items/import', [ItemController::class, 'bulkImport']);
        Route::apiResource('items', ItemController::class);
        Route::apiResource('users', UserController::class);
        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::get('/admin/inventory-drift', [AdminController::class, 'inventoryDriftScan']);
        Route::post('/admin/inventory-drift/fix', [AdminController::class, 'inventoryDriftFix']);
        Route::get('/dashboard', [DashboardController::class, 'index']);
        Route::post('/transactions/in', [TransactionController::class, 'storeIn']);
        Route::get('/transfers', [StockTransferController::class, 'index']);
        Route::post('/transfers', [StockTransferController::class, 'store']);
        Route::get('/reports/transactions', [TransactionController::class, 'report']);
    });

    // Both roles
    Route::get('/rooms', [RoomController::class, 'indexAll']);
    Route::get('/inventories', [InventoryController::class, 'index']);
    Route::get('/batches/{batch}/history', [InventoryController::class, 'batchHistory']);
    Route::post('/transactions/out', [TransactionController::class, 'storeOut']);
    Route::post('/transactions/write-off', [TransactionController::class, 'storeWriteOff']);
    Route::get('/transactions/write-offs', [TransactionController::class, 'writeOffHistory']);
    Route::get('/notifications', [NotificationController::class, 'index']);

    // Stock opname — Kepala Cabang full, Perawat limited to their assigned room (enforced in controller)
    Route::get('/stock-opname', [StockOpnameController::class, 'index']);
    Route::post('/stock-opname/prepare', [StockOpnameController::class, 'prepare']);
    Route::post('/stock-opname', [StockOpnameController::class, 'store']);
    Route::get('/stock-opname/{stockOpname}', [StockOpnameController::class, 'show']);
});
