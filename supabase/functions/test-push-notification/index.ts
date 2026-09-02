import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const appUrl = Deno.env.get('APP_URL') ?? '/';
  const authorization = request.headers.get('Authorization');

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceRoleKey ||
    !vapidSubject ||
    !vapidPublicKey ||
    !vapidPrivateKey
  ) {
    return Response.json(
      { error: 'Falta terminar la configuración del servidor.' },
      { status: 500, headers: corsHeaders },
    );
  }
  if (!authorization) {
    return Response.json(
      { error: 'Inicia sesión para enviar una prueba.' },
      { status: 401, headers: corsHeaders },
    );
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();
  if (authError || !user) {
    return Response.json(
      { error: 'La sesión ha caducado. Vuelve a iniciar sesión.' },
      { status: 401, headers: corsHeaders },
    );
  }

  let endpoint: string | undefined;
  try {
    const body = await request.json();
    endpoint = typeof body?.endpoint === 'string' ? body.endpoint : undefined;
  } catch {
    endpoint = undefined;
  }
  if (!endpoint) {
    return Response.json(
      { error: 'No se ha encontrado la suscripción de este dispositivo.' },
      { status: 400, headers: corsHeaders },
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
    .eq('enabled', true)
    .maybeSingle();
  if (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: corsHeaders },
    );
  }
  if (!data) {
    return Response.json(
      { error: 'Activa de nuevo los avisos en este dispositivo.' },
      { status: 404, headers: corsHeaders },
    );
  }

  const subscription = data as Subscription;
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({
    title: 'En casa · Prueba completada',
    body: 'Las notificaciones funcionan en este dispositivo.',
    url: appUrl,
    tag: `notification-test-${Date.now()}`,
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload,
      { TTL: 60 * 10, urgency: 'high' },
    );
    return Response.json({ ok: true, sent: 1 }, { headers: corsHeaders });
  } catch (caught) {
    const statusCode = (caught as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await admin
        .from('push_subscriptions')
        .update({ enabled: false })
        .eq('id', subscription.id);
      return Response.json(
        { error: 'La suscripción había caducado. Activa de nuevo los avisos.' },
        { status: 410, headers: corsHeaders },
      );
    }
    console.error('Test push delivery failed', subscription.id, statusCode ?? caught);
    return Response.json(
      { error: 'El servicio push no ha aceptado la notificación de prueba.' },
      { status: 502, headers: corsHeaders },
    );
  }
});
