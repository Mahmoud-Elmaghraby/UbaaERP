import type { Kysely, Transaction } from 'kysely';

/**
 * Runs `callback` against `db` inside a transaction, EXCEPT when `db` is
 * already an active transaction — in that case `callback` runs directly
 * against it instead of opening a nested one.
 *
 * Why this exists: Kysely 0.29.5 does not support transparent nested
 * transactions. Calling `.transaction()` on an already-active
 * `Transaction<DB>` throws synchronously ("calling the transaction method
 * for a Transaction is not supported") — confirmed by reading
 * node_modules/kysely/dist/kysely.js directly, not assumed. Every existing
 * service method that wraps its own body in `db.transaction().execute(...)`
 * (SalesOrdersService.create, DeliveriesService.create/confirm,
 * SalesInvoicesService.create/post, PaymentsReceivedService.create/post,
 * ...) would therefore blow up the moment it's called with an outer `trx`
 * instead of a plain `db` — which is exactly what an orchestrator like
 * PosSalesService.checkout() needs to do to make the whole checkout
 * atomic (see claude/sales-pos-research.md, POS Stage 3).
 *
 * Swapping `db.transaction().execute(cb)` for `withTransaction(db, cb)` in
 * those methods is behavior-preserving for every existing caller (they all
 * pass a plain `Kysely<TenantDatabase>`, so `db.isTransaction` is false and
 * this takes the exact same `db.transaction().execute(cb)` path as before).
 * It only changes behavior for a NEW kind of caller — one that deliberately
 * passes its own already-open `trx` down — which is the whole point.
 */
export function withTransaction<DB, T>(
  db: Kysely<DB>,
  callback: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> {
  if (db.isTransaction) {
    return callback(db as Transaction<DB>);
  }
  return db.transaction().execute(callback);
}
