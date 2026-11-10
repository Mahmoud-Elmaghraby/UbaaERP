import type { ComponentType } from 'react';
import {
  Activity,
  Blocks,
  Building2,
  CalendarClock,
  Coins,
  FileText,
  Hash,
  History,
  KeyRound,
  Landmark,
  MonitorSmartphone,
  Package,
  Percent,
  Printer,
  ShieldCheck,
  ShoppingCart,
  Truck,
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
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
const SalesSection = () => <AppSettingsSection section="sales" />;
const DocumentDatesSection = () => <AppSettingsSection section="documents" />;
const PurchasesSection = () => <AppSettingsSection section="purchases" />;
function PosSection() {
  const { t } = useTranslation();
  return (
    <AppSettingsSection
      section="pos"
      footer={
        <p className="px-1 text-sm text-muted-foreground">
          {t('settings.hub.posReceiptDesign')}{' '}
          <Link to="/settings/templates" className="font-medium text-primary hover:underline">
            {t('settings.hub.cards.templates.title')}
          </Link>
        </p>
      }
    />
  );
}
/** Sales and POS settings: the company admin or the sales manager. */
const SALES_SETTINGS = ['settings.manage', 'sales.settings.manage'];
/** Purchases settings: the company admin or the purchasing manager. */
const PURCHASES_SETTINGS = ['settings.manage', 'purchases.settings.manage'];

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
  { id: 'documents', group: 'documents', icon: CalendarClock, component: DocumentDatesSection, permission: 'settings.manage' },
  { id: 'features', group: 'modules', icon: Blocks, component: ModulesTab, permission: 'settings.manage' },
  { id: 'sales', group: 'modules', icon: ShoppingCart, component: SalesSection, permission: SALES_SETTINGS },
  { id: 'pos', group: 'modules', icon: MonitorSmartphone, component: PosSection, permission: SALES_SETTINGS, feature: 'pos' },
  { id: 'purchases', group: 'modules', icon: Truck, component: PurchasesSection, permission: PURCHASES_SETTINGS },
  { id: 'inventory', group: 'modules', icon: Package, to: '/inventory/settings', permission: ['settings.manage', 'inventory.settings.manage'] },
  { id: 'accounting', group: 'modules', icon: FileText, to: '/accounting/settings', permission: 'accounting.manage', feature: 'accounting' },
  { id: 'operations', group: 'system', icon: Activity, component: BackgroundOperationsTab },
  { id: 'audit', group: 'system', icon: History, to: '/audit-logs', permission: 'audit_logs.view' },
];

/** Old ?tab= links (other screens still use them) → the section that replaced the tab. */
export const LEGACY_TABS: Record<string, string> = { modules: 'features' };
