import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger, PageHeader } from '@erp-platform/ui';

import { BranchesTab } from './branches-tab';
import { CurrenciesTab } from './currencies-tab';
import { GeneralTab } from './general-tab';
import { ModulesTab } from './modules-tab';
import { NumberingTab } from './numbering-tab';
import { TemplatesTab } from './templates-tab';
import { TaxesTab } from './taxes-tab';
import { BackgroundOperationsTab } from './background-operations-tab';

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="grid gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.pageDescription')} />

      <Tabs defaultValue="branches">
        <TabsList>
          <TabsTrigger value="general">{t('settings.tabs.general')}</TabsTrigger>
          <TabsTrigger value="branches">{t('settings.tabs.branches')}</TabsTrigger>
          <TabsTrigger value="currencies">{t('settings.tabs.currencies')}</TabsTrigger>
          <TabsTrigger value="numbering">{t('settings.tabs.numbering')}</TabsTrigger>
          <TabsTrigger value="templates">{t('settings.tabs.templates')}</TabsTrigger>
          <TabsTrigger value="taxes">{t('settings.tabs.taxes')}</TabsTrigger>
          <TabsTrigger value="modules">{t('settings.tabs.modules')}</TabsTrigger>
          <TabsTrigger value="operations">{t('settings.tabs.operations')}</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="branches">
          <BranchesTab />
        </TabsContent>
        <TabsContent value="currencies">
          <CurrenciesTab />
        </TabsContent>
        <TabsContent value="numbering">
          <NumberingTab />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="taxes">
          <TaxesTab />
        </TabsContent>
        <TabsContent value="modules">
          <ModulesTab />
        </TabsContent>
        <TabsContent value="operations">
          <BackgroundOperationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
