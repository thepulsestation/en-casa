'use client';

import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createDemoActivity,
  createDemoInventory,
  decrementFor,
  importedItemToInventory,
  inventorySort,
  type InventoryActivity,
  type InventoryItem,
  type PurchaseImport,
} from '@/lib/inventory';

const DEMO_INVENTORY_KEY = 'en-casa-demo-inventory-v1';
const DEMO_ACTIVITY_KEY = 'en-casa-demo-activity-v1';

type Options = {
  client: SupabaseClient | null;
  householdId: string | null;
  userId: string | null;
  actorName: string;
};

type DbInventoryRow = {
  id: string;
  household_id: string;
  source_batch_id: string | null;
  name: string;
  quantity: number | string;
  initial_quantity: number | string;
  unit: InventoryItem['unit'];
  purchased_on: string | null;
  expires_on: string | null;
  expiry_kind: InventoryItem['expiryKind'];
  expiry_precision: InventoryItem['expiryPrecision'];
  storage_location: InventoryItem['storageLocation'];
  opened_on: string | null;
  consume_within_days_after_opening: number | null;
  notes: string | null;
  status: InventoryItem['status'];
  created_at: string;
  updated_at: string;
  created_by_name?: string;
};

function fromDbRow(row: DbInventoryRow): InventoryItem {
  return {
    id: row.id,
    householdId: row.household_id,
    sourceBatchId: row.source_batch_id ?? null,
    name: row.name,
    quantity: Number(row.quantity),
    initialQuantity: Number(row.initial_quantity),
    unit: row.unit,
    purchasedOn: row.purchased_on,
    expiresOn: row.expires_on,
    expiryKind: row.expiry_kind,
    expiryPrecision: row.expiry_precision ?? 'day',
    storageLocation: row.storage_location,
    openedOn: row.opened_on,
    consumeWithinDaysAfterOpening: row.consume_within_days_after_opening,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: row.created_by_name,
  };
}

function readDemoState<T>(key: string, fallback: () => T): T {
  if (typeof window === 'undefined') return fallback();
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback();
  } catch {
    return fallback();
  }
}

export function useInventoryData({ client, householdId, userId, actorName }: Options) {
  const demoMode = !client;
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [activity, setActivity] = useState<InventoryActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (demoMode) {
      setItems(readDemoState(DEMO_INVENTORY_KEY, createDemoInventory));
      setActivity(readDemoState(DEMO_ACTIVITY_KEY, createDemoActivity));
      setLoading(false);
      return;
    }

    if (!householdId) {
      setItems([]);
      setActivity([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [inventoryResult, activityResult] = await Promise.all([
      client
        .from('inventory_batches')
        .select('*')
        .eq('household_id', householdId)
        .eq('status', 'active')
        .order('expires_on', { ascending: true, nullsFirst: false }),
      client
        .from('inventory_activity_feed')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(80),
    ]);

    if (inventoryResult.error) {
      setError('No se ha podido cargar el inventario.');
    } else {
      setItems((inventoryResult.data as DbInventoryRow[]).map(fromDbRow));
    }

    if (!activityResult.error) {
      setActivity(
        activityResult.data.map((row) => ({
          id: row.id,
          itemId: row.batch_id ?? undefined,
          action: row.action as InventoryActivity['action'],
          itemName: row.item_name,
          detail: row.detail,
          actorName: row.actor_name || 'Alguien de casa',
          createdAt: row.created_at,
          quantityDelta: row.quantity_delta == null ? undefined : Number(row.quantity_delta),
          canUndo:
            row.action === 'consumed'
            && Number(row.quantity_delta) < 0
            && !row.metadata?.restored_at
            && row.batch_status !== 'discarded',
        })),
      );
    }
    setLoading(false);
  }, [client, demoMode, householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!demoMode || typeof window === 'undefined' || loading) return;
    window.localStorage.setItem(DEMO_INVENTORY_KEY, JSON.stringify(items));
    window.localStorage.setItem(DEMO_ACTIVITY_KEY, JSON.stringify(activity));
  }, [activity, demoMode, items, loading]);

  useEffect(() => {
    if (!client || !householdId) return;
    const channel = client
      .channel(`inventory:${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_batches', filter: `household_id=eq.${householdId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inventory_events', filter: `household_id=eq.${householdId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, householdId, load]);

  const addLocalActivity = useCallback(
    (entry: Omit<InventoryActivity, 'id' | 'createdAt' | 'actorName'>) => {
      setActivity((current) => [
        {
          ...entry,
          id: crypto.randomUUID(),
          actorName,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    },
    [actorName],
  );

  const importPurchase = useCallback(
    async (purchase: PurchaseImport) => {
      const imported = purchase.items.map((item) =>
        importedItemToInventory(item, purchase.purchased_on),
      );

      if (demoMode) {
        setItems((current) => [...imported, ...current]);
        addLocalActivity({
          action: 'imported',
          itemName: `Compra de ${purchase.items.length} ${purchase.items.length === 1 ? 'producto' : 'productos'}`,
          detail: `Añadió ${purchase.items.length} ${purchase.items.length === 1 ? 'producto' : 'productos'} al inventario`,
        });
        return;
      }

      if (!client || !householdId || !userId) throw new Error('No hay una casa seleccionada.');
      const rows = imported.map((item) => ({
        household_id: householdId,
        source_batch_id: item.sourceBatchId,
        name: item.name,
        quantity: item.quantity,
        initial_quantity: item.initialQuantity,
        unit: item.unit,
        purchased_on: item.purchasedOn,
        expires_on: item.expiresOn,
        expiry_kind: item.expiryKind,
        expiry_precision: item.expiryPrecision,
        storage_location: item.storageLocation,
        opened_on: item.openedOn,
        consume_within_days_after_opening: item.consumeWithinDaysAfterOpening,
        notes: item.notes,
        created_by: userId,
      }));
      const { error: insertError } = await client.from('inventory_batches').insert(rows);
      if (insertError) throw insertError;
      await client.from('inventory_events').insert({
        household_id: householdId,
        action: 'imported',
        item_name: `Compra de ${rows.length} productos`,
        detail: `Añadió ${rows.length} productos al inventario`,
        user_id: userId,
      });
      await load();
    },
    [addLocalActivity, client, demoMode, householdId, load, userId],
  );

  const consume = useCallback(
    async (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return;
      const amount = decrementFor(item);

      if (demoMode) {
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === id
              ? {
                  ...candidate,
                  quantity: Math.max(0, candidate.quantity - amount),
                  status: candidate.quantity - amount <= 0 ? 'consumed' : 'active',
                  updatedAt: new Date().toISOString(),
                }
              : candidate,
          ),
        );
        addLocalActivity({
          itemId: id,
          action: 'consumed',
          itemName: item.name,
          detail: `Consumió ${amount} ${item.unit === 'unit' ? 'unidad' : item.unit}`,
          quantityDelta: -amount,
          canUndo: true,
        });
        return;
      }

      if (!client) return;
      const { error: rpcError } = await client.rpc('consume_inventory_item', {
        p_batch_id: id,
        p_amount: amount,
      });
      if (rpcError) throw rpcError;
      await load();
    },
    [addLocalActivity, client, demoMode, items, load],
  );

  const undoConsumption = useCallback(
    async (activityId: string) => {
      const entry = activity.find((candidate) => candidate.id === activityId);
      if (!entry || entry.action !== 'consumed' || !entry.canUndo || !entry.itemId) {
        throw new Error('Este consumo ya no se puede recuperar.');
      }

      if (demoMode) {
        const amount = Math.abs(entry.quantityDelta ?? 0);
        if (!amount) throw new Error('No se ha podido determinar la cantidad consumida.');
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === entry.itemId
              ? {
                  ...candidate,
                  quantity: candidate.quantity + amount,
                  status: 'active',
                  updatedAt: new Date().toISOString(),
                }
              : candidate,
          ),
        );
        setActivity((current) =>
          current.map((candidate) =>
            candidate.id === activityId ? { ...candidate, canUndo: false } : candidate,
          ),
        );
        addLocalActivity({
          itemId: entry.itemId,
          action: 'updated',
          itemName: entry.itemName,
          detail: `Deshizo el consumo de ${amount} ${amount === 1 ? 'unidad' : 'unidades'}`,
          quantityDelta: amount,
        });
        return;
      }

      if (!client) return;
      const { error: rpcError } = await client.rpc('restore_consumed_inventory_event', {
        p_event_id: activityId,
      });
      if (rpcError) {
        if (rpcError.message.includes('already_restored')) {
          throw new Error('Este consumo ya se había recuperado.');
        }
        throw rpcError;
      }
      await load();
    },
    [activity, addLocalActivity, client, demoMode, load],
  );

  const openItem = useCallback(
    async (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item || item.openedOn || !item.consumeWithinDaysAfterOpening) return;
      const today = format(new Date(), 'yyyy-MM-dd');

      if (demoMode) {
        if ((item.unit === 'unit' || item.unit === 'pack') && item.quantity > 1) {
          const openedItem: InventoryItem = {
            ...item,
            id: crypto.randomUUID(),
            sourceBatchId: item.sourceBatchId ?? item.id,
            quantity: 1,
            initialQuantity: 1,
            openedOn: today,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setItems((current) => [
            openedItem,
            ...current.map((candidate) =>
              candidate.id === id
                ? { ...candidate, quantity: candidate.quantity - 1, updatedAt: new Date().toISOString() }
                : candidate,
            ),
          ]);
        } else {
          setItems((current) =>
            current.map((candidate) =>
              candidate.id === id
                ? { ...candidate, openedOn: today, updatedAt: new Date().toISOString() }
                : candidate,
            ),
          );
        }
        addLocalActivity({
          itemId: id,
          action: 'opened',
          itemName: item.name,
          detail: item.quantity > 1 ? 'Abrió una unidad' : 'Marcó el producto como abierto',
        });
        return;
      }

      if (!client) return;
      const { error: rpcError } = await client.rpc('open_inventory_item', { p_batch_id: id });
      if (rpcError) throw rpcError;
      await load();
    },
    [addLocalActivity, client, demoMode, items, load],
  );

  const discard = useCallback(
    async (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return;
      if (demoMode) {
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === id
              ? { ...candidate, status: 'discarded', updatedAt: new Date().toISOString() }
              : candidate,
          ),
        );
        addLocalActivity({
          itemId: id,
          action: 'discarded',
          itemName: item.name,
          detail: 'Marcó el producto como tirado',
        });
        return;
      }
      if (!client) return;
      const { error: rpcError } = await client.rpc('discard_inventory_item', { p_batch_id: id });
      if (rpcError) throw rpcError;
      await load();
    },
    [addLocalActivity, client, demoMode, items, load],
  );

  const saveItem = useCallback(
    async (item: InventoryItem) => {
      if (demoMode) {
        setItems((current) => {
          const exists = current.some((candidate) => candidate.id === item.id);
          return exists
            ? current.map((candidate) =>
                candidate.id === item.id
                  ? { ...item, updatedAt: new Date().toISOString() }
                  : candidate,
              )
            : [{ ...item, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...current];
        });
        addLocalActivity({
          itemId: item.id,
          action: items.some((candidate) => candidate.id === item.id) ? 'updated' : 'created',
          itemName: item.name,
          detail: items.some((candidate) => candidate.id === item.id)
            ? 'Actualizó los datos del producto'
            : 'Añadió el producto manualmente',
        });
        return;
      }
      if (!client || !householdId || !userId) return;
      const row = {
        household_id: householdId,
        source_batch_id: item.sourceBatchId,
        name: item.name,
        quantity: item.quantity,
        initial_quantity: item.initialQuantity,
        unit: item.unit,
        purchased_on: item.purchasedOn,
        expires_on: item.expiresOn,
        expiry_kind: item.expiryKind,
        expiry_precision: item.expiryPrecision,
        storage_location: item.storageLocation,
        opened_on: item.openedOn,
        consume_within_days_after_opening: item.consumeWithinDaysAfterOpening,
        notes: item.notes,
        status: item.status,
        created_by: userId,
      };
      const existing = items.some((candidate) => candidate.id === item.id);
      const result = existing
        ? await client.from('inventory_batches').update(row).eq('id', item.id)
        : await client.from('inventory_batches').insert({ ...row, id: item.id });
      if (result.error) throw result.error;
      const { error: eventError } = await client.from('inventory_events').insert({
        household_id: householdId,
        batch_id: item.id,
        user_id: userId,
        action: existing ? 'updated' : 'created',
        item_name: item.name,
        detail: existing ? 'Actualizó los datos del producto' : 'Añadió el producto manualmente',
      });
      if (eventError) throw eventError;
      await load();
    },
    [addLocalActivity, client, demoMode, householdId, items, load, userId],
  );

  const resetDemo = useCallback(() => {
    if (!demoMode) return;
    const demoItems = createDemoInventory();
    const demoActivity = createDemoActivity();
    setItems(demoItems);
    setActivity(demoActivity);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEMO_INVENTORY_KEY, JSON.stringify(demoItems));
      window.localStorage.setItem(DEMO_ACTIVITY_KEY, JSON.stringify(demoActivity));
    }
  }, [demoMode]);

  const activeItems = useMemo(
    () => items.filter((item) => item.status === 'active' && item.quantity > 0).sort(inventorySort),
    [items],
  );

  return {
    items: activeItems,
    activity,
    loading,
    error,
    demoMode,
    reload: load,
    importPurchase,
    consume,
    undoConsumption,
    openItem,
    discard,
    saveItem,
    resetDemo,
  };
}
