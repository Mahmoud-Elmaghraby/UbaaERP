// Entry point for @erp-platform/contracts (CLAUDE.md §2.9 — [مقترح]):
// Zod schemas imported verbatim by apps/api (validation) and, later,
// apps/web (zodResolver), so both sides validate against the same source
// of truth. Grown module by module as each is implemented.
export * from './settings';
export * from './users-permissions';
