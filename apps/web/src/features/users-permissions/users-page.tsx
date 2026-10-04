import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { createUserSchema, type CreateUserDto, type UserDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
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
  toast,
  PageHeader,
} from '@erp-platform/ui';

import { useCreateUser, useRoles, useSendUserInvite, useUsers } from './queries';
import { UserAccessDialog } from './user-access-dialog';
import { ApiError } from '../../lib/api-client';

export function UsersPage() {
  const { t } = useTranslation();
  const { data: users, isLoading } = useUsers();
  const { data: roles } = useRoles();
  const [open, setOpen] = useState(false);
  const [managingUser, setManagingUser] = useState<UserDto | null>(null);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title={t('users.title')} />
          <p className="text-sm text-muted-foreground">{t('users.subtitle')}</p>
        </div>
        <Can permission="users.manage">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>{t('users.newUser')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('users.newUser')}</DialogTitle>
              </DialogHeader>
              <CreateUserForm roles={roles ?? []} onDone={() => setOpen(false)} />
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
              <TableHead>{t('users.fullName')}</TableHead>
              <TableHead>{t('users.email')}</TableHead>
              <TableHead>{t('users.role')}</TableHead>
              <TableHead>{t('users.status')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(users ?? []).map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.fullName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{roles?.find((r) => r.id === user.roleId)?.name ?? user.roleId}</TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? 'default' : 'secondary'}>
                    {user.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Can permission="users.manage">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setManagingUser(user)}>
                        {t('users.manageAccess')}
                      </Button>
                      <SendInviteButton userId={user.id} />
                    </div>
                  </Can>
                </TableCell>
              </TableRow>
            ))}
            {(users ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      )}

      <UserAccessDialog user={managingUser} onClose={() => setManagingUser(null)} />
    </div>
  );
}

function SendInviteButton({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const sendInvite = useSendUserInvite();

  async function handleClick() {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('users.sendInviteConfirm'))) return;
    try {
      await sendInvite.mutateAsync(userId);
      toast.success(t('users.sendInviteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('users.sendInviteError'));
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={sendInvite.isPending} onClick={() => void handleClick()}>
      {t('users.sendInvite')}
    </Button>
  );
}

function CreateUserForm({
  roles,
  onDone,
}: {
  roles: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createUser = useCreateUser();

  const form = useForm<CreateUserDto>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', password: '', fullName: '', roleId: '', isActive: true },
  });

  async function onSubmit(values: CreateUserDto) {
    try {
      await createUser.mutateAsync(values);
      toast.success(t('users.createSuccess'));
      onDone();
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('users.createError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('users.fullName')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('users.email')}</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('users.password')}</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="roleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('users.role')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={createUser.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
