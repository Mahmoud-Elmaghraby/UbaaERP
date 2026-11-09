import { createBrowserRouter } from 'react-router-dom';

import { ProtectedRoute } from './protected-route';
import { PrintPage } from '../features/printing/print-page';
import { SharePage } from '../features/printing/share-page';
import { AppShell } from './layout/app-shell';
import { HomePage } from './pages/home-page';
import { NotFoundPage, RouteErrorPage } from './pages/route-error-page';
import { LoginPage } from '../features/users-permissions/login-page';
import { DesktopSetupPage } from '../features/desktop/setup-page';
import { ForgotPasswordPage } from '../features/users-permissions/forgot-password-page';
import { ResetPasswordPage } from '../features/users-permissions/reset-password-page';
import { UsersPage } from '../features/users-permissions/users-page';
import { UserPage } from '../features/users-permissions/user-page';
import { UserEditorPage } from '../features/users-permissions/user-editor-page';
import { RoleEditorPage } from '../features/users-permissions/role-editor-page';
import { RolesPage } from '../features/users-permissions/roles-page';
import { AuditLogsPage } from '../features/users-permissions/audit-logs-page';
import { ProfilePage } from '../features/users-permissions/profile-page';
import { SettingsPage } from '../features/settings/settings-page';
import { inventoryRoutes } from '../features/inventory/routes';
import { purchasesRoutes } from '../features/purchases/routes';
import { salesRoutes } from '../features/sales/routes';
import { accountingRoutes } from '../features/accounting/routes';
import { treasuryRoutes } from '../features/treasury/routes';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  // Desktop build only — first-run Owner account (redirects to /login everywhere else).
  { path: '/setup', element: <DesktopSetupPage />, errorElement: <RouteErrorPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  // Public view of a shared document (WhatsApp link) — no login; the signed token authorizes it.
  { path: '/share/:token', element: <SharePage />, errorElement: <RouteErrorPage /> },
  {
    // Central print page — signed in, but outside the app shell (nothing but the document prints).
    path: '/print/:documentType/:id',
    element: (
      <ProtectedRoute>
        <PrintPage />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        // Pathless wrapper so a crashing page renders RouteErrorPage *inside* the
        // shell (sidebar and top bar stay usable) instead of replacing the whole app.
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'settings', element: <SettingsPage /> },
          ...inventoryRoutes,
          ...purchasesRoutes,
          ...salesRoutes,
          ...accountingRoutes,
          ...treasuryRoutes,
          { path: 'users', element: <UsersPage /> },
          { path: 'users/new', element: <UserEditorPage /> },
          { path: 'users/:id', element: <UserPage /> },
          { path: 'users/:id/edit', element: <UserEditorPage /> },
          { path: 'roles', element: <RolesPage /> },
          { path: 'roles/new', element: <RoleEditorPage /> },
          { path: 'roles/:id', element: <RoleEditorPage /> },
          { path: 'audit-logs', element: <AuditLogsPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
