import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { z } from 'zod';

export const UNITS = ['unit', 'g', 'kg', 'ml', 'l', 'pack'] as const;
export const STORAGE_LOCATIONS = ['fridge', 'freezer', 'pantry', 'other'] as const;
export const EXPIRY_KINDS = ['use_by', 'best_before', 'unknown'] as const;

export type Unit = (typeof UNITS)[number];
export type StorageLocation = (typeof STORAGE_LOCATIONS)[number];
export type ExpiryKind = (typeof EXPIRY_KINDS)[number];
export type InventoryStatus = 'active' | 'consumed' | 'discarded';

export type InventoryItem = {
  id: string;
  householdId?: string;
  name: string;
  quantity: number;
  initialQuantity: number;
  unit: Unit;
  purchasedOn: string | null;
  expiresOn: string | null;
  expiryKind: ExpiryKind;
  storageLocation: StorageLocation;
  openedOn: string | null;
  consumeWithinDaysAfterOpening: number | null;
  notes: string | null;
  status: InventoryStatus;
  createdAt: string;
  updatedAt: string;
  createdByName?: string;
};

export type InventoryActivity = {
  id: string;
  itemId?: string;
  action: 'imported' | 'created' | 'opened' | 'consumed' | 'discarded' | 'updated';
  itemName: string;
  detail: string;
  actorName: string;
  createdAt: string;
};

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa fechas con el formato AAAA-MM-DD')
  .refine((value) => isValid(parseISO(value)), 'La fecha no es válida');

const nullableDate = z.union([isoDate, z.null()]).optional().default(null);

const importedItemSchema = z.object({
  name: z.string().trim().min(1, 'Falta el nombre').max(120),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor que cero').max(100000),
  unit: z.enum(UNITS).default('unit'),
  expires_on: nullableDate,
  expiry_kind: z.enum(EXPIRY_KINDS).default('unknown'),
  storage_location: z.enum(STORAGE_LOCATIONS).default('pantry'),
  opened_on: nullableDate,
  consume_within_days_after_opening: z
    .union([z.coerce.number().int().positive().max(365), z.null()])
    .optional()
    .default(null),
  notes: z.union([z.string().trim().max(500), z.null()]).optional().default(null),
});

export const purchaseImportSchema = z.object({
  schema_version: z.union([z.literal('1.0'), z.literal(1)]).transform(() => '1.0' as const),
  purchased_on: nullableDate,
  items: z.array(importedItemSchema).min(1, 'El JSON no contiene productos').max(100),
});

export type PurchaseImport = z.infer<typeof purchaseImportSchema>;

const unitAliases: Record<string, Unit> = {
  unidad: 'unit',
  unidades: 'unit',
  unit: 'unit',
  units: 'unit',
  ud: 'unit',
  uds: 'unit',
  gramo: 'g',
  gramos: 'g',
  g: 'g',
  kilo: 'kg',
  kilos: 'kg',
  kg: 'kg',
  mililitro: 'ml',
  mililitros: 'ml',
  ml: 'ml',
  litro: 'l',
  litros: 'l',
  l: 'l',
  paquete: 'pack',
  paquetes: 'pack',
  pack: 'pack',
};

const storageAliases: Record<string, StorageLocation> = {
  nevera: 'fridge',
  frigorifico: 'fridge',
  frigorífico: 'fridge',
  fridge: 'fridge',
  congelador: 'freezer',
  freezer: 'freezer',
  despensa: 'pantry',
  pantry: 'pantry',
  otro: 'other',
  other: 'other',
};

const expiryAliases: Record<string, ExpiryKind> = {
  caducidad: 'use_by',
  use_by: 'use_by',
  consumo_preferente: 'best_before',
  'consumo preferente': 'best_before',
  best_before: 'best_before',
  desconocido: 'unknown',
  unknown: 'unknown',
};

export function normalizeImportPayload(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const record = input as Record<string, unknown>;
  const rawItems = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.productos)
      ? record.productos
      : [];

  return {
    schema_version: record.schema_version ?? record.version ?? '1.0',
    purchased_on: record.purchased_on ?? record.fecha_compra ?? null,
    items: rawItems.map((rawItem) => {
      const item = (rawItem ?? {}) as Record<string, unknown>;
      const stringValue = (value: unknown, fallback: string) =>
        typeof value === 'string' || typeof value === 'number'
          ? String(value).toLowerCase()
          : fallback;
      const rawUnit = stringValue(item.unit ?? item.unidad, 'unit');
      const rawStorage = stringValue(
        item.storage_location ?? item.ubicacion ?? item.almacenamiento,
        'pantry',
      );
      const rawExpiryKind = stringValue(
        item.expiry_kind ?? item.tipo_caducidad,
        'unknown',
      );

      return {
        name: item.name ?? item.nombre,
        quantity: item.quantity ?? item.cantidad,
        unit: unitAliases[rawUnit] ?? rawUnit,
        expires_on: item.expires_on ?? item.fecha_caducidad ?? item.caduca_el ?? null,
        expiry_kind: expiryAliases[rawExpiryKind] ?? rawExpiryKind,
        storage_location: storageAliases[rawStorage] ?? rawStorage,
        opened_on: item.opened_on ?? item.abierto_el ?? null,
        consume_within_days_after_opening:
          item.consume_within_days_after_opening ?? item.dias_tras_apertura ?? null,
        notes: item.notes ?? item.notas ?? null,
      };
    }),
  };
}

export function importedItemToInventory(
  item: PurchaseImport['items'][number],
  purchasedOn: string | null,
): InventoryItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: item.name,
    quantity: item.quantity,
    initialQuantity: item.quantity,
    unit: item.unit,
    purchasedOn,
    expiresOn: item.expires_on,
    expiryKind: item.expiry_kind,
    storageLocation: item.storage_location,
    openedOn: item.opened_on,
    consumeWithinDaysAfterOpening: item.consume_within_days_after_opening,
    notes: item.notes,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdByName: 'Nicole',
  };
}

export const unitLabels: Record<Unit, { singular: string; plural: string; short: string }> = {
  unit: { singular: 'unidad', plural: 'unidades', short: 'ud.' },
  g: { singular: 'gramo', plural: 'gramos', short: 'g' },
  kg: { singular: 'kilo', plural: 'kilos', short: 'kg' },
  ml: { singular: 'mililitro', plural: 'mililitros', short: 'ml' },
  l: { singular: 'litro', plural: 'litros', short: 'l' },
  pack: { singular: 'paquete', plural: 'paquetes', short: 'paq.' },
};

export const storageLabels: Record<StorageLocation, string> = {
  fridge: 'Nevera',
  freezer: 'Congelador',
  pantry: 'Despensa',
  other: 'Otro',
};

export const expiryKindLabels: Record<ExpiryKind, string> = {
  use_by: 'Caducidad',
  best_before: 'Consumo preferente',
  unknown: 'Sin especificar',
};

export function getEffectiveExpiry(item: InventoryItem): string | null {
  const dates: string[] = [];
  if (item.expiresOn) dates.push(item.expiresOn);
  if (item.openedOn && item.consumeWithinDaysAfterOpening) {
    dates.push(
      format(addDays(parseISO(item.openedOn), item.consumeWithinDaysAfterOpening), 'yyyy-MM-dd'),
    );
  }
  return dates.sort()[0] ?? null;
}

export function daysUntilExpiry(item: InventoryItem, now = new Date()): number | null {
  const expiry = getEffectiveExpiry(item);
  if (!expiry) return null;
  return differenceInCalendarDays(parseISO(expiry), now);
}

export function formatExpiry(item: InventoryItem, now = new Date()): string {
  const days = daysUntilExpiry(item, now);
  if (days === null) return 'Sin fecha';
  if (days < 0) return `Caducó hace ${Math.abs(days)} ${Math.abs(days) === 1 ? 'día' : 'días'}`;
  if (days === 0) return item.expiryKind === 'best_before' ? 'Preferente hoy' : 'Caduca hoy';
  if (days === 1) return item.expiryKind === 'best_before' ? 'Preferente mañana' : 'Caduca mañana';
  return `Quedan ${days} días`;
}

export function formatQuantity(item: Pick<InventoryItem, 'quantity' | 'unit'>): string {
  const amount = Number.isInteger(item.quantity)
    ? String(item.quantity)
    : item.quantity.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  if (item.unit === 'unit' || item.unit === 'pack') {
    const label = item.quantity === 1 ? unitLabels[item.unit].singular : unitLabels[item.unit].plural;
    return `${amount} ${label}`;
  }
  return `${amount} ${unitLabels[item.unit].short}`;
}

export function formatLongDate(value: string): string {
  return format(parseISO(value), "d 'de' MMMM", { locale: es });
}

export function inventorySort(a: InventoryItem, b: InventoryItem): number {
  const aDays = daysUntilExpiry(a);
  const bDays = daysUntilExpiry(b);
  if (aDays === null && bDays === null) return a.name.localeCompare(b.name, 'es');
  if (aDays === null) return 1;
  if (bDays === null) return -1;
  return aDays - bDays || a.name.localeCompare(b.name, 'es');
}

export function decrementFor(item: InventoryItem): number {
  if (item.unit === 'unit' || item.unit === 'pack') return 1;
  if (item.unit === 'g' || item.unit === 'ml') return Math.min(100, item.quantity);
  return Math.min(0.25, item.quantity);
}

const isoToday = () => format(new Date(), 'yyyy-MM-dd');
const relativeDate = (days: number) => format(addDays(new Date(), days), 'yyyy-MM-dd');

export function createDemoInventory(): InventoryItem[] {
  const now = new Date().toISOString();
  const create = (
    id: string,
    name: string,
    quantity: number,
    unit: Unit,
    days: number | null,
    storageLocation: StorageLocation,
    options: Partial<InventoryItem> = {},
  ): InventoryItem => ({
    id,
    name,
    quantity,
    initialQuantity: quantity,
    unit,
    purchasedOn: isoToday(),
    expiresOn: days === null ? null : relativeDate(days),
    expiryKind: 'use_by',
    storageLocation,
    openedOn: null,
    consumeWithinDaysAfterOpening: null,
    notes: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdByName: 'Nicole',
    ...options,
  });

  return [
    create('demo-eggs', 'Huevos camperos', 12, 'unit', 0, 'fridge'),
    create('demo-milk', 'Leche fresca', 1, 'l', 6, 'fridge', {
      openedOn: relativeDate(-1),
      consumeWithinDaysAfterOpening: 3,
    }),
    create('demo-spinach', 'Espinacas', 300, 'g', 3, 'fridge'),
    create('demo-yogurts', 'Yogures naturales', 6, 'unit', 7, 'fridge', {
      expiryKind: 'best_before',
    }),
    create('demo-chicken', 'Pechuga de pollo', 500, 'g', 1, 'fridge'),
    create('demo-peas', 'Guisantes', 750, 'g', 45, 'freezer'),
    create('demo-bread', 'Pan de molde', 1, 'pack', 5, 'pantry', {
      openedOn: isoToday(),
      consumeWithinDaysAfterOpening: 5,
    }),
    create('demo-rice', 'Arroz', 1, 'kg', null, 'pantry', {
      expiryKind: 'best_before',
    }),
  ];
}

export function createDemoActivity(): InventoryActivity[] {
  const now = new Date();
  return [
    {
      id: 'activity-1',
      itemId: 'demo-bread',
      action: 'opened',
      itemName: 'Pan de molde',
      detail: 'Marcó un paquete como abierto',
      actorName: 'Mamá',
      createdAt: new Date(now.getTime() - 35 * 60_000).toISOString(),
    },
    {
      id: 'activity-2',
      itemId: 'demo-yogurts',
      action: 'consumed',
      itemName: 'Yogures naturales',
      detail: 'Consumió 1 unidad',
      actorName: 'Lucas',
      createdAt: new Date(now.getTime() - 3 * 60 * 60_000).toISOString(),
    },
    {
      id: 'activity-3',
      action: 'imported',
      itemName: 'Compra del viernes',
      detail: 'Añadió 8 productos al inventario',
      actorName: 'Nicole',
      createdAt: new Date(now.getTime() - 24 * 60 * 60_000).toISOString(),
    },
  ];
}

export const examplePurchaseJson = JSON.stringify(
  {
    schema_version: '1.0',
    purchased_on: isoToday(),
    items: [
      {
        name: 'Huevos',
        quantity: 12,
        unit: 'unit',
        expires_on: relativeDate(7),
        expiry_kind: 'use_by',
        storage_location: 'fridge',
        opened_on: null,
        consume_within_days_after_opening: null,
        notes: null,
      },
      {
        name: 'Leche fresca',
        quantity: 2,
        unit: 'l',
        expires_on: relativeDate(5),
        expiry_kind: 'use_by',
        storage_location: 'fridge',
        opened_on: null,
        consume_within_days_after_opening: 3,
        notes: null,
      },
    ],
  },
  null,
  2,
);
