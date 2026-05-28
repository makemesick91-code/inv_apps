'use client';

import { NotificationBell } from '@/components/notification-bell';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Building2,
  ClipboardCheck,
  Crown,
  Database,
  DoorOpen,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Package,
  ScrollText,
  Send,
  Stethoscope,
  Tag,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

type NavItem = { href: string; label: string; icon: LucideIcon; ownerOnly?: boolean };

const navKepala: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventori', label: 'Stok per Ruangan', icon: Package },
  { href: '/barang-masuk', label: 'Barang Masuk', icon: ArrowDownToLine },
  { href: '/barang-keluar', label: 'Barang Keluar', icon: ArrowUpFromLine },
  { href: '/transfer', label: 'Transfer Stok', icon: Send },
  { href: '/write-off', label: 'Penghapusan', icon: Trash2 },
  { href: '/opname', label: 'Stock Opname', icon: ClipboardCheck },
  { href: '/items', label: 'Master Item', icon: Boxes },
  { href: '/categories', label: 'Kategori', icon: Tag },
  { href: '/cabang', label: 'Cabang & Ruangan', icon: Building2 },
  { href: '/users', label: 'Pengguna', icon: Users },
  { href: '/laporan', label: 'Laporan', icon: FileBarChart },
  { href: '/audit', label: 'Audit Log', icon: ScrollText },
  { href: '/diagnostics', label: 'Diagnostik', icon: Database, ownerOnly: true },
];

const navPerawat: NavItem[] = [
  { href: '/inventori', label: 'Stok Ruangan', icon: Package },
  { href: '/barang-keluar', label: 'Catat Pemakaian', icon: ArrowUpFromLine },
  { href: '/write-off', label: 'Penghapusan', icon: Trash2 },
  { href: '/opname', label: 'Stock Opname', icon: ClipboardCheck },
];

function initials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) return null;

  const baseNav = user.role === 'Kepala_Cabang' ? navKepala : navPerawat;
  const nav = baseNav.filter((item) => !item.ownerOnly || user.is_owner);
  const roleLabel = user.role === 'Kepala_Cabang' ? 'Kepala Cabang' : 'Perawat';

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed inset-y-0 left-0">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-100">
          <div className="bg-blue-600 text-white p-2 rounded-lg shadow-sm shadow-blue-600/30">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm leading-tight">Klinik Gigi</p>
            <p className="text-xs text-slate-500">Inventori</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-3 mb-2">
            Menu
          </p>
          {nav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Separator />

        <div className="p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="w-9 h-9">
              <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
              <Badge
                variant="secondary"
                className="mt-0.5 bg-blue-50 text-blue-700 hover:bg-blue-50 text-[10px] px-1.5 py-0 h-4 font-medium"
              >
                {roleLabel}
              </Badge>
            </div>
          </div>
          {user.role === 'Perawat' && (
            <div className="mx-2 mb-2 px-2.5 py-2 rounded-md bg-emerald-50 border border-emerald-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Ruangan Tugas
              </p>
              {user.room ? (
                <div className="flex items-start gap-1.5 mt-1">
                  <DoorOpen className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">
                      {user.room.room_name}
                    </p>
                    {user.room.branch && (
                      <p className="text-[10px] text-slate-500 truncate">
                        {user.room.branch.branch_name}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-amber-700 mt-1">Belum ditugaskan</p>
              )}
            </div>
          )}
          {user.role === 'Kepala_Cabang' && (
            <div
              className={`mx-2 mb-2 px-2.5 py-2 rounded-md border ${
                user.is_owner
                  ? 'bg-violet-50 border-violet-100'
                  : 'bg-amber-50 border-amber-100'
              }`}
            >
              <p
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  user.is_owner ? 'text-violet-700' : 'text-amber-700'
                }`}
              >
                Cakupan
              </p>
              <div className="flex items-start gap-1.5 mt-1">
                {user.is_owner ? (
                  <>
                    <Crown className="w-3.5 h-3.5 text-violet-600 mt-0.5 shrink-0" />
                    <p className="text-xs font-medium text-slate-800">Owner · semua cabang</p>
                  </>
                ) : (
                  <>
                    <Building2 className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs font-medium text-slate-800 truncate">
                      {user.branch?.branch_name ?? 'Belum ditugaskan ke cabang'}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout().then(() => router.replace('/login'))}
            className="w-full justify-start gap-2 text-slate-600 hover:text-red-600 hover:bg-red-50 mt-1"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </Button>
        </div>
      </aside>

      <main className="flex-1 ml-64 flex flex-col min-h-screen">
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-100 flex items-center justify-end gap-2 h-12 px-6">
          <NotificationBell />
        </div>
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  );
}
