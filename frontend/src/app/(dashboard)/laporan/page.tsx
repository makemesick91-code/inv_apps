'use client';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { Branch, Item, Room } from '@/types';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileBarChart,
  Filter,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type TxType =
  | 'in'
  | 'out'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'write_off';

const TYPE_META: Record<TxType, { label: string; color: string }> = {
  in: { label: 'Masuk', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  out: { label: 'Keluar', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  adjustment_in: { label: 'Penyesuaian +', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  adjustment_out: { label: 'Penyesuaian -', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  transfer_in: { label: 'Transfer Masuk', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  transfer_out: { label: 'Transfer Keluar', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  write_off: { label: 'Penghapusan', color: 'bg-red-50 text-red-700 border-red-200' },
};

const ALL_TYPES: TxType[] = [
  'in',
  'out',
  'adjustment_in',
  'adjustment_out',
  'transfer_in',
  'transfer_out',
  'write_off',
];

interface TxRow {
  id: number;
  type: TxType;
  quantity: number;
  transaction_date: string;
  notes: string | null;
  batch: {
    id: number;
    batch_code: string | null;
    item: { id: number; item_name: string; sku: string | null; unit: string } | null;
    room: { id: number; room_name: string; branch: { id: number; branch_name: string } | null } | null;
  } | null;
  user: { id: number; name: string } | null;
}

interface ReportResponse {
  data: TxRow[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
  summary: Record<string, { type: TxType; count: number; total_qty: number }>;
}

interface ManagedUser {
  id: number;
  name: string;
  role: string;
}

const PER_PAGE = 50;

export default function LaporanPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Filter state
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedTypes, setSelectedTypes] = useState<Set<TxType>>(new Set(ALL_TYPES));
  const [branchId, setBranchId] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // Data state
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'Kepala_Cabang') {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [b, r, i, u] = await Promise.all([
        api.get<{ data: Branch[] }>('/branches'),
        api.get<{ data: Room[] }>('/rooms'),
        api.get<{ data: Item[] }>('/items'),
        api.get<{ data: ManagedUser[] }>('/users'),
      ]);
      setBranches(b.data);
      setRooms(r.data);
      setItems(i.data);
      setUsers(u.data);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      selectedTypes.forEach((t) => params.append('types[]', t));
      if (branchId) params.set('branch_id', String(branchId));
      if (roomId) params.set('room_id', String(roomId));
      if (itemId) params.set('item_id', String(itemId));
      if (userId) params.set('user_id', String(userId));
      params.set('per_page', String(PER_PAGE));
      params.set('page', String(page));

      const res = await api.get<ReportResponse>(`/reports/transactions?${params}`);
      setReport(res);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedTypes, branchId, roomId, itemId, userId, page]);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang') loadMeta();
  }, [user, loadMeta]);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang') loadReport();
  }, [user, loadReport]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, selectedTypes, branchId, roomId, itemId, userId]);

  const filteredRooms = useMemo(
    () => (branchId ? rooms.filter((r) => r.branch_id === branchId) : rooms),
    [rooms, branchId]
  );

  function toggleType(t: TxType) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function resetFilters() {
    setDateFrom(weekAgo);
    setDateTo(today);
    setSelectedTypes(new Set(ALL_TYPES));
    setBranchId(null);
    setRoomId(null);
    setItemId(null);
    setUserId(null);
  }

  function downloadCsv() {
    if (!report) return;
    const rows = [
      ['Tanggal', 'Tipe', 'Barang', 'SKU', 'Kode Batch', 'Cabang', 'Ruangan', 'Jumlah', 'Satuan', 'Oleh', 'Catatan'],
      ...report.data.map((tx) => [
        formatDate(tx.transaction_date),
        TYPE_META[tx.type]?.label ?? tx.type,
        tx.batch?.item?.item_name ?? '',
        tx.batch?.item?.sku ?? '',
        tx.batch?.batch_code ?? '',
        tx.batch?.room?.branch?.branch_name ?? '',
        tx.batch?.room?.room_name ?? '',
        String(tx.quantity),
        tx.batch?.item?.unit ?? '',
        tx.user?.name ?? '',
        tx.notes ?? '',
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-transaksi-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading || !user || user.role !== 'Kepala_Cabang') return null;

  const totalRows = report?.meta.total ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Laporan Transaksi"
        description="Audit pergerakan stok dengan filter dan unduh CSV."
        actions={
          <Button
            variant="outline"
            onClick={downloadCsv}
            disabled={!report || report.data.length === 0}
          >
            <Download className="w-4 h-4" />
            Unduh CSV (halaman ini)
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">Filter</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="ml-auto text-slate-500"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from">Dari Tanggal</Label>
              <Input
                id="from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                max={dateTo}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">Sampai Tanggal</Label>
              <Input
                id="to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                min={dateFrom}
                max={today}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-branch">Cabang</Label>
              <select
                id="f-branch"
                disabled={loadingMeta}
                value={branchId ?? ''}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setBranchId(v);
                  setRoomId(null);
                }}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="">Semua</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-room">Ruangan</Label>
              <select
                id="f-room"
                disabled={loadingMeta}
                value={roomId ?? ''}
                onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : null)}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="">Semua</option>
                {filteredRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-item">Barang</Label>
              <select
                id="f-item"
                disabled={loadingMeta}
                value={itemId ?? ''}
                onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : null)}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="">Semua</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.item_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-user">Pengguna</Label>
              <select
                id="f-user"
                disabled={loadingMeta}
                value={userId ?? ''}
                onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : null)}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="">Semua</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-slate-500">Jenis Transaksi</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TYPES.map((t) => {
                const meta = TYPE_META[t];
                const active = selectedTypes.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      active
                        ? meta.color
                        : 'border-slate-200 text-slate-400 hover:border-slate-300 line-through'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary chips */}
      {report && Object.keys(report.summary).length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-slate-300 text-slate-700 font-medium px-3 py-1">
            Total: {totalRows} transaksi
          </Badge>
          {Object.values(report.summary).map((s) => (
            <Badge
              key={s.type}
              className={`px-3 py-1 font-normal border ${TYPE_META[s.type]?.color ?? ''}`}
            >
              {TYPE_META[s.type]?.label}: {s.count} · {s.total_qty} unit
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat transaksi...
            </div>
          ) : !report || report.data.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="Tidak ada transaksi di rentang ini"
              description="Coba ubah filter tanggal atau jenis transaksi."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2 px-3 font-medium">Tanggal</th>
                      <th className="py-2 px-3 font-medium">Jenis</th>
                      <th className="py-2 px-3 font-medium">Barang</th>
                      <th className="py-2 px-3 font-medium">Ruangan</th>
                      <th className="py-2 px-3 font-medium text-right">Qty</th>
                      <th className="py-2 px-3 font-medium">Oleh</th>
                      <th className="py-2 px-3 font-medium">Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.map((tx) => {
                      const meta = TYPE_META[tx.type];
                      return (
                        <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                            {formatDate(tx.transaction_date)}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              className={`text-[10px] font-normal border ${meta?.color ?? ''}`}
                            >
                              {meta?.label ?? tx.type}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-slate-800">
                              {tx.batch?.item?.item_name ?? '—'}
                            </p>
                            {tx.batch?.batch_code && (
                              <p className="text-xs text-slate-400 font-mono">
                                {tx.batch.batch_code}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">
                            {tx.batch?.room?.branch?.branch_name && (
                              <span className="text-slate-400">
                                {tx.batch.room.branch.branch_name} ·{' '}
                              </span>
                            )}
                            {tx.batch?.room?.room_name ?? '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                            {tx.quantity}{' '}
                            <span className="text-xs text-slate-500 font-normal">
                              {tx.batch?.item?.unit ?? ''}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-500">
                            {tx.user?.name ?? '—'}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-500 max-w-[16rem] truncate">
                            {tx.notes ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {report.meta.last_page > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Halaman {report.meta.current_page} dari {report.meta.last_page} ·{' '}
                    {report.meta.total} total
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Sebelumnya
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= report.meta.last_page}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Berikutnya
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
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
