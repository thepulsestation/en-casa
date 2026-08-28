'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, Home, KeyRound, PackageOpen, UsersRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  client: SupabaseClient;
  onReady: () => Promise<void>;
};

export function HouseholdSetup({ client, onReady }: Props) {
  const [choice, setChoice] = useState<'choose' | 'create' | 'join'>('choose');
  const [houseName, setHouseName] = useState('Mi casa');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const result =
      choice === 'create'
        ? await client.rpc('create_household', { p_name: houseName.trim() || 'Mi casa' })
        : await client.rpc('join_household', { p_invite_code: inviteCode.trim().toUpperCase() });
    if (result.error) {
      setError(
        result.error.message.includes('invalid_invite')
          ? 'Ese código no existe o ha caducado.'
          : result.error.message,
      );
    } else {
      await onReady();
    }
    setBusy(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-5">
      <section className="w-full max-w-2xl rounded-[28px] border border-border bg-card p-5 shadow-[0_24px_70px_rgb(44_45_40/9%)] sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground"><PackageOpen className="size-5" /></div>
          <div><p className="font-extrabold">En casa</p><p className="text-xs text-muted-foreground">Preparar el espacio familiar</p></div>
        </div>

        {choice === 'choose' ? (
          <>
            <h1 className="mt-8 text-3xl font-extrabold tracking-[-0.04em]">¿Cómo quieres empezar?</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Crea el espacio principal de tu familia o usa el código que te haya enviado otra persona.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button type="button" className="group rounded-2xl border border-border p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.035]" onClick={() => setChoice('create')}>
                <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Home className="size-5" /></span>
                <span className="mt-4 block font-extrabold">Crear una casa</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">Serás quien pueda invitar al resto de la familia.</span>
                <ArrowRight className="mt-5 size-4 text-primary transition-transform group-hover:translate-x-1" />
              </button>
              <button type="button" className="group rounded-2xl border border-border p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.035]" onClick={() => setChoice('join')}>
                <span className="grid size-11 place-items-center rounded-2xl bg-[#f3ecdd] text-[#846936]"><UsersRound className="size-5" /></span>
                <span className="mt-4 block font-extrabold">Unirme a mi familia</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">Necesitarás un código de invitación de 8 caracteres.</span>
                <ArrowRight className="mt-5 size-4 text-primary transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </>
        ) : (
          <div className="mt-8 max-w-md">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              {choice === 'create' ? <Home className="size-5" /> : <KeyRound className="size-5" />}
            </div>
            <h1 className="mt-5 text-2xl font-extrabold tracking-[-0.03em]">{choice === 'create' ? 'Ponle nombre a la casa' : 'Introduce la invitación'}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{choice === 'create' ? 'Puede ser vuestro apellido o simplemente “Mi casa”.' : 'El código no distingue entre mayúsculas y minúsculas.'}</p>
            <div className="mt-6 space-y-2">
              <Label htmlFor="household-value">{choice === 'create' ? 'Nombre de la casa' : 'Código de invitación'}</Label>
              <Input id="household-value" className="h-11 rounded-xl" value={choice === 'create' ? houseName : inviteCode} onChange={(event) => choice === 'create' ? setHouseName(event.target.value) : setInviteCode(event.target.value.toUpperCase())} maxLength={choice === 'join' ? 8 : 60} />
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/8 p-3 text-sm text-destructive">{error}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" className="h-10 rounded-xl" disabled={busy} onClick={() => { setChoice('choose'); setError(null); }}>Volver</Button>
              <Button className="h-10 rounded-xl px-4 font-extrabold" disabled={busy || (choice === 'join' ? inviteCode.trim().length < 6 : !houseName.trim())} onClick={() => void run()}>
                {busy ? 'Preparando…' : choice === 'create' ? 'Crear mi casa' : 'Unirme a la casa'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
