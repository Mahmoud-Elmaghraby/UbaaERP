// Entry point for @erp-platform/shared-kernel (CLAUDE.md §2.5 [مستقر]).
//
// Genuinely cross-module shared domain primitives only — don't promote
// module-local concepts here by default.
export * from './money/money';
export * from './tax/tax-calculator';
export * from './text/amount-in-words-ar';
