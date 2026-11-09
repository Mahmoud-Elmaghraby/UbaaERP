import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UserDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  toast,
} from '@erp-platform/ui';
import { FileQuestion, KeyRound, MoreHorizontal, Pencil } from 'lucide-react';

import {
  useAuditLogs,
  useResetUserTwoFactor,
  useRevokeUserSessions,
  useRoles,
  useSendUserInvite,
  useSetUserPassword,
  useUnlockUser,
  useUpdateUser,
  useUser,
} from './queries';
import { ApiError } from '../../lib/api-client';
import { formatDateTime } from '../../lib/format-date';
import { entityRoute } from '../../lib/entity-routes';
import { confirmDialog } from '../../components/feedback/confirm-dialog';
import { auditActionLabel, auditEntityLabel } from '../../components/audit/audit-format';
import { DocumentBody, DocumentHeaderBar, InfoGrid, SectionCard } from '../../components/document/document-layout';
import { BranchAccessSection, ManagerSection } from './user-access-sections';
import { PasswordInput } from './password-input';
import { ROLES_PATH, USERS_PATH } from './user-paths';

/** /users/:id — one account: role, access, security actions and what they did lately. */
export function UserPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, isError } = useUser(id);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (isError || !user) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={USERS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }
  return <UserDetails user={user} />;
}

function UserDetails({ user }: { user: UserDto }) {
  const { t } = useTranslation();
  const { data: roles } = useRoles();
  const role = roles?.find((r) => r.id === user.roleId);
  const updateUser = useUpdateUser();
  const revokeSessions = useRevokeUserSessions();
  const resetTwoFactor = useResetUserTwoFactor();
  const sendInvite = useSendUserInvite();
  const unlockUser = useUnlockUser();
  const lockedUntil = user.lockedUntil ? new Date(user.lockedUntil) : null;
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function run(confirmText: string, action: () => Promise<unknown>, successText: string, tone?: 'danger') {
    if (!(await confirmDialog(confirmText, tone ? { tone } : undefined))) return;
    try {
      await action();
      toast.success(successText);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={USERS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('users.title')}
        title={user.fullName}
        status={
          <span className="flex items-center gap-1.5">
            <Badge variant={user.isActive ? 'success' : 'neutral'} dot>
              {user.isActive ? t('common.active') : t('common.inactive')}
            </Badge>
            {role?.isSystem ? <Badge variant="brand">{role.name}</Badge> : null}
            {lockedUntil ? (
              <Badge variant="danger">{t('users.lockedUntil', { time: formatDateTime(lockedUntil) })}</Badge>
            ) : null}
          </span>
        }
        actions={
          <Can permission="users.manage">
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t('common.actions')}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {lockedUntil ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void run(
                          t('users.unlockConfirm', { name: user.fullName }),
                          () => unlockUser.mutateAsync(user.id),
                          t('users.unlockSuccess'),
                        )
                      }
                    >
                      {t('users.unlock')}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() =>
                      void run(
                        t('users.revokeSessionsConfirm', { name: user.fullName }),
                        () => revokeSessions.mutateAsync(user.id),
                        t('users.revokeSessionsSuccess'),
                      )
                    }
                  >
                    {t('users.revokeSessions')}
                  </DropdownMenuItem>
                  {user.twoFactorEnabled ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void run(
                          t('users.resetTwoFactorConfirm', { name: user.fullName }),
                          () => resetTwoFactor.mutateAsync(user.id),
                          t('users.resetTwoFactorSuccess'),
                          'danger',
                        )
                      }
                    >
                      {t('users.resetTwoFactor')}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() =>
                      void run(t('users.sendInviteConfirm'), () => sendInvite.mutateAsync(user.id), t('users.sendInviteSuccess'))
                    }
                  >
                    {t('users.sendInvite')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void run(
                        user.isActive
                          ? t('users.deactivateConfirm', { name: user.fullName })
                          : t('users.activateConfirm', { name: user.fullName }),
                        () => updateUser.mutateAsync({ id: user.id, input: { isActive: !user.isActive } }),
                        user.isActive ? t('users.deactivateSuccess') : t('users.activateSuccess'),
                        user.isActive ? 'danger' : undefined,
                      )
                    }
                  >
                    {user.isActive ? t('users.deactivate') : t('users.activate')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" onClick={() => setPasswordOpen(true)}>
                <KeyRound />
                {t('users.setPassword')}
              </Button>
              <Button asChild>
                <Link to={`${USERS_PATH}/${user.id}/edit`}>
                  <Pencil />
                  {t('common.edit')}
                </Link>
              </Button>
            </>
          </Can>
        }
      />

      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('users.email'), value: <span dir="ltr">{user.email}</span> },
                  {
                    label: t('users.role'),
                    value: role ? (
                      <Link to={`${ROLES_PATH}/${role.id}`} className="text-primary hover:underline">
                        {role.name}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: t('users.twoFactor'),
                    value: user.twoFactorEnabled ? (
                      <Badge variant="success">{t('users.twoFactorOn')}</Badge>
                    ) : (
                      <span className="text-muted-foreground">{t('users.twoFactorOff')}</span>
                    ),
                  },
                  { label: t('users.lastLogin'), value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t('users.neverLoggedIn') },
                  { label: t('users.createdAt'), value: formatDateTime(user.createdAt) },
                ]}
              />
            </SectionCard>
            <BranchAccessSection userId={user.id} />
            <ManagerSection userId={user.id} />
          </>
        }
        side={
          <Can permission="audit_logs.view">
            <RecentActivity userId={user.id} />
          </Can>
        }
      />

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.setPasswordFor', { name: user.fullName })}</DialogTitle>
          </DialogHeader>
          <SetPasswordForm userId={user.id} onDone={() => setPasswordOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SetPasswordForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const setPassword = useSetUserPassword();
  const [password, setPasswordValue] = useState('');

  async function save() {
    try {
      await setPassword.mutateAsync({ id: userId, input: { password } });
      toast.success(t('users.setPasswordSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-3">
      <PasswordInput value={password} onChange={setPasswordValue} />
      <p className="text-xs text-muted-foreground">{t('users.passwordRule')}</p>
      <p className="text-xs text-muted-foreground">{t('users.setPasswordHint')}</p>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={setPassword.isPending || password.length < 8}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function RecentActivity({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data: logs, isLoading } = useAuditLogs({ userId, limit: '12' });
  return (
    <SectionCard
      title={t('users.recentActivity')}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/audit-logs?user=${userId}`}>{t('users.allActivity')}</Link>
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="mt-4 h-24" />
      ) : !logs?.length ? (
        <p className="pt-4 text-sm text-muted-foreground">{t('history.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-2.5 pt-4 text-sm">
          {logs.map((log) => {
            const to = entityRoute(log.entityType, log.entityId);
            const label = `${auditActionLabel(t, log.action)} · ${auditEntityLabel(t, log.entityType)}`;
            return (
              <li key={log.id} className="flex flex-col">
                {to ? (
                  <Link to={to} className="font-medium hover:text-primary hover:underline">
                    {label}
                  </Link>
                ) : (
                  <span className="font-medium">{label}</span>
                )}
                <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
