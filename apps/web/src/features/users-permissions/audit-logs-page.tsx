import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useHasAnyPermission,
} from '@erp-platform/ui';
import { ChevronDown, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';

import { useAuditLogs, useUsers, type AuditLogFilters } from './queries';
import { formatDateTime } from '../../lib/format-date';
import { entityRoute } from '../../lib/entity-routes';
import { downloadXlsx } from '../../lib/xlsx';
import { AUDIT_MODULES, auditActionLabel, auditEntityLabel } from '../../components/audit/audit-format';

const PAGE_SIZE = 50;
const ALL = '__all__';
const ACTIONS = ['created', 'updated', 'deleted', 'posted', 'confirmed', 'cancelled', 'reversed', 'auth.login', 'auth.login_failed'];
const FILTER_KEYS = ['module', 'user', 'action', 'from', 'to'] as const;

/**
 * سجل المراجعة — who did what, when, on which record. Filters live in the URL (the user page
 * links here with ?user=…); 50 rows a page; a row opens its record and shows the recorded details.
 */
export function AuditLogsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const canListUsers = useHasAnyPermission(['users.manage']);
  const { data: users } = useUsers(canListUsers);
  const nameById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u.fullName])), [users]);

  const module = params.get('module') ?? '';
  const filters: AuditLogFilters = {
    userId: params.get('user') ?? undefined,
    entityType: module ? AUDIT_MODULES[module]?.join(',') : undefined,
    action: params.get('action') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  };
  const { data: logs, isLoading } = useAuditLogs(filters);

  function update(key: (typeof FILTER_KEYS)[number], value: string | undefined) {
    const next = new URLSearchParams(params);
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(0);
  }

  const userName = (id: string | null) => (id ? (nameById.get(id) ?? t('audit.unknownUser')) : t('history.system'));

  function exportPage() {
    downloadXlsx(
      'audit-log',
      [t('auditLogs.date'), t('auditLogs.user'), t('auditLogs.action'), t('auditLogs.entityType'), t('audit.details')],
      (logs ?? []).map((log) => [
        formatDateTime(log.createdAt),
        userName(log.userId),
        auditActionLabel(t, log.action),
        auditEntityLabel(t, log.entityType),
        JSON.stringify(log.metadata),
      ]),
    );
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('auditLogs.title')}
        description={t('auditLogs.subtitle')}
        actions={
          <Button variant="outline" onClick={exportPage} disabled={!logs?.length}>
            <Download className="me-1 h-4 w-4" />
            {t('audit.export')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-card">
        <div className="grid gap-1.5">
          <Label>{t('audit.module')}</Label>
          <Select value={module || ALL} onValueChange={(v) => update('module', v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('common.all')}</SelectItem>
              {Object.keys(AUDIT_MODULES).map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`audit.modules.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canListUsers ? (
          <div className="grid gap-1.5">
            <Label>{t('auditLogs.user')}</Label>
            <Select value={params.get('user') ?? ALL} onValueChange={(v) => update('user', v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('common.all')}</SelectItem>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label>{t('auditLogs.action')}</Label>
          <Select value={params.get('action') ?? ALL} onValueChange={(v) => update('action', v)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('common.all')}</SelectItem>
              {ACTIONS.map((action) => (
                <SelectItem key={action} value={action}>
                  {auditActionLabel(t, action)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-from">{t('auditLogs.filters.from')}</Label>
          <Input id="audit-from" type="date" className="w-40" value={params.get('from') ?? ''} onChange={(e) => update('from', e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="audit-to">{t('auditLogs.filters.to')}</Label>
          <Input id="audit-to" type="date" className="w-40" value={params.get('to') ?? ''} onChange={(e) => update('to', e.target.value)} />
        </div>
        {FILTER_KEYS.some((key) => params.has(key)) ? (
          <Button
            variant="ghost"
            onClick={() => {
              setParams({}, { replace: true });
              setPage(0);
            }}
          >
            <X />
            {t('inventory.stock.clearFilters')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-60 w-full rounded-xl" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" />
                <TableHead>{t('auditLogs.date')}</TableHead>
                <TableHead>{t('auditLogs.user')}</TableHead>
                <TableHead>{t('auditLogs.action')}</TableHead>
                <TableHead>{t('auditLogs.entityType')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs ?? []).map((log) => {
                const to = entityRoute(log.entityType, log.entityId);
                const details = Object.entries(log.metadata ?? {}).filter(([key]) => key !== 'occurredAt');
                const open = expanded === log.id;
                return (
                  <Fragment key={log.id}>
                    <TableRow
                      className={details.length ? 'cursor-pointer' : undefined}
                      onClick={() => details.length && setExpanded(open ? null : log.id)}
                    >
                      <TableCell className="text-muted-foreground">
                        {details.length ? open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" /> : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                      <TableCell className="font-medium">{userName(log.userId)}</TableCell>
                      <TableCell>{auditActionLabel(t, log.action)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {to ? (
                          <Link to={to} className="text-primary hover:underline">
                            {auditEntityLabel(t, log.entityType)}
                          </Link>
                        ) : (
                          auditEntityLabel(t, log.entityType)
                        )}
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell />
                        <TableCell colSpan={4}>
                          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                            {details.map(([key, value]) => (
                              <div key={key} className="flex gap-2">
                                <dt className="text-muted-foreground">{t(`audit.fields.${key}`, { defaultValue: key })}:</dt>
                                <dd className="break-all font-medium" dir="auto">
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
              {(logs ?? []).length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ChevronRight />
          {t('audit.newer')}
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">{t('audit.page', { page: page + 1 })}</span>
        <Button variant="outline" size="sm" disabled={(logs?.length ?? 0) < PAGE_SIZE} onClick={() => setPage(page + 1)}>
          {t('audit.older')}
          <ChevronLeft />
        </Button>
      </div>
    </div>
  );
}
