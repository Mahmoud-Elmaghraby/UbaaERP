export interface NavItem {
  to: string;
  labelKey: string;
  /** Permission key required to see this item — omit for permission-free items. */
  permission?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/settings', labelKey: 'nav.settings', permission: 'settings.manage' },
  { to: '/users', labelKey: 'nav.users', permission: 'users.manage' },
  { to: '/roles', labelKey: 'nav.roles', permission: 'roles.manage' },
  { to: '/audit-logs', labelKey: 'nav.auditLogs', permission: 'audit_logs.view' },
];
