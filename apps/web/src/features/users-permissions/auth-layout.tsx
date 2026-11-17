import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BookCheck, Boxes, Receipt } from 'lucide-react';
import { BrandMark, BrandWordmark } from '../../components/brand/brand-mark';

interface AuthLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * Shared frame for the pre-login screens (login, 2FA, forgot/reset password): the form
 * on one side and a brand panel on the other. The brand panel uses the same accent
 * tokens as the rest of the app, so it follows the chosen brand color, and is hidden
 * on small screens.
 */
/** Pointy-top honeycomb tile (same geometry as the mark's hexagon). */
const HONEYCOMB =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='38.11' height='66'%3E%3Cpath d='M0.0 -22.0L19.1 -11.0L19.1 11.0L0.0 22.0L-19.1 11.0L-19.1 -11.0ZM38.1 -22.0L57.2 -11.0L57.2 11.0L38.1 22.0L19.1 11.0L19.1 -11.0ZM19.1 11.0L38.1 22.0L38.1 44.0L19.1 55.0L-0.0 44.0L0.0 22.0ZM0.0 44.0L19.1 55.0L19.1 77.0L0.0 88.0L-19.1 77.0L-19.1 55.0ZM38.1 44.0L57.2 55.0L57.2 77.0L38.1 88.0L19.1 77.0L19.1 55.0Z' fill='none' stroke='white' stroke-width='1'/%3E%3C/svg%3E")`;

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  const highlights = [
    { icon: Receipt, label: t('auth.brand.highlights.documents') },
    { icon: Boxes, label: t('auth.brand.highlights.inventory') },
    { icon: BookCheck, label: t('auth.brand.highlights.accounting') },
  ];

  return (
    <div className="flex min-h-screen bg-card">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-8">
          <div className="flex items-center gap-2.5">
            {/* Latin lockup reads mark → name left-to-right, so the name comes first in this RTL row. */}
            <BrandWordmark title={t('app.name')} className="h-8 w-auto text-foreground" />
            <BrandMark className="h-14 w-14 dark:hidden" />
            <BrandMark tile className="hidden h-14 w-14 dark:flex" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-bold leading-tight">{title}</h1>
            {description ? <p className="text-muted-foreground">{description}</p> : null}
          </div>
          <div>{children}</div>
        </div>
      </div>

      <aside className="relative hidden flex-1 flex-col justify-between gap-10 overflow-hidden bg-sidebar p-14 text-white lg:flex">
        {/* Honeycomb texture echoing the hexagon mark, plus the mark itself as a large watermark. */}
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: HONEYCOMB }} />
        <BrandMark className="pointer-events-none absolute -bottom-32 -left-32 h-[460px] w-[460px] opacity-[0.06] grayscale" />

        <div className="relative flex items-center gap-4">
          {/* Latin lockup reads mark → name left-to-right, so the name comes first in this RTL row. */}
          <BrandWordmark className="h-11 w-auto text-white" />
          <BrandMark tile className="h-20 w-20" />
        </div>

        <div className="relative flex max-w-lg flex-col gap-4">
          <span className="text-sm font-semibold text-highlight">{t('auth.brand.tagline')}</span>
          <h2 className="text-4xl font-bold leading-snug">{t('auth.brand.headline')}</h2>
          <p className="text-base text-white/75">{t('auth.brand.body')}</p>
        </div>

        <ul className="relative grid max-w-xl grid-cols-3 gap-3">
          {highlights.map(({ icon: Icon, label }) => (
            <li key={label} className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
              <Icon className="h-5 w-5 text-highlight" />
              <span className="text-sm font-medium leading-snug">{label}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
