'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BellRing,
  Check,
  Copy,
  House,
  LogOut,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  UsersRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: SupabaseClient | null;
  householdId: string | null;
  householdName: string;
  userId: string | null;
  userName: string;
  role: string;
  demoMode: boolean;
  onSignOut: () => Promise<void>;
  onResetDemo: () => void;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

export function SettingsDialog({
  open,
  onOpenChange,
  client,
  householdId,
  householdName,
  userId,
  userName,
  role,
  demoMode,
  onSignOut,
  onResetDemo,
}: Props) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (
      !open ||
      typeof Notification === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      setNotificationsEnabled(false);
      return () => {
        cancelled = true;
      };
    }

    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) {
          setNotificationsEnabled(
            Notification.permission === 'granted' && Boolean(subscription),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setNotificationsEnabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const registerPushSubscription = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      throw new Error('Este navegador no admite notificaciones web.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error(
        'No se han autorizado las notificaciones. Puedes cambiarlo en los ajustes del móvil.',
      );
    }

    const registration = await navigator.serviceWorker.ready;
    if (demoMode) return { registration, subscription: null };

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey || !client || !householdId || !userId) {
      throw new Error(
        'Falta terminar la configuración de notificaciones del proyecto.',
      );
    }

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));
    const serialized = subscription.toJSON();
    const { error } = await client.from('push_subscriptions').upsert(
      {
        household_id: householdId,
        user_id: userId,
        endpoint: serialized.endpoint,
        p256dh: serialized.keys?.p256dh,
        auth: serialized.keys?.auth,
        user_agent: navigator.userAgent,
        enabled: true,
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw error;
    return { registration, subscription };
  };

  const enableNotifications = async () => {
    setNotificationBusy(true);
    setNotificationMessage(null);
    try {
      await registerPushSubscription();
      setNotificationsEnabled(true);
      setNotificationMessage(
        demoMode
          ? 'Permiso concedido. Al conectar Supabase se activarán los avisos programados.'
          : 'Avisos activados en este dispositivo. Ya puedes enviar una prueba.',
      );
    } catch (caught) {
      setNotificationsEnabled(false);
      setNotificationMessage(
        caught instanceof Error
          ? caught.message
          : 'No se han podido activar los avisos.',
      );
    } finally {
      setNotificationBusy(false);
    }
  };

  const testNotifications = async () => {
    setNotificationBusy(true);
    setNotificationMessage(null);
    try {
      const { registration, subscription } =
        await registerPushSubscription();
      setNotificationsEnabled(true);

      if (demoMode || !client || !subscription) {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
        await registration.showNotification('En casa · Prueba completada', {
          body: 'Las notificaciones funcionan en este dispositivo.',
          icon: `${basePath}/icon.svg`,
          badge: `${basePath}/icon.svg`,
          tag: 'notification-test',
        });
      } else {
        const { data, error } = await client.functions.invoke(
          'test-push-notification',
          { body: { endpoint: subscription.endpoint } },
        );
        if (error) {
          const context = (error as { context?: Response }).context;
          const responseBody = context
            ? await context.clone().json().catch(() => null)
            : null;
          const responseError =
            responseBody &&
            typeof responseBody === 'object' &&
            'error' in responseBody &&
            typeof responseBody.error === 'string'
              ? responseBody.error
              : null;
          throw new Error(
            responseError ??
              'El servidor no ha podido enviar la notificación de prueba.',
          );
        }
        if (!data?.sent) {
          throw new Error(
            data?.error ?? 'No se ha podido entregar la notificación de prueba.',
          );
        }
      }

      setNotificationMessage(
        'Prueba enviada. Si no aparece, revisa Ajustes del iPhone → Notificaciones → En casa.',
      );
    } catch (caught) {
      setNotificationMessage(
        caught instanceof Error
          ? caught.message
          : 'No se ha podido enviar la prueba.',
      );
    } finally {
      setNotificationBusy(false);
    }
  };

  const createInvite = async () => {
    if (!client || !householdId || demoMode) return;
    setInviteBusy(true);
    const { data, error } = await client.rpc('create_household_invite', { p_household_id: householdId });
    if (!error) setInviteCode(String(data));
    setInviteBusy(false);
  };

  const copyInvite = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-xl overflow-y-auto rounded-[24px] p-5 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-xl font-extrabold tracking-[-0.03em]">Casa y avisos</DialogTitle>
          <DialogDescription>Gestiona la familia y este dispositivo.</DialogDescription>
        </DialogHeader>

        <section className="rounded-2xl border border-border bg-muted/25 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><House className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold">{householdName}</h3>
                <Badge variant="outline">{role === 'owner' ? 'Administradora' : 'Miembro'}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Sesión de {userName}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f3ecdd] text-[#846936]"><BellRing className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-extrabold">Resumen diario</h3><p className="mt-1 text-xs text-muted-foreground">A las 09:00 · Avisos a 3, 1 y 0 días</p></div>
                <Switch checked={notificationsEnabled} disabled={notificationBusy} onCheckedChange={(checked) => { if (checked) void enableNotifications(); }} aria-label="Activar notificaciones" />
              </div>
              {!notificationsEnabled && (
                <Button variant="outline" size="sm" className="mt-3 rounded-xl" disabled={notificationBusy} onClick={() => void enableNotifications()}>
                  <Smartphone className="size-4" />{notificationBusy ? 'Activando…' : 'Activar en este móvil'}
                </Button>
              )}
              {notificationsEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-xl"
                  disabled={notificationBusy}
                  onClick={() => void testNotifications()}
                >
                  <Send className="size-4" />
                  {notificationBusy ? 'Enviando…' : 'Enviar notificación de prueba'}
                </Button>
              )}
              {notificationMessage && <p className="mt-3 text-xs leading-5 text-muted-foreground">{notificationMessage}</p>}
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />En iPhone, añade primero la web a la pantalla de inicio y abre la aplicación desde su icono.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e9eef8] text-[#50689b]"><UsersRound className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-extrabold">Invitar a la familia</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">El código puede utilizarse durante 7 días para unirse a esta casa.</p>
              {demoMode ? (
                <p className="mt-3 text-xs font-semibold text-primary">Disponible cuando conectemos la base de datos familiar.</p>
              ) : inviteCode ? (
                <div className="mt-3 flex items-center gap-2">
                  <code className="rounded-xl bg-muted px-3 py-2 text-base font-extrabold tracking-[0.16em]">{inviteCode}</code>
                  <Button variant="outline" size="icon" aria-label="Copiar código" onClick={() => void copyInvite()}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="mt-3 rounded-xl" disabled={inviteBusy || role !== 'owner'} onClick={() => void createInvite()}>
                  <Share2 className="size-4" />{inviteBusy ? 'Creando…' : 'Crear código'}
                </Button>
              )}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          {demoMode ? (
            <Button variant="ghost" className="justify-start text-muted-foreground" onClick={() => { onResetDemo(); onOpenChange(false); }}><RotateCcw className="size-4" />Restaurar datos de ejemplo</Button>
          ) : <span />}
          <Button variant="ghost" className="justify-start text-muted-foreground" onClick={() => void onSignOut()}><LogOut className="size-4" />Cerrar sesión</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
