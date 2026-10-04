import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { FeaturesProvider, PermissionsProvider, Toaster } from '@erp-platform/ui';

import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../lib/auth-store';
import { ThemeProvider } from './theme/theme-provider';
import '../i18n';

export function AppProviders({ children }: { children: ReactNode }) {
  const permissions = useAuthStore((state) => state.permissions);
  const features = useAuthStore((state) => state.features);
  const disabledFeatures = useAuthStore((state) => state.disabledFeatures);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <PermissionsProvider permissions={permissions}>
          <FeaturesProvider features={features} disabledFeatures={disabledFeatures}>
            {children}
            <Toaster />
          </FeaturesProvider>
        </PermissionsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
