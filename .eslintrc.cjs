/**
 * Root ESLint config for the erp-platform monorepo.
 *
 * Dependency-boundary enforcement (CLAUDE.md / master doc §11, 15.1):
 * kept intentionally minimal at foundation stage. Two app/lib-level rules:
 *   1. libs/* must never import from apps/*
 *   2. apps/* must never import another app's source directly
 * Layer boundaries (domain -> application -> infrastructure -> presentation)
 * inside a business module were NOT enforced here previously, because no
 * module existed yet. Inventory is now the first module built end-to-end
 * (apps/web/src/features/inventory), so a first, narrow module-internal rule
 * is added below: entities inside Inventory's components/ folder
 * (products/warehouses/units-of-measure/stock/landed-costs) must not import
 * each other's components directly. Shared logic goes through api/<entity>,
 * hooks/<entity>, or gets promoted to a module- or app-level shared file
 * (e.g. apps/web/src/lib/money.ts) — never a direct cross-entity import.
 * This was originally scoped to Inventory's components/ only; Purchases now
 * has its own entity components too (suppliers, purchase-requisitions, rfqs,
 * purchase-orders, goods-receipts, purchase-returns, purchase-invoices —
 * every entity in the Purchases module), so the same per-entity rule is
 * applied there as well, below.
 * Widen it to future modules (Sales, ...) the same way as each one is built.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  plugins: ['@typescript-eslint', 'boundaries'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  settings: {
    'boundaries/elements': [
      // More specific patterns must be listed before the broader 'app-web'
      // entry below — eslint-plugin-boundaries uses the first matching
      // pattern, so these five have to win over 'app-web' for files under
      // features/inventory/components/<entity>/**.
      { type: 'inventory-products', pattern: 'apps/web/src/features/inventory/components/products/**' },
      { type: 'inventory-warehouses', pattern: 'apps/web/src/features/inventory/components/warehouses/**' },
      { type: 'inventory-units-of-measure', pattern: 'apps/web/src/features/inventory/components/units-of-measure/**' },
      { type: 'inventory-stock', pattern: 'apps/web/src/features/inventory/components/stock/**' },
      { type: 'inventory-landed-costs', pattern: 'apps/web/src/features/inventory/components/landed-costs/**' },
      { type: 'purchases-suppliers', pattern: 'apps/web/src/features/purchases/components/suppliers/**' },
      { type: 'purchases-purchase-requisitions', pattern: 'apps/web/src/features/purchases/components/purchase-requisitions/**' },
      { type: 'purchases-rfqs', pattern: 'apps/web/src/features/purchases/components/rfqs/**' },
      { type: 'purchases-purchase-orders', pattern: 'apps/web/src/features/purchases/components/purchase-orders/**' },
      { type: 'purchases-goods-receipts', pattern: 'apps/web/src/features/purchases/components/goods-receipts/**' },
      { type: 'purchases-purchase-returns', pattern: 'apps/web/src/features/purchases/components/purchase-returns/**' },
      { type: 'sales-customers', pattern: 'apps/web/src/features/sales/components/customers/**' },
      { type: 'sales-quotations', pattern: 'apps/web/src/features/sales/components/quotations/**' },
      { type: 'sales-sales-orders', pattern: 'apps/web/src/features/sales/components/sales-orders/**' },
      { type: 'sales-deliveries', pattern: 'apps/web/src/features/sales/components/deliveries/**' },
      { type: 'sales-sales-invoices', pattern: 'apps/web/src/features/sales/components/sales-invoices/**' },
      { type: 'sales-payments-received', pattern: 'apps/web/src/features/sales/components/payments-received/**' },
      { type: 'sales-sales-returns', pattern: 'apps/web/src/features/sales/components/sales-returns/**' },
      { type: 'sales-sales-credit-notes', pattern: 'apps/web/src/features/sales/components/sales-credit-notes/**' },
      { type: 'purchases-purchase-invoices', pattern: 'apps/web/src/features/purchases/components/purchase-invoices/**' },
      { type: 'accounting-chart-of-accounts', pattern: 'apps/web/src/features/accounting/components/chart-of-accounts/**' },
      { type: 'accounting-fiscal-years', pattern: 'apps/web/src/features/accounting/components/fiscal-years/**' },
      { type: 'accounting-journal-entries', pattern: 'apps/web/src/features/accounting/components/journal-entries/**' },
      { type: 'accounting-accounting-reports', pattern: 'apps/web/src/features/accounting/components/accounting-reports/**' },
      { type: 'accounting-accounting-settings', pattern: 'apps/web/src/features/accounting/components/accounting-settings/**' },
      { type: 'accounting-cost-centers', pattern: 'apps/web/src/features/accounting/components/cost-centers/**' },
      { type: 'accounting-bank-accounts', pattern: 'apps/web/src/features/accounting/components/bank-accounts/**' },
      { type: 'app-api', pattern: 'apps/api/**' },
      { type: 'app-web', pattern: 'apps/web/**' },
      { type: 'app-desktop', pattern: 'apps/desktop/**' },
      { type: 'lib-contracts', pattern: 'libs/contracts/**' },
      { type: 'lib-shared-kernel', pattern: 'libs/shared-kernel/**' },
      { type: 'lib-ui', pattern: 'libs/ui/**' },
    ],
  },
  rules: {
    'boundaries/element-types': [
      2,
      {
        default: 'allow',
        rules: [
          {
            from: ['lib-contracts', 'lib-shared-kernel', 'lib-ui'],
            disallow: [
              'app-api',
              'app-web',
              'app-desktop',
              'inventory-products',
              'inventory-warehouses',
              'inventory-units-of-measure',
              'inventory-stock',
              'inventory-landed-costs',
              'purchases-suppliers',
              'purchases-purchase-requisitions',
              'purchases-rfqs',
              'purchases-purchase-orders',
              'purchases-goods-receipts',
              'purchases-purchase-returns',
              'purchases-purchase-invoices',
              'sales-customers',
              'sales-quotations',
              'sales-sales-orders',
              'sales-deliveries',
              'sales-sales-invoices',
              'sales-payments-received',
              'sales-sales-returns',
              'sales-sales-credit-notes',
              'accounting-chart-of-accounts',
              'accounting-fiscal-years',
              'accounting-journal-entries',
              'accounting-accounting-reports',
              'accounting-accounting-settings',
              'accounting-cost-centers',
              'accounting-bank-accounts',
            ],
            message: 'libs/* must not import from apps/* (CLAUDE.md dependency direction).',
          },
          {
            from: ['app-api'],
            disallow: ['app-web', 'app-desktop'],
            message: 'apps must not import each other directly.',
          },
          {
            from: [
              'app-web',
              'inventory-products',
              'inventory-warehouses',
              'inventory-units-of-measure',
              'inventory-stock',
              'inventory-landed-costs',
              'purchases-suppliers',
              'purchases-purchase-requisitions',
              'purchases-rfqs',
              'purchases-purchase-orders',
              'purchases-goods-receipts',
              'purchases-purchase-returns',
              'purchases-purchase-invoices',
              'sales-customers',
              'sales-quotations',
              'sales-sales-orders',
              'sales-deliveries',
              'sales-sales-invoices',
              'sales-payments-received',
              'sales-sales-returns',
              'sales-sales-credit-notes',
              'accounting-chart-of-accounts',
              'accounting-fiscal-years',
              'accounting-journal-entries',
              'accounting-accounting-reports',
              'accounting-accounting-settings',
              'accounting-cost-centers',
              'accounting-bank-accounts',
            ],
            disallow: ['app-api', 'app-desktop'],
            message: 'apps must not import each other directly.',
          },
          {
            from: ['app-desktop'],
            disallow: ['app-api', 'app-web'],
            message: 'apps must not import each other directly (desktop spawns/bundles them at build/runtime, not via source import).',
          },
          {
            from: ['inventory-products'],
            disallow: ['inventory-warehouses', 'inventory-units-of-measure', 'inventory-stock', 'inventory-landed-costs'],
            message:
              "Inventory: components/products must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['inventory-warehouses'],
            disallow: ['inventory-products', 'inventory-units-of-measure', 'inventory-stock', 'inventory-landed-costs'],
            message:
              "Inventory: components/warehouses must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['inventory-units-of-measure'],
            disallow: ['inventory-products', 'inventory-warehouses', 'inventory-stock', 'inventory-landed-costs'],
            message:
              "Inventory: components/units-of-measure must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['inventory-stock'],
            disallow: ['inventory-products', 'inventory-warehouses', 'inventory-units-of-measure', 'inventory-landed-costs'],
            message:
              "Inventory: components/stock must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['inventory-landed-costs'],
            disallow: ['inventory-products', 'inventory-warehouses', 'inventory-units-of-measure', 'inventory-stock'],
            message:
              "Inventory: components/landed-costs must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['purchases-suppliers'],
            disallow: [
              'purchases-purchase-requisitions',
              'purchases-rfqs',
              'purchases-purchase-orders',
              'purchases-goods-receipts',
              'purchases-purchase-returns',
              'purchases-purchase-invoices',
            ],
            message:
              "Purchases: components/suppliers must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['purchases-purchase-requisitions'],
            disallow: [
              'purchases-suppliers',
              'purchases-rfqs',
              'purchases-purchase-orders',
              'purchases-goods-receipts',
              'purchases-purchase-returns',
              'purchases-purchase-invoices',
            ],
            message:
              "Purchases: components/purchase-requisitions must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['purchases-rfqs'],
            disallow: [
              'purchases-suppliers',
              'purchases-purchase-requisitions',
              'purchases-purchase-orders',
              'purchases-goods-receipts',
              'purchases-purchase-returns',
              'purchases-purchase-invoices',
            ],
            message:
              "Purchases: components/rfqs must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['purchases-purchase-orders'],
            disallow: [
              'purchases-suppliers',
              'purchases-purchase-requisitions',
              'purchases-rfqs',
              'purchases-goods-receipts',
              'purchases-purchase-returns',
              'purchases-purchase-invoices',
            ],
            message:
              "Purchases: components/purchase-orders must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['purchases-goods-receipts'],
            disallow: [
              'purchases-suppliers',
              'purchases-purchase-requisitions',
              'purchases-rfqs',
              'purchases-purchase-orders',
              'purchases-purchase-returns',
              'purchases-purchase-invoices',
            ],
            message:
              "Purchases: components/goods-receipts must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['purchases-purchase-returns'],
            disallow: [
              'purchases-suppliers',
              'purchases-purchase-requisitions',
              'purchases-rfqs',
              'purchases-purchase-orders',
              'purchases-goods-receipts',
              'purchases-purchase-invoices',
            ],
            message:
              "Purchases: components/purchase-returns must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['purchases-purchase-invoices'],
            disallow: [
              'purchases-suppliers',
              'purchases-purchase-requisitions',
              'purchases-rfqs',
              'purchases-purchase-orders',
              'purchases-goods-receipts',
              'purchases-purchase-returns',
            ],
            message:
              "Purchases: components/purchase-invoices must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['sales-customers'],
            disallow: [
              'sales-quotations',
              'sales-sales-orders',
              'sales-deliveries',
              'sales-sales-invoices',
              'sales-payments-received',
              'sales-sales-returns',
              'sales-sales-credit-notes',
            ],
            message:
              "Sales: components/customers must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['sales-quotations'],
            disallow: [
              'sales-customers',
              'sales-sales-orders',
              'sales-deliveries',
              'sales-sales-invoices',
              'sales-payments-received',
              'sales-sales-returns',
              'sales-sales-credit-notes',
            ],
            message:
              "Sales: components/quotations must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['sales-sales-orders'],
            disallow: [
              'sales-customers',
              'sales-quotations',
              'sales-deliveries',
              'sales-sales-invoices',
              'sales-payments-received',
              'sales-sales-returns',
              'sales-sales-credit-notes',
            ],
            message:
              "Sales: components/sales-orders must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['sales-deliveries'],
            disallow: [
              'sales-customers',
              'sales-quotations',
              'sales-sales-orders',
              'sales-sales-invoices',
              'sales-payments-received',
              'sales-sales-returns',
              'sales-sales-credit-notes',
            ],
            message:
              "Sales: components/deliveries must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['sales-sales-invoices'],
            disallow: [
              'sales-customers',
              'sales-quotations',
              'sales-sales-orders',
              'sales-deliveries',
              'sales-payments-received',
              'sales-sales-returns',
              'sales-sales-credit-notes',
            ],
            message:
              "Sales: components/sales-invoices must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['sales-payments-received'],
            disallow: [
              'sales-customers',
              'sales-quotations',
              'sales-sales-orders',
              'sales-deliveries',
              'sales-sales-invoices',
              'sales-sales-returns',
              'sales-sales-credit-notes',
            ],
            message:
              "Sales: components/payments-received must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['sales-sales-returns'],
            disallow: [
              'sales-customers',
              'sales-quotations',
              'sales-sales-orders',
              'sales-deliveries',
              'sales-sales-invoices',
              'sales-payments-received',
              'sales-sales-credit-notes',
            ],
            message:
              "Sales: components/sales-returns must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['sales-sales-credit-notes'],
            disallow: [
              'sales-customers',
              'sales-quotations',
              'sales-sales-orders',
              'sales-deliveries',
              'sales-sales-invoices',
              'sales-payments-received',
              'sales-sales-returns',
            ],
            message:
              "Sales: components/sales-credit-notes must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['accounting-chart-of-accounts'],
            disallow: [
              'accounting-fiscal-years',
              'accounting-journal-entries',
              'accounting-accounting-reports',
              'accounting-accounting-settings',
              'accounting-cost-centers',
              'accounting-bank-accounts',
            ],
            message:
              "Accounting: components/chart-of-accounts must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['accounting-fiscal-years'],
            disallow: [
              'accounting-chart-of-accounts',
              'accounting-journal-entries',
              'accounting-accounting-reports',
              'accounting-accounting-settings',
              'accounting-cost-centers',
              'accounting-bank-accounts',
            ],
            message:
              "Accounting: components/fiscal-years must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['accounting-journal-entries'],
            disallow: [
              'accounting-chart-of-accounts',
              'accounting-fiscal-years',
              'accounting-accounting-reports',
              'accounting-accounting-settings',
              'accounting-cost-centers',
              'accounting-bank-accounts',
            ],
            message:
              "Accounting: components/journal-entries must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['accounting-accounting-reports'],
            disallow: [
              'accounting-chart-of-accounts',
              'accounting-fiscal-years',
              'accounting-journal-entries',
              'accounting-accounting-settings',
              'accounting-cost-centers',
              'accounting-bank-accounts',
            ],
            message:
              "Accounting: components/accounting-reports must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['accounting-accounting-settings'],
            disallow: [
              'accounting-chart-of-accounts',
              'accounting-fiscal-years',
              'accounting-journal-entries',
              'accounting-accounting-reports',
              'accounting-cost-centers',
              'accounting-bank-accounts',
            ],
            message:
              "Accounting: components/accounting-settings must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['accounting-cost-centers'],
            disallow: [
              'accounting-chart-of-accounts',
              'accounting-fiscal-years',
              'accounting-journal-entries',
              'accounting-accounting-reports',
              'accounting-accounting-settings',
              'accounting-bank-accounts',
            ],
            message:
              "Accounting: components/cost-centers must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
          {
            from: ['accounting-bank-accounts'],
            disallow: [
              'accounting-chart-of-accounts',
              'accounting-fiscal-years',
              'accounting-journal-entries',
              'accounting-accounting-reports',
              'accounting-accounting-settings',
              'accounting-cost-centers',
            ],
            message:
              "Accounting: components/bank-accounts must not import another entity's components directly — share logic through api/<entity>, hooks/<entity>, or a shared file (e.g. lib/money.ts).",
          },
        ],
      },
    ],
  },
  ignorePatterns: [
    '**/dist/**',
    '**/node_modules/**',
    '**/.turbo/**',
    '**/release/**',
    '*.config.js',
    '*.config.cjs',
  ],
};
