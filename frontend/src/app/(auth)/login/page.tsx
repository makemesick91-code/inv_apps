'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { AlertCircle, Clock, Loader2, Stethoscope } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg shadow-blue-600/30 mb-3">
            <Stethoscope className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Klinik Gigi Inventori</h1>
          <p className="text-sm text-slate-500 mt-1">Sistem manajemen stok multi-cabang</p>
        </div>

        {reason === 'session_expired' && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Sesi Anda telah berakhir. Silakan login ulang untuk melanjutkan.</span>
          </div>
        )}

        <Card className="border-slate-200/80 shadow-xl shadow-slate-200/40">
          <CardHeader>
            <CardTitle className="text-lg">Masuk ke akun Anda</CardTitle>
            <CardDescription>
              Gunakan kredensial yang diberikan oleh administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="nama@klinik.test"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Memproses...' : 'Masuk'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6">
          © 2026 Klinik Gigi Inventori
        </p>
      </div>
    </main>
  );
}
