import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@erp-platform/ui';

/** Opens a document on the central print page; with `receipt` it also offers the 80 mm roll. */
export function openPrint(documentType: string, id: string, options: { paper?: 'a4' | 'thermal80'; autoprint?: boolean } = {}) {
  const query = new URLSearchParams();
  if (options.paper) query.set('paper', options.paper);
  if (options.autoprint) query.set('autoprint', '1');
  const search = query.toString();
  window.open(`/print/${documentType}/${id}${search ? `?${search}` : ''}`, '_blank', 'noopener');
}

export function PrintButton({
  documentType,
  id,
  receipt = false,
  variant = 'outline',
}: {
  documentType: string;
  id: string;
  /** The document also prints on an 80 mm roll (invoice / receipt). */
  receipt?: boolean;
  variant?: 'outline' | 'ghost' | 'secondary';
}) {
  const { t } = useTranslation();
  if (!receipt) {
    return (
      <Button type="button" variant={variant} onClick={() => openPrint(documentType, id)}>
        <Printer />
        {t('printing.print')}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant}>
          <Printer />
          {t('printing.print')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => openPrint(documentType, id, { paper: 'a4' })}>
          {t('printing.paper.a4')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openPrint(documentType, id, { paper: 'thermal80' })}>
          {t('printing.paper.thermal80')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
