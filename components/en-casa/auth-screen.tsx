'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, Check, LockKeyhole, PackageOpen, UsersRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = { client: SupabaseClient };

export function AuthScreen({ client }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    if (mode === 'signup' && name.trim().length < 2) {
      setError('Escribe tu nombre.');
      setBusy(false);
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      setBusy(false);
      return;
    }

    const result =
      mode === 'signin'
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({
            email,
            password,
            options: { data: { full_name: name.trim() } },
          });

    if (result.error) {
      setError(
        result.error.message === 'Invalid login credentials'
          ? 'El correo o la contraseña no son correctos.'
          : result.error.message,
      );
    } else if (mode === 'signup' && !result.data.session) {
      setMessage('Revisa tu correo para confirmar la cuenta y después inicia sesión.');
      setMode('signin');
    }
    setBusy(false);
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#194d3b] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-24 -top-24 size-80 rounded-full border-[54px] border-white/5" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-white/12"><PackageOpen className="size-5" /></div>
          <div>
            <p className="text-lg font-extrabold">En casa</p>
            <p className="text-xs text-white/60">La despensa familiar</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#f4d37c]">Menos desperdicio, entre todos</p>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] tracking-[-0.05em]">
            Que nada se quede olvidado en la nevera.
          </h1>
          <div className="mt-9 space-y-4 text-sm text-white/75">
            {['Inventario compartido en tiempo real', 'Avisos antes de que algo caduque', 'Una cuenta para cada persona de la familia'].map((item) => (
              <p key={item} className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full bg-white/10"><Check className="size-3.5" /></span>{item}</p>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/45">La información de tu casa solo es visible para sus miembros.</p>
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground"><PackageOpen className="size-5" /></div>
            <div><p className="font-extrabold">En casa</p><p className="text-xs text-muted-foreground">La despensa familiar</p></div>
          </div>
          <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            {mode === 'signin' ? <LockKeyhole className="size-5" /> : <UsersRound className="size-5" />}
          </div>
          <h2 className="mt-5 text-3xl font-extrabold tracking-[-0.04em]">
            {mode === 'signin' ? 'Volver a casa' : 'Crear tu cuenta'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {mode === 'signin'
              ? 'Entra para ver lo que hay y actualizar lo que habéis consumido.'
              : 'Después podrás crear una casa o unirte con el código de tu familia.'}
          </p>

          <form className="mt-8 space-y-4" onSubmit={submit}>
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="auth-name">Tu nombre</Label>
                <Input id="auth-name" autoComplete="name" className="h-11 rounded-xl bg-card" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nicole" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="auth-email">Correo electrónico</Label>
              <Input id="auth-email" type="email" autoComplete="email" className="h-11 rounded-xl bg-card" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Contraseña</Label>
              <Input id="auth-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} className="h-11 rounded-xl bg-card" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            {error && <p role="alert" className="rounded-xl bg-destructive/8 p-3 text-sm font-medium text-destructive">{error}</p>}
            {message && <p className="rounded-xl bg-primary/8 p-3 text-sm font-medium text-primary">{message}</p>}
            <Button type="submit" className="h-11 w-full rounded-xl font-extrabold" disabled={busy}>
              {busy ? 'Un momento…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'signin' ? '¿Es tu primera vez?' : '¿Ya tienes cuenta?'}{' '}
            <button type="button" className="font-extrabold text-primary" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setMessage(null); }}>
              {mode === 'signin' ? 'Crear una cuenta' : 'Iniciar sesión'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
