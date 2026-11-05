import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import type {
  SalesInvoiceRegisterRowDto,
  SalesInvoiceStatusDto,
} from "@erp-platform/contracts";
import {
  Badge,
  Button,
  Can,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@erp-platform/ui";
import { FileText, MoreHorizontal, Plus } from "lucide-react";

import { useSalesInvoiceRegister } from "../../api/sales-invoices/queries";
import { useSalesReps } from "../../api/sales-reps/queries";
import { Amount, AMOUNT_CELL } from "../../../../components/amount";
import { StatusTabs } from "../../../../components/list/status-tabs";
import { formatDate } from "../../../../lib/format-date";
import {
  SALES_INVOICE_STATUS_VARIANT,
  SALES_INVOICES_PATH,
  salesInvoiceStatusLabelKey,
} from "./sales-invoice-status";
import { useSalesInvoiceActions } from "./use-sales-invoice-actions";

type StatusTab = "all" | "unpaid" | SalesInvoiceStatusDto;
const STATUS_TABS: readonly StatusTab[] = [
  "all",
  "draft",
  "posted",
  "unpaid",
  "cancelled",
];
const ALL_REPS = "__all__";
const NO_REP = "__none__";

function isUnpaid(row: SalesInvoiceRegisterRowDto): boolean {
  return row.status === "posted" && BigInt(row.outstandingMinorUnits) > 0n;
}

/** فواتير البيع — from the invoice register (customer, outstanding, overdue); a row opens the invoice. */
export function SalesInvoicesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get("status") as StatusTab | null;
  const status: StatusTab =
    rawStatus && STATUS_TABS.includes(rawStatus) ? rawStatus : "all";
  const { data: register, isLoading } = useSalesInvoiceRegister();
  const actions = useSalesInvoiceActions();
  const { data: reps } = useSalesReps();
  const repFilter = params.get("rep") ?? ALL_REPS;
  const invoices = useMemo(
    () =>
      repFilter === ALL_REPS
        ? register
        : register?.filter((invoice) =>
            repFilter === NO_REP
              ? !invoice.salesRepId
              : invoice.salesRepId === repFilter,
          ),
    [register, repFilter],
  );
  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const counts = useMemo(() => {
    const result: Record<StatusTab, number> = {
      all: 0,
      draft: 0,
      posted: 0,
      unpaid: 0,
      cancelled: 0,
    };
    for (const invoice of invoices ?? []) {
      result.all += 1;
      result[invoice.status] += 1;
      if (isUnpaid(invoice)) result.unpaid += 1;
    }
    return result;
  }, [invoices]);

  const rows = useMemo(
    () =>
      (invoices ?? []).filter((invoice) =>
        status === "all"
          ? true
          : status === "unpaid"
            ? isUnpaid(invoice)
            : invoice.status === status,
      ),
    [invoices, status],
  );

  const columns = useMemo<ColumnDef<SalesInvoiceRegisterRowDto>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: t("sales.salesInvoices.invoiceNumber"),
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {row.original.invoiceNumber}
          </span>
        ),
      },
      {
        id: "invoiceDate",
        header: t("sales.salesInvoices.invoiceDate"),
        accessorFn: (row) => row.invoiceDate ?? "",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDate(row.original.invoiceDate)}
          </span>
        ),
      },
      {
        accessorKey: "customerName",
        header: t("sales.salesInvoices.customer"),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.customerName}</span>
        ),
      },
      {
        id: "salesRep",
        header: t("salesReps.field"),
        accessorFn: (row) => row.salesRepName ?? "",
        cell: ({ row }) =>
          row.original.salesRepName ? (
            <span className="text-secondary-foreground">
              {row.original.salesRepName}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "dueDate",
        header: t("sales.salesInvoices.dueDate"),
        accessorFn: (row) => row.dueDate ?? "",
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums text-secondary-foreground">
              {formatDate(row.original.dueDate)}
            </span>
            {row.original.overdueDays > 0 ? (
              <Badge variant="danger">
                {t("sales.salesInvoices.overdueDays", {
                  days: row.original.overdueDays,
                })}
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        id: "total",
        header: () => (
          <div className={AMOUNT_CELL}>
            {t("sales.salesInvoices.totalAmount")}
          </div>
        ),
        accessorFn: (row) => Number(row.totalMinorUnits),
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount
              value={row.original.totalMinorUnits}
              currency={row.original.currency}
            />
          </div>
        ),
      },
      {
        id: "outstanding",
        header: () => (
          <div className={AMOUNT_CELL}>
            {t("sales.salesInvoices.outstanding")}
          </div>
        ),
        accessorFn: (row) => Number(row.outstandingMinorUnits),
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            {row.original.status === "posted" ? (
              <Amount
                value={row.original.outstandingMinorUnits}
                currency={row.original.currency}
                zeroAsDash
              />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        accessorFn: (row) => t(salesInvoiceStatusLabelKey(row.status)),
        cell: ({ row }) => (
          <Badge
            variant={SALES_INVOICE_STATUS_VARIANT[row.original.status]}
            dot
          >
            {t(salesInvoiceStatusLabelKey(row.original.status))}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const invoice = row.original;
          return (
            // Stop clicks (also from the portalled menu) from reaching the row's onClick.
            <div
              className="flex justify-end"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("common.actions")}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      navigate(`${SALES_INVOICES_PATH}/${invoice.id}`)
                    }
                  >
                    {t("documents.open")}
                  </DropdownMenuItem>
                  <Can permission="sales.manage">
                    {isUnpaid(invoice) ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          navigate(
                            `/sales/payments-received/new?customerId=${invoice.customerId}&invoiceId=${invoice.id}`,
                          )
                        }
                      >
                        {t("sales.salesInvoices.recordPayment")}
                      </DropdownMenuItem>
                    ) : null}
                    {invoice.status === "draft" ? (
                      <>
                        <DropdownMenuItem
                          onSelect={() => void actions.post(invoice.id)}
                        >
                          {t("sales.salesInvoices.post")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => void actions.cancel(invoice.id)}
                        >
                          {t("sales.salesInvoices.cancel")}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {invoice.status === "draft" ||
                    invoice.status === "cancelled" ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-danger focus:bg-danger-soft focus:text-danger"
                          onSelect={() => void actions.remove(invoice.id)}
                        >
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </Can>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [t, navigate, actions],
  );

  const newButton = (
    <Can permission="sales.manage">
      <Button asChild>
        <Link to={`${SALES_INVOICES_PATH}/new`}>
          <Plus />
          {t("sales.salesInvoices.newInvoice")}
        </Link>
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("sales.tabs.salesInvoices")}
        description={t("sales.salesInvoices.pageDescription")}
        actions={newButton}
      />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t("sales.salesInvoices.search")}
        onRowClick={(invoice) =>
          navigate(`${SALES_INVOICES_PATH}/${invoice.id}`)
        }
        emptyState={
          status === "all" ? (
            <EmptyState
              icon={<FileText />}
              title={t("sales.salesInvoices.emptyTitle")}
              description={t("sales.salesInvoices.emptyDescription")}
              action={newButton}
            />
          ) : undefined
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <StatusTabs
              tabs={STATUS_TABS}
              value={status}
              onChange={(tab) => setParam("status", tab === "all" ? null : tab)}
              label={(tab) =>
                tab === "all"
                  ? t("documents.all")
                  : tab === "unpaid"
                    ? t("sales.salesInvoices.unpaid")
                    : t(salesInvoiceStatusLabelKey(tab))
              }
              counts={counts}
            />
            {(reps ?? []).length > 0 ? (
              <Select
                value={repFilter}
                onValueChange={(value) =>
                  setParam("rep", value === ALL_REPS ? null : value)
                }
              >
                <SelectTrigger
                  className="h-9 w-44"
                  aria-label={t("salesReps.field")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_REPS}>
                    {t("salesReps.allReps")}
                  </SelectItem>
                  <SelectItem value={NO_REP}>{t("salesReps.noRep")}</SelectItem>
                  {(reps ?? []).map((rep) => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
