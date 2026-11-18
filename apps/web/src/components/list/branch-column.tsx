import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@erp-platform/ui";

import { useBranches } from "../../features/settings/queries";

const ALL = "__all__";

/**
 * The branch column and filter every document list shares (migration 0130). Only shown when the
 * user can see more than one branch — the API already returns a branch-limited user's own
 * branches only, so a one-branch user or a one-branch company sees no extra column.
 *
 *   const branch = useBranchColumn<Row>();
 *   columns: [...base, ...branch.columns]   data: branch.filter(rows)   toolbar: branch.control
 */
export function useBranchColumn<TRow extends { branchId?: string | null }>(): {
  columns: ColumnDef<TRow>[];
  filter: (rows: TRow[] | undefined) => TRow[];
  control: ReactNode;
} {
  const { t } = useTranslation();
  const { data: branches = [] } = useBranches();
  const [selected, setSelected] = useState<string>(ALL);
  const names = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );
  const shown = branches.length > 1;

  const columns = useMemo<ColumnDef<TRow>[]>(
    () =>
      shown
        ? [
            {
              id: "branch",
              header: t("branches.label"),
              accessorFn: (row) =>
                row.branchId ? (names.get(row.branchId) ?? "") : "",
              cell: ({ getValue }) => (
                <span className="whitespace-nowrap text-muted-foreground">
                  {getValue<string>()}
                </span>
              ),
            },
          ]
        : [],
    [shown, names, t],
  );

  const filter = (rows: TRow[] | undefined) =>
    !rows
      ? []
      : selected === ALL
        ? rows
        : rows.filter((row) => row.branchId === selected);

  const control = shown ? (
    <Select value={selected} onValueChange={setSelected}>
      <SelectTrigger className="h-9 w-44" aria-label={t("branches.label")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t("branches.all")}</SelectItem>
        {branches.map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            {branch.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : null;

  return { columns, filter, control };
}

/** The "الفرع" item for a document page's InfoGrid — nothing when the company has one branch. */
export function useBranchInfo(
  branchId: string | null | undefined,
): { label: string; value: string }[] {
  const { t } = useTranslation();
  const { data: branches = [] } = useBranches();
  if (branches.length < 2 || !branchId) return [];
  const name = branches.find((branch) => branch.id === branchId)?.name;
  return name ? [{ label: t("branches.label"), value: name }] : [];
}

/** A report filter: "كل الفروع" or one branch, kept in the page's URL. Hidden with a single branch. */
export function BranchFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (branchId: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: branches = [] } = useBranches();
  if (branches.length < 2) return null;
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">
        {t("branches.label")}
      </span>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => onChange(v === ALL ? null : v)}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("branches.all")}</SelectItem>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={branch.id}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
