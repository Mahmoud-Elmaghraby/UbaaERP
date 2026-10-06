import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@erp-platform/ui';
import { Check, ChevronRight } from 'lucide-react';

/*
 * Shared building blocks for every business-document screen (invoices, orders,
 * receipts…) — claude/ui-redesign-plan.md, Phase 3. A document screen is a full
 * routed page (not a dialog) made of:
 *   <DocumentHeaderBar>  sticky bar: back, title, status, primary actions
 *   <DocumentChain>      where this document sits in its business flow
 *   <DocumentBody main= side=>  two columns: content | summary
 *   <SectionCard>, <InfoGrid>, <TotalsPanel> inside those columns.
 */

interface DocumentHeaderBarProps {
  backTo: string;
  backLabel: string;
  /** Small line above the title, usually the list's name. */
  eyebrow?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}

export function DocumentHeaderBar({
  backTo,
  backLabel,
  eyebrow,
  title,
  status,
  actions,
}: DocumentHeaderBarProps) {
  return (
    <div className="sticky top-16 z-20 -mx-4 -mt-6 mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 md:-mx-8 md:px-8">
      <Link
        to={backTo}
        aria-label={backLabel}
        title={backLabel}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-input text-secondary-foreground transition-colors hover:bg-muted"
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        {eyebrow ? <span className="truncate text-xs text-muted-foreground">{eyebrow}</span> : null}
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-xl font-bold">{title}</h1>
          {status}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type ChainStepState = 'done' | 'current' | 'upcoming';

export interface ChainStep {
  key: string;
  label: ReactNode;
  /** e.g. the related document's number */
  detail?: ReactNode;
  state: ChainStepState;
  to?: string;
}

export function DocumentChain({ steps, label }: { steps: ChainStep[]; label: string }) {
  return (
    <ol aria-label={label} className="mb-5 flex flex-wrap items-center gap-2 text-[13px]">
      {steps.map((step, index) => {
        const content = (
          <>
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                step.state === 'done' && 'bg-success text-white',
                step.state === 'current' && 'bg-primary text-primary-foreground',
                step.state === 'upcoming' && 'bg-muted text-muted-foreground',
              )}
            >
              {step.state === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
            </span>
            <span className="font-medium">{step.label}</span>
            {step.detail ? <span className="tabular text-muted-foreground">{step.detail}</span> : null}
          </>
        );
        const pillClass = cn(
          'flex h-8 items-center gap-2 rounded-full border px-3 transition-colors',
          step.state === 'current'
            ? 'border-primary/40 bg-accent text-accent-foreground'
            : 'border-border bg-card text-foreground',
          step.state === 'upcoming' && 'text-muted-foreground',
          step.to && 'hover:border-primary/40',
        );
        return (
          <li
            key={step.key}
            className="flex items-center gap-2"
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            {step.to ? (
              <Link to={step.to} className={pillClass}>
                {content}
              </Link>
            ) : (
              <span className={pillClass}>{content}</span>
            )}
            {index < steps.length - 1 ? <span aria-hidden="true" className="h-px w-5 bg-border" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function DocumentBody({ main, side }: { main: ReactNode; side?: ReactNode }) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">{main}</div>
      {side ? <aside className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-36">{side}</aside> : null}
    </div>
  );
}

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Drop the body padding (for edge-to-edge tables). */
  flush?: boolean;
  className?: string;
}

export function SectionCard({ title, description, actions, children, flush, className }: SectionCardProps) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-xl border bg-card shadow-card', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4">
          <div className="flex flex-col">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(!flush && 'px-5 pb-5', !flush && !(title || actions) && 'pt-5')}>{children}</div>
    </section>
  );
}

export interface InfoItem {
  label: ReactNode;
  value: ReactNode;
  /** Span the full row (notes, addresses). */
  wide?: boolean;
}

export function InfoGrid({ items }: { items: InfoItem[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={index}
          className={cn('flex min-w-0 flex-col gap-0.5', item.wide && 'sm:col-span-2 lg:col-span-3')}
        >
          <dt className="text-[13px] text-muted-foreground">{item.label}</dt>
          <dd className="break-words font-medium">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface TotalsRow {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'muted' | 'danger';
}

interface TotalsPanelProps {
  title: ReactNode;
  rows: TotalsRow[];
  totalLabel: ReactNode;
  totalValue: ReactNode;
  currency?: string;
  footer?: ReactNode;
}

export function TotalsPanel({ title, rows, totalLabel, totalValue, currency, footer }: TotalsPanelProps) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <dl className="flex flex-col gap-2.5 text-sm">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <dt className="text-secondary-foreground">{row.label}</dt>
            <dd
              className={cn(
                'tabular font-medium',
                row.tone === 'muted' && 'text-muted-foreground',
                row.tone === 'danger' && 'text-danger',
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="my-4 h-px bg-border" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{totalLabel}</span>
        <span className="tabular inline-flex items-baseline gap-1.5 text-2xl font-bold text-brand-700 dark:text-primary">
          <span dir="ltr">{totalValue}</span>
          {currency ? <span className="text-sm font-medium text-muted-foreground">{currency}</span> : null}
        </span>
      </div>
      {footer ? <div className="mt-4 flex flex-col gap-2">{footer}</div> : null}
    </section>
  );
}

/** Card frame for panels that render their own heading (e.g. AttachmentsPanel). */
export function PanelCard({ children }: { children: ReactNode }) {
  return <div className="min-w-0 rounded-xl border bg-card p-5 shadow-card">{children}</div>;
}
