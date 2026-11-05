import { useParams } from 'react-router-dom';

import { PrintView } from './print-page';
import { usePublicDocument } from './queries';

/**
 * /share/:token — the public view of a shared document (WhatsApp link).
 * Outside ProtectedRoute: the signed token is the only authorization; the
 * API validates it (signature, expiry, document type) and returns the same
 * print data as the signed-in print page.
 */
export function SharePage() {
  const { token } = useParams();
  const { data, isLoading, error } = usePublicDocument(token);
  return <PrintView data={data} isLoading={isLoading} error={error} />;
}
