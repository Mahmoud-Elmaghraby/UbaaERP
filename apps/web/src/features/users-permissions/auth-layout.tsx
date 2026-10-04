import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BookCheck, Boxes, Receipt } from 'lucide-react';

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
            <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-primary text-lg font-bold text-primary-foreground">
              أ
            </span>
            <span className="text-xl font-bold">{t('app.name')}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-bold leading-tight">{title}</h1>
            {description ? <p className="text-muted-foreground">{description}</p> : null}
          </div>
          <div>{children}</div>
        </div>
      </div>

      <aside className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-brand-900 p-14 text-white lg:flex">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative flex max-w-lg flex-col gap-4">
          <span className="text-sm font-semibold text-white/70">{t('auth.brand.tagline')}</span>
          <h2 className="text-4xl font-bold leading-snug">{t('auth.brand.headline')}</h2>
          <p className="text-base text-white/75">{t('auth.brand.body')}</p>
        </div>
        <ul className="relative grid max-w-xl grid-cols-3 gap-3">
          {highlights.map(({ icon: Icon, label }) => (
            <li key={label} className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
              <Icon className="h-5 w-5 text-white/80" />
              <span className="text-sm font-medium leading-snug">{label}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
