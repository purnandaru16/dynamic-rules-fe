"use client"; // Penting! Tandai sebagai Client Component

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { login } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const { setToken, isLoggedIn } = useAuthStore();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await login(clientId, clientSecret);
        setToken(res.data.access_token);
        router.push('/dashboard');
    } catch (err: unknown) {
      setError('Login gagal. Periksa kembali credentials Anda.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      router.push("/dashboard");
    }
  }, [isLoggedIn]);

  return (
    <div className='min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle className='text-2xl text-center'>⚡ Dynamic Rules</CardTitle>
          <p className='text-center text-muted-foreground text-sm'>
            Masuk dengan Client Credentials
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className='space-y-4'>
            <div>
              <Label htmlFor='clientId'>Client ID</Label>
              <Input id='clientId' value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder='Masukkan client ID' />
            </div>
            <div>
              <Label htmlFor='secret'>Client Secret</Label>
              <Input id='secret' type='password' value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder='Masukkan client secret' />
            </div>
            {error && (
              <p className='text-destructive text-sm'>{error}</p>
            )}
            <Button type='submit' className='w-full' disabled={loading}>
              {loading ? 'Memverifikasi...' : 'Masuk →'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
