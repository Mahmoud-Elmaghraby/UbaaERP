// Public entry point for @erp-platform/ui.
//
// libs/ui is presentational: shadcn/ui primitives, the TanStack Table
// re-export, the shared <Can> permission component, and the dynamic
// custom-fields form engine (CLAUDE.md §7, §9.1). It must never import
// from apps/* (enforced by .eslintrc.cjs boundaries/element-types) — any
// app-specific wiring (Zustand store, API client, router) stays in
// apps/web and is handed in via props/context (see can/permissions-context.tsx).

export { cn } from './lib/cn';

export * from './components/ui/button';
export * from './components/ui/input';
export * from './components/ui/textarea';
export * from './components/ui/label';
export * from './components/ui/card';
export * from './components/ui/badge';
export * from './components/ui/separator';
export * from './components/ui/skeleton';
export * from './components/ui/avatar';
export * from './components/ui/table';
export * from './components/ui/data-table';
export * from './components/ui/tabs';
export * from './components/ui/dialog';
export * from './components/ui/checkbox';
export * from './components/ui/select';
export * from './components/ui/dropdown-menu';
export * from './components/ui/form';
export * from './components/ui/toaster';

export * from './can/permissions-context';
export * from './can/can';

export * from './dynamic-form/build-custom-fields-schema';
export * from './dynamic-form/custom-fields-form-section';
