import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { RoleDto } from '@erp-platform/contracts';
import { Badge, Button, Can, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus } from 'lucide-react';

import { usePermissions, useRoles } from './queries';
import { ROLES_PATH } from './user-paths';

/** الأدوار — what each role may do and how many people hold it; a row opens the role. */
export function RolesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: roles, isLoading } = useRoles();
  const { data: permissions } = usePermissions();
  const total = permissions?.length ?? 0;

  const columns = useMemo<ColumnDef<RoleDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('roles.name'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            {row.original.name}
            {row.original.isSystem ? <Badge variant="brand">{t('roles.systemRole')}</Badge> : null}
          </span>
        ),
      },
      {
        id: 'permissions',
        header: t('roles.permissions'),
        accessorFn: (row) => row.permissionKeys.length,
        cell: ({ row }) =>
          row.original.isSystem ? (
            t('users.allPermissions')
          ) : (
            <span className="tabular-nums">
              {row.original.permissionKeys.length}
              {total ? <span className="text-muted-foreground"> / {total}</span> : null}
            </span>
          ),
      },
      {
        accessorKey: 'userCount',
        header: t('roles.userCount'),
        cell: ({ row }) => <span className="tabular-nums">{row.original.userCount}</span>,
      },
    ],
    [t, total],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('roles.title')}
        description={t('roles.subtitle')}
        actions={
          <Can permission="roles.manage">
            <Button asChild>
              <Link to={`${ROLES_PATH}/new`}>
                <Plus className="me-1 h-4 w-4" />
                {t('roles.newRole')}
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={roles ?? []}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('roles.search')}
        onRowClick={(role) => navigate(`${ROLES_PATH}/${role.id}`)}
      />
    </div>
  );
}
