import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer, X } from 'lucide-react';
import type { PaperSizeDto } from '@erp-platform/contracts';
import { Button, Skeleton } from '@erp-platform/ui';
import { useTranslation } from 'react-i18next';

import { usePrintDocument } from './queries';
import { A4Layout } from './layouts/a4-layout';
import { ThermalLayout } from './layouts/thermal-layout';
import { ApiError } from '../../lib/api-client';

const PAGE_CSS: Record<PaperSizeDto, string> = {
  a4: '@page { size: A4; margin: 12mm; } .print-a4 { width: 186mm; }',
  thermal80: '@page { size: 80mm auto; margin: 3mm; } .print-thermal { width: 74mm; }',
};

/**
 * The one print page every document opens (/print/:documentType/:id):
 * the central PrintDocument rendered with the chosen layout, a toolbar that
 * never prints, and @page rules for the paper. "Save as PDF" is the
 * browser's print dialog. ?paper=thermal80 and ?autoprint=1 are supported.
 */
export function PrintPage() {
  const { t } = useTranslation();
  const { documentType, id } = useParams();
  const [params] = useSearchParams();
  // Everything except the page's own switches goes to the API (e.g. a statement's period).
  const forwarded = new URLSearchParams(params);
  forwarded.delete('paper');
  forwarded.delete('autoprint');
  const { data, isLoading, error } = usePrintDocument(documentType, id, forwarded.toString());
  const [paper, setPaper] = useState<PaperSizeDto | null>(null);

  const requested = params.get('paper') as PaperSizeDto | null;
  const activePaper: PaperSizeDto | null = data
    ? (paper ??
      (requested && data.document.paperSizes.includes(requested) ? requested : data.template.paperSize))
    : null;

  useEffect(() => {
    if (data) document.title = `${data.document.title} ${data.document.number}`;
  }, [data]);

  useEffect(() => {
    if (data && params.get('autoprint') === '1') {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [data, params]);

  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white" dir="rtl">
      {activePaper ? <style>{`${PAGE_CSS[activePaper]} @media print { body { background: white; } }`}</style> : null}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2 print:hidden">
        <Button onClick={() => window.print()} disabled={!data}>
          <Printer />
          {t('printing.print')}
        </Button>
        {data && data.document.paperSizes.length > 1
          ? data.document.paperSizes.map((size) => (
              <Button
                key={size}
                variant={size === activePaper ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPaper(size)}
              >
                {t(`printing.paper.${size}`)}
              </Button>
            ))
          : null}
        <span className="text-xs text-muted-foreground">{t('printing.pdfHint')}</span>
        <Button variant="ghost" size="sm" className="ms-auto" onClick={() => window.close()}>
          <X />
          {t('printing.close')}
        </Button>
      </div>

      <div className="py-6 print:py-0">
        {isLoading ? <Skeleton className="mx-auto h-[600px] w-[210mm]" /> : null}
        {error ? (
          <p className="text-center text-destructive">
            {error instanceof ApiError ? error.message : t('printing.loadError')}
          </p>
        ) : null}
        {data && activePaper === 'thermal80' ? (
          <div className="mx-auto w-fit bg-white p-3 shadow print:p-0 print:shadow-none">
            <ThermalLayout document={data.document} template={data.template} />
          </div>
        ) : null}
        {data && activePaper === 'a4' ? (
          <div className="mx-auto w-fit bg-white p-[12mm] shadow print:p-0 print:shadow-none">
            <A4Layout document={data.document} template={data.template} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
