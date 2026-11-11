import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, type Control, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import {
  saveEmployeeSchema,
  type EmployeeDto,
  type EmployeeStatusDto,
  type SaveEmployeeDto,
  type UserDto,
} from '@erp-platform/contracts';
import {
  buildCustomFieldsSchema,
  Button,
  Can,
  CustomFieldsFormSection,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
  useHasPermission,
} from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { ApiError, apiGet } from '../../../lib/api-client';
import { HR } from '../../../lib/permissions';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';
import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../../components/document/document-layout';
import { AttachmentsPanel } from '../../attachments/components/attachments-panel';
import { useBranches, useCustomFieldDefinitions } from '../../settings/queries';
import {
  useChangeEmployeeStatus,
  useDeleteEmployee,
  useDepartments,
  useEmployee,
  useEmployees,
  useJobTitles,
  useSaveEmployee,
} from '../api/queries';
import { EmployeeStatusBadge } from './employee-status-badge';

const EMPLOYEE_ENTITY_TYPE = 'employee';
const EMPLOYEES_PATH = '/hr/employees';
const NONE = '__none__';

const NULLABLE_TEXT = [
  'code',
  'nationalId',
  'phone',
  'email',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'bankName',
  'bankAccount',
  'notes',
] as const;
const NULLABLE_DATES = ['nationalIdExpiry', 'birthDate'] as const;

/** /hr/employees/new and /hr/employees/:id — the employee file, one form for both. */
export function EmployeeEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: employee, isLoading, isError } = useEmployee(id);
  const { isLoading: definitionsLoading } = useCustomFieldDefinitions(EMPLOYEE_ENTITY_TYPE);
  if ((id && isLoading) || definitionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !employee)) return <EmptyState icon={<FileQuestion />} title={t('hr.employees.notFound')} />;
  return <EmployeeEditor key={employee?.updatedAt ?? 'new'} employee={id ? employee : undefined} />;
}

function EmployeeEditor({ employee }: { employee: EmployeeDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const save = useSaveEmployee();
  const canManage = useHasPermission(HR.employeesManage);
  const readOnly = !canManage || employee?.status === 'terminated';
  const { data: definitions } = useCustomFieldDefinitions(EMPLOYEE_ENTITY_TYPE);
  const { data: departments } = useDepartments();
  const { data: jobTitles } = useJobTitles();
  const { data: colleagues } = useEmployees({ status: 'active' });
  // Branches and users are admin lists — asked for only when the viewer may read them.
  const canListBranches = useHasPermission('settings.manage');
  const canListUsers = useHasPermission('users.manage');
  const { data: branches } = useBranches();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => apiGet<UserDto[]>('/users'), enabled: canListUsers });

  const formSchema = useMemo(() => {
    const base = saveEmployeeSchema.omit({ customFields: true });
    if (!definitions) return base;
    const customFields = buildCustomFieldsSchema(definitions);
    return base.extend({ customFields: employee ? customFields.partial() : customFields });
  }, [definitions, employee]);

  const form = useForm<SaveEmployeeDto>({
    resolver: zodResolver(formSchema as z.ZodType<SaveEmployeeDto>),
    defaultValues: {
      code: employee?.code ?? '',
      fullName: employee?.fullName ?? '',
      nationalId: employee?.nationalId ?? '',
      nationalIdExpiry: employee?.nationalIdExpiry ?? null,
      gender: employee?.gender ?? null,
      birthDate: employee?.birthDate ?? null,
      phone: employee?.phone ?? '',
      email: employee?.email ?? '',
      address: employee?.address ?? '',
      emergencyContactName: employee?.emergencyContactName ?? '',
      emergencyContactPhone: employee?.emergencyContactPhone ?? '',
      branchId: employee?.branchId ?? null,
      departmentId: employee?.departmentId ?? null,
      jobTitleId: employee?.jobTitleId ?? null,
      managerId: employee?.managerId ?? null,
      userId: employee?.userId ?? null,
      hireDate: employee?.hireDate ?? new Date().toISOString().slice(0, 10),
      employmentType: employee?.employmentType ?? 'full_time',
      paymentMethod: employee?.paymentMethod ?? 'cash',
      bankName: employee?.bankName ?? '',
      bankAccount: employee?.bankAccount ?? '',
      notes: employee?.notes ?? '',
      customFields: employee?.customFields ?? {},
    },
  });
  const paymentMethod = form.watch('paymentMethod');

  async function onSubmit(values: SaveEmployeeDto) {
    const input: SaveEmployeeDto = { ...values };
    for (const key of NULLABLE_TEXT) if (typeof input[key] === 'string' && !input[key]?.trim()) input[key] = null;
    for (const key of NULLABLE_DATES) if (!input[key]) input[key] = null;
    try {
      const saved = await save.mutateAsync({ id: employee?.id, input });
      toast.success(t('hr.saved'));
      if (!employee) navigate(`${EMPLOYEES_PATH}/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  // Ctrl/⌘+S saves.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!readOnly && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void form.handleSubmit(onSubmit)();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const control = form.control;
  const managers = (colleagues ?? []).filter((c) => c.id !== employee?.id).map((c) => ({ id: c.id, name: `${c.fullName} (${c.code})` }));

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={EMPLOYEES_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('hr.employees.title')}
          title={employee ? `${employee.fullName} · ${employee.code}` : t('hr.employees.add')}
          status={employee ? <EmployeeStatusBadge status={employee.status} /> : undefined}
          actions={
            readOnly ? undefined : (
              <>
                <Button type="button" variant="outline" onClick={() => navigate(EMPLOYEES_PATH)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={save.isPending} title="Ctrl+S">
                  {t('common.save')}
                </Button>
              </>
            )
          }
        />
        <DocumentBody
          main={
            <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-5">
              {employee?.status === 'terminated' ? (
                <p className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
                  {t('hr.employees.terminatedNotice', { date: employee.terminationDate })}
                </p>
              ) : null}
              <SectionCard title={t('hr.employees.sections.basic')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField control={control} name="fullName" label={t('hr.employees.fullName')} />
                  <TextField control={control} name="code" label={t('hr.employees.code')} placeholder={t('common.autoCodePlaceholder')} dir="ltr" />
                  <TextField control={control} name="hireDate" label={t('hr.employees.hireDate')} type="date" />
                  <ChoiceField
                    control={control}
                    name="employmentType"
                    label={t('hr.employees.employmentType')}
                    options={['full_time', 'part_time', 'temporary', 'trainee'].map((v) => ({ id: v, name: t(`hr.employees.employmentTypes.${v}`) }))}
                  />
                </div>
              </SectionCard>

              <SectionCard title={t('hr.employees.sections.job')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChoiceField control={control} name="jobTitleId" label={t('hr.employees.jobTitle')} nullable options={jobTitles ?? []} />
                  <ChoiceField control={control} name="departmentId" label={t('hr.employees.department')} nullable options={departments ?? []} />
                  <ChoiceField
                    control={control}
                    name="branchId"
                    label={t('hr.employees.branch')}
                    nullable
                    options={withCurrent(canListBranches ? (branches ?? []) : [], employee?.branchId, employee?.branchName)}
                  />
                  <ChoiceField
                    control={control}
                    name="managerId"
                    label={t('hr.employees.manager')}
                    nullable
                    options={withCurrent(managers, employee?.managerId, employee?.managerName)}
                  />
                  <ChoiceField
                    control={control}
                    name="userId"
                    label={t('hr.employees.user')}
                    nullable
                    hint={t('hr.employees.userHint')}
                    options={withCurrent(
                      (users ?? []).map((u) => ({ id: u.id, name: u.fullName })),
                      employee?.userId,
                      employee?.userName,
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard title={t('hr.employees.sections.personal')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField control={control} name="nationalId" label={t('hr.employees.nationalId')} dir="ltr" />
                  <TextField control={control} name="nationalIdExpiry" label={t('hr.employees.nationalIdExpiry')} type="date" />
                  <ChoiceField
                    control={control}
                    name="gender"
                    label={t('hr.employees.gender')}
                    nullable
                    options={['male', 'female'].map((v) => ({ id: v, name: t(`hr.employees.genders.${v}`) }))}
                  />
                  <TextField control={control} name="birthDate" label={t('hr.employees.birthDate')} type="date" />
                  <TextField control={control} name="phone" label={t('hr.employees.phone')} dir="ltr" />
                  <TextField control={control} name="email" label={t('hr.employees.email')} dir="ltr" />
                  <TextField control={control} name="address" label={t('hr.employees.address')} wide />
                  <TextField control={control} name="emergencyContactName" label={t('hr.employees.emergencyContactName')} />
                  <TextField control={control} name="emergencyContactPhone" label={t('hr.employees.emergencyContactPhone')} dir="ltr" />
                </div>
              </SectionCard>

              <SectionCard title={t('hr.employees.sections.pay')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChoiceField
                    control={control}
                    name="paymentMethod"
                    label={t('hr.employees.paymentMethod')}
                    options={['cash', 'bank', 'wallet'].map((v) => ({ id: v, name: t(`hr.employees.paymentMethods.${v}`) }))}
                  />
                  <div className="hidden sm:block" />
                  {paymentMethod !== 'cash' ? (
                    <>
                      <TextField control={control} name="bankName" label={t(paymentMethod === 'wallet' ? 'hr.employees.walletProvider' : 'hr.employees.bankName')} />
                      <TextField control={control} name="bankAccount" label={t(paymentMethod === 'wallet' ? 'hr.employees.walletNumber' : 'hr.employees.bankAccount')} dir="ltr" />
                    </>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard title={t('hr.employees.sections.other')}>
                <div className="grid gap-4">
                  <FormField
                    control={control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('hr.employees.notes')}</FormLabel>
                        <FormControl>
                          <Textarea rows={3} {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {definitions && definitions.length > 0 ? <CustomFieldsFormSection definitions={definitions} /> : null}
                </div>
              </SectionCard>
            </fieldset>
          }
          side={
            employee ? (
              <>
                <Can permission={HR.employeesManage}>
                  <StatusCard employee={employee} />
                </Can>
                <AttachmentsPanel entityType="employee" entityId={employee.id} />
              </>
            ) : undefined
          }
        />
      </form>
    </Form>
  );
}

/** Keeps a saved link visible even when the option list can't be loaded (no permission) or it went inactive. */
function withCurrent(options: { id: string; name: string }[], id: string | null | undefined, name: string | null | undefined) {
  if (!id || options.some((o) => o.id === id)) return options;
  return [{ id, name: name ?? id }, ...options];
}

function TextField({
  control,
  name,
  label,
  placeholder,
  dir,
  type,
  wide,
}: {
  control: Control<SaveEmployeeDto>;
  name: FieldPath<SaveEmployeeDto>;
  label: string;
  placeholder?: string;
  dir?: 'ltr';
  type?: 'date';
  wide?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={wide ? 'sm:col-span-2' : undefined}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              type={type}
              value={(field.value as string | null | undefined) ?? ''}
              placeholder={placeholder}
              dir={dir}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ChoiceField({
  control,
  name,
  label,
  options,
  nullable,
  hint,
}: {
  control: Control<SaveEmployeeDto>;
  name: FieldPath<SaveEmployeeDto>;
  label: string;
  options: { id: string; name: string }[];
  nullable?: boolean;
  hint?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={(field.value as string | null | undefined) || NONE}
            onValueChange={(v) => field.onChange(v === NONE ? null : v)}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {nullable ? <SelectItem value={NONE}>{t('hr.none')}</SelectItem> : null}
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Suspend, reactivate, end service or delete — the actions that aren't plain edits. */
function StatusCard({ employee }: { employee: EmployeeDto }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const change = useChangeEmployeeStatus();
  const remove = useDeleteEmployee();
  const [ending, setEnding] = useState(false);

  async function setStatus(status: EmployeeStatusDto) {
    try {
      await change.mutateAsync({ id: employee.id, input: { status } });
      toast.success(t('hr.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onDelete() {
    if (!(await confirmDialog(t('hr.employees.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(employee.id);
      toast.success(t('hr.deleted'));
      navigate(EMPLOYEES_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <SectionCard title={t('hr.employees.statusTitle')}>
      <div className="grid gap-2">
        {employee.status === 'active' ? (
          <>
            <Button type="button" variant="outline" disabled={change.isPending} onClick={() => setStatus('suspended')}>
              {t('hr.employees.actions.suspend')}
            </Button>
            <Button type="button" variant="outline" className="text-destructive" onClick={() => setEnding(true)}>
              {t('hr.employees.actions.terminate')}
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" disabled={change.isPending} onClick={() => setStatus('active')}>
            {t(employee.status === 'terminated' ? 'hr.employees.actions.rehire' : 'hr.employees.actions.reactivate')}
          </Button>
        )}
        {employee.status === 'suspended' ? (
          <Button type="button" variant="outline" className="text-destructive" onClick={() => setEnding(true)}>
            {t('hr.employees.actions.terminate')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={onDelete}>
          {t('common.delete')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('hr.employees.deleteHint')}</p>
      </div>
      <TerminateDialog employee={employee} open={ending} onClose={() => setEnding(false)} />
    </SectionCard>
  );
}

function TerminateDialog({ employee, open, onClose }: { employee: EmployeeDto; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const change = useChangeEmployeeStatus();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  async function submit() {
    try {
      await change.mutateAsync({ id: employee.id, input: { status: 'terminated', terminationDate: date, terminationReason: reason.trim() || null } });
      toast.success(t('hr.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('hr.employees.actions.terminateTitle', { name: employee.fullName })}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="term-date">{t('hr.employees.terminationDate')}</Label>
            <Input id="term-date" type="date" value={date} min={employee.hireDate} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="term-reason">{t('hr.employees.terminationReason')}</Label>
            <Textarea id="term-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="destructive" disabled={change.isPending || !date} onClick={submit}>
              {t('hr.employees.actions.terminate')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
