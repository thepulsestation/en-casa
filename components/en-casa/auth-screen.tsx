'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, ArrowRight, Check, KeyRound, LockKeyhole, PackageOpen, UsersRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clearAuthCallbackUrl, getAuthRedirectUrl } from '@/lib/supabase-client';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'recovery';

type Props = {
  client: SupabaseClient;
  initialMode?: AuthMode;
  onRecoveryComplete?: () => void;
};

export function AuthScreen({ client, initialMode = 'signin', onRecoveryComplete }: Props) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMode === 'recovery') setMode('recovery');
  }, [initialMode]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setPasswordConfirmation('');
    setError(null);
    setMessage(null);
  };

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
    if (mode === 'forgot') {
      const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl(),
      });
      if (resetError) setError(resetError.message);
      else setMessage('Te hemos enviado un enlace para elegir una contraseña nueva. Revisa también la carpeta de spam.');
      setBusy(false);
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      setBusy(false);
      return;
    }
    if (mode === 'recovery') {
      if (password !== passwordConfirmation) {
        setError('Las dos contraseñas no coinciden.');
        setBusy(false);
        return;
      }
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
      } else {
        await client.auth.signOut();
        clearAuthCallbackUrl();
        setMode('signin');
        setPassword('');
        setPasswordConfirmation('');
        setMessage('Contraseña actualizada. Ya puedes entrar con la nueva contraseña.');
        onRecoveryComplete?.();
      }
      setBusy(false);
      return;
    }

    const result =
      mode === 'signin'
        ? await client.auth.signInWithPassword({ email: email.trim(), password })
        : await client.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: { full_name: name.trim() },
              emailRedirectTo: getAuthRedirectUrl(),
            },
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

  const title = mode === 'signin'
    ? 'Volver a casa'
    : mode === 'signup'
      ? 'Crear tu cuenta'
      : mode === 'forgot'
        ? 'Recuperar contraseña'
        : 'Elige una contraseña nueva';

  const description = mode === 'signin'
    ? 'Entra para ver lo que hay y actualizar lo que habéis consumido.'
    : mode === 'signup'
      ? 'Después podrás crear una casa o unirte con el código de tu familia.'
      : mode === 'forgot'
        ? 'Te enviaremos un enlace seguro a tu correo para que puedas volver a entrar.'
        : 'Escribe la contraseña que quieres utilizar a partir de ahora.';

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
            {mode === 'signin' ? <LockKeyhole className="size-5" /> : mode === 'signup' ? <UsersRound className="size-5" /> : <KeyRound className="size-5" />}
          </div>
          <h2 className="mt-5 text-3xl font-extrabold tracking-[-0.04em]">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>

          <form className="mt-8 space-y-4" onSubmit={submit}>
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="auth-name">Tu nombre</Label>
                <Input id="auth-name" autoComplete="name" className="h-11 rounded-xl bg-card" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nicole" />
              </div>
            )}
            {mode !== 'recovery' && (
              <div className="space-y-2">
                <Label htmlFor="auth-email">Correo electrónico</Label>
                <Input id="auth-email" type="email" autoComplete="email" className="h-11 rounded-xl bg-card" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" required />
              </div>
            )}
            {mode !== 'forgot' && (
              <div className="space-y-2">
                <Label htmlFor="auth-password">{mode === 'recovery' ? 'Nueva contraseña' : 'Contraseña'}</Label>
                <Input id="auth-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} className="h-11 rounded-xl bg-card" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </div>
            )}
            {mode === 'signin' && (
              <button type="button" className="block w-full text-right text-xs font-extrabold text-primary" onClick={() => changeMode('forgot')}>
                He olvidado mi contraseña
              </button>
            )}
            {mode === 'recovery' && (
              <div className="space-y-2">
                <Label htmlFor="auth-password-confirmation">Repite la nueva contraseña</Label>
                <Input id="auth-password-confirmation" type="password" autoComplete="new-password" className="h-11 rounded-xl bg-card" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required />
              </div>
            )}
            {error && <p role="alert" className="rounded-xl bg-destructive/8 p-3 text-sm font-medium text-destructive">{error}</p>}
            {message && <p className="rounded-xl bg-primary/8 p-3 text-sm font-medium text-primary">{message}</p>}
            <Button type="submit" className="h-11 w-full rounded-xl font-extrabold" disabled={busy}>
              {busy ? 'Un momento…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar enlace' : 'Guardar contraseña'}
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </form>

          {mode !== 'recovery' && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === 'signin' ? '¿Es tu primera vez?' : mode === 'signup' ? '¿Ya tienes cuenta?' : '¿Has recordado la contraseña?'}{' '}
              <button type="button" className="inline-flex items-center gap-1 font-extrabold text-primary" onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')}>
                {mode === 'forgot' && <ArrowLeft className="size-3.5" />}
                {mode === 'signin' ? 'Crear una cuenta' : 'Iniciar sesión'}
              </button>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
