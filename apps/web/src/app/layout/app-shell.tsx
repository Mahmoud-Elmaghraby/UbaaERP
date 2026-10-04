import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Skeleton, cn } from '@erp-platform/ui';
import { X } from 'lucide-react';

import { useAuthStore } from '../../lib/auth-store';
import { useLogout } from '../../features/users-permissions/queries';
import { useUiPreferences } from '../theme/ui-preferences-store';
import { AppearanceDialog } from './appearance-dialog';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

function PageFallback() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

/**
 * Application frame (claude/ui-redesign-plan.md, Phase 1): grouped icon sidebar
 * (collapsible to an icon rail on desktop, a drawer on mobile), a sticky top bar with
 * breadcrumbs / Ctrl+K search / user menu, and the routed page in a centered,
 * max-width content column.
 */
export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const clearSession = useAuthStore((state) => state.clearSession);
  const logout = useLogout();
  const collapsed = useUiPreferences((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiPreferences((state) => state.toggleSidebar);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  // Best-effort: revoke the refresh token server-side, but never block
  // the user from actually logging out if the API call itself fails
  // (offline, API down) — local state is cleared either way. No token
  // value to check/pass anymore: the refresh token lives only in an
  // httpOnly cookie now (see auth-store.ts's comment), so this call is
  // unconditional — the backend just no-ops if there's no cookie to revoke.
  async function handleLogout() {
    try {
      await logout.mutateAsync();
    } catch {
      // Swallowed deliberately — see comment above.
    }
    clearSession();
  }

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  // Close the drawer on navigation.
  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  // Ctrl/⌘ + K opens global search from anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:block',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleSidebar} />
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 bg-foreground/40 md:hidden" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] border-s border-sidebar-border bg-sidebar text-sidebar-foreground shadow-overlay transition-transform duration-200 md:hidden',
          mobileNavOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!mobileNavOpen}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute end-3 top-4 z-10"
          onClick={() => setMobileNavOpen(false)}
          aria-label={t('nav.closeMenu')}
        >
          <X className="h-4 w-4" />
        </Button>
        <Sidebar collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenAppearance={() => setAppearanceOpen(true)}
          onLogout={() => void handleLogout()}
        />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-12 pt-6 md:px-8">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <AppearanceDialog open={appearanceOpen} onOpenChange={setAppearanceOpen} />
    </div>
  );
}
