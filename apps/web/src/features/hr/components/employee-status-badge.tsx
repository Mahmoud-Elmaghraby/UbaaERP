import { useTranslation } from 'react-i18next';
import type { EmployeeStatusDto } from '@erp-platform/contracts';
import { Badge } from '@erp-platform/ui';

const VARIANT: Record<EmployeeStatusDto, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  terminated: 'neutral',
};

export function EmployeeStatusBadge({ status }: { status: EmployeeStatusDto }) {
  const { t } = useTranslation();
  return (
    <Badge variant={VARIANT[status]} dot>
      {t(`hr.employees.statuses.${status}`)}
    </Badge>
  );
}
