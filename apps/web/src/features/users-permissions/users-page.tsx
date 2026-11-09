import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { UserDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus, ShieldCheck } from 'lucide-react';

import { useRoles, useUsers } from './queries';
import { StatusTabs } from '../../components/list/status-tabs';
import { formatDateTime } from '../../lib/format-date';
import { USERS_PATH } from './user-paths';

const STATUS_TABS = ['all', 'active', 'inactive'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

/** المستخدمين — who can sign in, with which role, and when they last did; a row opens the user. */
export function UsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: users, isLoading } = useUsers();
  const { data: roles } = useRoles();
  const roleName = useMemo(() => new Map((roles ?? []).map((r) => [r.id, r.name])), [roles]);

  const counts = useMemo(() => {
    const all = users ?? [];
    const active = all.filter((u) => u.isActive).length;
    return { all: all.length, active, inactive: all.length - active };
  }, [users]);
  const visible = useMemo(
    () => (users ?? []).filter((u) => (status === 'all' ? true : status === 'active' ? u.isActive : !u.isActive)),
    [users, status],
  );

  const columns = useMemo<ColumnDef<UserDto>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: t('users.fullName'),
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 font-medium">
            {row.original.fullName}
            {row.original.twoFactorEnabled ? (
              <ShieldCheck className="h-3.5 w-3.5 text-success" aria-label={t('users.twoFactorOn')} />
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: t('users.email'),
        cell: ({ row }) => <span className="text-muted-foreground" dir="ltr">{row.original.email}</span>,
      },
      {
        id: 'role',
        header: t('users.role'),
        accessorFn: (row) => roleName.get(row.roleId) ?? '—',
      },
      {
        id: 'lastLoginAt',
        header: t('users.lastLogin'),
        accessorFn: (row) => (row.lastLoginAt ? new Date(row.lastLoginAt).getTime() : 0),
        cell: ({ row }) =>
          row.original.lastLoginAt ? (
            <span className="tabular-nums text-muted-foreground">{formatDateTime(row.original.lastLoginAt)}</span>
          ) : (
            <span className="text-muted-foreground">{t('users.neverLoggedIn')}</span>
          ),
      },
      {
        id: 'isActive',
        header: t('common.status'),
        accessorFn: (row) => (row.isActive ? t('common.active') : t('common.inactive')),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
    ],
    [t, roleName],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('users.title')}
        description={t('users.subtitle')}
        actions={
          <Can permission="users.manage">
            <Button asChild>
              <Link to={`${USERS_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('users.newUser')}
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={visible}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('users.search')}
        onRowClick={(user) => navigate(`${USERS_PATH}/${user.id}`)}
        toolbar={
          <StatusTabs
            tabs={STATUS_TABS}
            value={status}
            onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
            label={(tab) => (tab === 'all' ? t('common.all') : tab === 'active' ? t('common.active') : t('common.inactive'))}
            counts={users ? counts : undefined}
          />
        }
      />
    </div>
  );
}
