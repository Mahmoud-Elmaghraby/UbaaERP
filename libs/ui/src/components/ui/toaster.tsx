import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

/**
 * Thin wrapper around sonner so app code imports toast UI from
 * @erp-platform/ui rather than depending on the sonner package directly.
 * Mount once near the app root; trigger toasts with `toast(...)` from
 * 'sonner' (re-exported below).
 */
function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      dir="rtl"
      position="top-center"
      richColors
      closeButton
      {...props}
    />
  );
}

export { Toaster };
export { toast } from 'sonner';
