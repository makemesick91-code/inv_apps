'use client';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { Branch, Role, Room } from '@/types';
import {
  AlertCircle,
  Building,
  Crown,
  DoorOpen,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Stethoscope,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_owner?: boolean;
  branch: { id: number; branch_name: string } | null;
  room: {
    id: number;
    room_name: string;
    branch: { id: number; branch_name: string } | null;
  } | null;
  created_at?: string;
}

export default function UsersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'Kepala_Cabang') {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, b, r] = await Promise.all([
        api.get<{ data: ManagedUser[] }>('/users'),
        api.get<{ data: Branch[] }>('/branches'),
        api.get<{ data: Room[] }>('/rooms'),
      ]);
      setUsers(u.data);
      setBranches(b.data);
      setRooms(r.data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang') load();
  }, [user, load]);

  async function handleDelete(target: ManagedUser) {
    if (!confirm(`Hapus pengguna "${target.name}" (${target.email})?`)) return;
    try {
      await api.delete(`/users/${target.id}`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus');
    }
  }

  if (authLoading || !user || user.role !== 'Kepala_Cabang') return null;

  const kepalaCount = users.filter((u) => u.role === 'Kepala_Cabang').length;
  const perawatCount = users.filter((u) => u.role === 'Perawat').length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Pengguna"
        description="Kelola akun Kepala Cabang dan Perawat beserta penugasan ruangannya."
        actions={
          !showAdd && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" />
              Tambah Pengguna
            </Button>
          )
        }
      />

      {showAdd && (
        <UserForm
          branches={branches}
          rooms={rooms}
          onCancel={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false);
            await load();
          }}
        />
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatBox icon={Users} label="Total Pengguna" value={users.length} />
        <StatBox icon={Crown} label="Kepala Cabang" value={kepalaCount} />
        <StatBox icon={Stethoscope} label="Perawat" value={perawatCount} />
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center text-slate-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat pengguna...
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Users}
              title="Belum ada pengguna"
              description="Tambahkan akun pertama Anda."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map((u) =>
            editingId === u.id ? (
              <UserForm
                key={u.id}
                editingUser={u}
                branches={branches}
                rooms={rooms}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await load();
                }}
              />
            ) : (
              <UserCard
                key={u.id}
                managedUser={u}
                isSelf={u.id === user.id}
                onEdit={() => setEditingId(u.id)}
                onDelete={() => handleDelete(u)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function UserCard({
  managedUser: u,
  isSelf,
  onEdit,
  onDelete,
}: {
  managedUser: ManagedUser;
  isSelf: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isKepala = u.role === 'Kepala_Cabang';
  const Icon = isKepala ? Crown : Stethoscope;
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-4">
          <div
            className={`p-2.5 rounded-xl ${
              isKepala ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-900">{u.name}</p>
              <Badge
                variant="secondary"
                className={`text-[10px] font-normal ${
                  isKepala
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-50'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                {isKepala ? 'Kepala Cabang' : 'Perawat'}
              </Badge>
              {isSelf && (
                <Badge variant="outline" className="text-[10px] font-normal border-slate-200">
                  Anda
                </Badge>
              )}
              {isKepala && u.is_owner && (
                <Badge className="text-[10px] font-normal bg-violet-50 text-violet-700 hover:bg-violet-50 border border-violet-200">
                  Owner · semua cabang
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{u.email}</p>
            {isKepala && !u.is_owner && (
              <p className="text-xs mt-1 flex items-center gap-1.5">
                <Building className="w-3 h-3 text-amber-600" />
                <span className="text-slate-600">
                  {u.branch ? u.branch.branch_name : 'Belum ditugaskan ke cabang'}
                </span>
              </p>
            )}
            {!isKepala && (
              <p className="text-xs mt-1 flex items-center gap-1.5">
                {u.room ? (
                  <>
                    <DoorOpen className="w-3 h-3 text-emerald-600" />
                    <span className="text-slate-600">{u.room.room_name}</span>
                    {u.room.branch && (
                      <span className="text-slate-400">· {u.room.branch.branch_name}</span>
                    )}
                  </>
                ) : (
                  <span className="text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Belum ditugaskan ke ruangan
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit pengguna">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {!isSelf && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                title="Hapus pengguna"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UserForm({
  editingUser,
  branches,
  rooms,
  onCancel,
  onSaved,
}: {
  editingUser?: ManagedUser;
  branches: Branch[];
  rooms: Room[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(editingUser?.name ?? '');
  const [email, setEmail] = useState(editingUser?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<Role>(editingUser?.role ?? 'Perawat');
  const [branchId, setBranchId] = useState<number | null>(
    editingUser?.room?.branch?.id ?? editingUser?.branch?.id ?? null
  );
  const [kepalaBranchId, setKepalaBranchId] = useState<number | null>(
    editingUser?.branch?.id ?? null
  );
  const [roomId, setRoomId] = useState<number | null>(editingUser?.room?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { user: currentUser } = useAuth();
  const isOwner = currentUser?.is_owner === true;
  const filteredRooms = branchId ? rooms.filter((r) => r.branch_id === branchId) : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (role === 'Perawat' && !roomId) {
      setError('Perawat wajib ditugaskan ke salah satu ruangan.');
      return;
    }
    if (role === 'Kepala_Cabang' && !isOwner && !kepalaBranchId) {
      setError('Pilih cabang untuk Kepala (hanya Owner yang boleh membuat Kepala tanpa cabang spesifik).');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim(),
        role,
        room_id: role === 'Perawat' ? roomId : null,
        branch_id: role === 'Kepala_Cabang' ? kepalaBranchId : null,
      };
      if (password) body.password = password;
      if (!editingUser) body.password = password; // required on create

      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, body);
      } else {
        await api.post('/users', body);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={editingUser ? 'border-blue-200' : 'border-blue-200 bg-blue-50/30'}>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCog className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-semibold text-slate-800">
                {editingUser ? `Edit Pengguna: ${editingUser.name}` : 'Tambah Pengguna Baru'}
              </p>
            </div>
            {editingUser && (
              <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Nama *</Label>
              <Input
                id="u-name"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mis. Siti Aminah"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email *</Label>
              <Input
                id="u-email"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@klinik.test"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="u-pw">
                Password {editingUser && <span className="text-slate-400 font-normal">(kosongkan jika tidak diubah)</span>}
                {!editingUser && ' *'}
              </Label>
              <div className="relative">
                <Input
                  id="u-pw"
                  required={!editingUser}
                  minLength={6}
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? '••••••' : 'min 6 karakter'}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-role">Role *</Label>
              <select
                id="u-role"
                required
                value={role}
                onChange={(e) => {
                  const r = e.target.value as Role;
                  setRole(r);
                  if (r === 'Kepala_Cabang') {
                    setBranchId(null);
                    setRoomId(null);
                  }
                }}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="Perawat">Perawat</option>
                <option value="Kepala_Cabang">Kepala Cabang</option>
              </select>
            </div>
          </div>

          {role === 'Kepala_Cabang' && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                  <Crown className="w-4 h-4 text-amber-600" />
                  Cakupan Cabang
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-kepala-branch">Cabang yang dikelola</Label>
                  <select
                    id="u-kepala-branch"
                    value={kepalaBranchId ?? ''}
                    onChange={(e) =>
                      setKepalaBranchId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    {isOwner && (
                      <option value="">— Owner (akses semua cabang) —</option>
                    )}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.branch_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">
                    {isOwner
                      ? 'Kosongkan untuk membuat Owner (akses lintas cabang). Pilih cabang untuk Kepala dengan scope terbatas.'
                      : 'Sebagai Kepala dengan scope cabang, Anda hanya bisa membuat Kepala lain di cabang yang sama.'}
                  </p>
                </div>
              </div>
            </>
          )}

          {role === 'Perawat' && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                  <DoorOpen className="w-4 h-4 text-emerald-600" />
                  Penugasan Ruangan
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="u-branch">Cabang *</Label>
                    <select
                      id="u-branch"
                      required
                      value={branchId ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        setBranchId(v);
                        setRoomId(null);
                      }}
                      className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
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
                    <Label htmlFor="u-room">Ruangan *</Label>
                    <select
                      id="u-room"
                      required
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
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingUser ? 'Simpan Perubahan' : 'Buat Pengguna'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5 flex items-center gap-3">
        <div className="bg-slate-100 text-slate-600 p-2.5 rounded-xl">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
