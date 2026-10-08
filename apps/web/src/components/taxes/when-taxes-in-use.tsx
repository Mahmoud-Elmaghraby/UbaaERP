import type { ReactNode } from 'react';

import { useTaxesInUse, type TaxScope } from './use-document-taxes';

/** Renders its children only while the tenant has an active tax rule (for `scope`) — see useTaxesInUse. */
export function WhenTaxesInUse({ scope, children }: { scope?: TaxScope; children: ReactNode }) {
  return useTaxesInUse(scope) ? <>{children}</> : null;
}
