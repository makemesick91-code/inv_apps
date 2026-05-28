'use client';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { Branch, Item, Room } from '@/types';
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface SuccessInfo {
  itemName: string;
  quantity: number;
  unit: string;
  roomName: string;
  branchName: string;
}

export default function BarangMasukPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState('');

  // Form state — branch/room/date persist across "Simpan & Tambah Lagi"
  const [branchId, setBranchId] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Per-item state — reset after "Simpan & Tambah Lagi"
  const [itemId, setItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [expiration, setExpiration] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [lastSaved, setLastSaved] = useState<SuccessInfo | null>(null);

  const itemSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'Kepala_Cabang') {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setMetaError('');
    try {
      const [branchRes, roomRes, itemRes] = await Promise.all([
        api.get<{ data: Branch[] }>('/branches'),
        api.get<{ data: Room[] }>('/rooms'),
        api.get<{ data: Item[] }>('/items'),
      ]);
      setBranches(branchRes.data);
      setRooms(roomRes.data);
      setItems(itemRes.data);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Gagal memuat data referensi');
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'Kepala_Cabang') loadMeta();
  }, [user, loadMeta]);

  const filteredRooms = useMemo(
    () => (branchId ? rooms.filter((r) => r.branch_id === branchId) : []),
    [rooms, branchId]
  );

  const selectedItem = items.find((i) => i.id === itemId) ?? null;
  const selectedRoom = rooms.find((r) => r.id === roomId) ?? null;
  const selectedBranch = branches.find((b) => b.id === branchId) ?? null;

  function resetItemFields() {
    setItemId(null);
    setQuantity('');
    setBatchCode('');
    setExpiration('');
    setNotes('');
    setFormError('');
  }

  function resetAll() {
    setBranchId(null);
    setRoomId(null);
    setDate(new Date().toISOString().slice(0, 10));
    resetItemFields();
    setLastSaved(null);
  }

  async function handleSubmit(e: React.FormEvent, andAddAnother: boolean) {
    e.preventDefault();
    if (!roomId || !itemId) return;
    setFormError('');
    setSaving(true);
    try {
      await api.post('/transactions/in', {
        room_id: roomId,
        item_id: itemId,
        batch_code: batchCode.trim() || null,
        quantity: Number(quantity),
        expiration_date: expiration || null,
        transaction_date: date,
        notes: notes.trim() || null,
      });

      const saved: SuccessInfo = {
        itemName: selectedItem?.item_name ?? '',
        quantity: Number(quantity),
        unit: selectedItem?.unit ?? '',
        roomName: selectedRoom?.room_name ?? '',
        branchName: selectedBranch?.branch_name ?? '',
      };
      setLastSaved(saved);

      if (andAddAnother) {
        resetItemFields();
        // Reload items to get updated total_stock display in future enhancement
        api.get<{ data: Item[] }>('/items').then((r) => setItems(r.data));
        setTimeout(() => itemSelectRef.current?.focus(), 50);
      } else {
        resetAll();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user || user.role !== 'Kepala_Cabang') return null;

  const canSubmit = !!roomId && !!itemId && Number(quantity) > 0 && !saving;
  const needsSetup = !loadingMeta && (branches.length === 0 || items.length === 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Catat Barang Masuk"
        description="Tambah stok baru dari pengiriman supplier ke ruangan tertentu."
      />

      {metaError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{metaError}</span>
        </div>
      )}

      {needsSetup && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {branches.length === 0 && 'Belum ada cabang terdaftar. '}
            {items.length === 0 && 'Belum ada item terdaftar. '}
            Lengkapi data master di menu <strong>Cabang &amp; Ruangan</strong> dan{' '}
            <strong>Master Item</strong> sebelum mencatat barang masuk.
          </span>
        </div>
      )}

      {lastSaved && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Berhasil dicatat: <strong>{lastSaved.quantity} {lastSaved.unit}</strong> {lastSaved.itemName}{' '}
            ke <strong>{lastSaved.roomName}</strong>
            {lastSaved.branchName && ` (${lastSaved.branchName})`}.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-blue-600" />
            Detail Pengiriman
          </CardTitle>
          <CardDescription>
            Isi cabang dan ruangan tujuan, lalu detail barang yang masuk. Tanggal kadaluarsa membantu
            sistem memberi peringatan otomatis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="branch">Cabang *</Label>
                <select
                  id="branch"
                  required
                  disabled={loadingMeta || needsSetup}
                  value={branchId ?? ''}
                  onChange={(e) => {
                    const next = e.target.value ? Number(e.target.value) : null;
                    setBranchId(next);
                    setRoomId(null);
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
                <Label htmlFor="room">Ruangan Penyimpanan *</Label>
                <select
                  id="room"
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
                        ? '— Cabang ini belum punya ruangan —'
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

            <Separator />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="item">Barang *</Label>
                <select
                  id="item"
                  ref={itemSelectRef}
                  required
                  disabled={loadingMeta || items.length === 0}
                  value={itemId ?? ''}
                  onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : null)}
                  className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  <option value="">— Pilih barang —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.item_name}
                      {it.sku ? ` · ${it.sku}` : ''} ({it.unit})
                    </option>
                  ))}
                </select>
                {selectedItem && (
                  <p className="text-xs text-slate-500 flex items-center gap-2">
                    Total stok saat ini di semua ruangan:{' '}
                    <Badge
                      variant="secondary"
                      className="bg-slate-100 text-slate-700 hover:bg-slate-100 font-normal"
                    >
                      {selectedItem.total_stock ?? 0} {selectedItem.unit}
                    </Badge>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="qty">
                    Jumlah *
                    {selectedItem && (
                      <span className="text-slate-400 font-normal ml-1">({selectedItem.unit})</span>
                    )}
                  </Label>
                  <Input
                    id="qty"
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exp">Tanggal Kadaluarsa</Label>
                  <Input
                    id="exp"
                    type="date"
                    value={expiration}
                    onChange={(e) => setExpiration(e.target.value)}
                    min={date}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="batch">Kode Batch (opsional)</Label>
                <Input
                  id="batch"
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                  placeholder="mis. LDC-2026A"
                  className="font-mono"
                />
                <p className="text-xs text-slate-500">
                  Isi jika produsen memberi kode batch. Barang dengan kode sama akan digabung; kode
                  berbeda akan disimpan terpisah (untuk FEFO).
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="date">Tanggal Transaksi *</Label>
                <Input
                  id="date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Catatan (opsional)</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="mis. supplier ABC, PO #123"
                />
              </div>
            </div>

            {formError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={resetAll}
                disabled={saving}
                className="mr-auto"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Form
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={(e) => handleSubmit(e, true)}
                disabled={!canSubmit}
                title="Simpan dan langsung input barang berikutnya di ruangan yang sama"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan &amp; Tambah Lagi
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
