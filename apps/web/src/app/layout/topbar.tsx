import { Fragment } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@erp-platform/ui';
import { ChevronLeft, LogOut, Menu, Palette, Search, UserRound } from 'lucide-react';

import { useAuthStore } from '../../lib/auth-store';
import { getBreadcrumbs } from './nav-items';

interface TopbarProps {
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
  onOpenAppearance: () => void;
  onLogout: () => void;
}

export function Topbar({ onOpenMobileNav, onOpenSearch, onOpenAppearance, onLogout }: TopbarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const crumbs = getBreadcrumbs(pathname);

  const initials = user?.fullName
    ?.split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/75 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMobileNav}
        aria-label={t('nav.openMenu')}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <nav aria-label={t('nav.breadcrumb')} className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.to}>
              {index > 0 ? <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" /> : null}
              {last ? (
                <span className="truncate font-semibold text-foreground" aria-current="page">
                  {t(crumb.labelKey)}
                </span>
              ) : (
                <Link to={crumb.to} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                  {t(crumb.labelKey)}
                </Link>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-10 items-center gap-2 rounded-lg border bg-subtle px-3 text-sm text-muted-foreground transition-colors hover:border-input hover:bg-card md:w-72"
        aria-label={t('shell.search')}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden flex-1 text-start md:inline">{t('shell.search')}</span>
        <kbd dir="ltr" className="hidden rounded border bg-card px-1.5 py-0.5 font-sans text-[11px] md:inline">
          {t('shell.searchShortcut')}
        </kbd>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:pe-2"
            aria-label={t('shell.userMenu')}
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
                {initials || '؟'}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[140px] truncate text-sm font-medium lg:inline">{user?.fullName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
            <span className="truncate text-sm font-semibold">{user?.fullName}</span>
            <span className="truncate text-xs text-muted-foreground" dir="ltr">
              {user?.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate('/profile')}>
            <UserRound />
            {t('profile.title')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenAppearance}>
            <Palette />
            {t('shell.appearance')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onLogout} className="text-danger focus:bg-danger-soft focus:text-danger">
            <LogOut />
            {t('nav.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
