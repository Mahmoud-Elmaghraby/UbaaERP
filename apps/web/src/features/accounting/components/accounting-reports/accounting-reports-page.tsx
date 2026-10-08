import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger, PageHeader } from '@erp-platform/ui';

import { GeneralLedgerReport } from './general-ledger-report';
import { TrialBalanceReport } from './trial-balance-report';
import { IncomeStatementReport } from './income-statement-report';
import { BalanceSheetReport } from './balance-sheet-report';
import { CashFlowReport } from './cash-flow-report';
import { VatReturnReport } from './vat-return-report';

/**
 * All four reports (دفتر الأستاذ / ميزان المراجعة / قائمة الدخل / الميزانية العمومية)
 * grouped under one routed page with an in-page Tabs switcher, same nested-Tabs shape
 * as Inventory's own StockTab (levels/movements/lots) — rather than four separate
 * top-level nav entries, since they're all pure read-only report viewers a user picks
 * between, not independently manageable entities with their own create/edit lifecycle.
 */
export function AccountingReportsPage() {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState('general-ledger');

  return (
    <div className="grid gap-6">
      <PageHeader title={t('accounting.tabs.reports')} />

      <Tabs value={activeView} onValueChange={setActiveView}>
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="general-ledger">{t('accounting.reports.generalLedger')}</TabsTrigger>
            <TabsTrigger value="trial-balance">{t('accounting.reports.trialBalance')}</TabsTrigger>
            <TabsTrigger value="income-statement">{t('accounting.reports.incomeStatement')}</TabsTrigger>
            <TabsTrigger value="balance-sheet">{t('accounting.reports.balanceSheet')}</TabsTrigger>
            <TabsTrigger value="cash-flow">{t('accounting.reports.cashFlow')}</TabsTrigger>
            <TabsTrigger value="vat-return">{t('accounting.reports.vatReturn')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="general-ledger">
          <GeneralLedgerReport />
        </TabsContent>
        <TabsContent value="trial-balance">
          <TrialBalanceReport />
        </TabsContent>
        <TabsContent value="income-statement">
          <IncomeStatementReport />
        </TabsContent>
        <TabsContent value="balance-sheet">
          <BalanceSheetReport />
        </TabsContent>
        <TabsContent value="cash-flow">
          <CashFlowReport />
        </TabsContent>
        <TabsContent value="vat-return">
          <VatReturnReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
