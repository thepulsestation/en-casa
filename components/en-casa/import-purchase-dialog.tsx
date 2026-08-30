'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardPaste, PackageCheck, Trash2 } from 'lucide-react';
import { ZodError } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  examplePurchaseJson,
  expiryKindLabels,
  formatLongDate,
  formatQuantity,
  normalizeImportPayload,
  purchaseImportSchema,
  storageLabels,
  type PurchaseImport,
} from '@/lib/inventory';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: string[];
  onImport: (purchase: PurchaseImport) => Promise<void>;
};

function readableError(error: unknown): string {
  if (error instanceof SyntaxError) return 'El texto no es un JSON válido. Revisa comas, llaves y comillas.';
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const where = first.path.length ? ` (${first.path.join(' → ')})` : '';
    return `${first.message}${where}`;
  }
  return error instanceof Error ? error.message : 'No se ha podido revisar el JSON.';
}

export function ImportPurchaseDialog({ open, onOpenChange, existingNames, onImport }: Props) {
  const [rawJson, setRawJson] = useState('');
  const [purchase, setPurchase] = useState<PurchaseImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const duplicateNames = useMemo(() => {
    if (!purchase) return new Set<string>();
    const existing = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase('es')));
    return new Set(
      purchase.items
        .filter((item) => existing.has(item.name.trim().toLocaleLowerCase('es')))
        .map((item) => item.name),
    );
  }, [existingNames, purchase]);

  const analyze = () => {
    setError(null);
    try {
      const parsedJson = JSON.parse(rawJson);
      setPurchase(purchaseImportSchema.parse(normalizeImportPayload(parsedJson)));
    } catch (caught) {
      setPurchase(null);
      setError(readableError(caught));
    }
  };

  const removeItem = (index: number) => {
    if (!purchase) return;
    const items = purchase.items.filter((_, itemIndex) => itemIndex !== index);
    setPurchase(items.length ? { ...purchase, items } : null);
  };

  const confirm = async () => {
    if (!purchase) return;
    setBusy(true);
    setError(null);
    try {
      await onImport(purchase);
      setRawJson('');
      setPurchase(null);
      onOpenChange(false);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const close = (nextOpen: boolean) => {
    if (!nextOpen && !busy) {
      setError(null);
      setPurchase(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-[24px] p-5 sm:p-6">
        <DialogHeader className="pr-8">
          <div className="mb-1 grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ClipboardPaste className="size-5" />
          </div>
          <DialogTitle className="text-xl font-extrabold tracking-[-0.03em]">Importar la compra</DialogTitle>
          <DialogDescription className="leading-5">
            Pega el JSON que te ha preparado ChatGPT. Nada se guardará hasta que revises la vista previa.
          </DialogDescription>
        </DialogHeader>

        {!purchase ? (
          <div className="space-y-3">
            <Textarea
              aria-label="JSON de la compra"
              className="min-h-64 resize-y rounded-2xl bg-muted/35 p-4 font-mono text-xs leading-5"
              value={rawJson}
              onChange={(event) => setRawJson(event.target.value)}
              placeholder="Pega aquí el JSON de ChatGPT…"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                className="text-xs text-muted-foreground"
                onClick={() => {
                  setRawJson(examplePurchaseJson);
                  setError(null);
                }}
              >
                Cargar un ejemplo
              </Button>
              <Button className="h-10 rounded-xl px-4 font-bold" disabled={!rawJson.trim()} onClick={analyze}>
                Revisar productos
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/[0.055] p-3.5">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-extrabold">El formato es correcto</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Revisa cantidades, ubicaciones y fechas antes de añadir {purchase.items.length}{' '}
                  {purchase.items.length === 1 ? 'producto' : 'productos'}.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {purchase.items.map((item, index) => (
                <article key={`${item.name}-${index}`} className="rounded-2xl border border-border bg-card p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-lg">🛒</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold">{item.name}</h3>
                        {duplicateNames.has(item.name) && (
                          <Badge variant="outline" className="border-[#c79542]/35 bg-[#fff8e8] text-[#8a5f18]">
                            Ya existe otro lote
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatQuantity({ quantity: item.quantity, unit: item.unit })} ·{' '}
                        {storageLabels[item.storage_location]}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="font-medium">
                          {item.expires_on ? `Fecha: ${formatLongDate(item.expires_on, item.expiry_precision)}` : 'Sin fecha'}
                        </Badge>
                        <Badge variant="secondary" className="font-medium">
                          {expiryKindLabels[item.expiry_kind]}
                        </Badge>
                        {item.consume_within_days_after_opening && (
                          <Badge variant="secondary" className="font-medium">
                            {item.consume_within_days_after_opening} días al abrir
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      aria-label={`Quitar ${item.name} de la importación`}
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeItem(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-destructive/8 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {purchase && (
          <DialogFooter className="mt-1 -mx-5 -mb-5 px-5 sm:-mx-6 sm:-mb-6 sm:px-6">
            <Button variant="outline" className="h-10 rounded-xl" disabled={busy} onClick={() => setPurchase(null)}>
              Volver al JSON
            </Button>
            <Button className="h-10 rounded-xl px-4 font-bold" disabled={busy} onClick={() => void confirm()}>
              <PackageCheck className="size-4" />
              {busy ? 'Guardando…' : `Añadir ${purchase.items.length} productos`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
