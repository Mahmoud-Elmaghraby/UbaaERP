import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RoleDto } from '@erp-platform/contracts';
import { Button, Can, EmptyState, Input, Label, Skeleton, toast, useHasAnyPermission } from '@erp-platform/ui';
import { Copy, FileQuestion, Trash2 } from 'lucide-react';

import { useCreateRole, useDeleteRole, usePermissions, useRoles, useUpdateRole, useUsers } from './queries';
import { ApiError } from '../../lib/api-client';
import { confirmDialog } from '../../components/feedback/confirm-dialog';
import { useSaveShortcut } from '../../lib/use-save-shortcut';
import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../components/document/document-layout';
import { PermissionMatrix } from './permission-matrix';
import { ROLE_TEMPLATES, templateKeys } from './role-templates';
import { ROLES_PATH, USERS_PATH } from './user-paths';

/**
 * /roles/new (optionally ?from=<role id> to copy one) and /roles/:id — name, permissions and who
 * holds the role. The system role (Owner) is shown read-only: it always has every permission.
 */
export function RoleEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { data: roles, isLoading } = useRoles();
  const { data: permissions, isLoading: permissionsLoading } = usePermissions();
  const role = id ? roles?.find((r) => r.id === id) : undefined;
  const source = !id ? roles?.find((r) => r.id === params.get('from')) : undefined;

  if (isLoading || permissionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && !role) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={ROLES_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }
  return (
    <RoleEditor
      key={role?.id ?? `new-${source?.id ?? ''}`}
      role={role}
      source={source}
      allKeys={(permissions ?? []).map((p) => p.key)}
    />
  );
}

function RoleEditor({ role, source, allKeys }: { role?: RoleDto; source?: RoleDto; allKeys: string[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: permissions } = usePermissions();
  const canManage = useHasAnyPermission(['roles.manage']);
  const locked = Boolean(role?.isSystem) || !canManage;
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const [name, setName] = useState(role?.name ?? (source ? t('roles.copyName', { name: source.name }) : ''));
  const [selected, setSelected] = useState<string[]>(
    role?.isSystem ? allKeys : (role?.permissionKeys ?? source?.permissionKeys ?? []),
  );
  useEffect(() => {
    if (role?.isSystem) setSelected(allKeys);
  }, [role?.isSystem, allKeys]);

  const saving = createRole.isPending || updateRole.isPending;

  async function save() {
    if (!name.trim()) {
      toast.error(t('roles.nameRequired'));
      return;
    }
    try {
      if (role) {
        await updateRole.mutateAsync({ id: role.id, input: { name: name.trim(), permissionKeys: selected } });
        toast.success(t('roles.updateSuccess'));
      } else {
        const created = await createRole.mutateAsync({ name: name.trim(), permissionKeys: selected });
        toast.success(t('roles.createSuccess'));
        navigate(`${ROLES_PATH}/${created.id}`, { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }
  useSaveShortcut(() => void save(), locked);

  async function handleDelete() {
    if (!role || !(await confirmDialog(t('roles.deleteConfirm', { name: role.name }), { tone: 'danger' }))) return;
    try {
      await deleteRole.mutateAsync(role.id);
      toast.success(t('roles.deleteSuccess'));
      navigate(ROLES_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={ROLES_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('roles.title')}
        title={role ? role.name : t('roles.newRole')}
        actions={
          role && canManage ? (
            <>
              <Button variant="outline" asChild>
                <Link to={`${ROLES_PATH}/new?from=${role.id}`}>
                  <Copy />
                  {t('roles.copy')}
                </Link>
              </Button>
              {!role.isSystem ? (
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  disabled={deleteRole.isPending || role.userCount > 0}
                  title={role.userCount > 0 ? t('roles.deleteBlocked') : undefined}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 />
                  {t('common.delete')}
                </Button>
              ) : null}
              {!role.isSystem ? (
                <Button onClick={() => void save()} disabled={saving}>
                  {t('common.save')}
                </Button>
              ) : null}
            </>
          ) : !role ? (
            <Button onClick={() => void save()} disabled={saving}>
              {t('common.save')}
            </Button>
          ) : undefined
        }
      />
      <DocumentBody
        main={
          <>
            <SectionCard>
              <div className="grid gap-1.5 pt-5">
                <Label htmlFor="role-name">{t('roles.name')}</Label>
                <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} disabled={locked} className="max-w-md" />
              </div>
            </SectionCard>
            {!role ? (
              <SectionCard title={t('roles.templates')} description={t('roles.templatesHint')}>
                <div className="flex flex-wrap gap-2 pt-4">
                  {ROLE_TEMPLATES.map((template) => (
                    <Button
                      key={template.key}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelected(templateKeys(template, allKeys));
                        if (!name.trim()) setName(t(`roles.templateNames.${template.key}`));
                      }}
                    >
                      {t(`roles.templateNames.${template.key}`)}
                    </Button>
                  ))}
                </div>
              </SectionCard>
            ) : null}
            <SectionCard
              title={t('roles.permissions')}
              description={role?.isSystem ? t('roles.systemLockedHint') : `${selected.length} / ${allKeys.length}`}
            >
              <div className="pt-4">
                <PermissionMatrix permissions={permissions ?? []} selected={selected} onChange={setSelected} disabled={locked} />
              </div>
            </SectionCard>
          </>
        }
        side={role ? <RoleMembers role={role} /> : undefined}
      />
    </div>
  );
}

function RoleMembers({ role }: { role: RoleDto }) {
  const { t } = useTranslation();
  const { data: users } = useUsers();
  const members = useMemo(() => (users ?? []).filter((u) => u.roleId === role.id), [users, role.id]);
  return (
    <SectionCard title={t('roles.members')} description={String(role.userCount)}>
      {members.length === 0 ? (
        <p className="pt-4 text-sm text-muted-foreground">{t('roles.noMembers')}</p>
      ) : (
        <ul className="flex flex-col gap-2 pt-4 text-sm">
          {members.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2">
              <Can permission="users.manage" fallback={<span>{u.fullName}</span>}>
                <Link to={`${USERS_PATH}/${u.id}`} className="font-medium hover:text-primary hover:underline">
                  {u.fullName}
                </Link>
              </Can>
              {!u.isActive ? <span className="text-xs text-muted-foreground">{t('common.inactive')}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
