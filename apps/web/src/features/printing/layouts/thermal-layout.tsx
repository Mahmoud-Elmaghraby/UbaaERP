import type { PrintDocumentDto, PrintTemplateConfigDto } from '@erp-platform/contracts';

import { amount, formatDate, formatQuantity } from './format';

/** 80 mm roll: POS receipts, cash receipts and vouchers — compact, one column, monochrome. */
export function ThermalLayout({ document: doc, template }: { document: PrintDocumentDto; template: PrintTemplateConfigDto }) {
  const totals = doc.totals;
  const company = doc.company;
  return (
    <article className="print-thermal mx-auto bg-white text-[11px] leading-snug text-black">
      <header className="text-center">
        {template.showLogo && company.logoUrl ? (
          <img src={company.logoUrl} alt="" className="mx-auto mb-1 max-h-14 object-contain grayscale" />
        ) : null}
        <p className="text-sm font-bold">{company.name ?? ''}</p>
        {company.address ? <p>{company.address}</p> : null}
        {company.phone ? <p dir="ltr">{company.phone}</p> : null}
        {company.taxRegistrationNumber ? (
          <p>
            ر.ض: <bdi dir="ltr">{company.taxRegistrationNumber}</bdi>
          </p>
        ) : null}
      </header>
      <Rule />
      <p className="text-center text-[13px] font-bold">{template.title || doc.title}</p>
      {doc.statusLabel ? <p className="text-center font-bold">*** {doc.statusLabel} ***</p> : null}
      <Row label="رقم" value={doc.number} />
      <Row label="التاريخ" value={formatDate(doc.date)} />
      {doc.party ? <Row label={doc.party.roleLabel} value={doc.party.name} /> : null}
      {doc.fields.map((field) => (
        <Row key={field.label} label={field.label} value={field.value} />
      ))}
      <Rule />
      {doc.lines.map((line, index) => (
        <div key={index} className="py-0.5">
          <p className="font-medium">{line.description}</p>
          <div className="flex justify-between">
            <span dir="ltr">
              {line.quantity !== null && line.quantity !== undefined
                ? `${formatQuantity(line.quantity)} × ${amount(line.unitPrice)}`
                : ''}
            </span>
            <span dir="ltr" className="font-semibold">
              {amount(line.amount)}
            </span>
          </div>
        </div>
      ))}
      <Rule />
      {totals ? (
        <>
          {totals.vatAmount ? <Row label="ضريبة القيمة المضافة" value={amount(totals.vatAmount)} /> : null}
          {totals.discountAmount ? <Row label="الخصم" value={amount(totals.discountAmount)} /> : null}
          <div className="flex justify-between py-1 text-[14px] font-bold">
            <span>الإجمالي</span>
            <span dir="ltr">
              {amount(totals.totalAmount)} {doc.currency}
            </span>
          </div>
          {totals.paidAmount ? <Row label="المدفوع" value={amount(totals.paidAmount)} /> : null}
          {template.showAmountInWords && totals.amountInWords ? (
            <p className="mt-1 text-center text-[10px]">{totals.amountInWords}</p>
          ) : null}
        </>
      ) : null}
      {template.footerText ? (
        <>
          <Rule />
          <p className="text-center">{template.footerText}</p>
        </>
      ) : null}
    </article>
  );
}

function Rule() {
  return <div className="my-1.5 border-t border-dashed border-black" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="font-medium" dir="auto">
        {value}
      </span>
    </div>
  );
}
