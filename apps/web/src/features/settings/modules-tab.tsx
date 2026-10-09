import { useTranslation } from 'react-i18next';
import type { FeatureToggleDto } from '@erp-platform/contracts';
import {
  Badge,
  Can,
  Checkbox,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
  useHasPermission,
} from '@erp-platform/ui';

import { useFeatureToggles, useUpdateFeatureToggle } from './queries';
import { ApiError } from '../../lib/api-client';
import { ModuleSettingsLinks } from './module-settings-links';

/**
 * "الموديولات" tab — Layer 2 of the platform-flexibility design
 * (claude/platform-flexibility-strategy.md). Every row is a feature key
 * from the fixed catalog (apps/api shared/plans/feature-catalog.ts).
 *
 * Two independent pieces of state per row, both surfaced by the backend
 * FeatureTogglesService:
 * - grantedByPlan (Layer 1, the commercial ceiling from the tenant's
 *   Plan) — read-only here; this screen can never grant a feature the
 *   plan doesn't already include.
 * - enabled (Layer 2, the tenant's own on/off switch) — writable only
 *   when grantedByPlan is true. Disabling a module blocks *new* creation
 *   (non-GET) only; existing records stay visible, per the design
 *   decision already recorded in the strategy doc.
 *
 * The backend endpoint (GET/PATCH /feature-toggles) requires
 * settings.manage on every method, including GET — so unlike the other
 * tabs on this page, the whole tab (not just its write controls) is
 * gated by <Can>, and the query itself is disabled for users without
 * that permission to avoid a pointless 403 round-trip.
 */
export function ModulesTab() {
  const { t } = useTranslation();
  const canManage = useHasPermission('settings.manage');
  const { data: toggles, isLoading } = useFeatureToggles(canManage);
  const updateToggle = useUpdateFeatureToggle();

  async function handleToggle(toggle: FeatureToggleDto, enabled: boolean) {
    try {
      await updateToggle.mutateAsync({ featureKey: toggle.featureKey, input: { enabled } });
      toast.success(t('settings.modules.updateSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.modules.updateError'));
    }
  }

  return (
    <Can permission="settings.manage" fallback={<p className="text-sm text-muted-foreground">{t('settings.modules.noAccess')}</p>}>
      <div className="grid gap-6">
        <p className="text-sm text-muted-foreground">{t('settings.modules.description')}</p>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.modules.feature')}</TableHead>
                <TableHead>{t('settings.modules.planStatus')}</TableHead>
                <TableHead>{t('settings.modules.enabled')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(toggles ?? []).map((toggle) => (
                <TableRow key={toggle.featureKey}>
                  <TableCell className="font-medium">
                    {t(`settings.modules.features.${toggle.featureKey}`)}
                  </TableCell>
                  <TableCell>
                    {toggle.grantedByPlan ? (
                      <Badge>{t('settings.modules.grantedByPlan')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('settings.modules.notGrantedByPlan')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={toggle.enabled}
                      disabled={!toggle.grantedByPlan || updateToggle.isPending}
                      title={toggle.grantedByPlan ? undefined : t('settings.modules.notGrantedHint')}
                      onCheckedChange={(checked) => handleToggle(toggle, checked === true)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {(toggles ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}

        <ModuleSettingsLinks />
      </div>
    </Can>
  );
}
