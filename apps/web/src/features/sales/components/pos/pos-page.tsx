import { useTranslation } from 'react-i18next';
import { Badge, Skeleton } from '@erp-platform/ui';

import { useCurrentPosSession } from '../../api/pos/queries';
import { CloseSessionDialog } from './close-session-dialog';
import { OpenSessionForm } from './open-session-form';
import { PosCartPanel } from './pos-cart-panel';
import { PosSessionReportDialog } from './pos-session-report-dialog';

/**
 * POS Stage 4 (claude/sales-pos-research.md) — standalone top-level screen (its own
 * sidebar item "نقطة البيع", not nested under Sales' tabs — the whole point is that a
 * cashier lives on this one screen for their whole shift). Branches on whether the
 * current cashier already has an open session (GET /pos-sessions/current):
 * no session -> OpenSessionForm; open session -> the actual checkout screen.
 */
export function PosPage() {
  const { t } = useTranslation();
  const { data: session, isLoading } = useCurrentPosSession();

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!session) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">{t('nav.pos')}</h1>
        <OpenSessionForm />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{t('nav.pos')}</h1>
          <Badge>{t('pos.session.open')}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <PosSessionReportDialog session={session} />
          <CloseSessionDialog session={session} />
        </div>
      </div>
      <PosCartPanel session={session} />
    </div>
  );
}
