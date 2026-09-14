import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { FeaturesProvider, PermissionsProvider, Toaster } from '@erp-platform/ui';

import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../lib/auth-store';
import '../i18n';

export function AppProviders({ children }: { children: ReactNode }) {
  const permissions = useAuthStore((state) => state.permissions);
  const features = useAuthStore((state) => state.features);
  const disabledFeatures = useAuthStore((state) => state.disabledFeatures);

  return (
    <QueryClientProvider client={queryClient}>
      <PermissionsProvider permissions={permissions}>
        <FeaturesProvider features={features} disabledFeatures={disabledFeatures}>
          {children}
          <Toaster />
        </FeaturesProvider>
      </PermissionsProvider>
    </QueryClientProvider>
  );
}
