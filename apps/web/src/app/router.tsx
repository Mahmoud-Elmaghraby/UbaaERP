import { createBrowserRouter } from 'react-router-dom';

import { ProtectedRoute } from './protected-route';
import { AppShell } from './layout/app-shell';
import { HomePage } from './pages/home-page';
import { NotFoundPage, RouteErrorPage } from './pages/route-error-page';
import { LoginPage } from '../features/users-permissions/login-page';
import { ForgotPasswordPage } from '../features/users-permissions/forgot-password-page';
import { ResetPasswordPage } from '../features/users-permissions/reset-password-page';
import { UsersPage } from '../features/users-permissions/users-page';
import { RolesPage } from '../features/users-permissions/roles-page';
import { AuditLogsPage } from '../features/users-permissions/audit-logs-page';
import { ProfilePage } from '../features/users-permissions/profile-page';
import { SettingsPage } from '../features/settings/settings-page';
import { inventoryRoutes } from '../features/inventory/routes';
import { purchasesRoutes } from '../features/purchases/routes';
import { salesRoutes } from '../features/sales/routes';
import { accountingRoutes } from '../features/accounting/routes';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
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
          { path: 'users', element: <UsersPage /> },
          { path: 'roles', element: <RolesPage /> },
          { path: 'audit-logs', element: <AuditLogsPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
