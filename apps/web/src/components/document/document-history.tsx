import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Can, useHasAnyPermission } from '@erp-platform/ui';
import { History } from 'lucide-react';

import { useAuditLogs, useUsers } from '../../features/users-permissions/queries';
import { formatDateTime } from '../../lib/format-date';
import { auditActionLabel } from '../audit/audit-format';

/**
 * Who did what to one document, newest first (created, posted, cancelled,
 * reversed…) — read from the audit log. Shown to users who may read the
 * audit log; any document page can drop it in its side column.
 */
export function DocumentHistory({ entityType, entityId }: { entityType: string; entityId: string }) {
  return (
    <Can permission="audit_logs.view">
      <DocumentHistoryContent entityType={entityType} entityId={entityId} />
    </Can>
  );
}

function DocumentHistoryContent({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { t } = useTranslation();
  const { data: logs, isLoading } = useAuditLogs({ entityType, entityId });
  const canListUsers = useHasAnyPermission(['users.manage']);
  const { data: users } = useUsers(canListUsers);
  const nameById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u.fullName])), [users]);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <History className="h-4 w-4 text-muted-foreground" />
        {t('history.title')}
      </h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : !logs?.length ? (
        <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
      ) : (
        <ol className="relative flex flex-col gap-3 border-s ps-4">
          {logs.map((log) => (
            <li key={log.id} className="relative text-sm">
              <span className="absolute -start-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              <p className="font-medium">{auditActionLabel(t, log.action)}</p>
              <p className="text-xs text-muted-foreground">
                {(log.userId && nameById.get(log.userId)) || t('history.system')} · {formatDateTime(log.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
