'use client';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  History,
  Loader2,
  Package,
} from 'lucide-react';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

type TxType =
  | 'in'
  | 'out'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'write_off';

const TYPE_META: Record<TxType, { label: string; color: string; sign: '+' | '-' }> = {
  in: { label: 'Masuk', color: 'bg-blue-50 text-blue-700 border-blue-200', sign: '+' },
  out: { label: 'Keluar', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', sign: '-' },
  adjustment_in: { label: 'Penyesuaian +', color: 'bg-amber-50 text-amber-700 border-amber-200', sign: '+' },
  adjustment_out: { label: 'Penyesuaian -', color: 'bg-amber-50 text-amber-700 border-amber-200', sign: '-' },
  transfer_in: { label: 'Transfer Masuk', color: 'bg-violet-50 text-violet-700 border-violet-200', sign: '+' },
  transfer_out: { label: 'Transfer Keluar', color: 'bg-violet-50 text-violet-700 border-violet-200', sign: '-' },
  write_off: { label: 'Penghapusan', color: 'bg-red-50 text-red-700 border-red-200', sign: '-' },
};

interface BatchInfo {
  id: number;
  batch_code: string | null;
  quantity: number;
  expiration_date: string | null;
  item: { id: number; item_name: string; sku: string | null; unit: string } | null;
  room: { id: number; room_name: string; branch_name: string | null } | null;
}

interface TxRow {
  id: number;
  type: TxType;
  quantity: number;
  signed_delta: number;
  running_balance: number;
  transaction_date: string;
  created_at: string;
  notes: string | null;
  user: { id: number; name: string } | null;
  transfer_counterpart: {
    batch_code: string | null;
    room_name: string | null;
    branch_name: string | null;
  } | null;
}

interface HistoryResponse {
  batch: BatchInfo;
  transactions: TxRow[];
  total_movements: number;
}

export default function BatchHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<HistoryResponse>(`/batches/${id}/history`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat riwayat');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || !user) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Riwayat Batch"
        description="Semua transaksi yang pernah menyentuh batch ini, urut waktu."
        actions={
          <Button render={<Link href="/inventori" />} variant="outline">
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Inventori
          </Button>
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center text-slate-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <BatchHeaderCard batch={data.batch} totalMovements={data.total_movements} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                Timeline Transaksi
              </CardTitle>
              <CardDescription>
                Saldo dihitung kumulatif dari transaksi tercatat (mulai dari 0). Selisih dengan
                qty aktual menandakan stok awal yang belum dicatat sebagai transaksi (mis. seeded
                data atau migrasi).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.transactions.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="Belum ada transaksi tercatat"
                  description="Batch ini belum pernah dipakai, ditransfer, atau di-adjust sejak dibuat."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="py-2 px-3 font-medium">Tanggal</th>
                        <th className="py-2 px-3 font-medium">Jenis</th>
                        <th className="py-2 px-3 font-medium text-right">Delta</th>
                        <th className="py-2 px-3 font-medium text-right">Saldo</th>
                        <th className="py-2 px-3 font-medium">Oleh</th>
                        <th className="py-2 px-3 font-medium">Catatan / Counterpart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transactions.map((t) => {
                        const meta = TYPE_META[t.type];
                        const unit = data.batch.item?.unit ?? '';
                        return (
                          <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                              {formatDate(t.transaction_date)}
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge className={`text-[10px] font-normal border ${meta.color}`}>
                                {meta.label}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span
                                className={`font-semibold ${
                                  t.signed_delta > 0
                                    ? 'text-emerald-700'
                                    : t.signed_delta < 0
                                      ? 'text-red-700'
                                      : 'text-slate-400'
                                }`}
                              >
                                {t.signed_delta > 0 ? '+' : ''}
                                {t.signed_delta}
                              </span>{' '}
                              <span className="text-xs text-slate-500 font-normal">{unit}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-800">
                              {t.running_balance}{' '}
                              <span className="text-xs text-slate-500 font-normal">{unit}</span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 text-xs">
                              {t.user?.name ?? <span className="italic text-slate-400">sistem</span>}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-500">
                              {t.notes && <p>{t.notes}</p>}
                              {t.transfer_counterpart && (
                                <p className="flex items-center gap-1 mt-0.5 text-violet-600">
                                  <ArrowRight className="w-3 h-3" />
                                  {t.transfer_counterpart.branch_name && (
                                    <span className="text-slate-400">
                                      {t.transfer_counterpart.branch_name} ·{' '}
                                    </span>
                                  )}
                                  {t.transfer_counterpart.room_name}
                                  {t.transfer_counterpart.batch_code && (
                                    <span className="text-slate-400 font-mono">
                                      {' ('}
                                      {t.transfer_counterpart.batch_code}
                                      {')'}
                                    </span>
                                  )}
                                </p>
                              )}
                              {!t.notes && !t.transfer_counterpart && (
                                <span className="text-slate-400">—</span>
                              )}
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
        </>
      ) : null}
    </div>
  );
}

function BatchHeaderCard({
  batch,
  totalMovements,
}: {
  batch: BatchInfo;
  totalMovements: number;
}) {
  const daysUntilExp = batch.expiration_date
    ? Math.ceil(
        (new Date(batch.expiration_date).getTime() - Date.now()) / 86400000
      )
    : null;
  const isExpired = daysUntilExp !== null && daysUntilExp < 0;
  const isExpiringSoon = daysUntilExp !== null && daysUntilExp >= 0 && daysUntilExp <= 30;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="bg-slate-100 text-slate-500 p-3 rounded-xl shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xl font-semibold text-slate-900">
                {batch.item?.item_name ?? '—'}
              </p>
              {batch.item?.sku && (
                <span className="text-xs text-slate-400 font-mono">{batch.item.sku}</span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
              <span className="text-slate-500">Batch:</span>
              <span className="font-mono text-slate-700">
                {batch.batch_code ?? (
                  <span className="italic text-slate-400">no-batch</span>
                )}
              </span>
              {batch.room && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600">
                    {batch.room.branch_name && (
                      <span className="text-slate-400">{batch.room.branch_name} · </span>
                    )}
                    {batch.room.room_name}
                  </span>
                </>
              )}
            </div>
            {batch.expiration_date && (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                <CalendarClock
                  className={`w-3.5 h-3.5 ${
                    isExpired
                      ? 'text-red-500'
                      : isExpiringSoon
                        ? 'text-amber-500'
                        : 'text-slate-400'
                  }`}
                />
                <span
                  className={
                    isExpired
                      ? 'text-red-700 font-medium'
                      : isExpiringSoon
                        ? 'text-amber-700 font-medium'
                        : 'text-slate-500'
                  }
                >
                  Exp {formatDate(batch.expiration_date)}
                  {daysUntilExp !== null && (
                    <span className="text-slate-400 ml-1">
                      ({isExpired ? `lewat ${-daysUntilExp}h` : `${daysUntilExp}h lagi`})
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
          <Separator orientation="vertical" className="h-16" />
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Qty Sekarang</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">
              {batch.quantity}{' '}
              <span className="text-base text-slate-500 font-normal">
                {batch.item?.unit ?? ''}
              </span>
            </p>
            <p className="text-xs text-slate-500 mt-1">{totalMovements} transaksi tercatat</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
