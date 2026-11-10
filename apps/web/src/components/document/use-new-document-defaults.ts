import { useEffect, useRef } from 'react';
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form';
import type { CustomerDto } from '@erp-platform/contracts';

import { useAppSetting } from '../../lib/app-settings';

/**
 * Fills a NEW document from the settings hub, once, when the settings (and, for sales, the
 * customers) have loaded: the default notes / terms when the notes are still empty, and on sales
 * documents the walk-in customer ('sales.prefillWalkInCustomer') when no customer was chosen. An
 * existing document is never touched. Shared by sales and purchases editors.
 */
export function useNewDocumentDefaults<T extends FieldValues & { notes?: string | null }>(
  form: UseFormReturn<T>,
  {
    isNew,
    notesSetting,
    customers,
    prefillCustomer = true,
  }: {
    isNew: boolean;
    notesSetting: 'sales.defaultInvoiceNotes' | 'sales.defaultQuotationTerms' | 'purchases.defaultOrderNotes';
    /** Sales only: the customers list, for the walk-in customer. */
    customers?: CustomerDto[];
    prefillCustomer?: boolean;
  },
) {
  const { get, loaded } = useAppSetting();
  const done = useRef(false);
  useEffect(() => {
    if (!isNew || done.current || !loaded || (prefillCustomer && !customers)) return;
    done.current = true;
    const notes = get(notesSetting);
    if (notes && !form.getValues('notes' as Path<T>)) form.setValue('notes' as Path<T>, notes as PathValue<T, Path<T>>);
    if (prefillCustomer && get('sales.prefillWalkInCustomer') && !form.getValues('customerId' as Path<T>)) {
      const walkIn = customers?.find((c) => c.isSystemDefault && c.isActive !== false);
      if (walkIn) form.setValue('customerId' as Path<T>, walkIn.id as PathValue<T, Path<T>>, { shouldValidate: true });
    }
  }, [isNew, loaded, customers, get, form, notesSetting, prefillCustomer]);
}
