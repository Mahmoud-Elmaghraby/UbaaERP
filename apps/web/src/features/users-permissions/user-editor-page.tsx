import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserDto,
  type RoleDto,
  type UpdateUserDto,
  type UserDto,
} from '@erp-platform/contracts';
import {
  Button,
  Checkbox,
  EmptyState,
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
  toast,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useCreateUser, useRoles, useUpdateUser, useUser } from './queries';
import { ApiError } from '../../lib/api-client';
import { DocumentHeaderBar, SectionCard } from '../../components/document/document-layout';
import { useSaveShortcut } from '../../lib/use-save-shortcut';
import { PasswordInput } from './password-input';
import { USERS_PATH } from './user-paths';

/** /users/new and /users/:id/edit. The e-mail is the sign-in name, so it is fixed after creation. */
export function UserEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, isError } = useUser(id);
  const { data: roles, isLoading: rolesLoading } = useRoles();

  if ((id && isLoading) || rolesLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !user)) {
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

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={user ? `${USERS_PATH}/${user.id}` : USERS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('users.title')}
        title={user ? t('users.editTitle', { name: user.fullName }) : t('users.newUser')}
      />
      <div className="mx-auto w-full max-w-2xl">
        <SectionCard>
          <div className="pt-5">
            {user ? <EditUserForm user={user} roles={roles ?? []} /> : <CreateUserForm roles={roles ?? []} />}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function RoleField({ roles, value, onChange }: { roles: RoleDto[]; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <Select onValueChange={onChange} value={value}>
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder={t('users.pickRole')} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
            {role.isSystem ? ` — ${t('users.allPermissions')}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateUserForm({ roles }: { roles: RoleDto[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createUser = useCreateUser();
  const form = useForm<CreateUserDto>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', password: '', fullName: '', roleId: '', isActive: true },
  });

  async function onSubmit(values: CreateUserDto) {
    try {
      const created = await createUser.mutateAsync(values);
      toast.success(t('users.createSuccess'));
      navigate(`${USERS_PATH}/${created.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('users.createError'));
    }
  }
  useSaveShortcut(() => void form.handleSubmit(onSubmit)());

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
                <Input {...field} autoFocus />
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
                <Input type="email" dir="ltr" autoComplete="off" {...field} />
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
              <PasswordInput value={field.value} onChange={field.onChange} />
              <p className="text-xs text-muted-foreground">{t('users.passwordRule')}</p>
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
              <RoleField roles={roles} value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={createUser.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function EditUserForm({ user, roles }: { user: UserDto; roles: RoleDto[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateUser = useUpdateUser();
  const form = useForm<UpdateUserDto>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { fullName: user.fullName, roleId: user.roleId, isActive: user.isActive },
  });

  async function onSubmit(values: UpdateUserDto) {
    try {
      await updateUser.mutateAsync({ id: user.id, input: values });
      toast.success(t('users.updateSuccess'));
      navigate(`${USERS_PATH}/${user.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }
  useSaveShortcut(() => void form.handleSubmit(onSubmit)());

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t('users.email')}</span>
          <span className="text-sm text-muted-foreground" dir="ltr">
            {user.email}
          </span>
        </div>
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('users.fullName')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
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
              <RoleField roles={roles} value={field.value ?? ''} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value ?? true} onCheckedChange={(checked) => field.onChange(checked === true)} />
              </FormControl>
              <FormLabel className="font-normal">{t('users.canSignIn')}</FormLabel>
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={updateUser.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
