import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { JournalLineRulesDto } from "@erp-platform/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@erp-platform/ui";
import { Lock } from "lucide-react";

import { PartyPicker } from "../../../../components/party/party-picker";
import { useJournalLineParties } from "../../api/journal-entries/queries";
import type { JournalLineDraftParties } from "./journal-entry-line-items-editor";

type Rule = JournalLineRulesDto["accounts"][number];

/**
 * Under a journal line's account (migration 0132): the customer / supplier / employee the Customers,
 * Suppliers, advances and salaries-payable accounts need, the treasury a treasury account needs,
 * or why a document-only account (cheques, inventory, GRNI) can't take a manual line.
 */
export function JournalLinePartyField({
  rule,
  line,
  onChange,
}: {
  rule: Rule | undefined;
  line: JournalLineDraftParties;
  onChange: (patch: JournalLineDraftParties) => void;
}) {
  const { t } = useTranslation();
  const partyKind =
    rule &&
    (rule.kind === "customer" ||
      rule.kind === "supplier" ||
      rule.kind === "employee")
      ? rule.kind
      : null;
  const { data: parties } = useJournalLineParties(
    partyKind ?? "customer",
    partyKind !== null,
  );
  const items = useMemo(
    () => (parties ?? []).map((p) => ({ ...p, contactPerson: null })),
    [parties],
  );

  if (!rule) return null;
  const clear = {
    customerId: undefined,
    supplierId: undefined,
    employeeId: undefined,
    treasuryId: undefined,
  };

  if (rule.kind === "locked") {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
        <Lock className="h-3 w-3" />
        {t("accounting.journalEntries.party.locked")}
      </p>
    );
  }

  if (rule.kind === "treasury") {
    if (rule.treasuries.length === 0) return null;
    return (
      <Select
        value={line.treasuryId ?? ""}
        onValueChange={(treasuryId) => onChange({ ...clear, treasuryId })}
      >
        <SelectTrigger
          className="mt-1 h-8 text-xs"
          aria-label={t("accounting.journalEntries.party.treasury")}
        >
          <SelectValue
            placeholder={t("accounting.journalEntries.party.treasury")}
          />
        </SelectTrigger>
        <SelectContent>
          {rule.treasuries.map((treasury) => (
            <SelectItem key={treasury.id} value={treasury.id}>
              {treasury.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const kind = rule.kind;
  const value =
    kind === "customer"
      ? line.customerId
      : kind === "supplier"
        ? line.supplierId
        : line.employeeId;
  const label = t(`accounting.journalEntries.party.${kind}`);
  return (
    <PartyPicker
      className="mt-1"
      items={items}
      value={value}
      onChange={(id) => onChange({ ...clear, [`${kind}Id`]: id })}
      labels={{
        placeholder: label,
        search: t("accounting.journalEntries.party.search"),
        new: "",
        name: "",
        phone: "",
        created: () => "",
        moreLater: "",
      }}
    />
  );
}
