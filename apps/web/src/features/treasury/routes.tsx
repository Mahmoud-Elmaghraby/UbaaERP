import { lazy } from "react";
import {
  Navigate,
  Outlet,
  useParams,
  type RouteObject,
} from "react-router-dom";

const TreasuriesPage = lazy(() =>
  import("./components").then((m) => ({ default: m.TreasuriesPage })),
);
const TreasuryStatementPage = lazy(() =>
  import("./components").then((m) => ({ default: m.TreasuryStatementPage })),
);
const TreasuryVouchersPage = lazy(() =>
  import("./components").then((m) => ({ default: m.TreasuryVouchersPage })),
);
const TreasuryCategoriesPage = lazy(() =>
  import("./components").then((m) => ({ default: m.TreasuryCategoriesPage })),
);

// Cheques (customers' and suppliers') and bank reconciliation live under الخزينة in the menu;
// their pages stay in their own features.
const ChequesPage = lazy(() =>
  import("../sales/components/cheques").then((m) => ({
    default: m.ChequesPage,
  })),
);
const BankAccountsPage = lazy(() =>
  import("../accounting/components/bank-accounts").then((m) => ({
    default: m.BankAccountsPage,
  })),
);
const BankReconciliationPage = lazy(() =>
  import("../accounting/components/bank-accounts").then((m) => ({
    default: m.BankReconciliationPage,
  })),
);

export const BANK_RECONCILIATION_PATH = "/treasury/bank-reconciliation";

/** Old links (/sales/cheques, /accounting/bank-accounts[/:id]) keep working. */
export function LegacyBankAccountRedirect() {
  const { id } = useParams();
  return (
    <Navigate
      to={id ? `${BANK_RECONCILIATION_PATH}/${id}` : BANK_RECONCILIATION_PATH}
      replace
    />
  );
}

/** Treasury (الخزائن): treasuries, vouchers, expense/income items, per-treasury statement. */
export const treasuryRoutes: RouteObject[] = [
  {
    path: "treasury",
    element: <Outlet />,
    children: [
      { index: true, element: <TreasuriesPage /> },
      { path: "vouchers", element: <TreasuryVouchersPage /> },
      { path: "categories", element: <TreasuryCategoriesPage /> },
      { path: "cheques", element: <ChequesPage /> },
      { path: "bank-reconciliation", element: <BankAccountsPage /> },
      { path: "bank-reconciliation/:id", element: <BankReconciliationPage /> },
      { path: ":id", element: <TreasuryStatementPage /> },
    ],
  },
];
