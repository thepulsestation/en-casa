'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  CloudOff,
  Edit3,
  Home,
  Link2,
  Loader2,
  MapPin,
  PackageOpen,
  Plus,
  RotateCcw,
  ScanLine,
  Search,
  Settings2,
  Snowflake,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthScreen } from '@/components/en-casa/auth-screen';
import { HouseholdSetup } from '@/components/en-casa/household-setup';
import { ImportPurchaseDialog } from '@/components/en-casa/import-purchase-dialog';
import { ItemDialog } from '@/components/en-casa/item-dialog';
import { SettingsDialog } from '@/components/en-casa/settings-dialog';
import { ProductThumbnail } from '@/components/en-casa/product-thumbnail';
import { useInventoryData } from '@/hooks/use-inventory-data';
import {
  daysUntilExpiry,
  expiryKindLabels,
  formatExpiry,
  formatLongDate,
  formatQuantity,
  getEffectiveExpiry,
  inventorySort,
  storageLabels,
  type InventoryItem,
  type StorageLocation,
} from '@/lib/inventory';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase-client';

type View = 'today' | 'inventory' | 'activity';

type Household = {
  id: string;
  name: string;
  timezone: string;
  role: string;
};

const navItems: Array<{
  label: string;
  view?: View;
  icon: typeof Home;
  import?: boolean;
}> = [
  { label: 'Hoy', view: 'today', icon: Home },
  { label: 'Inventario', view: 'inventory', icon: UtensilsCrossed },
  { label: 'Importar', icon: ScanLine, import: true },
  { label: 'Actividad', view: 'activity', icon: Clock3 },
];

function expiryTone(item: InventoryItem): string {
  const days = daysUntilExpiry(item);
  if (days !== null && days <= 0) return 'text-[#b24b42]';
  if (days !== null && days <= 3) return 'text-[#9a671b]';
  return 'text-primary';
}

function batchRelationship(
  item: InventoryItem,
  items: InventoryItem[],
): string | null {
  if (item.sourceBatchId) {
    const source = items.find(
      (candidate) => candidate.id === item.sourceBatchId,
    );
    return source
      ? `Lote original: ${formatQuantity(source)} sin abrir`
      : 'Separado de su lote original';
  }
  const openedQuantity = items
    .filter((candidate) => candidate.sourceBatchId === item.id)
    .reduce((total, candidate) => total + candidate.quantity, 0);
  return openedQuantity > 0
    ? `Abiertos desde este lote: ${formatQuantity({ ...item, quantity: openedQuantity })}`
    : null;
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-background">
      <div className="text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <PackageOpen className="size-5" />
        </div>
        <Loader2 className="mx-auto mt-5 size-5 animate-spin text-primary" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          Preparando la casa…
        </p>
      </div>
    </main>
  );
}

function InventoryCard({
  item,
  relationship,
  onConsume,
  onUse,
  onFinish,
  onOpen,
  onEdit,
  onDiscard,
}: {
  item: InventoryItem;
  relationship?: string | null;
  onConsume: () => void;
  onUse: () => void;
  onFinish: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}) {
  const effectiveExpiry = getEffectiveExpiry(item);
  const canOpen = !item.openedOn && item.tracksOpenedState;
  const isOpenedContainer = Boolean(item.openedOn && item.tracksOpenedState);
  return (
    <article className="rounded-[20px] border border-border bg-card p-4 shadow-[0_8px_28px_rgb(44_45_40/5%)]">
      <div className="flex items-start gap-3.5">
        <ProductThumbnail name={item.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-extrabold">{item.name}</h3>
            {item.openedOn && (
              <Badge className="bg-[#f3ecdd] text-[#846936] hover:bg-[#f3ecdd]">
                Abierto
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatQuantity(item)} · {storageLabels[item.storageLocation]}
          </p>
          <p
            className={`mt-2 inline-flex items-center gap-1.5 text-xs font-extrabold ${expiryTone(item)}`}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {formatExpiry(item)}
          </p>
          {effectiveExpiry && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {expiryKindLabels[item.expiryKind]}:{' '}
              {formatLongDate(
                effectiveExpiry,
                effectiveExpiry === item.expiresOn
                  ? item.expiryPrecision
                  : 'day',
              )}
            </p>
          )}
          {!item.openedOn && item.consumeWithinDaysAfterOpening && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Al abrir: consumir en {item.consumeWithinDaysAfterOpening} días
            </p>
          )}
          {canOpen && !item.consumeWithinDaysAfterOpening && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Se mantendrá en el inventario una vez abierto
            </p>
          )}
          {isOpenedContainer && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Puedes registrar usos sin retirar el envase
            </p>
          )}
          {relationship && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/[0.06] px-2 py-1 text-[11px] font-semibold text-primary">
              <Link2 className="size-3" />
              {relationship}
            </p>
          )}
        </div>
        <Button
          aria-label={`Editar ${item.name}`}
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
        >
          <Edit3 className="size-4" />
        </Button>
      </div>
      <div
        className={`mt-4 grid ${isOpenedContainer ? 'grid-cols-3' : 'grid-cols-2'} gap-2 border-t border-border/70 pt-3`}
      >
        {!item.tracksOpenedState && (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-xl font-bold"
            onClick={onConsume}
          >
            <CheckCircle2 className="size-3.5" />
            Consumir
          </Button>
        )}
        {canOpen && (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-xl font-bold"
            onClick={onOpen}
          >
            <PackageOpen className="size-3.5" />
            Abrir
          </Button>
        )}
        {isOpenedContainer && (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-xl font-bold"
            onClick={onUse}
          >
            <UtensilsCrossed className="size-3.5" />
            Usar
          </Button>
        )}
        {isOpenedContainer && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl font-bold"
            onClick={onFinish}
          >
            <CheckCircle2 className="size-3.5" />
            Terminar
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl text-muted-foreground"
          onClick={onDiscard}
        >
          <Trash2 className="size-3.5" />
          Tirar
        </Button>
      </div>
    </article>
  );
}

type ItemActions = {
  consume: (id: string) => void;
  use: (id: string) => void;
  finish: (item: InventoryItem) => void;
  open: (id: string) => void;
  edit: (item: InventoryItem) => void;
  discard: (item: InventoryItem) => void;
};

function TodayView({
  items,
  onViewInventory,
  onImport,
  actions,
}: {
  items: InventoryItem[];
  onViewInventory: (location?: StorageLocation) => void;
  onImport: () => void;
  actions: ItemActions;
}) {
  const urgent = items
    .filter((item) => {
      const days = daysUntilExpiry(item);
      return days !== null && days <= 3;
    })
    .slice(0, 3);
  const expiringToday = items.filter(
    (item) => daysUntilExpiry(item) === 0,
  ).length;
  const opened = items.filter((item) => item.openedOn).length;

  return (
    <div className="mx-auto max-w-[1040px]">
      <section className="relative overflow-hidden rounded-[26px] bg-[#194d3b] px-5 py-6 text-white shadow-[0_20px_50px_rgb(25_77_59/18%)] sm:px-7 sm:py-7">
        <div className="absolute -right-12 -top-16 size-48 rounded-full border-[28px] border-white/5" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <Badge className="mb-4 bg-white/12 text-white hover:bg-white/12">
              <CalendarDays />
              Resumen de hoy
            </Badge>
            <h2 className="max-w-lg text-[28px] font-extrabold leading-[1.08] tracking-[-0.04em] sm:text-[34px]">
              {urgent.length === 0
                ? 'Todo está bajo control'
                : `Hay ${urgent.length} ${urgent.length === 1 ? 'cosa' : 'cosas'} que conviene usar pronto`}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
              {expiringToday > 0
                ? `${expiringToday === 1 ? 'Un producto caduca' : `${expiringToday} productos caducan`} hoy. Revisa la lista para aprovecharlo.`
                : 'No hay nada que caduque hoy. Puedes consultar lo próximo para organizar las comidas.'}
            </p>
          </div>
          <Button
            className="h-11 justify-between rounded-xl bg-[#f4d37c] px-4 font-bold text-[#253b31] hover:bg-[#f6dd99]"
            onClick={() => onViewInventory()}
          >
            Ver inventario
            <ChevronRight className="ml-2 size-4" />
          </Button>
        </div>
      </section>

      <section className="mt-7" aria-labelledby="soon-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
              Prioridad
            </p>
            <h2
              id="soon-title"
              className="mt-1 text-xl font-extrabold tracking-[-0.03em]"
            >
              Próximamente
            </h2>
          </div>
          <button
            className="text-sm font-bold text-primary"
            type="button"
            onClick={() => onViewInventory()}
          >
            Ver todo
          </button>
        </div>
        {urgent.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {urgent.map((item) => (
              <InventoryCard
                key={item.id}
                item={item}
                relationship={batchRelationship(item, items)}
                onConsume={() => actions.consume(item.id)}
                onUse={() => actions.use(item.id)}
                onFinish={() => actions.finish(item)}
                onOpen={() => actions.open(item.id)}
                onEdit={() => actions.edit(item)}
                onDiscard={() => actions.discard(item)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-border bg-card p-8 text-center">
            <CheckCircle2 className="mx-auto size-7 text-primary" />
            <p className="mt-3 text-sm font-extrabold">
              Nada caduca en los próximos 3 días
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Buen momento para planificar la siguiente compra.
            </p>
          </div>
        )}
      </section>

      <section
        className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Resumen del inventario"
      >
        {[
          {
            label: 'Nevera',
            location: 'fridge' as const,
            icon: Snowflake,
            color: 'bg-[#e7f3f4] text-[#317179]',
          },
          {
            label: 'Congelador',
            location: 'freezer' as const,
            icon: Snowflake,
            color: 'bg-[#e9eef8] text-[#50689b]',
          },
          {
            label: 'Despensa',
            location: 'pantry' as const,
            icon: PackageOpen,
            color: 'bg-[#f3ecdd] text-[#846936]',
          },
          {
            label: 'Otro',
            location: 'other' as const,
            icon: MapPin,
            color: 'bg-[#eee9f5] text-[#6f5a8d]',
          },
        ].map(({ label, location, icon: Icon, color }) => {
          const count = items.filter(
            (item) => item.storageLocation === location,
          ).length;
          return (
            <button
              key={label}
              className="flex items-center gap-3 rounded-[18px] border border-border bg-card p-4 text-left shadow-[0_8px_24px_rgb(44_45_40/4%)] hover:border-primary/30"
              type="button"
              onClick={() => onViewInventory(location)}
            >
              <span
                className={`grid size-10 place-items-center rounded-xl ${color}`}
              >
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-extrabold">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {count} {count === 1 ? 'producto' : 'productos'}
                </span>
              </span>
              <ChevronRight className="ml-auto size-4 text-muted-foreground" />
            </button>
          );
        })}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="flex flex-col gap-4 rounded-[22px] border border-dashed border-primary/35 bg-primary/[0.045] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3.5">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <ScanLine className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold">
                ¿Acabas de hacer la compra?
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Pega el JSON de ChatGPT y revisa los productos.
              </p>
            </div>
          </div>
          <Button className="h-10 rounded-xl px-4 font-bold" onClick={onImport}>
            <Plus className="size-4" />
            Importar
          </Button>
        </div>
        <div className="flex items-center gap-4 rounded-[22px] border border-border bg-card p-5">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#f3ecdd] text-[#846936]">
            <PackageOpen className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-extrabold tracking-[-0.03em]">
              {opened}
            </p>
            <p className="text-xs text-muted-foreground">
              {opened === 1 ? 'producto abierto' : 'productos abiertos'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function InventoryView({
  items,
  actions,
  onAdd,
  location,
  onLocationChange,
}: {
  items: InventoryItem[];
  actions: ItemActions;
  onAdd: () => void;
  location: 'all' | StorageLocation;
  onLocationChange: (location: 'all' | StorageLocation) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () =>
      items
        .filter(
          (item) =>
            (location === 'all' || item.storageLocation === location) &&
            item.name
              .toLocaleLowerCase('es')
              .includes(query.trim().toLocaleLowerCase('es')),
        )
        .sort(inventorySort),
    [items, location, query],
  );

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
            Todo lo que hay
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-[-0.04em]">
            Inventario
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {items.length} lotes disponibles en la casa
          </p>
        </div>
        <Button className="h-10 rounded-xl px-4 font-bold" onClick={onAdd}>
          <Plus className="size-4" />
          Añadir manualmente
        </Button>
      </div>
      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 rounded-xl border-0 bg-muted/55 pl-9 shadow-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar un producto…"
          />
          {query && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setQuery('')}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: 'all', label: 'Todo' },
              { id: 'fridge', label: 'Nevera' },
              { id: 'freezer', label: 'Congelador' },
              { id: 'pantry', label: 'Despensa' },
              { id: 'other', label: 'Otro' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`h-10 shrink-0 rounded-xl px-3 text-xs font-extrabold ${location === filter.id ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground'}`}
              onClick={() => onLocationChange(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {filtered.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              relationship={batchRelationship(item, items)}
              onConsume={() => actions.consume(item.id)}
              onUse={() => actions.use(item.id)}
              onFinish={() => actions.finish(item)}
              onOpen={() => actions.open(item.id)}
              onEdit={() => actions.edit(item)}
              onDiscard={() => actions.discard(item)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-border bg-card p-10 text-center">
          <Search className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-3 text-sm font-extrabold">No hay resultados</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Prueba otra búsqueda o ubicación.
          </p>
        </div>
      )}
    </div>
  );
}

function ActivityView({
  activity,
  onUndo,
  undoingId,
}: {
  activity: ReturnType<typeof useInventoryData>['activity'];
  onUndo: (activityId: string) => void;
  undoingId: string | null;
}) {
  const actionIcon = {
    imported: ScanLine,
    created: Plus,
    opened: PackageOpen,
    consumed: CheckCircle2,
    discarded: Trash2,
    updated: Edit3,
  } as const;
  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
          Compartido
        </p>
        <h2 className="mt-1 text-3xl font-extrabold tracking-[-0.04em]">
          Actividad familiar
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Los cambios recientes de todas las personas de la casa.
        </p>
      </div>
      <div className="mt-7 overflow-hidden rounded-[22px] border border-border bg-card">
        {activity.length ? (
          activity.map((entry, index) => {
            const Icon = actionIcon[entry.action];
            return (
              <article
                key={entry.id}
                className={`flex gap-3.5 p-4 sm:p-5 ${index ? 'border-t border-border/70' : ''}`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-extrabold">{entry.actorName}</span> ·{' '}
                    {entry.detail.toLocaleLowerCase('es')}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                    {entry.itemName}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <time className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.createdAt), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </time>
                  {entry.canUndo && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg px-2.5 text-[11px] font-bold"
                      disabled={undoingId === entry.id}
                      onClick={() => onUndo(entry.id)}
                    >
                      <RotateCcw
                        className={`size-3.5 ${undoingId === entry.id ? 'animate-spin' : ''}`}
                      />
                      {undoingId === entry.id ? 'Recuperando…' : 'Deshacer'}
                    </Button>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <div className="p-10 text-center">
            <Clock3 className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-extrabold">
              Todavía no hay actividad
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell() {
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(client));
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [householdLoading, setHouseholdLoading] = useState(Boolean(client));
  const [view, setView] = useState<View>('today');
  const [inventoryLocation, setInventoryLocation] = useState<
    'all' | StorageLocation
  >('all');
  const [importOpen, setImportOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState<InventoryItem | null>(
    null,
  );
  const [pendingFinish, setPendingFinish] = useState<InventoryItem | null>(
    null,
  );
  const [undoingActivityId, setUndoingActivityId] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    title: string;
    description: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const userName =
    session?.user.user_metadata?.full_name ||
    session?.user.email?.split('@')[0] ||
    'Nicole';
  const userId = session?.user.id ?? null;

  const loadHousehold = useCallback(async () => {
    if (!client || !session) {
      setHousehold(null);
      setHouseholdLoading(false);
      return;
    }
    setHouseholdLoading(true);
    const { data } = await client
      .from('household_members')
      .select('household_id, role, households(id, name, timezone)')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle();
    if (data?.households) {
      const linked = Array.isArray(data.households)
        ? data.households[0]
        : data.households;
      setHousehold({
        id: linked.id,
        name: linked.name,
        timezone: linked.timezone,
        role: data.role,
      });
    } else setHousehold(null);
    setHouseholdLoading(false);
  }, [client, session]);

  useEffect(() => {
    if (!client) return;
    const hashParameters = new URLSearchParams(
      window.location.hash.replace(/^#/, ''),
    );
    const queryParameters = new URLSearchParams(window.location.search);
    if (
      hashParameters.get('type') === 'recovery' ||
      queryParameters.get('type') === 'recovery'
    ) {
      setPasswordRecovery(true);
    }
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      setAuthLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    void loadHousehold();
  }, [loadHousehold]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      void navigator.serviceWorker
        .register(`${basePath}/service-worker.js`)
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const data = useInventoryData({
    client: client && session && household ? client : null,
    householdId: household?.id ?? null,
    userId,
    actorName: userName,
  });

  const notify = (
    title: string,
    description: string,
    type: 'success' | 'error' | 'info' = 'success',
  ) => setNotice({ title, description, type });
  const notifyError = (caught: unknown) =>
    notify(
      'No se ha podido completar',
      caught instanceof Error ? caught.message : 'Prueba de nuevo.',
      'error',
    );
  const openInventory = (location: 'all' | StorageLocation = 'all') => {
    setInventoryLocation(location);
    setView('inventory');
  };
  const undoConsumption = (activityId: string) => {
    setUndoingActivityId(activityId);
    void data
      .undoConsumption(activityId)
      .then(() =>
        notify(
          'Producto recuperado',
          'La cantidad consumida vuelve a estar disponible.',
        ),
      )
      .catch(notifyError)
      .finally(() => setUndoingActivityId(null));
  };
  const actions: ItemActions = {
    consume: (id) =>
      void data
        .consume(id)
        .then(() =>
          notify(
            'Inventario actualizado',
            'Se ha descontado la cantidad. Puedes deshacerlo desde Actividad.',
          ),
        )
        .catch(notifyError),
    use: (id) =>
      void data
        .useOpenItem(id)
        .then(() =>
          notify('Uso registrado', 'El envase sigue abierto y disponible.'),
        )
        .catch(notifyError),
    finish: (item) => setPendingFinish(item),
    open: (id) =>
      void data
        .openItem(id)
        .then(() =>
          notify(
            'Producto abierto',
            'Ya se tendrá en cuenta su duración tras la apertura.',
          ),
        )
        .catch(notifyError),
    edit: (item) => {
      setEditingItem(item);
      setItemDialogOpen(true);
    },
    discard: (item) => setPendingDiscard(item),
  };

  if (client && passwordRecovery)
    return (
      <AuthScreen
        client={client}
        initialMode="recovery"
        onRecoveryComplete={() => setPasswordRecovery(false)}
      />
    );
  if (authLoading) return <LoadingScreen />;
  if (client && !session) return <AuthScreen client={client} />;
  if (client && householdLoading) return <LoadingScreen />;
  if (client && session && !household)
    return <HouseholdSetup client={client} onReady={loadHousehold} />;

  const dateLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });
  const activeNav = (item: (typeof navItems)[number]) => item.view === view;

  return (
    <>
      <main className="min-h-screen bg-background pb-24 text-foreground lg:pb-0">
        <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
          <aside className="hidden w-[248px] shrink-0 border-r border-border/80 bg-card px-5 py-7 lg:flex lg:flex-col">
            <div className="flex items-center gap-3 px-2">
              <div className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-[0_8px_20px_rgb(42_108_77/22%)]">
                <PackageOpen className="size-5" />
              </div>
              <div>
                <p className="font-heading text-[17px] font-bold tracking-[-0.02em]">
                  En casa
                </p>
                <p className="text-xs text-muted-foreground">
                  {household?.name ?? 'La despensa familiar'}
                </p>
              </div>
            </div>
            <nav
              className="mt-10 space-y-1.5"
              aria-label="Navegación principal"
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeNav(item);
                return (
                  <button
                    key={item.label}
                    className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    type="button"
                    onClick={() =>
                      item.import
                        ? setImportOpen(true)
                        : item.view === 'inventory'
                          ? openInventory()
                          : item.view && setView(item.view)
                    }
                  >
                    <Icon
                      className="size-[18px]"
                      strokeWidth={active ? 2.4 : 2}
                    />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="mt-auto rounded-2xl bg-[#f2eee5] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[#6d5733]">
                <Bell className="size-4" />
                Avisos a las 09:00
              </div>
              <p className="mt-2 text-xs leading-5 text-[#806e50]">
                Te avisaremos de lo que caduque a 3 días, 1 día y el mismo día.
              </p>
            </div>
          </aside>

          <section className="min-w-0 flex-1">
            <header className="app-header sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-xl sm:px-8 lg:h-[84px] lg:px-10">
              <div className="lg:hidden">
                <p className="text-lg font-extrabold tracking-[-0.03em]">
                  En casa
                </p>
                <p className="text-[11px] font-medium capitalize text-muted-foreground">
                  {dateLabel}
                </p>
              </div>
              <div className="hidden lg:block">
                <p className="text-sm font-medium capitalize text-muted-foreground">
                  {dateLabel}
                </p>
                <h1 className="text-[22px] font-extrabold tracking-[-0.03em]">
                  Buenos días, {userName}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                {!isSupabaseConfigured && (
                  <Badge
                    variant="outline"
                    className="hidden border-[#c79542]/30 bg-[#fff8e8] text-[#8a5f18] sm:flex"
                  >
                    <CloudOff />
                    Modo demo
                  </Badge>
                )}
                <button
                  aria-label="Abrir ajustes"
                  className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5 pr-3 shadow-sm"
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                >
                  <span className="grid size-8 place-items-center rounded-full bg-[#e8bca9] text-[#6d3927]">
                    <CircleUserRound className="size-4" />
                  </span>
                  <span className="hidden text-xs font-bold sm:inline">
                    {userName}
                  </span>
                  <Settings2 className="size-3.5 text-muted-foreground" />
                </button>
              </div>
            </header>

            <div className="px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
              {data.loading ? (
                <div className="grid min-h-[55vh] place-items-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              ) : data.error ? (
                <div className="mx-auto max-w-xl rounded-2xl border border-destructive/20 bg-card p-8 text-center">
                  <CloudOff className="mx-auto size-7 text-destructive" />
                  <p className="mt-3 font-extrabold">
                    No se ha podido cargar la casa
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.error}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-5"
                    onClick={() => void data.reload()}
                  >
                    Volver a intentar
                  </Button>
                </div>
              ) : view === 'today' ? (
                <TodayView
                  items={data.items}
                  onViewInventory={openInventory}
                  onImport={() => setImportOpen(true)}
                  actions={actions}
                />
              ) : view === 'inventory' ? (
                <InventoryView
                  items={data.items}
                  actions={actions}
                  location={inventoryLocation}
                  onLocationChange={setInventoryLocation}
                  onAdd={() => {
                    setEditingItem(null);
                    setItemDialogOpen(true);
                  }}
                />
              ) : (
                <ActivityView
                  activity={data.activity}
                  onUndo={undoConsumption}
                  undoingId={undoingActivityId}
                />
              )}
            </div>
          </section>
        </div>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
          aria-label="Navegación principal"
        >
          <div className="mx-auto flex max-w-md justify-around">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeNav(item);
              return (
                <button
                  key={item.label}
                  className={`flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold ${active ? 'text-primary' : 'text-muted-foreground'}`}
                  type="button"
                  onClick={() =>
                    item.import
                      ? setImportOpen(true)
                      : item.view === 'inventory'
                        ? openInventory()
                        : item.view && setView(item.view)
                  }
                >
                  <span
                    className={`grid size-8 place-items-center rounded-xl ${active ? 'bg-primary/10' : ''}`}
                  >
                    <Icon
                      className="size-[18px]"
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      </main>

      <ImportPurchaseDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingNames={data.items.map((item) => item.name)}
        onImport={async (purchase) => {
          await data.importPurchase(purchase);
          notify(
            'Compra añadida',
            `${purchase.items.length} productos ya están en el inventario.`,
          );
        }}
      />
      <ItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        onSave={async (item) => {
          await data.saveItem(item);
          notify(
            editingItem ? 'Producto actualizado' : 'Producto añadido',
            item.name,
          );
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        client={client}
        householdId={household?.id ?? null}
        householdName={household?.name ?? 'Casa de demostración'}
        userId={userId}
        userName={userName}
        role={household?.role ?? 'owner'}
        demoMode={data.demoMode}
        onSignOut={async () => {
          if (client) await client.auth.signOut();
          else setSettingsOpen(false);
        }}
        onResetDemo={() => {
          data.resetDemo();
          notify(
            'Demostración restaurada',
            'Los productos de ejemplo vuelven a estar disponibles.',
          );
        }}
      />
      <AlertDialog
        open={Boolean(pendingFinish)}
        onOpenChange={(open) => !open && setPendingFinish(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-primary/10 text-primary">
              <CheckCircle2 />
            </AlertDialogMedia>
            <AlertDialogTitle>¿Se ha terminado el envase?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingFinish?.name}” saldrá del inventario. Si fue un error,
              podrás recuperarlo desde Actividad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingFinish) return;
                void data
                  .consume(pendingFinish.id)
                  .then(() =>
                    notify(
                      'Envase terminado',
                      'Se ha retirado del inventario. Puedes deshacerlo desde Actividad.',
                    ),
                  )
                  .catch(notifyError);
                setPendingFinish(null);
              }}
            >
              Sí, se ha terminado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(pendingDiscard)}
        onOpenChange={(open) => !open && setPendingDiscard(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>¿Se ha tirado este producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se retirará “{pendingDiscard?.name}” del inventario y quedará
              registrado en la actividad familiar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDiscard) return;
                void data
                  .discard(pendingDiscard.id)
                  .then(() =>
                    notify('Producto retirado', pendingDiscard.name, 'info'),
                  )
                  .catch(notifyError);
                setPendingDiscard(null);
              }}
            >
              Sí, se ha tirado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {notice && (
        <output
          aria-live="polite"
          className={`fixed bottom-24 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border bg-card p-4 shadow-xl lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0 ${notice.type === 'error' ? 'border-destructive/25' : 'border-border'}`}
        >
          <div className="flex gap-3">
            <span
              className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${notice.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}
            >
              {notice.type === 'error' ? (
                <X className="size-3.5" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
            </span>
            <div>
              <p className="text-sm font-extrabold">{notice.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {notice.description}
              </p>
            </div>
          </div>
        </output>
      )}
    </>
  );
}
