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
import type { Branch, InventoryBatch, Item, Room } from '@/types';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  Package,
  PackageX,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type BatchWithItem = InventoryBatch & { item: Item };

type ItemGroup = {
  item: Item;
  total: number;
  batches: BatchWithItem[];
  hasExpiringSoon: boolean;
  hasExpired: boolean;
};

const EXPIRY_THRESHOLD_DAYS = 30;

export default function InventoriPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isPerawat = user?.role === 'Perawat';
  const lockedRoomId = isPerawat ? (user?.room?.id ?? null) : null;
  const lockedBranchId = isPerawat ? (user?.room?.branch?.id ?? null) : null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [batches, setBatches] = useState<BatchWithItem[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error, setError] = useState('');

  const [branchId, setBranchId] = useState<number | null>(lockedBranchId);
  const [roomId, setRoomId] = useState<number | null>(lockedRoomId);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    if (user) loadMeta();
  }, [user, loadMeta]);

  const loadBatches = useCallback(async () => {
    if (!isPerawat && !roomId) {
      setBatches([]);
      return;
    }
    setLoadingBatches(true);
    setError('');
    try {
      const url = isPerawat ? '/inventories' : `/inventories?room_id=${roomId}`;
      const res = await api.get<{ data: BatchWithItem[] }>(url);
      setBatches(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat stok');
    } finally {
      setLoadingBatches(false);
    }
  }, [isPerawat, roomId]);

  useEffect(() => {
    if (user && (roomId || isPerawat)) loadBatches();
  }, [user, roomId, isPerawat, loadBatches]);

  const filteredRooms = useMemo(
    () => (branchId ? rooms.filter((r) => r.branch_id === branchId) : []),
    [rooms, branchId]
  );

  const groups: ItemGroup[] = useMemo(() => {
    const map = new Map<number, ItemGroup>();
    for (const b of batches) {
      const entry = map.get(b.item_id) ?? {
        item: b.item,
        total: 0,
        batches: [],
        hasExpiringSoon: false,
        hasExpired: false,
      };
      entry.batches.push(b);
      entry.total += b.quantity;
      if (b.expiration_date) {
        const d = daysUntil(b.expiration_date);
        if (d < 0) entry.hasExpired = true;
        else if (d <= EXPIRY_THRESHOLD_DAYS) entry.hasExpiringSoon = true;
      }
      map.set(b.item_id, entry);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.item.item_name.localeCompare(b.item.item_name)
    );
  }, [batches]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.item.item_name.toLowerCase().includes(q) ||
        (g.item.sku ?? '').toLowerCase().includes(q)
    );
  }, [groups, search]);

  const summary = useMemo(() => {
    const totalItems = groups.length;
    const lowStock = groups.filter(
      (g) => g.item.min_stock_level > 0 && g.total <= g.item.min_stock_level
    ).length;
    const expiringSoon = groups.filter((g) => g.hasExpiringSoon || g.hasExpired).length;
    return { totalItems, lowStock, expiringSoon };
  }, [groups]);

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (authLoading || !user) return null;

  const perawatNoRoom = isPerawat && !user.room;
  const currentRoom = rooms.find((r) => r.id === roomId);
  const currentBranch = branches.find((b) => b.id === branchId);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Stok per Ruangan"
        description={
          isPerawat
            ? `Stok di ruangan tugas Anda${user.room ? ` (${user.room.room_name})` : ''}.`
            : 'Lihat distribusi stok per cabang dan ruangan.'
        }
        actions={
          !isPerawat && (
            <Button render={<Link href="/barang-masuk" />} variant="outline">
              <ArrowDownToLine className="w-4 h-4" />
              Tambah Stok
            </Button>
          )
        }
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

      {!isPerawat && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="branch">Cabang</Label>
                <select
                  id="branch"
                  disabled={loadingMeta}
                  value={branchId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    setBranchId(v);
                    setRoomId(null);
                    setBatches([]);
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
                <Label htmlFor="room">Ruangan</Label>
                <select
                  id="room"
                  disabled={!branchId || filteredRooms.length === 0}
                  value={roomId ?? ''}
                  onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : null)}
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
          </CardContent>
        </Card>
      )}

      {/* Show content only when a room is determined */}
      {(roomId || isPerawat) && !perawatNoRoom && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              icon={Package}
              label="Item dengan Stok"
              value={summary.totalItems}
              accent="blue"
            />
            <SummaryCard
              icon={PackageX}
              label="Stok di Bawah Minimum"
              value={summary.lowStock}
              accent="red"
            />
            <SummaryCard
              icon={AlertTriangle}
              label="Kadaluarsa ≤ 30 Hari"
              value={summary.expiringSoon}
              accent="amber"
            />
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Cari nama atau SKU..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <p className="text-xs text-slate-500 ml-auto">
                  {filteredGroups.length} dari {groups.length} item
                  {!isPerawat && currentBranch && currentRoom && (
                    <>
                      {' · '}
                      <span className="font-medium text-slate-700">
                        {currentBranch.branch_name} · {currentRoom.room_name}
                      </span>
                    </>
                  )}
                </p>
              </div>

              {loadingBatches ? (
                <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat stok...
                </div>
              ) : groups.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Belum ada stok di ruangan ini"
                  description={
                    isPerawat
                      ? 'Belum ada barang masuk ke ruangan Anda.'
                      : 'Catat barang masuk ke ruangan ini untuk mulai melihat stok.'
                  }
                  action={
                    !isPerawat && (
                      <Button render={<Link href="/barang-masuk" />}>
                        <ArrowDownToLine className="w-4 h-4" />
                        Catat Barang Masuk
                      </Button>
                    )
                  }
                />
              ) : filteredGroups.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  Tidak ada item yang cocok dengan pencarian.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredGroups.map((g) => (
                    <ItemRow
                      key={g.item.id}
                      group={g}
                      expanded={expanded.has(g.item.id)}
                      onToggle={() => toggleExpanded(g.item.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!isPerawat && !roomId && (
        <EmptyState
          icon={Package}
          title="Pilih ruangan untuk lihat stok"
          description="Pilih cabang dan ruangan di atas untuk menampilkan distribusi stoknya."
        />
      )}
    </div>
  );
}

function ItemRow({
  group,
  expanded,
  onToggle,
}: {
  group: ItemGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { item, total, batches, hasExpired, hasExpiringSoon } = group;
  const isLow = item.min_stock_level > 0 && total <= item.min_stock_level;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="bg-slate-100 text-slate-500 p-2 rounded-md">
          <Package className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900">{item.item_name}</span>
            {item.sku && (
              <span className="text-xs text-slate-400 font-mono">{item.sku}</span>
            )}
            {hasExpired && (
              <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border border-red-200 text-[10px] font-normal">
                Ada batch kadaluarsa
              </Badge>
            )}
            {!hasExpired && hasExpiringSoon && (
              <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200 text-[10px] font-normal">
                Hampir kadaluarsa
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {batches.length} batch
            {item.min_stock_level > 0 && (
              <span> · min {item.min_stock_level} {item.unit}</span>
            )}
          </p>
        </div>
        <div className="text-right">
          {isLow ? (
            <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200 font-normal">
              {total} {item.unit} · rendah
            </Badge>
          ) : (
            <span className="font-semibold text-slate-800">
              {total}{' '}
              <span className="text-xs text-slate-500 font-normal">{item.unit}</span>
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-2 px-3 font-medium pl-12">Batch</th>
                <th className="py-2 px-3 font-medium">Kadaluarsa</th>
                <th className="py-2 px-3 font-medium text-right">Qty</th>
                <th className="py-2 px-3 font-medium text-right pr-4 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b, idx) => {
                const days = b.expiration_date ? daysUntil(b.expiration_date) : null;
                const isExpired = days !== null && days < 0;
                const isExpiringSoon = days !== null && days >= 0 && days <= EXPIRY_THRESHOLD_DAYS;
                return (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="py-2 px-3 pl-12">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">
                          {b.batch_code ?? (
                            <span className="italic text-slate-400">no-batch</span>
                          )}
                        </span>
                        {idx === 0 && b.expiration_date && (
                          <Badge
                            variant="secondary"
                            className="bg-blue-50 text-blue-700 hover:bg-blue-50 text-[10px] font-normal"
                          >
                            FEFO
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      {b.expiration_date ? (
                        <div className="flex items-center gap-1.5">
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
                            className={`text-xs ${
                              isExpired
                                ? 'text-red-700 font-medium'
                                : isExpiringSoon
                                  ? 'text-amber-700 font-medium'
                                  : 'text-slate-600'
                            }`}
                          >
                            {formatDate(b.expiration_date)}
                            {days !== null && (
                              <span className="text-slate-400 ml-1">
                                ({isExpired ? `lewat ${-days}h` : `${days}h lagi`})
                              </span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">tidak ada</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-slate-800">
                      {b.quantity}{' '}
                      <span className="text-xs text-slate-500 font-normal">{group.item.unit}</span>
                    </td>
                    <td className="py-2 px-3 text-right pr-4">
                      <Link
                        href={`/inventori/batch/${b.id}`}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                        title="Lihat riwayat transaksi batch ini"
                      >
                        <History className="w-3 h-3" />
                        Riwayat
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  accent: 'blue' | 'red' | 'amber';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${colors[accent]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
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

function daysUntil(iso: string): number {
  const target = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}
