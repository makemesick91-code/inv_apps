'use client';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { Branch, InventoryBatch, Item, Room } from '@/types';
import {
  AlertCircle,
  ArrowUpFromLine,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Package,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type BatchWithItem = InventoryBatch & { item: Item };

interface SuccessInfo {
  itemName: string;
  quantity: number;
  unit: string;
  batchCode: string | null;
}

export default function BarangKeluarPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [batches, setBatches] = useState<BatchWithItem[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [metaError, setMetaError] = useState('');

  // Branch & room state — for Perawat, room is locked from user.room
  const isPerawat = user?.role === 'Perawat';
  const lockedRoomId = isPerawat ? (user?.room?.id ?? null) : null;
  const lockedBranchId = isPerawat ? (user?.room?.branch?.id ?? null) : null;

  const [branchId, setBranchId] = useState<number | null>(lockedBranchId);
  const [roomId, setRoomId] = useState<number | null>(lockedRoomId);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Per-item state
  const [itemId, setItemId] = useState<number | null>(null);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [lastSaved, setLastSaved] = useState<SuccessInfo | null>(null);

  const itemSelectRef = useRef<HTMLSelectElement>(null);

  // Load branches & rooms for Kepala; Perawat skips this
  const loadMeta = useCallback(async () => {
    if (isPerawat) {
      setLoadingMeta(false);
      return;
    }
    setLoadingMeta(true);
    try {
      const [b, r] = await Promise.all([
        api.get<{ data: Branch[] }>('/branches'),
        api.get<{ data: Room[] }>('/rooms'),
      ]);
      setBranches(b.data);
      setRooms(r.data);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoadingMeta(false);
    }
  }, [isPerawat]);

  useEffect(() => {
    if (user) loadMeta();
  }, [user, loadMeta]);

  // Load batches for selected room (whenever room changes)
  const loadBatches = useCallback(async (rid: number | null) => {
    if (!rid && !isPerawat) {
      setBatches([]);
      return;
    }
    setLoadingBatches(true);
    try {
      // Perawat: server forces their room, no query param needed
      // Kepala: pass room_id explicitly
      const url = isPerawat ? '/inventories' : `/inventories?room_id=${rid}`;
      const res = await api.get<{ data: BatchWithItem[] }>(url);
      setBatches(res.data);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Gagal memuat stok');
    } finally {
      setLoadingBatches(false);
    }
  }, [isPerawat]);

  useEffect(() => {
    if (user && (roomId || isPerawat)) {
      loadBatches(roomId);
    }
  }, [user, roomId, isPerawat, loadBatches]);

  const filteredRooms = useMemo(
    () => (branchId ? rooms.filter((r) => r.branch_id === branchId) : []),
    [rooms, branchId]
  );

  // Group batches by item — for item picker
  const itemsInRoom = useMemo(() => {
    const map = new Map<number, { item: Item; batches: BatchWithItem[]; total: number }>();
    for (const b of batches) {
      const entry = map.get(b.item_id) ?? { item: b.item, batches: [], total: 0 };
      entry.batches.push(b);
      entry.total += b.quantity;
      map.set(b.item_id, entry);
    }
    // Sort items alphabetically; batches inside already FEFO from server
    return Array.from(map.values()).sort((a, b) =>
      a.item.item_name.localeCompare(b.item.item_name)
    );
  }, [batches]);

  const selectedItemEntry = itemsInRoom.find((e) => e.item.id === itemId) ?? null;
  const selectedBatch = selectedItemEntry?.batches.find((b) => b.id === batchId) ?? null;

  // When item changes, auto-select FEFO batch (first in the array)
  useEffect(() => {
    if (selectedItemEntry && selectedItemEntry.batches.length > 0) {
      const fefoBatch = selectedItemEntry.batches[0];
      if (batchId !== fefoBatch.id && !selectedItemEntry.batches.some((b) => b.id === batchId)) {
        setBatchId(fefoBatch.id);
      }
    } else {
      setBatchId(null);
    }
  }, [selectedItemEntry, batchId]);

  function resetItemFields() {
    setItemId(null);
    setBatchId(null);
    setQuantity('');
    setNotes('');
    setFormError('');
  }

  function resetAll() {
    if (!isPerawat) {
      setBranchId(null);
      setRoomId(null);
    }
    setDate(new Date().toISOString().slice(0, 10));
    resetItemFields();
    setLastSaved(null);
  }

  async function handleSubmit(e: React.FormEvent, andAddAnother: boolean) {
    e.preventDefault();
    if (!batchId) return;
    const qty = Number(quantity);
    if (qty <= 0) {
      setFormError('Jumlah harus lebih dari nol.');
      return;
    }
    if (selectedBatch && qty > selectedBatch.quantity) {
      setFormError(
        `Jumlah melebihi stok batch ini (${selectedBatch.quantity} ${selectedItemEntry?.item.unit ?? ''}).`
      );
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      await api.post('/transactions/out', {
        batch_id: batchId,
        quantity: qty,
        transaction_date: date,
        notes: notes.trim() || null,
      });

      const saved: SuccessInfo = {
        itemName: selectedItemEntry?.item.item_name ?? '',
        quantity: qty,
        unit: selectedItemEntry?.item.unit ?? '',
        batchCode: selectedBatch?.batch_code ?? null,
      };
      setLastSaved(saved);

      // Refresh batches to reflect new quantity
      await loadBatches(roomId);

      if (andAddAnother) {
        resetItemFields();
        setTimeout(() => itemSelectRef.current?.focus(), 50);
      } else {
        resetAll();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user) return null;

  const perawatNoRoom = isPerawat && !user.room;
  const canSubmit = !!batchId && Number(quantity) > 0 && !saving;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Catat Barang Keluar"
        description={
          isPerawat
            ? `Catat pemakaian barang harian di ruangan tugas Anda${
                user.room ? ` (${user.room.room_name})` : ''
              }.`
            : 'Catat pengurangan stok dari ruangan tertentu.'
        }
      />

      {perawatNoRoom && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Anda belum ditugaskan ke ruangan manapun. Hubungi Kepala Cabang untuk diatur.
          </span>
        </div>
      )}

      {metaError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{metaError}</span>
        </div>
      )}

      {lastSaved && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Pemakaian dicatat: <strong>{lastSaved.quantity} {lastSaved.unit}</strong>{' '}
            {lastSaved.itemName}
            {lastSaved.batchCode && (
              <span className="text-emerald-600"> (batch {lastSaved.batchCode})</span>
            )}
            .
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpFromLine className="w-4 h-4 text-emerald-600" />
            Detail Pemakaian
          </CardTitle>
          <CardDescription>
            Stok akan otomatis berkurang dari batch yang dipilih. Sistem otomatis menyarankan batch
            dengan kadaluarsa terdekat (FEFO).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
            {/* Lokasi — locked for Perawat */}
            {isPerawat ? (
              <div className="space-y-1.5">
                <Label>Ruangan</Label>
                <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm">
                  <span className="font-medium text-slate-800">{user.room?.room_name}</span>
                  {user.room?.branch && (
                    <span className="text-xs text-slate-500">
                      · {user.room.branch.branch_name}
                    </span>
                  )}
                  <Badge
                    variant="secondary"
                    className="ml-auto bg-emerald-50 text-emerald-700 hover:bg-emerald-50 text-[10px] font-normal"
                  >
                    Ruangan tugas
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="branch">Cabang *</Label>
                  <select
                    id="branch"
                    required
                    disabled={loadingMeta}
                    value={branchId ?? ''}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      setBranchId(v);
                      setRoomId(null);
                      resetItemFields();
                    }}
                    className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    <option value="">— Pilih cabang —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.branch_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="room">Ruangan *</Label>
                  <select
                    id="room"
                    required
                    disabled={!branchId || filteredRooms.length === 0}
                    value={roomId ?? ''}
                    onChange={(e) => {
                      setRoomId(e.target.value ? Number(e.target.value) : null);
                      resetItemFields();
                    }}
                    className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    <option value="">
                      {!branchId
                        ? '— Pilih cabang dulu —'
                        : filteredRooms.length === 0
                          ? '— Cabang ini belum punya ruangan —'
                          : '— Pilih ruangan —'}
                    </option>
                    {filteredRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.room_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <Separator />

            {!perawatNoRoom && roomId === null && !isPerawat ? (
              <EmptyState
                icon={Package}
                title="Pilih ruangan dulu"
                description="Setelah memilih ruangan, daftar barang yang tersedia akan muncul."
              />
            ) : loadingBatches ? (
              <div className="flex items-center justify-center py-8 text-sm text-slate-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat stok ruangan...
              </div>
            ) : itemsInRoom.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Tidak ada stok di ruangan ini"
                description={
                  isPerawat
                    ? 'Belum ada barang masuk di ruangan tugas Anda. Hubungi Kepala Cabang.'
                    : 'Catat barang masuk dulu agar bisa dipakai dari ruangan ini.'
                }
              />
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="item">Barang *</Label>
                  <select
                    id="item"
                    ref={itemSelectRef}
                    required
                    value={itemId ?? ''}
                    onChange={(e) => {
                      setItemId(e.target.value ? Number(e.target.value) : null);
                      setBatchId(null);
                      setQuantity('');
                    }}
                    className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    <option value="">— Pilih barang —</option>
                    {itemsInRoom.map((e) => (
                      <option key={e.item.id} value={e.item.id}>
                        {e.item.item_name} · {e.total} {e.item.unit} tersedia
                      </option>
                    ))}
                  </select>
                </div>

                {selectedItemEntry && (
                  <div className="space-y-1.5">
                    <Label htmlFor="batch">Pilih Batch *</Label>
                    <div className="space-y-1.5">
                      {selectedItemEntry.batches.map((b, idx) => {
                        const isExpiringSoon = b.expiration_date
                          ? daysUntil(b.expiration_date) <= 30
                          : false;
                        const isExpired = b.expiration_date
                          ? daysUntil(b.expiration_date) < 0
                          : false;
                        return (
                          <label
                            key={b.id}
                            className={`flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                              batchId === b.id
                                ? 'border-emerald-300 bg-emerald-50/60'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="batch"
                              checked={batchId === b.id}
                              onChange={() => setBatchId(b.id)}
                              className="text-emerald-600"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-slate-800">
                                  {b.batch_code ?? (
                                    <span className="italic text-slate-500">no-batch</span>
                                  )}
                                </span>
                                {idx === 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="bg-blue-50 text-blue-700 hover:bg-blue-50 text-[10px] font-normal"
                                  >
                                    FEFO
                                  </Badge>
                                )}
                                {isExpired ? (
                                  <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border border-red-200 text-[10px] font-normal">
                                    Kadaluarsa
                                  </Badge>
                                ) : isExpiringSoon ? (
                                  <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200 text-[10px] font-normal">
                                    Hampir exp
                                  </Badge>
                                ) : null}
                              </div>
                              {b.expiration_date && (
                                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                  <CalendarClock className="w-3 h-3" />
                                  Exp: {formatDate(b.expiration_date)}
                                </p>
                              )}
                            </div>
                            <span className="text-sm font-semibold text-slate-800">
                              {b.quantity}{' '}
                              <span className="text-xs text-slate-500 font-normal">
                                {selectedItemEntry.item.unit}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedBatch && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="qty">
                        Jumlah Dipakai *{' '}
                        <span className="text-slate-400 font-normal">
                          (max {selectedBatch.quantity} {selectedItemEntry?.item.unit})
                        </span>
                      </Label>
                      <Input
                        id="qty"
                        type="number"
                        min="0.001"
                        step="0.001"
                        max={selectedBatch.quantity}
                        required
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="date">Tanggal *</Label>
                      <Input
                        id="date"
                        type="date"
                        required
                        value={date}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {selectedBatch && (
                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Catatan (opsional)</Label>
                    <Input
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="mis. pasien rawat jalan, prosedur cabut gigi..."
                    />
                  </div>
                )}
              </div>
            )}

            {formError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={resetAll}
                disabled={saving}
                className="mr-auto"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={(e) => handleSubmit(e, true)}
                disabled={!canSubmit}
                title="Simpan dan langsung input pemakaian berikutnya"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan &amp; Tambah Lagi
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysUntil(iso: string): number {
  const target = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}
