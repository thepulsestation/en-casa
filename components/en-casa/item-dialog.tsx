'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, PackagePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import {
  EXPIRY_KINDS,
  EXPIRY_PRECISIONS,
  STORAGE_LOCATIONS,
  UNITS,
  expiryKindLabels,
  expiryPrecisionLabels,
  monthToExpiryDate,
  storageLabels,
  unitLabels,
  type InventoryItem,
} from '@/lib/inventory';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  onSave: (item: InventoryItem) => Promise<void>;
};

function blankItem(): InventoryItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: '',
    quantity: 1,
    initialQuantity: 1,
    unit: 'unit',
    purchasedOn: now.slice(0, 10),
    expiresOn: null,
    expiryKind: 'unknown',
    expiryPrecision: 'day',
    storageLocation: 'fridge',
    openedOn: null,
    consumeWithinDaysAfterOpening: null,
    notes: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdByName: 'Nicole',
  };
}

export function ItemDialog({ open, onOpenChange, item, onSave }: Props) {
  const [draft, setDraft] = useState<InventoryItem>(item ?? blankItem());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(item ? { ...item } : blankItem());
      setError(null);
    }
  }, [item, open]);

  const save = async () => {
    if (!draft.name.trim()) {
      setError('Escribe el nombre del producto.');
      return;
    }
    if (!(draft.quantity > 0)) {
      setError('La cantidad debe ser mayor que cero.');
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        initialQuantity: Math.max(draft.initialQuantity, draft.quantity),
      });
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se ha podido guardar el producto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-[24px] p-5 sm:p-6">
        <DialogHeader className="pr-8">
          <div className="mb-1 grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            {item ? <CalendarClock className="size-5" /> : <PackagePlus className="size-5" />}
          </div>
          <DialogTitle className="text-xl font-extrabold tracking-[-0.03em]">
            {item ? 'Editar producto' : 'Añadir producto'}
          </DialogTitle>
          <DialogDescription>
            Los cambios serán visibles para todas las personas de la casa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="item-name">Nombre</Label>
            <Input
              id="item-name"
              className="h-10 rounded-xl"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Por ejemplo, leche fresca"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-quantity">Cantidad</Label>
            <Input
              id="item-quantity"
              type="number"
              min="0.01"
              step="any"
              className="h-10 rounded-xl"
              value={draft.quantity}
              onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-unit">Unidad</Label>
            <NativeSelect className="w-full" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value as InventoryItem['unit'] })}>
              {UNITS.map((unit) => (
                <NativeSelectOption key={unit} value={unit}>{unitLabels[unit].plural}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-expiry-precision">Formato de fecha</Label>
            <NativeSelect
              className="w-full"
              value={draft.expiryPrecision}
              onChange={(event) => {
                const expiryPrecision = event.target.value as InventoryItem['expiryPrecision'];
                setDraft({
                  ...draft,
                  expiryPrecision,
                  expiresOn: draft.expiresOn && expiryPrecision === 'month'
                    ? monthToExpiryDate(draft.expiresOn.slice(0, 7))
                    : draft.expiresOn,
                });
              }}
            >
              {EXPIRY_PRECISIONS.map((precision) => (
                <NativeSelectOption key={precision} value={precision}>{expiryPrecisionLabels[precision]}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-expiry">{draft.expiryPrecision === 'month' ? 'Mes y año' : 'Fecha'}</Label>
            <Input
              id="item-expiry"
              type={draft.expiryPrecision === 'month' ? 'month' : 'date'}
              className="h-10 rounded-xl"
              value={draft.expiryPrecision === 'month' ? draft.expiresOn?.slice(0, 7) ?? '' : draft.expiresOn ?? ''}
              onChange={(event) => setDraft({
                ...draft,
                expiresOn: event.target.value
                  ? draft.expiryPrecision === 'month'
                    ? monthToExpiryDate(event.target.value)
                    : event.target.value
                  : null,
              })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-kind">Tipo de fecha</Label>
            <NativeSelect className="w-full" value={draft.expiryKind} onChange={(event) => setDraft({ ...draft, expiryKind: event.target.value as InventoryItem['expiryKind'] })}>
              {EXPIRY_KINDS.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>{expiryKindLabels[kind]}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-storage">Ubicación</Label>
            <NativeSelect className="w-full" value={draft.storageLocation} onChange={(event) => setDraft({ ...draft, storageLocation: event.target.value as InventoryItem['storageLocation'] })}>
              {STORAGE_LOCATIONS.map((location) => (
                <NativeSelectOption key={location} value={location}>{storageLabels[location]}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-after-open">Días después de abrir</Label>
            <Input
              id="item-after-open"
              type="number"
              min="1"
              className="h-10 rounded-xl"
              value={draft.consumeWithinDaysAfterOpening ?? ''}
              onChange={(event) => setDraft({ ...draft, consumeWithinDaysAfterOpening: event.target.value ? Number(event.target.value) : null })}
              placeholder="Opcional"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="item-notes">Notas</Label>
            <Textarea
              id="item-notes"
              className="min-h-20 rounded-xl"
              value={draft.notes ?? ''}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })}
              placeholder="Marca, sabor, dónde está guardado…"
            />
          </div>
        </div>

        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

        <DialogFooter className="-mx-5 -mb-5 px-5 sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button variant="outline" className="h-10 rounded-xl" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="h-10 rounded-xl px-4 font-bold" disabled={busy} onClick={() => void save()}>
            {busy ? 'Guardando…' : 'Guardar producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
