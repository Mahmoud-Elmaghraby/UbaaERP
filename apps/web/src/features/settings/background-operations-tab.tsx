import { useTranslation } from 'react-i18next';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OutboxEventDto, OutboxSummaryDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { apiGet, apiPost, ApiError } from '../../lib/api-client';

const KEY = ['outbox-events'] as const;

const STATUS_VARIANT: Record<OutboxEventDto['status'], 'neutral' | 'info' | 'danger' | 'success'> = {
  pending: 'neutral',
  processing: 'info',
  failed: 'danger',
  processed: 'success',
};

/**
 * العمليات في الخلفية: what a confirmed document still has to do after it was
 * saved — move stock, post the journal entry… Normally these finish within
 * seconds; this tab shows the ones waiting, running, or failed after every
 * retry (with the reason), and sends a failed one again once the cause is
 * fixed (e.g. stock was received).
 */
export function BackgroundOperationsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: [...KEY, 'summary'],
    queryFn: () => apiGet<OutboxSummaryDto>('/outbox-events/summary'),
    refetchInterval: 15_000,
  });
  const events = useQuery({
    queryKey: [...KEY, 'list'],
    queryFn: () => apiGet<OutboxEventDto[]>('/outbox-events'),
    refetchInterval: 15_000,
  });
  const retry = useMutation({
    mutationFn: (id: string) => apiPost<void>(`/outbox-events/${id}/retry`),
    onSuccess: () => {
      toast.success(t('settings.operations.requeued'));
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('settings.operations.retryError')),
  });

  const counts = summary.data ?? { pending: 0, processing: 0, failed: 0 };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t('settings.operations.description')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="neutral">{t('settings.operations.pendingCount', { count: counts.pending })}</Badge>
        <Badge variant="info">{t('settings.operations.processingCount', { count: counts.processing })}</Badge>
        <Badge variant={counts.failed > 0 ? 'danger' : 'neutral'}>
          {t('settings.operations.failedCount', { count: counts.failed })}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto"
          onClick={() => void queryClient.invalidateQueries({ queryKey: KEY })}
        >
          <RefreshCw />
          {t('settings.operations.refresh')}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {events.isLoading ? (
            <Skeleton className="m-5 h-32" />
          ) : (events.data ?? []).length === 0 ? (
            <EmptyState className="py-10" title={t('settings.operations.allDone')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.operations.operation')}</TableHead>
                  <TableHead>{t('settings.operations.status')}</TableHead>
                  <TableHead>{t('settings.operations.time')}</TableHead>
                  <TableHead>{t('settings.operations.reason')}</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(events.data ?? []).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">
                      {t(`settings.operations.types.${event.eventType.replace(/\./g, '_')}`, {
                        defaultValue: event.eventType,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[event.status]} dot>
                        {t(`settings.operations.statuses.${event.status}`)}
                      </Badge>
                      {event.attempts > 0 ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t('settings.operations.attempts', { count: event.attempts })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <bdi dir="ltr">
                        {new Date(event.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                      </bdi>
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">{event.lastError ?? '—'}</TableCell>
                    <TableCell>
                      {event.status === 'failed' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(event.id)}
                        >
                          <RotateCcw />
                          {t('settings.operations.retry')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
