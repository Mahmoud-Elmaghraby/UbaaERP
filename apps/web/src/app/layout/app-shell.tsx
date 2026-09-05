import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Can, Avatar, AvatarFallback, Button, Skeleton, cn } from '@erp-platform/ui';
import { LogOut, Menu, X } from 'lucide-react';

import { useAuthStore } from '../../lib/auth-store';
import { NAV_ITEMS, type NavItem } from './nav-items';

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  const initials = user?.fullName
    ?.split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const closeMobileNav = () => setMobileNavOpen(false);

  function renderNavItem(item: NavItem) {
    // Matches react-router's own default (non-`end`) NavLink active logic: active on an
    // exact match or on any descendant path. Computed here (not just left to NavLink's
    // isActive render-prop) because it also decides whether to show the sub-section list.
    const isGroupActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

    const node = (
      <div key={item.to} className="flex flex-col gap-1">
        <NavLink
          to={item.to}
          onClick={closeMobileNav}
          className={({ isActive }) =>
            cn(
              'relative flex items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-mutedForeground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accentForeground',
              isActive &&
                "text-sidebar-accentForeground bg-sidebar-accent before:absolute before:inset-y-1 before:end-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']",
            )
          }
        >
          {t(item.labelKey)}
        </NavLink>
        {item.children && isGroupActive ? (
          <div className="ms-3 flex flex-col gap-1 border-e-2 border-sidebar-border pe-2">
            {item.children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={closeMobileNav}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm text-sidebar-mutedForeground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accentForeground',
                    isActive && 'bg-sidebar-accent font-medium text-sidebar-accentForeground',
                  )
                }
              >
                {t(child.labelKey)}
              </NavLink>
            ))}
          </div>
        ) : null}
      </div>
    );

    return item.permission ? (
      <Can key={item.to} permission={item.permission}>
        {node}
      </Can>
    ) : (
      node
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMobileNav}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-in-out',
          'md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2.5 border-b border-sidebar-border px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              أ
            </span>
            <span className="truncate text-lg font-bold tracking-tight">{t('app.name')}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-sidebar-mutedForeground hover:bg-sidebar-accent hover:text-sidebar-accentForeground md:hidden"
            onClick={closeMobileNav}
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => renderNavItem(item))}
        </nav>
        <div className="flex items-center gap-3 border-t border-sidebar-border p-3">
          <Link
            to="/profile"
            onClick={closeMobileNav}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:opacity-80"
            title={t('profile.title')}
          >
            <Avatar>
              <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground">
                {initials ?? '؟'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.fullName}</p>
              <p className="truncate text-xs text-sidebar-mutedForeground">{user?.email}</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-sidebar-mutedForeground hover:bg-sidebar-accent hover:text-sidebar-accentForeground"
            onClick={() => clearSession()}
            title={t('nav.logout')}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(true)}
            aria-label={t('nav.openMenu')}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="truncate text-base font-bold tracking-tight">{t('app.name')}</span>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
