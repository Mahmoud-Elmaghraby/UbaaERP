import type { PrintDocumentDto, PrintTemplateConfigDto } from '@erp-platform/contracts';

import { amount, formatDate, formatQuantity, shortTaxes } from './format';

/**
 * A4 layout shared by every printed document: company header, document
 * title/number/dates, party block, extra fields, lines, totals with tax
 * breakdown and amount in words, terms, signatures, footer.
 */
export function A4Layout({ document: doc, template }: { document: PrintDocumentDto; template: PrintTemplateConfigDto }) {
  const accent = template.accentColor;
  const hasUnitPrice = doc.lines.some((line) => line.unitPrice);
  const hasPrices = hasUnitPrice || doc.lines.some((line) => line.amount);
  const hasQuantity = doc.lines.some((line) => line.quantity !== null && line.quantity !== undefined);
  const hasTaxes = template.showTaxDetails && doc.lines.some((line) => (line.taxes ?? []).length > 0);
  const showSku = template.showSku && doc.lines.some((line) => line.sku);
  const showUnit = template.showUnit && doc.lines.some((line) => line.unit);
  const totals = doc.totals;
  const company = doc.company;

  return (
    <article className="print-a4 relative mx-auto bg-white text-[12px] leading-relaxed text-neutral-900">
      {doc.statusLabel ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 text-[96px] font-black text-neutral-200/70">{doc.statusLabel}</span>
        </div>
      ) : null}

      <header className="flex items-start justify-between gap-6 border-b-2 pb-4" style={{ borderColor: accent }}>
        <div className="flex items-start gap-4">
          {template.showLogo && company.logoUrl ? (
            <img src={company.logoUrl} alt="" className="max-h-20 max-w-40 object-contain" />
          ) : null}
          <div className="grid gap-0.5">
            <h1 className="text-lg font-bold" style={{ color: accent }}>
              {company.name ?? ''}
            </h1>
            {company.address ? <p>{company.address}</p> : null}
            <p className="text-neutral-600">
              {company.taxRegistrationNumber ? (
                <span>
                  رقم التسجيل الضريبي: <bdi dir="ltr">{company.taxRegistrationNumber}</bdi>
                </span>
              ) : null}
              {company.taxRegistrationNumber && company.commercialRegister ? ' · ' : null}
              {company.commercialRegister ? (
                <span>
                  سجل تجاري: <bdi dir="ltr">{company.commercialRegister}</bdi>
                </span>
              ) : null}
            </p>
            <p className="text-neutral-600" dir="auto">
              {[company.phone, company.email, company.website].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="grid min-w-48 gap-1 text-left">
          <h2 className="text-right text-xl font-bold" style={{ color: accent }}>
            {template.title || doc.title}
          </h2>
          <InfoRow label="رقم" value={doc.number} ltr />
          <InfoRow label="التاريخ" value={formatDate(doc.date)} ltr />
          {doc.dueDate ? <InfoRow label="الاستحقاق" value={formatDate(doc.dueDate)} ltr /> : null}
        </div>
      </header>

      {template.headerNote ? <p className="mt-3 whitespace-pre-line text-neutral-700">{template.headerNote}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-4">
        {doc.party ? (
          <div className="rounded border border-neutral-300 p-3">
            <p className="mb-1 text-[11px] font-semibold text-neutral-500">{doc.party.roleLabel}</p>
            <p className="font-bold">{doc.party.name}</p>
            {doc.party.code ? <p className="text-neutral-600">كود: {doc.party.code}</p> : null}
            {doc.party.taxNumber ? (
              <p className="text-neutral-600">
                رقم التسجيل الضريبي: <bdi dir="ltr">{doc.party.taxNumber}</bdi>
              </p>
            ) : null}
            {doc.party.address ? <p className="text-neutral-600">{doc.party.address}</p> : null}
            {doc.party.phone ? <p className="text-neutral-600" dir="ltr">{doc.party.phone}</p> : null}
          </div>
        ) : (
          <div />
        )}
        {doc.fields.length > 0 ? (
          <div className="grid content-start gap-1 rounded border border-neutral-300 p-3">
            {doc.fields.map((field) => (
              <InfoRow key={field.label} label={field.label} value={field.value} />
            ))}
          </div>
        ) : null}
      </section>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="text-white" style={{ backgroundColor: accent }}>
            <Th className="w-8">#</Th>
            <Th>البيان</Th>
            {showSku ? <Th className="w-24">الكود</Th> : null}
            {hasQuantity ? <Th className="w-16 text-center">الكمية</Th> : null}
            {showUnit ? <Th className="w-20">الوحدة</Th> : null}
            {hasUnitPrice ? <Th className="w-24 text-left">السعر</Th> : null}
            {hasTaxes ? <Th className="w-20 text-center">الضريبة</Th> : null}
            {hasPrices ? <Th className="w-28 text-left">القيمة</Th> : null}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line, index) => (
            <tr key={index} className="border-b border-neutral-200 align-top">
              <Td className="text-neutral-500">{index + 1}</Td>
              <Td>
                <span className="font-medium">{line.description}</span>
                {line.details ? <span className="block text-[11px] text-neutral-500">{line.details}</span> : null}
              </Td>
              {showSku ? (
                <Td className="text-[11px]" ltr>
                  {line.sku ?? ''}
                </Td>
              ) : null}
              {hasQuantity ? <Td className="text-center">{formatQuantity(line.quantity)}</Td> : null}
              {showUnit ? <Td>{line.unit ?? ''}</Td> : null}
              {hasUnitPrice ? (
                <Td className="text-left" ltr>
                  {amount(line.unitPrice)}
                </Td>
              ) : null}
              {hasTaxes ? (
                <Td className="text-center text-[11px]" ltr>
                  {shortTaxes(line)}
                </Td>
              ) : null}
              {hasPrices ? (
                <Td className="text-left font-semibold" ltr>
                  {amount(line.amount)}
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {totals ? (
        <section className="mt-4 flex items-start justify-between gap-6">
          <div className="flex-1">
            {template.showAmountInWords && totals.amountInWords ? (
              <p className="rounded bg-neutral-100 p-2 font-medium">{totals.amountInWords}</p>
            ) : null}
          </div>
          <table className="w-72 border-collapse">
            <tbody>
              <TotalRow label="الإجمالي قبل الضريبة" value={totals.netAmount} />
              <TotalRow label="الخصم" value={totals.discountAmount} />
              <TotalRow label="ضريبة الجدول" value={totals.tableTaxAmount} />
              <TotalRow label="ضريبة القيمة المضافة" value={totals.vatAmount} />
              <TotalRow label="خصم من المنبع" value={totals.withholdingAmount} negative />
              <tr className="text-white" style={{ backgroundColor: accent }}>
                <td className="px-2 py-1.5 font-bold">الإجمالي ({doc.currency})</td>
                <td className="px-2 py-1.5 text-left text-base font-bold" dir="ltr">
                  {amount(totals.totalAmount)}
                </td>
              </tr>
              <TotalRow label="المدفوع" value={totals.paidAmount} />
              <TotalRow label="المتبقي" value={totals.balanceAmount} />
            </tbody>
          </table>
        </section>
      ) : null}

      {doc.notes ? (
        <section className="mt-4">
          <p className="text-[11px] font-semibold text-neutral-500">ملاحظات</p>
          <p className="whitespace-pre-line">{doc.notes}</p>
        </section>
      ) : null}
      {template.termsText ? (
        <section className="mt-4 border-t border-neutral-200 pt-2">
          <p className="text-[11px] font-semibold text-neutral-500">الشروط والأحكام</p>
          <p className="whitespace-pre-line text-[11px] text-neutral-700">{template.termsText}</p>
        </section>
      ) : null}

      {template.showSignatures ? (
        <section className="mt-10 grid grid-cols-3 gap-8 text-center text-[11px] text-neutral-600">
          {['المُعِد', 'المراجع', 'المستلم'].map((role) => (
            <div key={role} className="border-t border-neutral-400 pt-1">
              {role}
            </div>
          ))}
        </section>
      ) : null}

      {template.footerText ? (
        <footer className="mt-8 border-t border-neutral-200 pt-2 text-center text-[11px] text-neutral-600">
          {template.footerText}
        </footer>
      ) : null}
    </article>
  );
}

function InfoRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-neutral-500">{label}</span>
      <span className="font-semibold" dir={ltr ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const aligned = /text-(left|center)/.test(className) ? '' : 'text-right';
  return <th className={`px-2 py-1.5 ${aligned} text-[11px] font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '', ltr }: { children: React.ReactNode; className?: string; ltr?: boolean }) {
  return (
    <td className={`px-2 py-1.5 ${className}`} dir={ltr ? 'ltr' : undefined}>
      {children}
    </td>
  );
}

function TotalRow({
  label,
  value,
  negative,
}: {
  label: string;
  value: { amountMinorUnits: string } | null | undefined;
  negative?: boolean;
}) {
  if (!value) return null;
  return (
    <tr className="border-b border-neutral-200">
      <td className="px-2 py-1 text-neutral-600">{label}</td>
      <td className="px-2 py-1 text-left font-medium" dir="ltr">
        {negative ? `(${amount(value)})` : amount(value)}
      </td>
    </tr>
  );
}
