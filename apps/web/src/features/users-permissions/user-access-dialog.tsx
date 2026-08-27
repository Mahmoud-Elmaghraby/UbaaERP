import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

const NO_MANAGER = '__no_manager__';

/**
 * Branch-access + manager (approval-chain) editing for one user. Both
 * endpoints already exist on the backend (UsersController's
 * /:id/branch-access and /:id/manager, see users.controller.ts) — this is
 * pure frontend wiring, no new API surface.
 */
export function UserAccessDialog({
  user,
  onClose,
}: {
  user: UserDto | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('users.manageAccess')} — {user?.fullName}
          </DialogTitle>
        </DialogHeader>
        {user ? (
          <div className="grid gap-6">
            <BranchAccessSection userId={user.id} />
            <ManagerSection userId={user.id} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BranchAccessSection({ userId }: { userId: string }) {
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
    <div className="grid gap-2">
      <p className="text-sm font-medium">{t('users.branchAccess')}</p>
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
  );
}

function ManagerSection({ userId }: { userId: string }) {
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
    <div className="grid gap-2">
      <p className="text-sm font-medium">{t('users.manager')}</p>
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
  );
}
