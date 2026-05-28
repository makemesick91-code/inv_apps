'use client';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface Mismatched {
  room_id: number;
  item_id: number;
  recorded: number;
  actual: number;
  delta: number;
  room_name: string;
  item_name: string;
}

interface Missing {
  room_id: number;
  item_id: number;
  actual: number;
  room_name: string;
  item_name: string;
}

interface Orphan {
  id: number;
  room_id: number;
  item_id: number;
  recorded: number;
  room_name: string;
  item_name: string;
}

interface DriftResponse {
  mismatched: Mismatched[];
  missing: Missing[];
  orphan: Orphan[];
  total: number;
}

interface FixResponse {
  message: string;
  result: { mismatchedFixed: number; missingCreated: number; orphanZeroed: number };
  after: DriftResponse;
}

export default function DiagnosticsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [drift, setDrift] = useState<DriftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [fixMsg, setFixMsg] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && user) {
      if (user.role !== 'Kepala_Cabang') {
        router.replace('/');
      } else if (user.is_owner === false) {
        // Non-Owner Kepala: backend would 403 anyway. Redirect with a flag
        // so the home page can render a friendly "Owner-only" toast.
        router.replace('/?notice=diagnostics_owner_only');
      }
    }
  }, [user, authLoading, router]);

  const scan = useCallback(async () => {
    setLoading(true);
    setFixMsg('');
    setSelected(new Set());
    try {
      const res = await api.get<DriftResponse>('/admin/inventory-drift');
      setDrift(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang' && user.is_owner !== false) scan();
  }, [user, scan]);

  async function fix(mode: 'all' | 'selected') {
    if (!drift || drift.total === 0) return;

    let body: object = {};
    let count = drift.total;

    if (mode === 'selected') {
      const sel = buildSelection(drift, selected);
      count =
        sel.mismatched.length + sel.missing.length + sel.orphan.length;
      if (count === 0) return;
      body = { selection: sel };
    }

    if (
      !confirm(
        `Akan memperbaiki ${count} masalah${mode === 'selected' ? ' yang dipilih' : ''}. Operasi atomik. Lanjutkan?`
      )
    ) return;

    setFixing(true);
    setFixMsg('');
    try {
      const res = await api.post<FixResponse>('/admin/inventory-drift/fix', body);
      setFixMsg(res.message);
      setDrift(res.after);
      setSelected(new Set());
    } catch (err) {
      setFixMsg(err instanceof Error ? err.message : 'Gagal memperbaiki');
    } finally {
      setFixing(false);
    }
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    if (!drift) return;
    const all = new Set<string>();
    drift.mismatched.forEach((r) => all.add(`m:${r.room_id}:${r.item_id}`));
    drift.missing.forEach((r) => all.add(`n:${r.room_id}:${r.item_id}`));
    drift.orphan.forEach((r) => all.add(`o:${r.id}`));
    setSelected(all);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  if (authLoading || !user || user.role !== 'Kepala_Cabang' || user.is_owner === false) return null;

  const isClean = drift?.total === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Diagnostik Konsistensi Stok"
        description="Bandingkan agregat inventori dengan jumlah riil per batch. Drift bisa muncul dari operasi DB langsung di luar aplikasi."
        actions={
          <Button variant="outline" onClick={scan} disabled={loading || fixing}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Pindai Ulang
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-500" />
            Status Konsistensi
          </CardTitle>
          <CardDescription>
            <strong>Mismatched</strong>: agregat tercatat ≠ jumlah batch riil ·{' '}
            <strong>Missing</strong>: batch ada tapi tidak ada baris agregat ·{' '}
            <strong>Orphan</strong>: agregat punya qty {'>'} 0 tapi tidak ada batch sama sekali.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memindai...
            </div>
          ) : isClean ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="bg-emerald-50 rounded-full p-3 mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-base font-semibold text-slate-800">Konsisten</p>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
                Semua agregat <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">inventories.quantity</code>
                {' '}cocok dengan jumlah aktual di <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">inventory_batches</code>.
              </p>
              {fixMsg && (
                <Badge className="mt-4 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border border-emerald-200 font-normal">
                  {fixMsg}
                </Badge>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">
                    Ditemukan {drift!.total} masalah konsistensi
                  </p>
                  <p className="text-xs mt-0.5">
                    {drift!.mismatched.length > 0 && `${drift!.mismatched.length} mismatched · `}
                    {drift!.missing.length > 0 && `${drift!.missing.length} missing · `}
                    {drift!.orphan.length > 0 && `${drift!.orphan.length} orphan`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={selected.size === drift!.total ? clearSelection : selectAll}
                    disabled={fixing}
                  >
                    {selected.size === drift!.total ? 'Batal Semua' : 'Pilih Semua'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => fix('selected')}
                    disabled={fixing || loading || selected.size === 0}
                  >
                    {fixing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wrench className="w-4 h-4" />
                    )}
                    Perbaiki Dipilih ({selected.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => fix('all')}
                    disabled={fixing || loading}
                  >
                    {fixing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wrench className="w-4 h-4" />
                    )}
                    Perbaiki Semua
                  </Button>
                </div>
              </div>

              {drift!.mismatched.length > 0 && (
                <DriftSection title={`Mismatched (${drift!.mismatched.length})`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="py-2 px-3 w-8"></th>
                        <th className="py-2 px-3 font-medium">Ruangan</th>
                        <th className="py-2 px-3 font-medium">Item</th>
                        <th className="py-2 px-3 font-medium text-right">Tercatat</th>
                        <th className="py-2 px-3 font-medium text-right">Aktual</th>
                        <th className="py-2 px-3 font-medium text-right">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drift!.mismatched.map((r, i) => {
                        const key = `m:${r.room_id}:${r.item_id}`;
                        return (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={selected.has(key)}
                                onChange={() => toggleSelect(key)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-slate-700">{r.room_name}</td>
                            <td className="py-2 px-3 font-medium text-slate-800">{r.item_name}</td>
                            <td className="py-2 px-3 text-right text-slate-600">{r.recorded}</td>
                            <td className="py-2 px-3 text-right text-slate-800 font-semibold">
                              {r.actual}
                            </td>
                            <td className={`py-2 px-3 text-right font-semibold ${
                              r.delta > 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}>
                              {r.delta > 0 ? `+${r.delta}` : r.delta}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </DriftSection>
              )}

              {drift!.missing.length > 0 && (
                <DriftSection title={`Missing (${drift!.missing.length})`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="py-2 px-3 w-8"></th>
                        <th className="py-2 px-3 font-medium">Ruangan</th>
                        <th className="py-2 px-3 font-medium">Item</th>
                        <th className="py-2 px-3 font-medium text-right">Akan dibuat dengan qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drift!.missing.map((r, i) => {
                        const key = `n:${r.room_id}:${r.item_id}`;
                        return (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={selected.has(key)}
                                onChange={() => toggleSelect(key)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-slate-700">{r.room_name}</td>
                            <td className="py-2 px-3 font-medium text-slate-800">{r.item_name}</td>
                            <td className="py-2 px-3 text-right text-slate-800 font-semibold">
                              {r.actual}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </DriftSection>
              )}

              {drift!.orphan.length > 0 && (
                <DriftSection title={`Orphan (${drift!.orphan.length})`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="py-2 px-3 w-8"></th>
                        <th className="py-2 px-3 font-medium">Ruangan</th>
                        <th className="py-2 px-3 font-medium">Item</th>
                        <th className="py-2 px-3 font-medium text-right">Tercatat (akan jadi 0)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drift!.orphan.map((r, i) => {
                        const key = `o:${r.id}`;
                        return (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-2 px-3">
                              <input
                                type="checkbox"
                                checked={selected.has(key)}
                                onChange={() => toggleSelect(key)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-3 text-slate-700">{r.room_name}</td>
                            <td className="py-2 px-3 font-medium text-slate-800">{r.item_name}</td>
                            <td className="py-2 px-3 text-right text-slate-600 line-through">
                              {r.recorded}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </DriftSection>
              )}

              {fixMsg && (
                <div className="text-sm text-slate-600 italic">{fixMsg}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Tips
          </p>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <span>
                Operasi normal aplikasi (barang masuk/keluar/opname/transfer) sudah otomatis
                menjaga konsistensi via <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">StockMovementService</code>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <span>
                Drift biasanya muncul kalau ada manipulasi DB langsung
                (raw SQL, bulk import lewat tools eksternal, migrasi data lama).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-1">•</span>
              <span>
                Bisa juga dijalankan dari CLI:{' '}
                <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">
                  php artisan inventories:resync --fix
                </code>
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function DriftSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
        {title}
      </p>
      <div className="rounded-md border border-slate-200 overflow-x-auto">{children}</div>
    </div>
  );
}

interface SelectionPayload {
  mismatched: { room_id: number; item_id: number }[];
  missing: { room_id: number; item_id: number }[];
  orphan: number[];
}

function buildSelection(drift: DriftResponse, selected: Set<string>): SelectionPayload {
  const result: SelectionPayload = { mismatched: [], missing: [], orphan: [] };
  for (const r of drift.mismatched) {
    if (selected.has(`m:${r.room_id}:${r.item_id}`)) {
      result.mismatched.push({ room_id: r.room_id, item_id: r.item_id });
    }
  }
  for (const r of drift.missing) {
    if (selected.has(`n:${r.room_id}:${r.item_id}`)) {
      result.missing.push({ room_id: r.room_id, item_id: r.item_id });
    }
  }
  for (const r of drift.orphan) {
    if (selected.has(`o:${r.id}`)) {
      result.orphan.push(r.id);
    }
  }
  return result;
}
