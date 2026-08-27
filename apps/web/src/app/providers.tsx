import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PermissionsProvider, Toaster } from '@erp-platform/ui';

import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../lib/auth-store';
import '../i18n';

export function AppProviders({ children }: { children: ReactNode }) {
  const permissions = useAuthStore((state) => state.permissions);

  return (
    <QueryClientProvider client={queryClient}>
      <PermissionsProvider permissions={permissions}>
        {children}
        <Toaster />
      </PermissionsProvider>
    </QueryClientProvider>
  );
}
