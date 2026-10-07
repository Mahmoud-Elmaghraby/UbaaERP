import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/** Inventory documents with their own page — references to them become links. */
export const INVENTORY_DOCUMENT_ROUTES: Record<string, string> = {
  stock_transfer: '/inventory/transfers',
  stock_adjustment: '/inventory/adjustments',
  stock_count: '/inventory/counts',
  opening_balance: '/inventory/counts',
};

export interface DocumentReferenceProps {
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber?: string | null;
  partyName?: string | null;
  /** Shown for a movement with no source document (a manual one). */
  movementType?: string;
}

/** Plain-text label of a movement's source, for exports. */
export function useDocumentReferenceLabel() {
  const { t } = useTranslation();
  return (referenceType: string | null, movementType?: string) =>
    referenceType
      ? t(`inventory.stock.references.${referenceType}`, { defaultValue: referenceType })
      : movementType
        ? t(`inventory.itemCard.manual.${movementType}`, { defaultValue: movementType })
        : '—';
}

/**
 * "تحويل مخزني TRF-00012 · customer" — the one way every inventory screen
 * (movements, item card, lot trace) shows where a stock movement came from.
 */
export function DocumentReference({
  referenceType,
  referenceId,
  referenceNumber,
  partyName,
  movementType,
}: DocumentReferenceProps) {
  const label = useDocumentReferenceLabel()(referenceType, movementType);
  const route = referenceType ? INVENTORY_DOCUMENT_ROUTES[referenceType] : undefined;
  const number = referenceNumber ? (
    <span dir="ltr" className="px-1 font-mono text-xs">
      {referenceNumber}
    </span>
  ) : null;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1">
      {route && referenceId ? (
        <Link className="text-primary hover:underline" to={`${route}/${referenceId}`}>
          {label}
          {number}
        </Link>
      ) : (
        <>
          <span>{label}</span>
          {number ? <span className="text-muted-foreground">{number}</span> : null}
        </>
      )}
      {partyName ? <span className="text-xs text-muted-foreground">· {partyName}</span> : null}
    </span>
  );
}
