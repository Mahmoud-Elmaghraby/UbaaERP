import { Navigate, createBrowserRouter } from 'react-router-dom';

import { ProtectedRoute } from './protected-route';
import { AppShell } from './layout/app-shell';
import { LoginPage } from '../features/users-permissions/login-page';
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
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/settings" replace /> },
      { path: 'settings', element: <SettingsPage /> },
      ...inventoryRoutes,
      ...purchasesRoutes,
      ...salesRoutes,
      ...accountingRoutes,
      { path: 'users', element: <UsersPage /> },
      { path: 'roles', element: <RolesPage /> },
      { path: 'audit-logs', element: <AuditLogsPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
]);
