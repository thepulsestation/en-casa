-- Ejecutar una sola vez después de desplegar la Edge Function.
-- Sustituye los dos valores marcados antes de ejecutar este archivo.

select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
select vault.create_secret('TU-SECRETO-CRON', 'cron_secret');

select cron.schedule(
  'send-expiry-notifications-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/send-expiry-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
