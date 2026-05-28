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
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  RotateCcw,
  ScrollText,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const ACTIONS = [
  'created',
  'updated',
  'deleted',
  'login',
  'logout',
  'inventory_resync',
] as const;
type Action = (typeof ACTIONS)[number];

const ACTION_META: Record<Action | string, { label: string; color: string }> = {
  created: { label: 'Dibuat', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  updated: { label: 'Diubah', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  deleted: { label: 'Dihapus', color: 'bg-red-50 text-red-700 border-red-200' },
  login: { label: 'Login', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  logout: { label: 'Logout', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  inventory_resync: {
    label: 'Resync Stok',
    color: 'bg-violet-50 text-violet-700 border-violet-200',
  },
};

const TYPES = ['User', 'Item', 'Branch', 'Room', 'Category', 'System'] as const;
type ObjType = (typeof TYPES)[number];

const TYPE_LABELS: Record<string, string> = {
  User: 'Pengguna',
  Item: 'Item',
  Branch: 'Cabang',
  Room: 'Ruangan',
  Category: 'Kategori',
  System: 'Sistem',
};

type DiffField = { old: unknown; new: unknown };
type Changes = Record<string, unknown> | Record<string, DiffField>;

interface AuditEntry {
  id: number;
  user_id: number | null;
  action: string;
  auditable_type: string | null;
  auditable_id: number | null;
  auditable_label: string | null;
  changes: Changes | null;
  ip_address: string | null;
  created_at: string;
  user: { id: number; name: string; role: string } | null;
}

interface PaginatedAudit {
  data: AuditEntry[];
  current_page: number;
  last_page: number;
  total: number;
}

interface ManagedUser {
  id: number;
  name: string;
  role: string;
}

const PER_PAGE = 50;

export default function AuditPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterAction, setFilterAction] = useState<Action | ''>('');
  const [filterType, setFilterType] = useState<ObjType | ''>('');
  const [filterUserId, setFilterUserId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PaginatedAudit | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'Kepala_Cabang') {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get<{ data: ManagedUser[] }>('/users');
      setUsers(res.data);
    } catch {
      // silent
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (filterAction) params.set('action', filterAction);
      if (filterType) params.set('type', filterType);
      if (filterUserId) params.set('user_id', String(filterUserId));
      params.set('per_page', String(PER_PAGE));
      params.set('page', String(page));
      const res = await api.get<PaginatedAudit>(`/audit-logs?${params}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, filterAction, filterType, filterUserId, page]);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang') {
      loadUsers();
    }
  }, [user, loadUsers]);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang') loadAudit();
  }, [user, loadAudit]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, filterAction, filterType, filterUserId]);

  function reset() {
    setDateFrom('');
    setDateTo('');
    setFilterAction('');
    setFilterType('');
    setFilterUserId(null);
  }

  function downloadCsv() {
    if (!data) return;
    const rows = [
      ['Waktu', 'Aksi', 'Objek', 'Label', 'Oleh', 'IP', 'Detail'],
      ...data.data.map((e) => [
        e.created_at,
        ACTION_META[e.action]?.label ?? e.action,
        e.auditable_type ? (TYPE_LABELS[e.auditable_type] ?? e.auditable_type) : '',
        e.auditable_label ?? '',
        e.user?.name ?? '(sistem)',
        e.ip_address ?? '',
        e.changes ? JSON.stringify(e.changes) : '',
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const range =
      dateFrom && dateTo ? `-${dateFrom}-to-${dateTo}` : '';
    a.download = `audit-log${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading || !user || user.role !== 'Kepala_Cabang') return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Audit Log"
        description="Catatan permanen siapa membuat, mengubah, atau menghapus data sensitif."
        actions={
          <Button
            variant="outline"
            onClick={downloadCsv}
            disabled={!data || data.data.length === 0}
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
              onClick={reset}
              className="ml-auto text-slate-500"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from">Dari</Label>
              <Input
                id="from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                max={dateTo || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">Sampai</Label>
              <Input
                id="to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                min={dateFrom || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-action">Aksi</Label>
              <select
                id="f-action"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value as Action | '')}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="">Semua</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_META[a].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-type">Objek</Label>
              <select
                id="f-type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as ObjType | '')}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="">Semua</option>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-user">Pengguna</Label>
              <select
                id="f-user"
                value={filterUserId ?? ''}
                onChange={(e) => setFilterUserId(e.target.value ? Number(e.target.value) : null)}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat audit log...
            </div>
          ) : !data || data.data.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Tidak ada entri ditemukan"
              description="Coba ubah filter, atau perubahan akan tercatat setelah ada aktivitas."
            />
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-3">
                Menampilkan {data.data.length} dari {data.total} entri
              </p>

              <div className="space-y-2">
                {data.data.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </div>

              {data.last_page > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    Halaman {data.current_page} dari {data.last_page} · {data.total} total
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
                      disabled={page >= data.last_page}
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

function AuditRow({ entry }: { entry: AuditEntry }) {
  const meta = ACTION_META[entry.action] ?? {
    label: entry.action,
    color: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  const typeLabel = entry.auditable_type
    ? TYPE_LABELS[entry.auditable_type] ?? entry.auditable_type
    : '—';

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className={`text-xs font-normal border ${meta.color}`}>{meta.label}</Badge>
        <span className="text-sm text-slate-500">{typeLabel}</span>
        <span className="font-medium text-slate-800">
          {entry.auditable_label ?? (entry.auditable_id ? `#${entry.auditable_id}` : '')}
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>oleh {entry.user?.name ?? 'sistem'}</span>
          {entry.ip_address && (
            <span className="font-mono text-[10px]">{entry.ip_address}</span>
          )}
          <span>{formatDateTime(entry.created_at)}</span>
        </div>
      </div>
      {entry.changes && entry.action !== 'login' && entry.action !== 'logout' && (
        <ChangeDiff action={entry.action} changes={entry.changes} />
      )}
    </div>
  );
}

function ChangeDiff({ action, changes }: { action: string; changes: Changes }) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  // updated: each value is { old, new }
  // created/deleted: each value is a primitive
  const isDiff = action === 'updated';

  return (
    <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {entries.map(([key, val]) => {
        if (isDiff && val && typeof val === 'object' && 'old' in val && 'new' in val) {
          const diff = val as DiffField;
          return (
            <div key={key} className="flex items-baseline gap-2">
              <span className="text-slate-400 font-mono shrink-0">{key}:</span>
              <span className="text-red-600 line-through">{renderValue(diff.old)}</span>
              <span className="text-slate-400">→</span>
              <span className="text-emerald-700 font-medium">{renderValue(diff.new)}</span>
            </div>
          );
        }
        return (
          <div key={key} className="flex items-baseline gap-2">
            <span className="text-slate-400 font-mono shrink-0">{key}:</span>
            <span className="text-slate-700">{renderValue(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
