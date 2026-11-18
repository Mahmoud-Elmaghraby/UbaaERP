import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LedgerIntegrityRowDto } from "@erp-platform/contracts";
import {
  Badge,
  Button,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@erp-platform/ui";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";

import { Amount, AMOUNT_CELL } from "../../../../components/amount";
import { useLedgerIntegrity } from "../../api/journal-entries/queries";

/**
 * /accounting/integrity — فحص سلامة البيانات: every control account in the books against what its
 * sub-ledger holds right now (customer and supplier balances, cheques, each treasury, stock value,
 * employee loans, unpaid salaries). A difference lists the manual entries that name no party — the
 * usual cause — so the accountant can fix them with a reversing entry.
 */
export function LedgerIntegrityPage() {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, refetch } = useLedgerIntegrity();
  const rows = data?.rows ?? [];
  const off = rows.filter((row) => row.differenceMinorUnits !== "0");

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("accounting.integrity.title")}
        description={t("accounting.integrity.subtitle")}
        actions={
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn("me-1 h-4 w-4", isFetching && "animate-spin")}
            />
            {t("accounting.integrity.recheck")}
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border p-4 text-sm font-medium",
              off.length === 0
                ? "border-success/40 bg-success/10 text-success"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {off.length === 0 ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <TriangleAlert className="h-5 w-5" />
            )}
            {off.length === 0
              ? t("accounting.integrity.allGood")
              : t("accounting.integrity.someOff", { count: off.length })}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("accounting.integrity.check")}</TableHead>
                  <TableHead>{t("accounting.integrity.account")}</TableHead>
                  <TableHead className={AMOUNT_CELL}>
                    {t("accounting.integrity.ledger")}
                  </TableHead>
                  <TableHead className={AMOUNT_CELL}>
                    {t("accounting.integrity.subledger")}
                  </TableHead>
                  <TableHead className={AMOUNT_CELL}>
                    {t("accounting.integrity.difference")}
                  </TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <IntegrityRow
                    key={`${row.key}-${row.accountId ?? row.label}`}
                    row={row}
                    currency={data!.currency}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("accounting.integrity.footnote")}
          </p>
        </>
      )}
    </div>
  );
}

function IntegrityRow({
  row,
  currency,
}: {
  row: LedgerIntegrityRowDto;
  currency: string;
}) {
  const { t } = useTranslation();
  const ok = row.differenceMinorUnits === "0";
  const title = row.label ?? t(`accounting.integrity.keys.${row.key}`);
  return (
    <>
      <TableRow className={cn(!ok && "bg-destructive/5")}>
        <TableCell>
          <div className="font-medium">
            {row.key === "treasury"
              ? `${t("accounting.integrity.keys.treasury")}: ${title}`
              : title}
          </div>
          {row.foreignExcluded > 0 ? (
            <div className="text-xs text-muted-foreground">
              {t("accounting.integrity.foreignExcluded", {
                count: row.foreignExcluded,
              })}
            </div>
          ) : null}
        </TableCell>
        <TableCell>
          {row.accountId ? (
            <Link
              className="hover:underline"
              to={`/accounting/reports/general-ledger?account=${row.accountId}`}
            >
              <span className="me-2 tabular-nums text-muted-foreground">
                {row.accountCode}
              </span>
              {row.accountName}
            </Link>
          ) : (
            <span className="text-destructive">
              {t("accounting.integrity.notMapped")}
            </span>
          )}
        </TableCell>
        <TableCell className={AMOUNT_CELL}>
          <Amount
            value={row.ledgerMinorUnits}
            currency={currency}
            hideCurrency
          />
        </TableCell>
        <TableCell className={AMOUNT_CELL}>
          {row.link ? (
            <Link className="hover:underline" to={row.link}>
              <Amount
                value={row.subledgerMinorUnits}
                currency={currency}
                hideCurrency
              />
            </Link>
          ) : (
            <Amount
              value={row.subledgerMinorUnits}
              currency={currency}
              hideCurrency
            />
          )}
        </TableCell>
        <TableCell
          className={cn(AMOUNT_CELL, !ok && "font-semibold text-destructive")}
        >
          <Amount
            value={row.differenceMinorUnits}
            currency={currency}
            hideCurrency
            zeroAsDash
          />
        </TableCell>
        <TableCell>
          {ok ? (
            <Badge variant="success">{t("accounting.integrity.matched")}</Badge>
          ) : (
            <Badge variant="danger">{t("accounting.integrity.mismatch")}</Badge>
          )}
        </TableCell>
      </TableRow>
      {row.unexplained.count > 0 ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-muted/30 py-2 text-xs">
            <span className="text-muted-foreground">
              {t(
                row.key === "notes_receivable" ||
                  row.key === "notes_payable" ||
                  row.key === "inventory"
                  ? "accounting.integrity.manualOnLocked"
                  : "accounting.integrity.unexplained",
                { count: row.unexplained.count },
              )}{" "}
              (
              <Amount
                value={row.unexplained.totalMinorUnits}
                currency={currency}
              />
              ):
            </span>{" "}
            {row.unexplained.entries.map((entry, index) => (
              <span key={entry.id}>
                {index > 0 ? "، " : null}
                <Link
                  className="text-primary hover:underline"
                  to={`/accounting/journal-entries/${entry.id}`}
                >
                  {entry.number}
                </Link>
              </span>
            ))}
            {row.unexplained.count > row.unexplained.entries.length
              ? " …"
              : null}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
