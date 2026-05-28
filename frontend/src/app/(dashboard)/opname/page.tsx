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
import type { Item, Room } from '@/types';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  Save,
  StickyNote,
  User as UserIcon,
  X,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';

interface PrepareBatch {
  id: number;
  room_id: number;
  item_id: number;
  batch_code: string | null;
  quantity: number;
  expiration_date: string | null;
  item?: Item;
}

interface PreparedRoom {
  id: number;
  room_name: string;
  branch: { id: number; branch_name: string } | null;
}

interface OpnameHistory {
  id: number;
  opname_date: string;
  notes: string | null;
  total_items: number;
  total_discrepancies: number;
  items_count: number;
  room: { id: number; room_name: string; branch?: { branch_name: string } | null };
  user: { id: number; name: string };
}

interface OpnameItemDetail {
  id: number;
  system_qty: number;
  physical_qty: number;
  difference: number;
  notes: string | null;
  batch: {
    id: number;
    batch_code: string | null;
    expiration_date: string | null;
    item: { id: number; item_name: string; sku: string | null; unit: string } | null;
  };
}

interface OpnameDetail extends OpnameHistory {
  items: OpnameItemDetail[];
}

type LineDraft = {
  batch_id: number;
  item_name: string;
  batch_code: string | null;
  exp: string | null;
  system_qty: number;
  physical_qty: string;
  notes: string;
};

export default function OpnamePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [history, setHistory] = useState<OpnameHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, OpnameDetail>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: OpnameHistory[] }>('/stock-opname');
      setHistory(res.data);
      setExpandedId(null);
      setDetails({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadHistory();
  }, [user, loadHistory]);

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!details[id]) {
      setLoadingDetailId(id);
      try {
        const res = await api.get<{ data: OpnameDetail }>(`/stock-opname/${id}`);
        setDetails((prev) => ({ ...prev, [id]: res.data }));
      } finally {
        setLoadingDetailId(null);
      }
    }
  }

  if (authLoading || !user) return null;

  const perawatWithoutRoom = user.role === 'Perawat' && !user.room;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Stock Opname"
        description={
          user.role === 'Perawat'
            ? `Hitung fisik stok di ruangan tugas Anda${
                user.room ? ` (${user.room.room_name})` : ''
              }.`
            : 'Hitung fisik stok dan sinkronkan dengan data sistem secara berkala.'
        }
        actions={
          !formOpen &&
          !perawatWithoutRoom && (
            <Button onClick={() => setFormOpen(true)}>
              <ClipboardCheck className="w-4 h-4" />
              Mulai Opname Baru
            </Button>
          )
        }
      />

      {perawatWithoutRoom && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Anda belum ditugaskan ke ruangan manapun. Hubungi Kepala Cabang untuk diatur.
          </span>
        </div>
      )}

      {formOpen && (
        <OpnameForm
          lockedRoom={
            user.role === 'Perawat' && user.room
              ? {
                  id: user.room.id,
                  room_name: user.room.room_name,
                  branch: user.room.branch,
                }
              : null
          }
          onCancel={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await loadHistory();
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Opname</CardTitle>
          <CardDescription>
            Penyesuaian stok dari opname akan otomatis dicatat di laporan transaksi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat riwayat...
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Belum ada opname tercatat"
              description="Klik 'Mulai Opname Baru' untuk mencatat hasil hitung fisik pertama."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 px-3 font-medium w-8"></th>
                    <th className="py-2 px-3 font-medium">Tanggal</th>
                    <th className="py-2 px-3 font-medium">Ruangan</th>
                    <th className="py-2 px-3 font-medium">Petugas</th>
                    <th className="py-2 px-3 font-medium text-right">Item Dihitung</th>
                    <th className="py-2 px-3 font-medium text-right">Selisih</th>
                    <th className="py-2 px-3 font-medium">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => {
                    const isExpanded = expandedId === row.id;
                    const isLoadingDetail = loadingDetailId === row.id;
                    const detail = details[row.id];
                    return (
                      <Fragment key={row.id}>
                        <tr
                          onClick={() => toggleExpand(row.id)}
                          className={`border-b border-slate-100 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-blue-50/40' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-slate-400">
                            {isLoadingDetail ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">
                            {formatDate(row.opname_date)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div>
                              <p className="text-slate-800">{row.room.room_name}</p>
                              {row.room.branch && (
                                <p className="text-xs text-slate-500">{row.room.branch.branch_name}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{row.user.name}</td>
                          <td className="py-2.5 px-3 text-right text-slate-700">{row.total_items}</td>
                          <td className="py-2.5 px-3 text-right">
                            {row.total_discrepancies > 0 ? (
                              <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200 font-normal">
                                {row.total_discrepancies} selisih
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border border-emerald-200 font-normal">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Cocok
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 text-xs max-w-[12rem] truncate">
                            {row.notes ?? '—'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="bg-slate-50/60 px-3 pb-4">
                              <OpnameDetailPanel detail={detail} loading={isLoadingDetail} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
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

function OpnameForm({
  lockedRoom,
  onCancel,
  onSaved,
}: {
  lockedRoom: PreparedRoom | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState<number | null>(lockedRoom?.id ?? null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[] | null>(null);
  const [preparedRoom, setPreparedRoom] = useState<PreparedRoom | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(!lockedRoom);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (lockedRoom) return;
    api
      .get<{ data: Room[] }>('/rooms')
      .then((res) => setRooms(res.data))
      .finally(() => setLoadingRooms(false));
  }, [lockedRoom]);

  async function handlePrepare() {
    if (!roomId) return;
    setError('');
    setPreparing(true);
    try {
      const res = await api.post<{ room: PreparedRoom; batches: PrepareBatch[] }>(
        '/stock-opname/prepare',
        { room_id: roomId }
      );
      setPreparedRoom(res.room);
      setLines(
        res.batches.map((b) => ({
          batch_id: b.id,
          item_name: b.item?.item_name ?? `Item #${b.item_id}`,
          batch_code: b.batch_code,
          exp: b.expiration_date,
          system_qty: b.quantity,
          physical_qty: String(b.quantity),
          notes: '',
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat batch');
    } finally {
      setPreparing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lines || !roomId) return;
    setError('');
    setSaving(true);
    try {
      await api.post('/stock-opname', {
        room_id: roomId,
        opname_date: date,
        notes: notes || null,
        items: lines.map((l) => ({
          batch_id: l.batch_id,
          physical_qty: Number(l.physical_qty || 0),
          notes: l.notes || null,
        })),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan opname');
    } finally {
      setSaving(false);
    }
  }

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev ? prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)) : prev
    );
  }

  const discrepancyCount = lines?.filter(
    (l) => Number(l.physical_qty || 0) !== l.system_qty
  ).length ?? 0;

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-blue-600" />
          <CardTitle className="text-base">Opname Baru</CardTitle>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {!lines ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ruangan</Label>
                {lockedRoom ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm">
                    <span className="font-medium text-slate-800">{lockedRoom.room_name}</span>
                    {lockedRoom.branch && (
                      <span className="text-xs text-slate-500">
                        · {lockedRoom.branch.branch_name}
                      </span>
                    )}
                    <Badge
                      variant="secondary"
                      className="ml-auto bg-emerald-50 text-emerald-700 hover:bg-emerald-50 text-[10px] font-normal"
                    >
                      Ruangan tugas
                    </Badge>
                  </div>
                ) : (
                  <select
                    id="room"
                    required
                    disabled={loadingRooms}
                    value={roomId ?? ''}
                    onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : null)}
                    className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    <option value="">— Pilih —</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.branch?.branch_name ? `${r.branch.branch_name} · ` : ''}
                        {r.room_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Tanggal Opname *</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel} disabled={preparing}>
                Batal
              </Button>
              <Button onClick={handlePrepare} disabled={!roomId || preparing}>
                {preparing && <Loader2 className="w-4 h-4 animate-spin" />}
                Lanjut <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {preparedRoom?.branch?.branch_name && `${preparedRoom.branch.branch_name} · `}
                  {preparedRoom?.room_name}
                </p>
                <p className="text-xs text-slate-500">
                  Opname tanggal {formatDate(date)} · {lines.length} batch
                </p>
              </div>
              {discrepancyCount > 0 && (
                <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {discrepancyCount} batch berbeda dari sistem
                </Badge>
              )}
            </div>

            <Separator />

            {lines.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Tidak ada batch di ruangan ini"
                description="Tambahkan stok dulu lewat menu Barang Masuk."
              />
            ) : (
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2 px-3 font-medium">Barang</th>
                      <th className="py-2 px-3 font-medium">Batch / Exp</th>
                      <th className="py-2 px-3 font-medium text-right">Sistem</th>
                      <th className="py-2 px-3 font-medium text-right">Fisik</th>
                      <th className="py-2 px-3 font-medium text-right">Selisih</th>
                      <th className="py-2 px-3 font-medium">Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => {
                      const physical = Number(l.physical_qty || 0);
                      const diff = physical - l.system_qty;
                      return (
                        <tr key={l.batch_id} className="border-b border-slate-100">
                          <td className="py-2 px-3 font-medium text-slate-800">{l.item_name}</td>
                          <td className="py-2 px-3">
                            <div className="text-xs text-slate-600">
                              {l.batch_code ?? <span className="italic text-slate-400">no-batch</span>}
                            </div>
                            {l.exp && (
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <CalendarClock className="w-3 h-3" />
                                {formatDate(l.exp)}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600">{l.system_qty}</td>
                          <td className="py-2 px-3 text-right">
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              value={l.physical_qty}
                              onChange={(e) =>
                                updateLine(idx, { physical_qty: e.target.value })
                              }
                              className="h-8 w-20 ml-auto text-right"
                              required
                            />
                          </td>
                          <td className="py-2 px-3 text-right text-sm">
                            <span
                              className={
                                diff === 0
                                  ? 'text-slate-400'
                                  : diff > 0
                                    ? 'text-emerald-600 font-medium'
                                    : 'text-red-600 font-medium'
                              }
                            >
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              value={l.notes}
                              onChange={(e) => updateLine(idx, { notes: e.target.value })}
                              placeholder="opsional"
                              className="h-8 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="opname-notes">Catatan Opname (opsional)</Label>
              <Input
                id="opname-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="mis. Opname bulanan November, dilakukan setelah jam tutup"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              {!lockedRoom && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLines(null)}
                  disabled={saving}
                >
                  Ganti Ruangan
                </Button>
              )}
              <Button type="submit" disabled={saving || lines.length === 0}>
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Simpan & Sesuaikan Stok
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function OpnameDetailPanel({
  detail,
  loading,
}: {
  detail: OpnameDetail | undefined;
  loading: boolean;
}) {
  if (loading || !detail) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-slate-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Memuat detail...
      </div>
    );
  }

  const matched = detail.items.filter((i) => i.difference === 0);
  const surplus = detail.items.filter((i) => i.difference > 0);
  const shortage = detail.items.filter((i) => i.difference < 0);

  return (
    <div className="pt-3 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <DetailStat label="Total Item" value={String(detail.total_items)} />
        <DetailStat
          label="Cocok"
          value={String(matched.length)}
          color="text-emerald-700"
        />
        <DetailStat
          label="Surplus (+)"
          value={String(surplus.length)}
          color="text-emerald-700"
        />
        <DetailStat
          label="Kurang (-)"
          value={String(shortage.length)}
          color="text-red-700"
        />
      </div>

      {detail.notes && (
        <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
          <span>{detail.notes}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-50">
              <th className="py-1.5 px-3 font-medium">Barang</th>
              <th className="py-1.5 px-3 font-medium">Batch / Exp</th>
              <th className="py-1.5 px-3 font-medium text-right">Sistem</th>
              <th className="py-1.5 px-3 font-medium text-right">Fisik</th>
              <th className="py-1.5 px-3 font-medium text-right">Selisih</th>
              <th className="py-1.5 px-3 font-medium">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-slate-100 last:border-0 ${
                  item.difference === 0 ? '' : 'bg-amber-50/30'
                }`}
              >
                <td className="py-2 px-3">
                  <p className="font-medium text-slate-800">
                    {item.batch.item?.item_name ?? '—'}
                  </p>
                  {item.batch.item?.sku && (
                    <p className="text-[10px] text-slate-400 font-mono">{item.batch.item.sku}</p>
                  )}
                </td>
                <td className="py-2 px-3">
                  <p className="font-mono text-[11px] text-slate-700">
                    {item.batch.batch_code ?? (
                      <span className="italic text-slate-400">no-batch</span>
                    )}
                  </p>
                  {item.batch.expiration_date && (
                    <p className="flex items-center gap-1 text-[10px] text-slate-500">
                      <CalendarClock className="w-2.5 h-2.5" />
                      {formatDate(item.batch.expiration_date)}
                    </p>
                  )}
                </td>
                <td className="py-2 px-3 text-right text-slate-600">{item.system_qty}</td>
                <td className="py-2 px-3 text-right font-semibold text-slate-800">
                  {item.physical_qty}
                </td>
                <td className="py-2 px-3 text-right">
                  <span
                    className={
                      item.difference === 0
                        ? 'text-slate-400'
                        : item.difference > 0
                          ? 'text-emerald-700 font-semibold'
                          : 'text-red-700 font-semibold'
                    }
                  >
                    {item.difference > 0 ? `+${item.difference}` : item.difference}
                  </span>
                  {item.difference !== 0 && (
                    <span className="text-[10px] text-slate-400 ml-1">
                      {item.batch.item?.unit ?? ''}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-slate-500 max-w-[12rem] truncate">
                  {item.notes ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400 flex items-center gap-1">
        <UserIcon className="w-3 h-3" />
        Dilakukan oleh {detail.user.name} pada {formatDate(detail.opname_date)}.
        {detail.total_discrepancies > 0 && (
          <span>
            {' '}
            Penyesuaian otomatis: {detail.total_discrepancies} transaksi di laporan
            (tipe Penyesuaian +/-).
          </span>
        )}
      </p>
    </div>
  );
}

function DetailStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${color ?? 'text-slate-900'}`}>{value}</p>
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
