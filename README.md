# En casa

PWA familiar para registrar alimentos por lotes, controlar aperturas y consumo, y avisar antes de que algo caduque.

## Funciones incluidas

- Inventario compartido por nevera, congelador y despensa.
- Importación JSON con validación, vista previa y detección de lotes ya existentes.
- Altas y ediciones manuales.
- Acciones rápidas para consumir, abrir una unidad o retirar un producto.
- Cálculo de la fecha efectiva al abrir un envase.
- Historial familiar en tiempo real.
- Una cuenta por persona, casas compartidas y códigos de invitación.
- PWA instalable y suscripciones Web Push.
- Resumen programado a 3 días, 1 día y el mismo día.
- Despliegue estático en GitHub Pages.

Sin variables de entorno, la aplicación se abre en modo de demostración. Los datos del modo demo se guardan únicamente en ese navegador.

## Desarrollo local

```bash
npm install
npm run dev
```

## Conexión con Supabase

1. Copiar `.env.example` como `.env.local` y completar las tres variables públicas.
2. Enlazar el proyecto con Supabase CLI.
3. Aplicar `supabase/migrations/20260828150000_initial_schema.sql`.
4. Desplegar `send-expiry-notifications`.
5. Crear las claves VAPID y guardar los secretos de la función: `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` y `APP_URL`.
6. Ejecutar una versión completada de `supabase/setup-notification-cron.example.sql`.

La clave `service_role` nunca debe añadirse al frontend ni a GitHub Pages.

## Publicación

El flujo `.github/workflows/deploy-pages.yml` construye y publica `dist/client` al hacer push a `main`. El repositorio necesita estos secretos de Actions:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

El prompt recomendado para ChatGPT está en `docs/PROMPT_CHATGPT.md`.
