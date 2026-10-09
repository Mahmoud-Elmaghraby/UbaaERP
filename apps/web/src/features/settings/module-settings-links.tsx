import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, useFeatureChecker, usePermissions } from '@erp-platform/ui';

import { NAV_GROUPS } from '../../app/layout/nav-items';
import { hasAny } from '../../lib/permissions';

/** Settings › Modules: a shortcut to every module's own settings page (same source as the sidebar gears). */
export function ModuleSettingsLinks() {
  const { t } = useTranslation();
  const hasFeature = useFeatureChecker();
  const granted = usePermissions();
  const modules = NAV_GROUPS.flatMap((group) => group.items).filter(
    (item) => item.settings && (!item.feature || hasFeature(item.feature)) && hasAny(granted, item.settings.permission),
  );
  if (modules.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.modules.settingsLinks')}</CardTitle>
        <CardDescription>{t('settings.modules.settingsLinksHint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {modules.map((item) => (
          <Link
            key={item.to}
            to={item.settings!.to}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-subtle"
          >
            <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t('nav.moduleSettings', { module: t(item.labelKey) })}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
