import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { createRoleSchema, type CreateRoleDto, type RoleDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
  PageHeader,
} from '@erp-platform/ui';

import { useCreateRole, usePermissions, useRoles, useUpdateRole } from './queries';
import { ApiError } from '../../lib/api-client';

export function RolesPage() {
  const { t } = useTranslation();
  const { data: roles, isLoading } = useRoles();
  const { data: permissions } = usePermissions();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDto | null>(null);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title={t('roles.title')} />
          <p className="text-sm text-muted-foreground">{t('roles.subtitle')}</p>
        </div>
        <Can permission="roles.manage">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>{t('roles.newRole')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('roles.newRole')}</DialogTitle>
              </DialogHeader>
              <CreateRoleForm onDone={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </Can>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('roles.name')}</TableHead>
              <TableHead>{t('roles.systemRole')}</TableHead>
              <TableHead>{t('roles.permissions')}</TableHead>
              <TableHead>{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(roles ?? []).map((role) => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">{role.name}</TableCell>
                <TableCell>
                  {role.isSystem ? <Badge variant="secondary">{t('roles.systemRole')}</Badge> : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {role.permissionKeys.length}
                </TableCell>
                <TableCell>
                  <Can permission="roles.manage">
                    <Button variant="outline" size="sm" onClick={() => setEditingRole(role)}>
                      {t('common.edit')}
                    </Button>
                  </Can>
                </TableCell>
              </TableRow>
            ))}
            {(roles ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRole?.name}</DialogTitle>
          </DialogHeader>
          {editingRole ? (
            <PermissionMatrixForm
              role={editingRole}
              permissions={permissions ?? []}
              onDone={() => setEditingRole(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateRoleForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createRole = useCreateRole();

  const form = useForm<CreateRoleDto>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { name: '', permissionKeys: [] },
  });

  async function onSubmit(values: CreateRoleDto) {
    try {
      await createRole.mutateAsync(values);
      toast.success(t('roles.createSuccess'));
      onDone();
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('roles.createError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('roles.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={createRole.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

function PermissionMatrixForm({
  role,
  permissions,
  onDone,
}: {
  role: RoleDto;
  permissions: { key: string; description: string }[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateRole = useUpdateRole();
  const [selected, setSelected] = useState<string[]>(role.permissionKeys);

  useEffect(() => setSelected(role.permissionKeys), [role]);

  function toggle(key: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  }

  async function save() {
    try {
      await updateRole.mutateAsync({ id: role.id, input: { permissionKeys: selected } });
      toast.success(t('roles.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {permissions.map((permission) => (
          <label key={permission.key} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(permission.key)}
              onCheckedChange={(checked) => toggle(permission.key, checked === true)}
              disabled={role.isSystem}
            />
            <span>{permission.description}</span>
            <span className="ms-auto text-xs text-muted-foreground">{permission.key}</span>
          </label>
        ))}
      </div>
      <Button onClick={save} disabled={updateRole.isPending || role.isSystem} className="mt-2">
        {t('common.save')}
      </Button>
    </div>
  );
}
