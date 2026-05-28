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
import type { Branch, Room } from '@/types';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type BranchWithCount = Branch & { rooms_count: number };

export default function CabangPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [branches, setBranches] = useState<BranchWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'Kepala_Cabang') {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  const loadBranches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: BranchWithCount[] }>('/branches');
      setBranches(res.data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang') loadBranches();
  }, [user, loadBranches]);

  async function handleDelete(branch: BranchWithCount) {
    if (!confirm(`Hapus cabang "${branch.branch_name}"? Semua ruangan & stok di dalamnya juga akan terhapus.`)) return;
    try {
      await api.delete(`/branches/${branch.id}`);
      await loadBranches();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus');
    }
  }

  if (authLoading || !user || user.role !== 'Kepala_Cabang') return null;

  const isOwner = user.is_owner === true;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Cabang & Ruangan"
        description={
          isOwner
            ? 'Kelola cabang klinik dan ruangan penyimpanan di dalamnya.'
            : 'Kelola ruangan di cabang Anda. Hanya Owner yang dapat menambah/menghapus cabang.'
        }
        actions={
          isOwner &&
          !showAdd && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" />
              Tambah Cabang
            </Button>
          )
        }
      />

      {showAdd && (
        <BranchForm
          onCancel={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false);
            await loadBranches();
          }}
        />
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-16 flex items-center justify-center text-slate-500 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat data cabang...
          </CardContent>
        </Card>
      ) : branches.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Building2}
              title="Belum ada cabang"
              description="Tambahkan cabang pertama untuk mulai mengelola ruangan dan stok klinik."
              action={
                !showAdd && (
                  <Button onClick={() => setShowAdd(true)}>
                    <Plus className="w-4 h-4" />
                    Tambah Cabang
                  </Button>
                )
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {branches.map((branch) =>
            editingId === branch.id ? (
              <BranchForm
                key={branch.id}
                branch={branch}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await loadBranches();
                }}
              />
            ) : (
              <BranchCard
                key={branch.id}
                branch={branch}
                expanded={expandedId === branch.id}
                canManage={isOwner}
                onToggle={() =>
                  setExpandedId(expandedId === branch.id ? null : branch.id)
                }
                onEdit={() => setEditingId(branch.id)}
                onDelete={() => handleDelete(branch)}
                onRoomsChanged={loadBranches}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function BranchCard({
  branch,
  expanded,
  canManage,
  onToggle,
  onEdit,
  onDelete,
  onRoomsChanged,
}: {
  branch: BranchWithCount;
  expanded: boolean;
  canManage: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRoomsChanged: () => Promise<void>;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-start gap-3 text-left flex-1 group"
          >
            <div className="bg-blue-50 text-blue-600 p-2 rounded-lg shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                  {branch.branch_name}
                </p>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">
                  {branch.rooms_count} ruangan
                </Badge>
              </div>
              {branch.location && (
                <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {branch.location}
                </p>
              )}
            </div>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400 mt-1.5" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 mt-1.5" />
            )}
          </button>
          {canManage && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit cabang">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                title="Hapus cabang"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        {expanded && (
          <>
            <Separator className="my-4" />
            <RoomManager branchId={branch.id} onChanged={onRoomsChanged} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BranchForm({
  branch,
  onCancel,
  onSaved,
}: {
  branch?: Branch;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(branch?.branch_name ?? '');
  const [location, setLocation] = useState(branch?.location ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = { branch_name: name, location: location || null };
      if (branch) {
        await api.put(`/branches/${branch.id}`, body);
      } else {
        await api.post('/branches', body);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-semibold text-slate-800">
              {branch ? 'Edit Cabang' : 'Tambah Cabang Baru'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name">Nama Cabang *</Label>
              <Input
                id="branch-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mis. Cabang Sudirman"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-location">Lokasi</Label>
              <Input
                id="branch-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="mis. Jakarta Selatan"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {branch ? 'Simpan Perubahan' : 'Tambah Cabang'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RoomManager({
  branchId,
  onChanged,
}: {
  branchId: number;
  onChanged: () => Promise<void>;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Room[] }>(`/branches/${branchId}/rooms`);
      setRooms(res.data);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(room: Room) {
    if (!confirm(`Hapus ruangan "${room.room_name}"?`)) return;
    await api.delete(`/rooms/${room.id}`);
    await load();
    await onChanged();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Ruangan
        </p>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" />
            Tambah Ruangan
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-3">
          <RoomForm
            branchId={branchId}
            onCancel={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await load();
              await onChanged();
            }}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-2">Memuat...</p>
      ) : rooms.length === 0 && !adding ? (
        <p className="text-sm text-slate-500 py-3 text-center bg-slate-50 rounded-md">
          Belum ada ruangan di cabang ini.
        </p>
      ) : (
        <div className="space-y-2">
          {rooms.map((room) =>
            editingId === room.id ? (
              <RoomForm
                key={room.id}
                branchId={branchId}
                room={room}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await load();
                }}
              />
            ) : (
              <div
                key={room.id}
                className="flex items-center gap-3 px-3 py-2 rounded-md border border-slate-200 bg-white"
              >
                <DoorOpen className="w-4 h-4 text-slate-400 shrink-0" />
                <p className="text-sm text-slate-800 flex-1">{room.room_name}</p>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setEditingId(room.id)}
                  title="Edit"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleDelete(room)}
                  title="Hapus"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function RoomForm({
  branchId,
  room,
  onCancel,
  onSaved,
}: {
  branchId: number;
  room?: Room;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(room?.room_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (room) {
        await api.put(`/rooms/${room.id}`, { room_name: name });
      } else {
        await api.post(`/branches/${branchId}/rooms`, { room_name: name });
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-start gap-2 p-2 rounded-md border border-blue-200 bg-blue-50/40"
    >
      <DoorOpen className="w-4 h-4 text-blue-600 mt-2.5 shrink-0" />
      <div className="flex-1">
        <Input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="mis. Ruang Bedah 1, Gudang Utama"
          className="h-8"
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <Button type="submit" size="sm" disabled={saving || !name.trim()}>
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : room ? 'Simpan' : 'Tambah'}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </form>
  );
}
