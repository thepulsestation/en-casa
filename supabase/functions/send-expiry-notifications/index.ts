import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Preference = {
  household_id: string;
  user_id: string;
  enabled: boolean;
  reminder_days: number[];
  daily_time: string;
  timezone: string;
};

type Subscription = {
  id: string;
  household_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type Candidate = {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  unit: string;
  expiry_kind: 'use_by' | 'best_before' | 'unknown';
  effective_expires_on: string;
};

function localParts(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
  };
}

function dayDifference(fromDate: string, toDate: string) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

function digestCopy(items: Array<Candidate & { days: number }>) {
  const today = items.filter((item) => item.days <= 0);
  const tomorrow = items.filter((item) => item.days === 1);
  const next = items.filter((item) => item.days > 1);
  const names = items.slice(0, 3).map((item) => item.name).join(', ');
  if (today.length) {
    return {
      title: today.length === 1 ? 'Un producto necesita atención hoy' : `${today.length} productos necesitan atención hoy`,
      body: `${names}${items.length > 3 ? ` y ${items.length - 3} más` : ''}. Revisa la despensa para aprovecharlos.`,
    };
  }
  if (tomorrow.length) {
    return {
      title: tomorrow.length === 1 ? 'Un producto caduca mañana' : `${tomorrow.length} productos caducan mañana`,
      body: `${names}${items.length > 3 ? ` y ${items.length - 3} más` : ''}. Quizá podáis usarlos hoy.`,
    };
  }
  return {
    title: next.length === 1 ? 'Algo conviene usar pronto' : `${next.length} cosas conviene usarlas pronto`,
    body: `${names}${items.length > 3 ? ` y ${items.length - 3} más` : ''}.`,
  };
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const appUrl = Deno.env.get('APP_URL') ?? '/';

  if (!supabaseUrl || !serviceRoleKey || !vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return Response.json({ error: 'missing_configuration' }, { status: 500 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [preferencesResult, subscriptionsResult, candidatesResult] = await Promise.all([
    supabase.from('notification_preferences').select('*').eq('enabled', true),
    supabase.from('push_subscriptions').select('id, household_id, user_id, endpoint, p256dh, auth').eq('enabled', true),
    supabase.from('inventory_notification_candidates').select('*').not('effective_expires_on', 'is', null),
  ]);

  const readError = preferencesResult.error || subscriptionsResult.error || candidatesResult.error;
  if (readError) return Response.json({ error: readError.message }, { status: 500 });

  const preferences = preferencesResult.data as Preference[];
  const subscriptions = subscriptionsResult.data as Subscription[];
  const candidates = candidatesResult.data as Candidate[];
  let sent = 0;
  let skipped = 0;

  for (const preference of preferences) {
    const local = localParts(preference.timezone || 'Europe/Madrid');
    const preferredHour = Number(preference.daily_time.slice(0, 2));
    if (local.hour !== preferredHour) continue;

    const userSubscriptions = subscriptions.filter(
      (subscription) =>
        subscription.user_id === preference.user_id &&
        subscription.household_id === preference.household_id,
    );
    if (!userSubscriptions.length) continue;

    const { data: existingLog } = await supabase
      .from('notification_log')
      .select('id')
      .eq('household_id', preference.household_id)
      .eq('user_id', preference.user_id)
      .eq('notification_date', local.date)
      .eq('notification_kind', 'expiry_digest')
      .maybeSingle();
    if (existingLog) {
      skipped += 1;
      continue;
    }

    const due = candidates
      .filter((candidate) => candidate.household_id === preference.household_id)
      .map((candidate) => ({ ...candidate, days: dayDifference(local.date, candidate.effective_expires_on) }))
      .filter((candidate) => preference.reminder_days.includes(candidate.days))
      .sort((a, b) => a.days - b.days);
    if (!due.length) continue;

    const copy = digestCopy(due);
    const payload = JSON.stringify({
      ...copy,
      url: appUrl,
      tag: `expiry-digest-${local.date}`,
    });

    let delivered = 0;
    for (const subscription of userSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 60 * 60 * 12, urgency: due.some((item) => item.days <= 0) ? 'high' : 'normal' },
        );
        delivered += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').update({ enabled: false }).eq('id', subscription.id);
        }
        console.error('Push delivery failed', subscription.id, statusCode ?? error);
      }
    }

    if (delivered > 0) {
      await supabase.from('notification_log').insert({
        household_id: preference.household_id,
        user_id: preference.user_id,
        notification_date: local.date,
        notification_kind: 'expiry_digest',
        item_count: due.length,
      });
      sent += delivered;
    }
  }

  return Response.json({ ok: true, sent, skipped });
});
