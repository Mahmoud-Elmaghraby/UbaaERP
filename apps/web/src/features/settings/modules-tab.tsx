import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureToggleDto } from '@erp-platform/contracts';
import { Badge, Can, Skeleton, Switch, toast, useHasPermission } from '@erp-platform/ui';

import { useFeatureToggles, useUpdateFeatureToggle } from './queries';
import { ModuleSettingsLinks } from './module-settings-links';
import { ApiError, refreshSession } from '../../lib/api-client';
import { SectionCard } from '../../components/document/document-layout';

/** How the switches are grouped on screen. A key missing here still shows, under "other". */
const GROUPS: { key: string; features: string[] }[] = [
  {
    key: 'activity',
    features: ['pos', 'sales.channels', 'sales.installments', 'sales.reps', 'cheques', 'inventory.landed_costs', 'fixed_assets', 'budgets'],
  },
  {
    key: 'chain',
    features: [
      'sales.quotations',
      'sales.sales_orders',
      'sales.deliveries',
      'purchases.rfq',
      'purchases.supplier_quotations',
      'purchases.purchase_orders',
      'purchases.goods_receipts',
    ],
  },
  { key: 'core', features: ['accounting', 'multi_currency'] },
];

/**
 * الموديولات والخصائص — the tenant's own switches (Layer 2, claude/platform-flexibility-strategy.md)
 * under the plan's ceiling (Layer 1, read-only here). Grouped: what depends on the kind of
 * business (POS, marketplaces, installments…), the optional steps of the document chains, and the
 * big modules. Off hides the screens and blocks new records; history stays readable. The session
 * is refreshed right after a change so the menu follows at once.
 */
export function ModulesTab() {
  const { t } = useTranslation();
  const canManage = useHasPermission('settings.manage');
  const { data: toggles, isLoading } = useFeatureToggles(canManage);
  const updateToggle = useUpdateFeatureToggle();

  const grouped = useMemo(() => {
    const byKey = new Map((toggles ?? []).map((toggle) => [toggle.featureKey, toggle]));
    const listed = new Set(GROUPS.flatMap((group) => group.features));
    const groups = GROUPS.map((group) => ({
      key: group.key,
      items: group.features.map((key) => byKey.get(key)).filter((toggle): toggle is FeatureToggleDto => Boolean(toggle)),
    }));
    const other = (toggles ?? []).filter((toggle) => !listed.has(toggle.featureKey));
    return other.length ? [...groups, { key: 'other', items: other }] : groups;
  }, [toggles]);

  async function handleToggle(toggle: FeatureToggleDto, enabled: boolean) {
    try {
      await updateToggle.mutateAsync({ featureKey: toggle.featureKey, input: { enabled } });
      await refreshSession();
      toast.success(enabled ? t('settings.modules.turnedOn') : t('settings.modules.turnedOff'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.modules.updateError'));
    }
  }

  return (
    <Can permission="settings.manage" fallback={<p className="text-sm text-muted-foreground">{t('settings.modules.noAccess')}</p>}>
      <div className="grid gap-5">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          grouped.map((group) =>
            group.items.length === 0 ? null : (
              <SectionCard key={group.key} title={t(`settings.modules.groups.${group.key}`)} description={t(`settings.modules.groupHints.${group.key}`)} flush>
                <ul className="divide-y">
                  {group.items.map((toggle) => (
                    <li key={toggle.featureKey} className="flex items-start gap-4 px-5 py-4">
                      <div className="grid flex-1 gap-1">
                        <span className="flex items-center gap-2 font-medium">
                          {t(`settings.modules.features.${toggle.featureKey}`)}
                          {!toggle.grantedByPlan ? <Badge variant="neutral">{t('settings.modules.notGrantedByPlan')}</Badge> : null}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t(`settings.modules.descriptions.${toggle.featureKey.replace(/\./g, '__')}`, { defaultValue: '' })}
                        </span>
                      </div>
                      <Switch
                        checked={toggle.enabled}
                        disabled={!toggle.grantedByPlan || updateToggle.isPending}
                        title={toggle.grantedByPlan ? undefined : t('settings.modules.notGrantedHint')}
                        aria-label={t(`settings.modules.features.${toggle.featureKey}`)}
                        onCheckedChange={(checked) => void handleToggle(toggle, checked)}
                      />
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ),
          )
        )}
        <ModuleSettingsLinks />
      </div>
    </Can>
  );
}
