'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Package,
  PackageX,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

interface DashboardStats {
  total_items: number;
  low_stock_count: number;
  expiring_soon_count: number;
  transactions_7d: number;
}

interface CriticalItem {
  id: number;
  item_name: string;
  sku: string | null;
  unit: string;
  min_stock_level: number;
  total_stock: number;
}

interface ExpiringBatch {
  id: number;
  batch_code: string | null;
  quantity: number;
  expiration_date: string;
  item: { id: number; item_name: string; unit: string };
  room: { id: number; room_name: string; branch_name: string | null };
}

interface DashboardData {
  stats: DashboardStats;
  critical_items: CriticalItem[];
  expiring_batches: ExpiringBatch[];
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const notice = searchParams.get('notice');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (user?.role === 'Perawat') {
      router.replace('/barang-keluar');
    }
  }, [user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DashboardData>('/dashboard');
      setData(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang') load();
  }, [user, load]);

  if (!user || user.role === 'Perawat') return null;

  const stats = data?.stats;
  const hasAlerts =
    (data?.critical_items.length ?? 0) > 0 || (data?.expiring_batches.length ?? 0) > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {notice === 'diagnostics_owner_only' && !dismissed && (
        <div className="flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">
            Halaman Diagnostik Konsistensi hanya dapat diakses oleh Owner. Anda diarahkan
            kembali ke Dashboard.
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="text-violet-600 hover:text-violet-800 text-xs font-medium"
          >
            Tutup
          </button>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Selamat datang kembali, <span className="font-medium text-slate-700">{user.name}</span>.
            Berikut ringkasan inventori klinik Anda.
          </p>
        </div>
        <Badge variant="outline" className="border-slate-200 text-slate-600 font-normal">
          {new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Item"
          value={stats?.total_items ?? '—'}
          delta="Semua kategori"
          icon={Package}
          accent="blue"
          loading={loading}
        />
        <StatCard
          title="Stok Kritis"
          value={stats?.low_stock_count ?? '—'}
          delta="≤ stok minimum"
          icon={PackageX}
          accent="red"
          loading={loading}
        />
        <StatCard
          title="Hampir Kadaluarsa"
          value={stats?.expiring_soon_count ?? '—'}
          delta="≤ 30 hari ke depan"
          icon={CalendarClock}
          accent="amber"
          loading={loading}
        />
        <StatCard
          title="Transaksi 7 Hari"
          value={stats?.transactions_7d ?? '—'}
          delta="Masuk + keluar + opname"
          icon={TrendingUp}
          accent="emerald"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Perlu Perhatian
              </CardTitle>
              <CardDescription>
                Barang stok kritis dan batch mendekati masa kadaluarsa.
              </CardDescription>
            </div>
            <Button
              render={<Link href="/inventori" />}
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700"
            >
              Lihat semua <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-sm text-slate-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
              </div>
            ) : !hasAlerts ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="bg-emerald-50 rounded-full p-3 mb-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-sm font-medium text-slate-700">Tidak ada peringatan</p>
                <p className="text-xs text-slate-500 mt-1">
                  Semua stok di atas batas minimum dan tidak ada batch mendekati exp date.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {data!.critical_items.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <PackageX className="w-3 h-3" />
                      Stok di bawah minimum
                    </p>
                    <div className="space-y-1.5">
                      {data!.critical_items.map((it) => (
                        <CriticalItemRow key={it.id} item={it} />
                      ))}
                    </div>
                  </div>
                )}

                {data!.expiring_batches.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <CalendarClock className="w-3 h-3" />
                      Hampir kadaluarsa
                    </p>
                    <div className="space-y-1.5">
                      {data!.expiring_batches.map((b) => (
                        <ExpiringBatchRow key={b.id} batch={b} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aksi Cepat</CardTitle>
            <CardDescription>Jalan pintas operasi sehari-hari.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickAction
              href="/barang-masuk"
              icon={ArrowDownToLine}
              label="Catat Barang Masuk"
              hint="Dari supplier baru"
              accent="blue"
            />
            <QuickAction
              href="/barang-keluar"
              icon={ArrowUpFromLine}
              label="Catat Barang Keluar"
              hint="Pemakaian harian"
              accent="emerald"
            />
            <QuickAction
              href="/inventori"
              icon={Package}
              label="Cek Stok Ruangan"
              hint="Lihat detail per ruangan"
              accent="violet"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CriticalItemRow({ item }: { item: CriticalItem }) {
  const shortage = item.min_stock_level - item.total_stock;
  return (
    <Link
      href="/inventori"
      className="flex items-center gap-3 p-2.5 rounded-md border border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 transition-colors"
    >
      <div className="bg-amber-50 text-amber-600 p-1.5 rounded-md">
        <Package className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{item.item_name}</p>
        <p className="text-xs text-slate-500">
          {item.total_stock} {item.unit} dari minimum {item.min_stock_level}
        </p>
      </div>
      <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200 font-normal text-xs">
        {item.total_stock === 0 ? 'Habis' : `kurang ${shortage}`}
      </Badge>
    </Link>
  );
}

function ExpiringBatchRow({ batch }: { batch: ExpiringBatch }) {
  const days = daysUntil(batch.expiration_date);
  const isExpired = days < 0;
  return (
    <Link
      href="/inventori"
      className={`flex items-center gap-3 p-2.5 rounded-md border transition-colors ${
        isExpired
          ? 'border-red-200 hover:border-red-300 hover:bg-red-50/30'
          : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'
      }`}
    >
      <div
        className={`p-1.5 rounded-md ${
          isExpired ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
        }`}
      >
        <CalendarClock className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-800 truncate">
            {batch.item.item_name}
          </p>
          {batch.batch_code && (
            <span className="text-xs font-mono text-slate-400">{batch.batch_code}</span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {batch.quantity} {batch.item.unit} ·{' '}
          {batch.room.branch_name ? `${batch.room.branch_name} · ` : ''}
          {batch.room.room_name}
        </p>
      </div>
      <Badge
        className={
          isExpired
            ? 'bg-red-50 text-red-700 hover:bg-red-50 border border-red-200 font-normal text-xs'
            : 'bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200 font-normal text-xs'
        }
      >
        {isExpired ? `lewat ${-days}h` : `${days}h lagi`}
      </Badge>
    </Link>
  );
}

const accentMap = {
  blue: { ring: 'bg-blue-50 text-blue-600', delta: 'text-blue-600' },
  red: { ring: 'bg-red-50 text-red-600', delta: 'text-red-600' },
  amber: { ring: 'bg-amber-50 text-amber-600', delta: 'text-amber-600' },
  emerald: { ring: 'bg-emerald-50 text-emerald-600', delta: 'text-emerald-600' },
  violet: { ring: 'bg-violet-50 text-violet-600', delta: 'text-violet-600' },
} as const;

type Accent = keyof typeof accentMap;

function StatCard({
  title,
  value,
  delta,
  icon: Icon,
  accent,
  loading,
}: {
  title: string;
  value: number | string;
  delta: string;
  icon: LucideIcon;
  accent: Accent;
  loading?: boolean;
}) {
  const c = accentMap[accent];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            {loading ? (
              <div className="h-9 mt-2 flex items-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : (
              <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
            )}
            <p className={`text-xs font-medium mt-1 ${c.delta}`}>{delta}</p>
          </div>
          <div className={`p-2.5 rounded-xl ${c.ring}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  hint,
  accent,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  accent: Accent;
}) {
  const c = accentMap[accent];
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
    >
      <div className={`p-2 rounded-lg ${c.ring}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
    </Link>
  );
}

function daysUntil(iso: string): number {
  const target = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}
