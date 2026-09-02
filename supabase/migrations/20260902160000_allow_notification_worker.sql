-- La función programada usa service_role: además de saltarse RLS, necesita
-- privilegios SQL explícitos sobre las tablas que consulta y actualiza.
grant select on public.notification_preferences to service_role;
grant select, update on public.push_subscriptions to service_role;
grant select, insert on public.notification_log to service_role;
