import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Can,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import { useBranches } from '../settings/queries';
import {
  useSetUserBranchAccess,
  useSetUserManager,
  useUserBranchAccess,
  useUserManager,
  useUsers,
} from './queries';
import { ApiError } from '../../lib/api-client';
import { SectionCard } from '../../components/document/document-layout';

const NO_MANAGER = '__no_manager__';

/**
 * Branch access and direct manager (approval chain) of one user, as sections of the user page.
 * Both endpoints are UsersController's /:id/branch-access and /:id/manager.
 */
export function BranchAccessSection({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const { data: access, isLoading: accessLoading } = useUserBranchAccess(userId);
  const setBranchAccess = useSetUserBranchAccess(userId);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(access?.branchIds ?? []);
  }, [access]);

  function toggle(branchId: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, branchId] : prev.filter((id) => id !== branchId)));
  }

  async function save() {
    try {
      await setBranchAccess.mutateAsync({ branchIds: selected });
      toast.success(t('users.accessSaveSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('users.accessSaveError'));
    }
  }

  const isLoading = branchesLoading || accessLoading;

  return (
    <SectionCard title={t('users.branchAccess')} description={t('users.branchAccessHint')}>
      <div className="grid gap-3 pt-4">
      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="grid gap-2 rounded-md border p-3">
          {(branches ?? []).map((branch) => (
            <label key={branch.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(branch.id)}
                onCheckedChange={(checked) => toggle(branch.id, checked === true)}
              />
              <span>{branch.name}</span>
            </label>
          ))}
          {(branches ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('common.noResults')}</p>
          ) : null}
        </div>
      )}
      <Can permission="users.manage">
        <Button
          size="sm"
          onClick={save}
          disabled={setBranchAccess.isPending || isLoading}
          className="justify-self-start"
        >
          {t('common.save')}
        </Button>
      </Can>
      </div>
    </SectionCard>
  );
}

export function ManagerSection({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data: users } = useUsers();
  const { data: manager, isLoading } = useUserManager(userId);
  const setManager = useSetUserManager(userId);
  const [managerId, setManagerId] = useState<string>(NO_MANAGER);

  useEffect(() => {
    setManagerId(manager?.managerId ?? NO_MANAGER);
  }, [manager]);

  async function save() {
    try {
      await setManager.mutateAsync({ managerId: managerId === NO_MANAGER ? null : managerId });
      toast.success(t('users.managerSaveSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('users.managerSaveError'));
    }
  }

  const candidates = (users ?? []).filter((candidate) => candidate.id !== userId);

  return (
    <SectionCard title={t('users.manager')} description={t('users.managerHint')}>
      <div className="grid gap-3 pt-4">
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <Select value={managerId} onValueChange={setManagerId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MANAGER}>{t('users.noManager')}</SelectItem>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Can permission="users.manage">
        <Button
          size="sm"
          onClick={save}
          disabled={setManager.isPending || isLoading}
          className="justify-self-start"
        >
          {t('common.save')}
        </Button>
      </Can>
      </div>
    </SectionCard>
  );
}
