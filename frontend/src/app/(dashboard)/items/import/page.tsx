'use client';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, api } from '@/lib/api';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

type ParsedRow = {
  item_name: string;
  sku: string;
  unit: string;
  min_stock_level: string;
  category_name: string;
};

const TEMPLATE = `item_name,sku,unit,min_stock_level,category_name
Lidocaine 2%,OBT-001,ampul,20,Obat
Sarung Tangan Steril,APD-001,pasang,50,APD
Masker N95,APD-002,pcs,100,APD
Composite Resin,BHN-001,syringe,10,BHP`;

const REQUIRED_HEADERS = ['item_name', 'unit'];
const ALL_HEADERS = ['item_name', 'sku', 'unit', 'min_stock_level', 'category_name'];

export default function ItemsImportPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<number, Record<string, string[]>>>({});
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'Kepala_Cabang') {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  function handleFileChosen(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsvText(text);
      parse(text);
    };
    reader.readAsText(file);
  }

  function parse(text: string) {
    setParseError('');
    setRowErrors({});
    setSubmitError('');
    setSuccess('');

    const trimmed = text.trim();
    if (!trimmed) {
      setParsed(null);
      return;
    }

    try {
      const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        throw new Error('CSV harus berisi minimal 1 baris header + 1 baris data.');
      }

      const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
      for (const r of REQUIRED_HEADERS) {
        if (!headers.includes(r)) {
          throw new Error(`Kolom wajib '${r}' tidak ditemukan di header CSV.`);
        }
      }
      const unknownHeaders = headers.filter((h) => !ALL_HEADERS.includes(h));
      if (unknownHeaders.length > 0) {
        throw new Error(
          `Kolom tidak dikenali: ${unknownHeaders.join(', ')}. Gunakan: ${ALL_HEADERS.join(', ')}.`
        );
      }

      const rows = lines.slice(1).map((line) => {
        const values = parseLine(line);
        const obj: Record<string, string> = {
          item_name: '',
          sku: '',
          unit: '',
          min_stock_level: '',
          category_name: '',
        };
        headers.forEach((h, i) => {
          obj[h] = (values[i] ?? '').trim();
        });
        return obj as ParsedRow;
      });

      setParsed(rows);
    } catch (err) {
      setParsed(null);
      setParseError(err instanceof Error ? err.message : 'Format CSV tidak valid.');
    }
  }

  async function handleImport() {
    if (!parsed || parsed.length === 0) return;
    setImporting(true);
    setSubmitError('');
    setRowErrors({});
    setSuccess('');
    try {
      const payload = {
        items: parsed.map((r) => ({
          item_name: r.item_name,
          sku: r.sku || null,
          unit: r.unit,
          min_stock_level: r.min_stock_level ? Number(r.min_stock_level) : 0,
          category_name: r.category_name || null,
        })),
      };
      const res = await api.post<{ message: string; imported: number }>(
        '/items/import',
        payload
      );
      setSuccess(res.message);
      setParsed(null);
      setCsvText('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object') {
        const rowErrs = (err.body as { row_errors?: Record<string, Record<string, string[]>> })
          .row_errors;
        if (rowErrs) {
          const numericKeys: Record<number, Record<string, string[]>> = {};
          for (const k of Object.keys(rowErrs)) {
            numericKeys[Number(k)] = rowErrs[k];
          }
          setRowErrors(numericKeys);
        }
      }
      setSubmitError(err instanceof Error ? err.message : 'Gagal import');
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-import-item.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const errorCount = Object.keys(rowErrors).length;
  const totalRows = parsed?.length ?? 0;

  const validRowCount = useMemo(
    () => (parsed ? parsed.length - errorCount : 0),
    [parsed, errorCount]
  );

  if (authLoading || !user || user.role !== 'Kepala_Cabang') return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Import Item dari CSV"
        description="Upload banyak item sekaligus dalam satu file CSV."
        actions={
          <Button render={<Link href="/items" />} variant="outline">
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Master Item
          </Button>
        }
      />

      {success && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Siapkan File CSV</CardTitle>
          <CardDescription>
            Format kolom: <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">item_name, sku, unit, min_stock_level</code>
            . Kolom wajib: <strong>item_name</strong> dan <strong>unit</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="w-4 h-4" />
            Unduh Template CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Upload atau Tempel CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="file">Pilih File CSV</Label>
            <Input
              id="file"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChosen(f);
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">atau</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paste">Tempel teks CSV langsung</Label>
            <textarea
              id="paste"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                parse(e.target.value);
              }}
              rows={8}
              placeholder="item_name,sku,unit,min_stock_level&#10;Lidocaine 2%,OBT-001,ampul,20"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && parsed.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">3. Preview ({totalRows} baris)</CardTitle>
              <CardDescription>
                {errorCount > 0
                  ? `${errorCount} baris memiliki error. Perbaiki file lalu coba lagi.`
                  : 'Semua baris valid dan siap diimpor.'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {errorCount === 0 ? (
                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border border-emerald-200 font-normal">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> {totalRows} siap
                </Badge>
              ) : (
                <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border border-red-200 font-normal">
                  {errorCount} error · {validRowCount} OK
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {submitError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 px-3 font-medium w-12">#</th>
                    <th className="py-2 px-3 font-medium">Nama Item</th>
                    <th className="py-2 px-3 font-medium">Kategori</th>
                    <th className="py-2 px-3 font-medium">SKU</th>
                    <th className="py-2 px-3 font-medium">Satuan</th>
                    <th className="py-2 px-3 font-medium text-right">Min Stok</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row, idx) => {
                    const errs = rowErrors[idx];
                    const hasError = !!errs;
                    return (
                      <tr
                        key={idx}
                        className={`border-b border-slate-100 ${
                          hasError ? 'bg-red-50/40' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-xs text-slate-400 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-slate-800">
                            {row.item_name || (
                              <span className="italic text-slate-400">kosong</span>
                            )}
                          </p>
                          {errs?.item_name?.map((e, i) => (
                            <p key={i} className="text-xs text-red-600 mt-0.5">
                              {e}
                            </p>
                          ))}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-600">
                          {row.category_name || <span className="text-slate-400">—</span>}
                          {errs?.category_name?.map((e, i) => (
                            <p key={i} className="text-xs text-red-600 mt-0.5">
                              {e}
                            </p>
                          ))}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-600">
                          {row.sku || <span className="text-slate-400">—</span>}
                          {errs?.sku?.map((e, i) => (
                            <p key={i} className="text-xs text-red-600 mt-0.5">
                              {e}
                            </p>
                          ))}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {row.unit || <span className="italic text-slate-400">kosong</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {row.min_stock_level || '0'}
                        </td>
                        <td className="py-2.5 px-3">
                          {hasError ? (
                            <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border border-red-200 font-normal text-xs">
                              Error
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border border-emerald-200 font-normal text-xs">
                              OK
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                onClick={handleImport}
                disabled={importing || totalRows === 0}
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Import {totalRows} Item
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {parsed === null && !parseError && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <div className="bg-slate-100 rounded-full p-3 mb-3">
              <FileUp className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">
              Belum ada file dipilih
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Upload file CSV atau tempel teks di kotak di atas untuk melihat preview.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
