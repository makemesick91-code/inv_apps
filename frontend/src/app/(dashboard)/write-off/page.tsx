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
  CalendarClock,
  CheckCircle2,
  Loader2,
  Package,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type BatchWithItem = InventoryBatch & { item: Item };

const REASONS = ['Rusak', 'Kadaluarsa', 'Hilang', 'Lainnya'] as const;
type Reason = (typeof REASONS)[number];

const REASON_META: Record<Reason, { color: string; hint: string }> = {
  Rusak: {
    color: 'bg-red-50 text-red-700 border-red-200',
    hint: 'Botol/alat pecah, syringe rusak, dll.',
  },
  Kadaluarsa: {
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    hint: 'Sudah lewat tanggal expired, dibuang.',
  },
  Hilang: {
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    hint: 'Tidak diketahui keberadaannya saat opname.',
  },
  Lainnya: {
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    hint: 'Alasan lain yang perlu didokumentasikan.',
  },
};

interface WriteOffRow {
  id: number;
  quantity: number;
  transaction_date: string;
  notes: string | null;
  batch: {
    id: number;
    batch_code: string | null;
    item: { id: number; item_name: string; unit: string } | null;
    room: { id: number; room_name: string; branch_name: string | null } | null;
  };
  user: { id: number; name: string } | null;
}

interface SuccessInfo {
  itemName: string;
  qty: number;
  unit: string;
  reason: Reason;
}

export default function WriteOffPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isPerawat = user?.role === 'Perawat';
  const lockedRoomId = isPerawat ? (user?.room?.id ?? null) : null;
  const lockedBranchId = isPerawat ? (user?.room?.branch?.id ?? null) : null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [batches, setBatches] = useState<BatchWithItem[]>([]);
  const [history, setHistory] = useState<WriteOffRow[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [lastSaved, setLastSaved] = useState<SuccessInfo | null>(null);

  const [branchId, setBranchId] = useState<number | null>(lockedBranchId);
  const [roomId, setRoomId] = useState<number | null>(lockedRoomId);
  const [itemId, setItemId] = useState<number | null>(null);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<Reason>('Rusak');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoadingMeta(false);
    }
  }, [isPerawat]);

  const loadBatches = useCallback(async () => {
    if (!isPerawat && !roomId) {
      setBatches([]);
      return;
    }
    setLoadingBatches(true);
    try {
      const url = isPerawat ? '/inventories' : `/inventories?room_id=${roomId}`;
      const res = await api.get<{ data: BatchWithItem[] }>(url);
      setBatches(res.data);
    } finally {
      setLoadingBatches(false);
    }
  }, [isPerawat, roomId]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get<WriteOffRow[]>('/transactions/write-offs');
      setHistory(res);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadMeta();
      loadHistory();
    }
  }, [user, loadMeta, loadHistory]);

  useEffect(() => {
    if (user && (roomId || isPerawat)) loadBatches();
  }, [user, roomId, isPerawat, loadBatches]);

  const filteredRooms = useMemo(
    () => (branchId ? rooms.filter((r) => r.branch_id === branchId) : []),
    [rooms, branchId]
  );

  const itemsInRoom = useMemo(() => {
    const map = new Map<number, { item: Item; batches: BatchWithItem[]; total: number }>();
    for (const b of batches) {
      const e = map.get(b.item_id) ?? { item: b.item, batches: [], total: 0 };
      e.batches.push(b);
      e.total += b.quantity;
      map.set(b.item_id, e);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.item.item_name.localeCompare(b.item.item_name)
    );
  }, [batches]);

  const selectedItemEntry = itemsInRoom.find((e) => e.item.id === itemId) ?? null;
  const selectedBatch = selectedItemEntry?.batches.find((b) => b.id === batchId) ?? null;

  useEffect(() => {
    if (selectedItemEntry && !selectedItemEntry.batches.some((b) => b.id === batchId)) {
      setBatchId(selectedItemEntry.batches[0]?.id ?? null);
    }
  }, [selectedItemEntry, batchId]);

  function resetItemFields() {
    setItemId(null);
    setBatchId(null);
    setQuantity('');
    setReason('Rusak');
    setNotes('');
    setError('');
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!batchId) return;
    const qty = Number(quantity);
    if (qty <= 0) {
      setError('Jumlah harus lebih dari nol.');
      return;
    }
    if (selectedBatch && qty > selectedBatch.quantity) {
      setError(
        `Jumlah melebihi stok batch ini (${selectedBatch.quantity} ${selectedItemEntry?.item.unit ?? ''}).`
      );
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.post('/transactions/write-off', {
        batch_id: batchId,
        quantity: qty,
        reason,
        transaction_date: date,
        notes: notes.trim() || null,
      });
      setLastSaved({
        itemName: selectedItemEntry?.item.item_name ?? '',
        qty,
        unit: selectedItemEntry?.item.unit ?? '',
        reason,
      });
      await Promise.all([loadBatches(), loadHistory()]);
      resetItemFields();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user) return null;

  const perawatNoRoom = isPerawat && !user.room;
  const canSubmit = !!batchId && Number(quantity) > 0 && !saving;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Penghapusan Stok"
        description="Catat barang yang dihapus dari stok karena rusak, kadaluarsa, atau hilang — bukan pemakaian normal."
      />

      {perawatNoRoom && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Anda belum ditugaskan ke ruangan manapun.</span>
        </div>
      )}

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
            Tercatat: <strong>{lastSaved.qty} {lastSaved.unit}</strong> {lastSaved.itemName} dihapus
            karena <strong>{lastSaved.reason}</strong>.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-600" />
            Form Penghapusan
          </CardTitle>
          <CardDescription>
            Penghapusan akan mengurangi stok dari batch yang dipilih dan tercatat terpisah dari
            pemakaian normal di laporan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Lokasi */}
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
                          ? '— Belum ada ruangan —'
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

            {loadingBatches ? (
              <div className="flex items-center justify-center py-8 text-sm text-slate-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat stok...
              </div>
            ) : itemsInRoom.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Tidak ada stok di ruangan ini"
                description="Tidak ada batch untuk dihapus."
              />
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="item">Barang *</Label>
                  <select
                    id="item"
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

                {selectedItemEntry && selectedItemEntry.batches.length > 1 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="batch">Pilih Batch *</Label>
                    <select
                      id="batch"
                      required
                      value={batchId ?? ''}
                      onChange={(e) => setBatchId(e.target.value ? Number(e.target.value) : null)}
                      className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    >
                      {selectedItemEntry.batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batch_code ?? 'no-batch'} · {b.quantity} {selectedItemEntry.item.unit}
                          {b.expiration_date ? ` · exp ${formatDate(b.expiration_date)}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedBatch && (
                  <>
                    <div className="space-y-2">
                      <Label>Alasan Penghapusan *</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {REASONS.map((r) => {
                          const meta = REASON_META[r];
                          const active = reason === r;
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setReason(r)}
                              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                active
                                  ? meta.color
                                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-500">{REASON_META[reason].hint}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="qty">
                          Jumlah Dihapus *{' '}
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

                    <div className="space-y-1.5">
                      <Label htmlFor="notes">Detail (opsional)</Label>
                      <Input
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="mis. ampul pecah saat angkut dari supplier"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
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
              <Button type="submit" disabled={!canSubmit} variant="destructive">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Hapus dari Stok
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Penghapusan</CardTitle>
          <CardDescription>
            50 penghapusan terkini{isPerawat ? ' di ruangan Anda' : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={Trash2}
              title="Belum ada penghapusan"
              description="Penghapusan stok yang dicatat akan muncul di sini."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 px-3 font-medium">Tanggal</th>
                    <th className="py-2 px-3 font-medium">Barang</th>
                    <th className="py-2 px-3 font-medium">Alasan</th>
                    {!isPerawat && <th className="py-2 px-3 font-medium">Ruangan</th>}
                    <th className="py-2 px-3 font-medium text-right">Qty</th>
                    <th className="py-2 px-3 font-medium">Oleh</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => {
                    const reasonTag = parseReasonTag(row.notes);
                    return (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-700">
                          {formatDate(row.transaction_date)}
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-slate-800">
                            {row.batch.item?.item_name ?? '—'}
                          </p>
                          {row.batch.batch_code && (
                            <p className="text-xs text-slate-400 font-mono">
                              {row.batch.batch_code}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {reasonTag ? (
                            <Badge
                              className={`text-xs font-normal border ${
                                REASON_META[reasonTag.reason as Reason]?.color ??
                                'bg-slate-50 text-slate-700 border-slate-200'
                              }`}
                            >
                              {reasonTag.reason}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                          {reasonTag?.detail && (
                            <p className="text-xs text-slate-500 mt-1">{reasonTag.detail}</p>
                          )}
                        </td>
                        {!isPerawat && (
                          <td className="py-2.5 px-3 text-xs text-slate-600">
                            {row.batch.room?.branch_name && (
                              <span className="text-slate-400">{row.batch.room.branch_name} · </span>
                            )}
                            {row.batch.room?.room_name ?? '—'}
                          </td>
                        )}
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                          {row.quantity}{' '}
                          <span className="text-xs text-slate-500 font-normal">
                            {row.batch.item?.unit ?? ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-500">
                          {row.user?.name ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function parseReasonTag(notes: string | null): { reason: string; detail: string } | null {
  if (!notes) return null;
  const match = notes.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return null;
  return { reason: match[1], detail: match[2].trim() };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
