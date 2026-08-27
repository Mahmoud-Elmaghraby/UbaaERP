import { RouterProvider } from 'react-router-dom';

import { AppProviders } from './app/providers';
import { router } from './app/router';

/**
 * Root application shell: routing (react-router-dom), server-state
 * (React Query), client-state permissions context (<Can>, fed from the
 * Zustand auth store), and toasts. Arabic/RTL is already set at the
 * document level (see index.html) — not duplicated here.
 */
export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
