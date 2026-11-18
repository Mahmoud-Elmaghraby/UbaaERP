import { ForbiddenException, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import type { JwtAccessPayload } from '../auth/jwt-payload.type';
import { formatArMessage } from '../errors/error-messages.ar';
import { TenantConnectionManager } from '../tenancy/tenant-connection-manager';
import { mainBranchId } from './branch-resolver';

/**
 * Branch access (migration 0130, branches-plan-2026-11-18), enforced in one place for every route.
 * A user limited to branches (JwtAccessPayload.branchIds non-empty) may:
 *  - name only their branches' warehouses / treasuries / branches in a request (body or query);
 *  - open, print or act on only their branches' documents (by id);
 *  - see only their branches' rows in a document / place list (filtered after the handler);
 *  - not open company-wide balance reports (trial balance, balance sheet, ledger, cash flow, VAT);
 *  - see the income statement / sales analysis of their branch only.
 * Shared master data (customers, items, suppliers, price lists) and full customer/supplier
 * balances stay visible (user decision 2026-11-18). An unrestricted user is never touched.
 */

type Scope = 'branch' | 'warehouse' | 'transfer';
interface DocTable {
  table: keyof TenantDatabase;
  scope: Scope;
}

/** First path segment (or `print` document type) → the table whose branch decides access. */
const DOCUMENTS: Record<string, DocTable> = {
  quotations: { table: 'quotations', scope: 'branch' },
  'sales-orders': { table: 'sales_orders', scope: 'branch' },
  'sales-invoices': { table: 'sales_invoices', scope: 'branch' },
  'sales-returns': { table: 'sales_returns', scope: 'branch' },
  'sales-credit-notes': { table: 'sales_credit_notes', scope: 'branch' },
  'payments-received': { table: 'payments_received', scope: 'branch' },
  'customer-refunds': { table: 'customer_refunds', scope: 'branch' },
  'pos-sessions': { table: 'pos_sessions', scope: 'branch' },
  'purchase-orders': { table: 'purchase_orders', scope: 'branch' },
  'purchase-invoices': { table: 'purchase_invoices', scope: 'branch' },
  'purchase-returns': { table: 'purchase_returns', scope: 'branch' },
  'purchase-debit-notes': { table: 'purchase_debit_notes', scope: 'branch' },
  'purchase-requisitions': { table: 'purchase_requisitions', scope: 'branch' },
  'supplier-payments': { table: 'supplier_payments', scope: 'branch' },
  'treasury-vouchers': { table: 'treasury_vouchers', scope: 'branch' },
  'journal-entries': { table: 'journal_entries', scope: 'branch' },
  treasuries: { table: 'treasuries', scope: 'branch' },
  warehouses: { table: 'warehouses', scope: 'branch' },
  deliveries: { table: 'deliveries', scope: 'warehouse' },
  'goods-receipts': { table: 'goods_receipts', scope: 'warehouse' },
  'stock-adjustments': { table: 'stock_adjustments', scope: 'warehouse' },
  'stock-counts': { table: 'stock_counts', scope: 'warehouse' },
  'stock-transfers': { table: 'stock_transfers', scope: 'transfer' },
};

const PRINT_TYPES: Record<string, string> = {
  quotation: 'quotations',
  sales_order: 'sales-orders',
  sales_invoice: 'sales-invoices',
  sales_return: 'sales-returns',
  sales_credit_note: 'sales-credit-notes',
  payment_received: 'payments-received',
  delivery: 'deliveries',
  purchase_order: 'purchase-orders',
  purchase_invoice: 'purchase-invoices',
  purchase_return: 'purchase-returns',
  goods_receipt: 'goods-receipts',
  supplier_payment: 'supplier-payments',
  treasury_voucher: 'treasury-vouchers',
};

/** Whole-company balance reports a branch-limited user can't open. */
const COMPANY_WIDE = new Set([
  'accounting-reports/trial-balance',
  'accounting-reports/balance-sheet',
  'accounting-reports/general-ledger',
  'accounting-reports/cash-flow-statement',
  'accounting-reports/vat-return',
]);
/** Reports that take a `branchId` and must be given one of the user's branches. */
const BRANCH_REPORTS = new Set(['accounting-reports/income-statement', 'sales-reports/analysis', 'purchase-reports/analysis']);

/** Request fields naming a place the user must own. Destinations (toWarehouseId…) may be anywhere. */
const PLACE_KEYS: Record<string, 'warehouses' | 'treasuries' | 'branches' | 'pos_sessions'> = {
  warehouseId: 'warehouses',
  fromWarehouseId: 'warehouses',
  treasuryId: 'treasuries',
  branchId: 'branches',
  posSessionId: 'pos_sessions',
};

/** Side lists whose rows point at a document by another field: route → (field, table). */
const SIDE_LISTS: Record<string, { field: string; table: 'sales_invoices' | 'purchase_invoices' }> = {
  'sales-installments': { field: 'salesInvoiceId', table: 'sales_invoices' },
  'supplier-payments/outstanding-invoices': { field: 'purchaseInvoiceId', table: 'purchase_invoices' },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function allowedBranchIds(user: Pick<JwtAccessPayload, 'branchIds'> | undefined): string[] | null {
  return user?.branchIds && user.branchIds.length > 0 ? user.branchIds : null;
}

/** 403 with the same {code, message} body every domain error has (UnexpectedExceptionFilter passes it through). */
function denied(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    code: 'BRANCH.ACCESS_DENIED',
    message: formatArMessage('BRANCH.ACCESS_DENIED'),
  });
}

@Injectable()
export class BranchAccessInterceptor implements NestInterceptor {
  constructor(private readonly connections: TenantConnectionManager) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<{
      user?: JwtAccessPayload;
      method: string;
      path: string;
      body?: unknown;
      query?: Record<string, unknown>;
    }>();
    const allowed = allowedBranchIds(request.user);
    if (!allowed) return next.handle();
    return from(this.guarded(request, allowed, next));
  }

  private async guarded(
    request: { user?: JwtAccessPayload; method: string; path: string; body?: unknown; query?: Record<string, unknown> },
    allowed: string[],
    next: CallHandler,
  ): Promise<unknown> {
    const db = this.connections.getClient(request.user!.schema);
    const segments = request.path.split('/').filter(Boolean);
    const route = segments.slice(0, 2).join('/');

    if (COMPANY_WIDE.has(route)) throw denied();
    if (BRANCH_REPORTS.has(route)) {
      const query = request.query ?? {};
      // No branch picked → all of the user's branches together; branchIds is set by the API only.
      if (!query.branchId) query.branchIds = allowed.join(',');
      else delete query.branchIds;
    }

    await this.checkPlaces(db, allowed, request.body);
    await this.checkPlaces(db, allowed, request.query);

    // A document by id: /<doc>/<id>[/<action>], /print/<type>/<id>, /pos/sessions/<id>/…, /pos-drawer/<id>/….
    let docKey: string | undefined = segments[0];
    let docId = segments[1];
    if (segments[0] === 'print') {
      docKey = PRINT_TYPES[segments[1] ?? ''];
      docId = segments[2];
    } else if (segments[0] === 'pos' && segments[1] === 'sessions') {
      docKey = 'pos-sessions';
      docId = segments[2];
    } else if (segments[0] === 'pos-drawer') {
      docKey = 'pos-sessions';
    }
    const doc = docKey ? DOCUMENTS[docKey] : undefined;
    if (doc && docId && UUID.test(docId)) {
      const action = segments[0] === 'stock-transfers' ? segments[2] : undefined;
      if (!(await this.documentAllowed(db, doc, docId, allowed, action, request.method))) throw denied();
    }

    const result = await lastValueFrom(next.handle(), { defaultValue: undefined });
    if (request.method === 'GET' && Array.isArray(result)) return this.filterList(db, allowed, segments, result);
    // A POS sale looked up by number (for a return) — from another branch's delivery: refused.
    if (request.method === 'GET' && route === 'pos/sales' && result && typeof result === 'object') {
      const deliveryId = (result as { deliveryId?: unknown }).deliveryId;
      if (typeof deliveryId === 'string' && !(await this.documentAllowed(db, DOCUMENTS.deliveries!, deliveryId, allowed, undefined, 'GET'))) {
        throw denied();
      }
    }
    return result;
  }

  private async checkPlaces(db: Kysely<TenantDatabase>, allowed: string[], source: unknown): Promise<void> {
    if (!source || typeof source !== 'object') return;
    for (const [key, table] of Object.entries(PLACE_KEYS)) {
      const value = (source as Record<string, unknown>)[key];
      if (typeof value !== 'string' || !UUID.test(value)) continue;
      const branch = table === 'branches' ? value : await this.branchOf(db, table, value);
      if (branch && !allowed.includes(branch)) throw denied();
    }
  }

  private async branchOf(
    db: Kysely<TenantDatabase>,
    table: 'warehouses' | 'treasuries' | 'pos_sessions',
    id: string,
  ): Promise<string | null> {
    const row = await db.selectFrom(table).select('branch_id').where('id', '=', id).executeTakeFirst();
    return (row?.branch_id as string | null | undefined) ?? null;
  }

  private async documentAllowed(
    db: Kysely<TenantDatabase>,
    doc: DocTable,
    id: string,
    allowed: string[],
    action: string | undefined,
    method: string,
  ): Promise<boolean> {
    if (doc.scope === 'transfer') {
      const row = await db
        .selectFrom('stock_transfers as t')
        .innerJoin('warehouses as f', 'f.id', 't.from_warehouse_id')
        .innerJoin('warehouses as d', 'd.id', 't.to_warehouse_id')
        .select(['f.branch_id as from_branch', 'd.branch_id as to_branch'])
        .where('t.id', '=', id)
        .executeTakeFirst();
      if (!row) return true; // the handler answers 404
      if (action === 'receive') return allowed.includes(row.to_branch);
      if (method === 'GET') return allowed.includes(row.from_branch) || allowed.includes(row.to_branch);
      return allowed.includes(row.from_branch);
    }
    const branch =
      doc.scope === 'warehouse'
        ? (
            await db
              .selectFrom(`${doc.table} as d` as 'deliveries as d')
              .innerJoin('warehouses as w', 'w.id', 'd.warehouse_id')
              .select('w.branch_id')
              .where('d.id', '=', id)
              .executeTakeFirst()
          )?.branch_id
        : (
            (await db
              .selectFrom(doc.table as 'sales_invoices')
              .select('branch_id')
              .where('id', '=', id)
              .executeTakeFirst()) as { branch_id: string | null } | undefined
          )?.branch_id;
    if (branch === undefined) return true; // not found → the handler answers 404
    return allowed.includes(branch ?? (await mainBranchId(db)));
  }

  /** Drops rows of other branches from a list: by the row's own branchId / warehouseId / treasuryId, else its document table. */
  private async filterList(
    db: Kysely<TenantDatabase>,
    allowed: string[],
    segments: string[],
    rows: unknown[],
  ): Promise<unknown[]> {
    if (rows.length === 0 || typeof rows[0] !== 'object' || rows[0] === null) return rows;
    const sample = rows[0] as Record<string, unknown>;
    if (segments.length === 1 && segments[0] === 'branches') {
      return rows.filter((row) => allowed.includes((row as { id: string }).id));
    }
    const side = SIDE_LISTS[segments.slice(0, 2).join('/')] ?? (segments.length === 1 ? SIDE_LISTS[segments[0]!] : undefined);
    if (side) {
      const ids = [...new Set(rows.map((row) => (row as Record<string, unknown>)[side.field]).filter((id): id is string => typeof id === 'string'))];
      if (ids.length === 0) return rows;
      const visible = await db
        .selectFrom(side.table as 'sales_invoices')
        .select('id')
        .where('id', 'in', ids)
        .where('branch_id', 'in', allowed)
        .execute();
      const keep = new Set(visible.map((row) => row.id));
      return rows.filter((row) => keep.has((row as Record<string, unknown>)[side.field] as string));
    }
    if (typeof sample.toWarehouseId === 'string') {
      const places = await db.selectFrom('warehouses').select('id').where('branch_id', 'in', allowed).execute();
      const keep = new Set(places.map((row) => row.id));
      return rows.filter((row) => keep.has((row as { toWarehouseId: string }).toWarehouseId));
    }
    if (typeof sample.branchId === 'string') {
      return rows.filter((row) => allowed.includes((row as { branchId: string }).branchId));
    }
    if (typeof sample.warehouseId === 'string' || typeof sample.treasuryId === 'string') {
      const [warehouses, treasuries] = await Promise.all([
        db.selectFrom('warehouses').select('id').where('branch_id', 'in', allowed).execute(),
        db.selectFrom('treasuries').select('id').where('branch_id', 'in', allowed).execute(),
      ]);
      const places = new Set([...warehouses, ...treasuries].map((row) => row.id));
      return rows.filter((row) => {
        const r = row as { warehouseId?: unknown; treasuryId?: unknown };
        const place = typeof r.warehouseId === 'string' ? r.warehouseId : r.treasuryId;
        return typeof place !== 'string' || places.has(place);
      });
    }
    // The plain list or its register view; other sub-lists (lines, allocations…) aren't documents.
    const doc = segments.length === 1 || segments[1] === 'register' ? DOCUMENTS[segments[0]!] : undefined;
    if (!doc || typeof sample.id !== 'string') return rows;
    const ids = rows.map((row) => (row as { id: string }).id);
    let visible: { id: string }[];
    if (doc.scope === 'branch') {
      visible = await db
        .selectFrom(doc.table as 'sales_invoices')
        .select('id')
        .where('id', 'in', ids)
        .where('branch_id', 'in', allowed)
        .execute();
    } else if (doc.scope === 'transfer') {
      // Outgoing and incoming transfers both show.
      visible = await db
        .selectFrom('stock_transfers as d')
        .innerJoin('warehouses as f', 'f.id', 'd.from_warehouse_id')
        .innerJoin('warehouses as t', 't.id', 'd.to_warehouse_id')
        .select('d.id')
        .where('d.id', 'in', ids)
        .where((eb) => eb.or([eb('f.branch_id', 'in', allowed), eb('t.branch_id', 'in', allowed)]))
        .execute();
    } else {
      visible = await db
        .selectFrom(`${doc.table} as d` as 'deliveries as d')
        .innerJoin('warehouses as w', 'w.id', 'd.warehouse_id')
        .select('d.id')
        .where('d.id', 'in', ids)
        .where('w.branch_id', 'in', allowed)
        .execute();
    }
    const keep = new Set(visible.map((row) => row.id));
    return rows.filter((row) => keep.has((row as { id: string }).id));
  }
}
