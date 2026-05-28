'use client';

import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Database,
  Loader2,
  PackageX,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type Severity = 'high' | 'medium' | 'low';
type NotifType = 'stock_out' | 'low_stock' | 'expired' | 'expiring_soon' | 'data_drift';

interface NotificationItem {
  type: NotifType;
  severity: Severity;
  title: string;
  body: string;
  link: string;
}

interface NotificationPayload {
  count: number;
  by_severity: { high: number; medium: number };
  items: NotificationItem[];
}

const POLL_INTERVAL_MS = 60_000;

const TYPE_META: Record<NotifType, { icon: LucideIcon; iconClass: string }> = {
  stock_out: { icon: PackageX, iconClass: 'text-red-600 bg-red-50' },
  low_stock: { icon: PackageX, iconClass: 'text-amber-600 bg-amber-50' },
  expired: { icon: CalendarClock, iconClass: 'text-red-600 bg-red-50' },
  expiring_soon: { icon: CalendarClock, iconClass: 'text-amber-600 bg-amber-50' },
  data_drift: { icon: Database, iconClass: 'text-red-600 bg-red-50' },
};

const SEVERITY_DOT: Record<Severity, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-300',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<NotificationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<NotificationPayload>('/notifications');
      setPayload(res);
    } catch {
      // silent — bell stays empty if request fails
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [open]);

  const count = payload?.count ?? 0;
  const hasHigh = (payload?.by_severity.high ?? 0) > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative h-9 w-9 rounded-lg flex items-center justify-center transition-colors ${
          open
            ? 'bg-slate-100 text-slate-900'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
        }`}
        title="Notifikasi"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span
            className={`absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
              hasHigh ? 'bg-red-500' : 'bg-amber-500'
            }`}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl shadow-slate-300/50 border border-slate-200 z-50 max-h-[32rem] flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Notifikasi</p>
              {payload && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {payload.count === 0
                    ? 'Tidak ada peringatan aktif'
                    : `${payload.count} peringatan aktif`}
                </p>
              )}
            </div>
            {payload && payload.by_severity.high > 0 && (
              <Badge className="bg-red-50 text-red-700 border border-red-200 font-normal text-[10px]">
                {payload.by_severity.high} kritis
              </Badge>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && !payload ? (
              <div className="flex items-center justify-center py-10 text-sm text-slate-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
              </div>
            ) : !payload || payload.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                <div className="bg-emerald-50 rounded-full p-3 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="text-sm font-medium text-slate-700">Semua aman</p>
                <p className="text-xs text-slate-500 mt-1">
                  Tidak ada stok kritis atau batch yang mendekati kadaluarsa.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payload.items.map((item, idx) => {
                  const meta = TYPE_META[item.type];
                  const Icon = meta?.icon ?? AlertTriangle;
                  return (
                    <li key={idx}>
                      <Link
                        href={item.link}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                      >
                        <div className={`p-2 rounded-lg shrink-0 ${meta?.iconClass ?? 'bg-slate-50 text-slate-500'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 leading-tight">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{item.body}</p>
                        </div>
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${SEVERITY_DOT[item.severity]}`}
                          title={item.severity}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-4 py-2 border-t border-slate-100">
            <button
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Bell className="w-3 h-3" />
              )}
              Refresh sekarang
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
