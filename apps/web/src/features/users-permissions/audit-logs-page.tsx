import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { useAuditLogs, type AuditLogFilters } from './queries';

export function AuditLogsPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [draft, setDraft] = useState<AuditLogFilters>({});
  const { data: logs, isLoading } = useAuditLogs(filters);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('auditLogs.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('auditLogs.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">{t('auditLogs.filters.entityType')}</label>
          <Input
            value={draft.entityType ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, entityType: e.target.value }))}
            className="w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">{t('auditLogs.filters.action')}</label>
          <Input
            value={draft.action ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, action: e.target.value }))}
            className="w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">{t('auditLogs.filters.from')}</label>
          <Input
            type="date"
            value={draft.from ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, from: e.target.value }))}
            className="w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs text-muted-foreground">{t('auditLogs.filters.to')}</label>
          <Input
            type="date"
            value={draft.to ?? ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
            className="w-40"
          />
        </div>
        <Button onClick={() => setFilters(draft)}>{t('auditLogs.filters.apply')}</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('auditLogs.date')}</TableHead>
              <TableHead>{t('auditLogs.action')}</TableHead>
              <TableHead>{t('auditLogs.entityType')}</TableHead>
              <TableHead>{t('auditLogs.entityId')}</TableHead>
              <TableHead>{t('auditLogs.user')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logs ?? []).map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString('ar-EG')}
                </TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.entityType}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{log.entityId ?? '-'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{log.userId ?? '-'}</TableCell>
              </TableRow>
            ))}
            {(logs ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
