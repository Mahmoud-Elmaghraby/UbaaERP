import type { ComponentType } from 'react';
import {
  Activity,
  Blocks,
  Building2,
  Coins,
  FileText,
  Hash,
  History,
  KeyRound,
  Landmark,
  Package,
  Percent,
  Printer,
  ShieldCheck,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { BranchesTab } from '../branches-tab';
import { CurrenciesTab } from '../currencies-tab';
import { GeneralTab } from '../general-tab';
import { ModulesTab } from '../modules-tab';
import { NumberingTab } from '../numbering-tab';
import { TemplatesTab } from '../templates-tab';
import { TaxesTab } from '../taxes-tab';
import { BackgroundOperationsTab } from '../background-operations-tab';
import { SalesSettingsSection } from '../sales-settings-section';
import { AppSettingsSection } from './app-settings-section';

export type SettingsGroup = 'organization' | 'documents' | 'modules' | 'system';
export const SETTINGS_GROUPS: SettingsGroup[] = ['organization', 'documents', 'modules', 'system'];

export interface SettingsSection {
  id: string;
  group: SettingsGroup;
  icon: LucideIcon;
  /** Rendered inside the hub… */
  component?: ComponentType;
  /** …or a page of its own (a module's settings page, users, roles…). */
  to?: string;
  /** Any of these permissions shows the section (none = everyone with access to settings). */
  permission?: string | string[];
  feature?: string;
}

const SecuritySection = () => <AppSettingsSection section="security" />;

/**
 * Every section of the settings hub, in reading order. Titles, descriptions and search keywords
 * come from i18n (settings.hub.cards.<id>.title / .hint / .keywords), so the search matches the
 * words people actually use ("ضريبة", "لوجو", "باركود"…).
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general', group: 'organization', icon: Building2, component: GeneralTab },
  { id: 'branches', group: 'organization', icon: Landmark, component: BranchesTab },
  { id: 'currencies', group: 'organization', icon: Coins, component: CurrenciesTab },
  { id: 'users', group: 'organization', icon: Users, to: '/users', permission: 'users.manage' },
  { id: 'roles', group: 'organization', icon: KeyRound, to: '/roles', permission: ['roles.manage', 'users.manage'] },
  { id: 'security', group: 'organization', icon: ShieldCheck, component: SecuritySection, permission: 'settings.manage' },
  { id: 'numbering', group: 'documents', icon: Hash, component: NumberingTab },
  { id: 'taxes', group: 'documents', icon: Percent, component: TaxesTab },
  { id: 'templates', group: 'documents', icon: Printer, component: TemplatesTab },
  { id: 'features', group: 'modules', icon: Blocks, component: ModulesTab, permission: 'settings.manage' },
  { id: 'sales', group: 'modules', icon: ShoppingCart, component: SalesSettingsSection },
  { id: 'inventory', group: 'modules', icon: Package, to: '/inventory/settings', permission: ['settings.manage', 'inventory.settings.manage'] },
  { id: 'accounting', group: 'modules', icon: FileText, to: '/accounting/settings', permission: 'accounting.manage', feature: 'accounting' },
  { id: 'operations', group: 'system', icon: Activity, component: BackgroundOperationsTab },
  { id: 'audit', group: 'system', icon: History, to: '/audit-logs', permission: 'audit_logs.view' },
];

/** Old ?tab= links (other screens still use them) → the section that replaced the tab. */
export const LEGACY_TABS: Record<string, string> = { modules: 'features' };
