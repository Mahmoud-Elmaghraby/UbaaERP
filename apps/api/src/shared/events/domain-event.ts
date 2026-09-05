/**
 * Shared shape for the integration events every module publishes through
 * the Event Bus (master doc §5 / CLAUDE.md §2.6 [مستقر]). Cross-module
 * communication must go through this, never a direct import into another
 * business module's service.
 *
 * `schema` (the tenant schema name) travels in the payload rather than
 * being inferred some other way, because EventEmitter2 has no built-in
 * per-tenant request context — any listener needs it to resolve the right
 * Kysely connection via TenantConnectionManager.
 *
 * Not wired to the Outbox pattern (§2.7) yet: that's reserved for
 * financially-sensitive events future Accounting must never miss
 * (sale.invoice_confirmed, purchase.invoice_posted, and equivalents).
 * Today's Inventory events have no real listener depending on not losing
 * them (the audit-log listener is best-effort, not a business-correctness
 * requirement) — revisit this the moment a financially-sensitive
 * consumer actually needs one.
 */
export interface DomainEventPayload {
  schema: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string | null;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}
