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
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Crown,
  Loader2,
  Package,
  RotateCcw,
  Save,
  Send,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type BatchWithItem = InventoryBatch & { item: Item };

interface TransferRow {
  id: number;
  quantity: number;
  transfer_date: string;
  notes: string | null;
  user: { id: number; name: string };
  source_batch: BatchWithItem & { room: Room & { branch?: Branch } };
  dest_batch: BatchWithItem & { room: Room & { branch?: Branch } };
}

interface SuccessInfo {
  itemName: string;
  qty: number;
  unit: string;
  source: string;
  dest: string;
}

export default function TransferPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [lastSaved, setLastSaved] = useState<SuccessInfo | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'Kepala_Cabang') {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [b, r] = await Promise.all([
        api.get<{ data: Branch[] }>('/branches'),
        api.get<{ data: Room[] }>('/rooms'),
      ]);
      setBranches(b.data);
      setRooms(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get<{ data: TransferRow[] }>('/transfers');
      setTransfers(res.data);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang') {
      loadMeta();
      loadHistory();
    }
  }, [user, loadMeta, loadHistory]);

  if (authLoading || !user || user.role !== 'Kepala_Cabang') return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Transfer Antar Ruangan"
        description="Pindahkan stok dari satu ruangan ke ruangan lain dalam satu langkah atomik."
        actions={
          !formOpen && (
            <Button onClick={() => setFormOpen(true)}>
              <Send className="w-4 h-4" />
              Transfer Baru
            </Button>
          )
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {lastSaved && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>{lastSaved.qty} {lastSaved.unit}</strong> {lastSaved.itemName} berhasil
            dipindah dari <strong>{lastSaved.source}</strong> ke <strong>{lastSaved.dest}</strong>.
          </span>
        </div>
      )}

      {formOpen && (
        <TransferForm
          branches={branches}
          rooms={rooms}
          loadingMeta={loadingMeta}
          onCancel={() => setFormOpen(false)}
          onSaved={async (info) => {
            setLastSaved(info);
            setFormOpen(false);
            await loadHistory();
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Transfer</CardTitle>
          <CardDescription>
            Setiap transfer mencatat 2 transaksi (out di asal + in di tujuan) yang dapat dilacak di laporan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat riwayat...
            </div>
          ) : transfers.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Belum ada transfer tercatat"
              description="Klik 'Transfer Baru' untuk memindahkan stok antar ruangan."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 px-3 font-medium">Tanggal</th>
                    <th className="py-2 px-3 font-medium">Barang</th>
                    <th className="py-2 px-3 font-medium">Dari</th>
                    <th className="py-2 px-3 font-medium"></th>
                    <th className="py-2 px-3 font-medium">Ke</th>
                    <th className="py-2 px-3 font-medium text-right">Qty</th>
                    <th className="py-2 px-3 font-medium">Oleh</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-700">{formatDate(t.transfer_date)}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-800">
                              {t.source_batch.item.item_name}
                            </p>
                            {t.source_batch.batch_code && (
                              <p className="text-xs text-slate-400 font-mono">
                                {t.source_batch.batch_code}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-xs">
                        {t.source_batch.room.branch?.branch_name && (
                          <span className="text-slate-400">{t.source_batch.room.branch.branch_name} · </span>
                        )}
                        {t.source_batch.room.room_name}
                      </td>
                      <td className="py-2.5 px-1 text-slate-400">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-xs">
                        {t.dest_batch.room.branch?.branch_name && (
                          <span className="text-slate-400">{t.dest_batch.room.branch.branch_name} · </span>
                        )}
                        {t.dest_batch.room.room_name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                        {t.quantity}{' '}
                        <span className="text-xs text-slate-500 font-normal">
                          {t.source_batch.item.unit}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-xs">{t.user.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TransferForm({
  branches,
  rooms,
  loadingMeta,
  onCancel,
  onSaved,
}: {
  branches: Branch[];
  rooms: Room[];
  loadingMeta: boolean;
  onCancel: () => void;
  onSaved: (info: SuccessInfo) => void | Promise<void>;
}) {
  const [sourceBranchId, setSourceBranchId] = useState<number | null>(null);
  const [sourceRoomId, setSourceRoomId] = useState<number | null>(null);
  const [sourceBatchId, setSourceBatchId] = useState<number | null>(null);
  const [destBranchId, setDestBranchId] = useState<number | null>(null);
  const [destRoomId, setDestRoomId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [sourceBatches, setSourceBatches] = useState<BatchWithItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sourceRooms = sourceBranchId
    ? rooms.filter((r) => r.branch_id === sourceBranchId)
    : [];
  const destRooms = destBranchId
    ? rooms.filter((r) => r.branch_id === destBranchId && r.id !== sourceRoomId)
    : [];

  useEffect(() => {
    if (!sourceRoomId) {
      setSourceBatches([]);
      setSourceBatchId(null);
      return;
    }
    setLoadingBatches(true);
    api
      .get<{ data: BatchWithItem[] }>(`/inventories?room_id=${sourceRoomId}`)
      .then((r) => setSourceBatches(r.data))
      .finally(() => setLoadingBatches(false));
  }, [sourceRoomId]);

  const selectedBatch = sourceBatches.find((b) => b.id === sourceBatchId) ?? null;
  const sourceRoom = rooms.find((r) => r.id === sourceRoomId) ?? null;
  const destRoom = rooms.find((r) => r.id === destRoomId) ?? null;
  const sourceBranch = branches.find((b) => b.id === sourceBranchId) ?? null;
  const destBranch = branches.find((b) => b.id === destBranchId) ?? null;

  // Group batches by item for cleaner display
  const grouped = useMemo(() => {
    const m = new Map<number, { item: Item; batches: BatchWithItem[] }>();
    for (const b of sourceBatches) {
      const e = m.get(b.item_id) ?? { item: b.item, batches: [] };
      e.batches.push(b);
      m.set(b.item_id, e);
    }
    return Array.from(m.values()).sort((a, b) =>
      a.item.item_name.localeCompare(b.item.item_name)
    );
  }, [sourceBatches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceBatchId || !destRoomId) return;
    const qty = Number(quantity);
    if (selectedBatch && qty > selectedBatch.quantity) {
      setError(
        `Jumlah melebihi stok batch ini (${selectedBatch.quantity} ${selectedBatch.item.unit}).`
      );
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.post('/transfers', {
        source_batch_id: sourceBatchId,
        dest_room_id: destRoomId,
        quantity: qty,
        transfer_date: date,
        notes: notes.trim() || null,
      });
      const sourceLabel = [sourceBranch?.branch_name, sourceRoom?.room_name].filter(Boolean).join(' · ');
      const destLabel = [destBranch?.branch_name, destRoom?.room_name].filter(Boolean).join(' · ');
      await onSaved({
        itemName: selectedBatch?.item.item_name ?? '',
        qty,
        unit: selectedBatch?.item.unit ?? '',
        source: sourceLabel,
        dest: destLabel,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal melakukan transfer');
    } finally {
      setSaving(false);
    }
  }

  function resetSource() {
    setSourceBranchId(null);
    setSourceRoomId(null);
    setSourceBatchId(null);
    setQuantity('');
    setSourceBatches([]);
  }

  const canSubmit = !!sourceBatchId && !!destRoomId && Number(quantity) > 0 && !saving;

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-600" />
          <CardTitle className="text-base">Transfer Stok</CardTitle>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Source */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Asal
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <RoomSelect
                id="src-branch"
                label="Cabang Asal *"
                branches={branches}
                value={sourceBranchId}
                disabled={loadingMeta}
                onChange={(v) => {
                  setSourceBranchId(v);
                  setSourceRoomId(null);
                  setSourceBatchId(null);
                }}
              />
              <SimpleRoomSelect
                id="src-room"
                label="Ruangan Asal *"
                rooms={sourceRooms}
                value={sourceRoomId}
                placeholder={!sourceBranchId ? '— Pilih cabang dulu —' : '— Pilih ruangan —'}
                onChange={(v) => {
                  setSourceRoomId(v);
                  setSourceBatchId(null);
                }}
              />
            </div>
          </div>

          {sourceRoomId && (
            <div className="space-y-1.5">
              <Label htmlFor="batch">Batch Sumber *</Label>
              {loadingBatches ? (
                <p className="text-sm text-slate-500 py-2">Memuat batch...</p>
              ) : sourceBatches.length === 0 ? (
                <p className="text-sm text-slate-500 py-2 italic">
                  Tidak ada stok di ruangan ini.
                </p>
              ) : (
                <select
                  id="batch"
                  required
                  value={sourceBatchId ?? ''}
                  onChange={(e) => {
                    setSourceBatchId(e.target.value ? Number(e.target.value) : null);
                    setQuantity('');
                  }}
                  className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  <option value="">— Pilih batch —</option>
                  {grouped.map((g) => (
                    <optgroup key={g.item.id} label={g.item.item_name}>
                      {g.batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batch_code ?? 'no-batch'} · {b.quantity} {g.item.unit}
                          {b.expiration_date ? ` · exp ${formatDate(b.expiration_date)}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {selectedBatch && selectedBatch.expiration_date && (
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <CalendarClock className="w-3 h-3" />
                  Kadaluarsa: {formatDate(selectedBatch.expiration_date)}
                </p>
              )}
            </div>
          )}

          <Separator />

          {/* Destination */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Tujuan
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <RoomSelect
                id="dest-branch"
                label="Cabang Tujuan *"
                branches={branches}
                value={destBranchId}
                disabled={loadingMeta}
                onChange={(v) => {
                  setDestBranchId(v);
                  setDestRoomId(null);
                }}
              />
              <SimpleRoomSelect
                id="dest-room"
                label="Ruangan Tujuan *"
                rooms={destRooms}
                value={destRoomId}
                placeholder={
                  !destBranchId
                    ? '— Pilih cabang dulu —'
                    : destRooms.length === 0
                      ? '— Tidak ada ruangan lain —'
                      : '— Pilih ruangan —'
                }
                onChange={(v) => setDestRoomId(v)}
              />
            </div>
          </div>

          {selectedBatch && destRoom && sourceBranchId && destBranchId && sourceBranchId !== destBranchId && (
            <div className="flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm text-violet-800">
              <Crown className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Transfer Lintas Cabang</p>
                <p className="text-xs mt-0.5">
                  Dari <strong>{sourceBranch?.branch_name}</strong> ke{' '}
                  <strong>{destBranch?.branch_name}</strong>. Hanya Owner yang dapat melakukan
                  transfer antar cabang — Kepala dengan scope tunggal akan ditolak oleh server.
                </p>
              </div>
            </div>
          )}

          {selectedBatch && destRoom && (
            <>
              <Separator />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="qty">
                    Jumlah *{' '}
                    <span className="text-slate-400 font-normal">
                      (max {selectedBatch.quantity} {selectedBatch.item.unit})
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
                  <Label htmlFor="date">Tanggal Transfer *</Label>
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
              <div className="space-y-1.5">
                <Label htmlFor="notes">Catatan (opsional)</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="mis. permintaan staf untuk prosedur..."
                />
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={resetSource}
              disabled={saving}
              className="mr-auto"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Asal
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Lakukan Transfer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RoomSelect({
  id,
  label,
  branches,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  branches: Branch[];
  value: number | null;
  disabled?: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        required
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
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
  );
}

function SimpleRoomSelect({
  id,
  label,
  rooms,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  rooms: Room[];
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        required
        disabled={rooms.length === 0}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
      >
        <option value="">{placeholder}</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.room_name}
          </option>
        ))}
      </select>
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
