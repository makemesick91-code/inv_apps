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
import type { Category, CategoryColor } from '@/types';
import { AlertCircle, Loader2, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const COLORS: CategoryColor[] = ['blue', 'emerald', 'amber', 'red', 'violet', 'slate'];

const COLOR_CLASS: Record<CategoryColor, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
};

const SWATCH_CLASS: Record<CategoryColor, string> = {
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-500',
};

export default function CategoriesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
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
      const res = await api.get<{ data: Category[] }>('/categories');
      setCategories(res.data);
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

  async function handleDelete(c: Category) {
    if (!confirm(`Hapus kategori "${c.name}"?`)) return;
    try {
      await api.delete(`/categories/${c.id}`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus');
    }
  }

  if (authLoading || !user || user.role !== 'Kepala_Cabang') return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Kategori Item"
        description="Kelompokkan item berdasarkan jenis (Obat, APD, BHP, dll) untuk laporan & filter."
        actions={
          !showAdd && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" />
              Tambah Kategori
            </Button>
          )
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showAdd && (
        <CategoryForm
          onCancel={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false);
            await load();
          }}
        />
      )}

      {loading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center text-sm text-slate-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat kategori...
          </CardContent>
        </Card>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Tag}
              title="Belum ada kategori"
              description="Tambahkan kategori pertama Anda."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {categories.map((c) =>
            editingId === c.id ? (
              <CategoryForm
                key={c.id}
                category={c}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await load();
                }}
              />
            ) : (
              <Card key={c.id}>
                <CardContent className="pt-4 pb-4 flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl border ${COLOR_CLASS[c.color]}`}>
                    <Tag className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <Badge className={`text-[10px] font-normal border ${COLOR_CLASS[c.color]}`}>
                        {c.color}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {c.items_count ?? 0} item terkait
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditingId(c.id)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(c)}
                      title="Hapus"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}

function CategoryForm({
  category,
  onCancel,
  onSaved,
}: {
  category?: Category;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState<CategoryColor>(category?.color ?? 'slate');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = { name: name.trim(), color };
      if (category) {
        await api.put(`/categories/${category.id}`, body);
      } else {
        await api.post('/categories', body);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={category ? 'border-blue-200' : 'border-blue-200 bg-blue-50/30'}>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-semibold text-slate-800">
                {category ? 'Edit Kategori' : 'Tambah Kategori Baru'}
              </p>
            </div>
            {category && (
              <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nama Kategori *</Label>
            <Input
              id="cat-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Obat, APD, BHP, Sterilisasi"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Warna</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs transition-all ${
                    color === c
                      ? COLOR_CLASS[c] + ' ring-2 ring-offset-1 ring-current'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${SWATCH_CLASS[c]}`} />
                  {c}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {category ? 'Simpan Perubahan' : 'Tambah'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
