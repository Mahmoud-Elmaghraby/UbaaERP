import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Can, Avatar, AvatarFallback, Button, cn } from '@erp-platform/ui';
import { LogOut } from 'lucide-react';

import { useAuthStore } from '../../lib/auth-store';
import { NAV_ITEMS } from './nav-items';

export function AppShell() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  const initials = user?.fullName
    ?.split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brandGold text-sm font-bold text-brandGold-foreground">
            أ
          </span>
          <span className="text-lg font-bold tracking-tight">{t('app.name')}</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-mutedForeground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accentForeground',
                    isActive &&
                      "text-sidebar-accentForeground bg-sidebar-accent before:absolute before:inset-y-1 before:end-0 before:w-0.5 before:rounded-full before:bg-brandGold before:content-['']",
                  )
                }
              >
                {t(item.labelKey)}
              </NavLink>
            );

            return item.permission ? (
              <Can key={item.to} permission={item.permission}>
                {link}
              </Can>
            ) : (
              link
            );
          })}
        </nav>
        <div className="flex items-center gap-3 border-t border-sidebar-border p-3">
          <Link
            to="/profile"
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
            className="text-sidebar-mutedForeground hover:bg-sidebar-accent hover:text-sidebar-accentForeground"
            onClick={() => clearSession()}
            title={t('nav.logout')}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
