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
import type { Category, CategoryColor, Item } from '@/types';
import {
  AlertCircle,
  FileUp,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

const COLOR_CLASS: Record<CategoryColor, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
};

export default function ItemsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user && user.role !== 'Kepala_Cabang') {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemRes, catRes] = await Promise.all([
        api.get<{ data: Item[] }>('/items'),
        api.get<{ data: Category[] }>('/categories'),
      ]);
      setItems(itemRes.data);
      setCategories(catRes.data);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (categoryFilter !== null && it.category_id !== categoryFilter) return false;
      if (q) {
        return (
          it.item_name.toLowerCase().includes(q) ||
          (it.sku ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, search, categoryFilter]);

  async function handleDelete(item: Item) {
    if (!confirm(`Hapus item "${item.item_name}"?`)) return;
    try {
      await api.delete(`/items/${item.id}`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus');
    }
  }

  if (authLoading || !user || user.role !== 'Kepala_Cabang') return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Master Item"
        description="Katalog seluruh barang/obat yang dikelola di klinik."
        actions={
          !showAdd && (
            <div className="flex items-center gap-2">
              <Button render={<Link href="/items/import" />} variant="outline">
                <FileUp className="w-4 h-4" />
                Import CSV
              </Button>
              <Button onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4" />
                Tambah Item
              </Button>
            </div>
          )
        }
      />

      {showAdd && (
        <ItemForm
          categories={categories}
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

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Cari nama atau SKU..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={categoryFilter ?? ''}
              onChange={(e) => setCategoryFilter(e.target.value ? Number(e.target.value) : null)}
              className="flex h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            >
              <option value="">Semua kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 ml-auto">
              {filtered.length} dari {items.length} item
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat item...
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Belum ada item terdaftar"
              description="Tambahkan item pertama (obat, alat, BHP) untuk mulai mengelola stok."
              action={
                !showAdd && (
                  <Button onClick={() => setShowAdd(true)}>
                    <Plus className="w-4 h-4" />
                    Tambah Item
                  </Button>
                )
              }
            />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Tidak ada item yang cocok dengan pencarian.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 px-3 font-medium">Nama Item</th>
                    <th className="py-2 px-3 font-medium">Kategori</th>
                    <th className="py-2 px-3 font-medium">SKU</th>
                    <th className="py-2 px-3 font-medium">Satuan</th>
                    <th className="py-2 px-3 font-medium text-right">Stok Total</th>
                    <th className="py-2 px-3 font-medium text-right">Stok Minimum</th>
                    <th className="py-2 px-3 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) =>
                    editingId === item.id ? (
                      <tr key={item.id}>
                        <td colSpan={7} className="p-0">
                          <div className="p-3 bg-blue-50/50">
                            <ItemForm
                              item={item}
                              categories={categories}
                              onCancel={() => setEditingId(null)}
                              onSaved={async () => {
                                setEditingId(null);
                                await load();
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onEdit={() => setEditingId(item.id)}
                        onDelete={() => handleDelete(item)}
                      />
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: Item;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const totalStock = item.total_stock ?? 0;
  const isLow = item.min_stock_level > 0 && totalStock <= item.min_stock_level;
  const isOut = totalStock === 0;

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 text-slate-500 p-1.5 rounded-md">
            <Package className="w-3.5 h-3.5" />
          </div>
          <span className="font-medium text-slate-800">{item.item_name}</span>
        </div>
      </td>
      <td className="py-2.5 px-3">
        {item.category ? (
          <Badge className={`text-[10px] font-normal border ${COLOR_CLASS[item.category.color]}`}>
            <Tag className="w-2.5 h-2.5 mr-1" />
            {item.category.name}
          </Badge>
        ) : (
          <span className="text-xs italic text-slate-400">—</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-slate-500 font-mono text-xs">
        {item.sku ?? <span className="italic text-slate-400">—</span>}
      </td>
      <td className="py-2.5 px-3 text-slate-600">{item.unit}</td>
      <td className="py-2.5 px-3 text-right">
        {isOut ? (
          <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border border-red-200 font-normal">
            Habis
          </Badge>
        ) : isLow ? (
          <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200 font-normal">
            {totalStock} · rendah
          </Badge>
        ) : (
          <span className="font-medium text-slate-800">{totalStock}</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right text-slate-500">
        {item.min_stock_level > 0 ? item.min_stock_level : '—'}
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            title="Hapus"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ItemForm({
  item,
  categories,
  onCancel,
  onSaved,
}: {
  item?: Item;
  categories: Category[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(item?.item_name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [minStock, setMinStock] = useState(String(item?.min_stock_level ?? 0));
  const [categoryId, setCategoryId] = useState<number | null>(item?.category_id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        item_name: name.trim(),
        sku: sku.trim() || null,
        unit: unit.trim() || 'pcs',
        min_stock_level: Number(minStock) || 0,
        category_id: categoryId,
      };
      if (item) {
        await api.put(`/items/${item.id}`, body);
      } else {
        await api.post('/items', body);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={item ? 'border-blue-200' : 'border-blue-200 bg-blue-50/30'}>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-semibold text-slate-800">
                {item ? 'Edit Item' : 'Tambah Item Baru'}
              </p>
            </div>
            {item && (
              <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-name">Nama Item *</Label>
              <Input
                id="item-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mis. Lidocaine 2%"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-sku">SKU (opsional)</Label>
              <Input
                id="item-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="mis. OBT-001"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-unit">Satuan *</Label>
              <Input
                id="item-unit"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs, box, ampul, pasang..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-min">Stok Minimum</Label>
              <Input
                id="item-min"
                type="number"
                min="0"
                step="0.001"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="item-cat">Kategori (opsional)</Label>
              <select
                id="item-cat"
                value={categoryId ?? ''}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                <option value="">Tanpa kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Stok minimum dipakai untuk alert "barang hampir habis" di dashboard. Isi 0 untuk
            menonaktifkan alert.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {item ? 'Simpan Perubahan' : 'Tambah Item'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
