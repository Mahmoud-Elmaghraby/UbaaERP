import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Can, cn, useFeatureChecker } from '@erp-platform/ui';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

import { NAV_GROUPS, isPathActive, type NavItem } from './nav-items';

interface SidebarProps {
  /** Icon-only rail (desktop). Never true inside the mobile drawer. */
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
}

export function Sidebar({ collapsed, onNavigate, onToggleCollapsed }: SidebarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const hasFeature = useFeatureChecker();

  function renderItem(item: NavItem) {
    if (item.feature && !hasFeature(item.feature)) return null;
    const active = isPathActive(pathname, item.to);
    const Icon = item.icon;
    const hasChildren = Boolean(item.children?.length);
    const label = t(item.labelKey);

    const node = (
      <div key={item.to} className="flex flex-col gap-0.5">
        <NavLink
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          aria-current={active && !hasChildren ? 'page' : undefined}
          className={cn(
            'group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-mutedForeground outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring',
            collapsed && 'justify-center px-0',
            active && !hasChildren && 'bg-sidebar-accent font-semibold text-sidebar-accentForeground',
            active && hasChildren && 'font-semibold text-sidebar-accentForeground',
            active && hasChildren && collapsed && 'bg-sidebar-accent',
          )}
        >
          {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} aria-hidden="true" /> : null}
          {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
        </NavLink>

        {hasChildren && active && !collapsed ? (
          <div className="ms-[21px] flex flex-col gap-0.5 border-s border-sidebar-border ps-2.5 pb-1 pt-0.5">
            {item
              .children!.filter((child) => !child.feature || hasFeature(child.feature))
              .map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex h-8 items-center rounded-md px-2.5 text-[13px] text-sidebar-mutedForeground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                      isActive && 'bg-sidebar-accent font-semibold text-sidebar-accentForeground',
                    )
                  }
                >
                  <span className="truncate">{t(child.labelKey)}</span>
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
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'mb-2 flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5',
          collapsed && 'justify-center px-0',
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-base font-bold text-primary-foreground">
          أ
        </span>
        {!collapsed ? <span className="truncate text-lg font-bold">{t('app.name')}</span> : null}
      </div>

      <nav
        className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3"
        aria-label={t('app.name')}
      >
        {NAV_GROUPS.map((group) => {
          const permissions = group.items
            .map((item) => item.permission)
            .filter((p): p is string => Boolean(p));
          const heading = group.labelKey ? (
            collapsed ? (
              <div className="mx-auto my-2 h-px w-6 bg-sidebar-border" aria-hidden="true" />
            ) : (
              <p className="px-3 pb-1 pt-4 text-[11px] font-semibold text-sidebar-mutedForeground/80">
                {t(group.labelKey)}
              </p>
            )
          ) : null;

          return (
            <div key={group.key} className="flex flex-col gap-0.5">
              {heading && permissions.length === group.items.length ? (
                // Only show a section heading when the user can see at least one item in it.
                <Can permission={permissions}>{heading}</Can>
              ) : (
                heading
              )}
              {group.items.map(renderItem)}
            </div>
          );
        })}
      </nav>

      {onToggleCollapsed ? (
        <div className="hidden shrink-0 border-t border-sidebar-border p-3 md:block">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-sidebar-mutedForeground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            title={collapsed ? t('nav.expand') : undefined}
          >
            {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
            {!collapsed ? <span>{t('nav.collapse')}</span> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
