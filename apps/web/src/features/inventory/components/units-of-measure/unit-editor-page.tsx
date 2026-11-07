import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Can, EmptyState, Skeleton, toast } from '@erp-platform/ui';
import { FileQuestion, Trash2 } from 'lucide-react';

import { useDeleteUnitOfMeasure, useUnitsOfMeasure } from '../../api/units-of-measure/queries';
import { ApiError } from '../../../../lib/api-client';
import { INV } from '../../../../lib/permissions';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { CreateUnitOfMeasureForm, EditUnitOfMeasureForm } from './unit-form';
import { UNITS_PATH } from './unit-paths';

/** /inventory/units-of-measure/new and /:id/edit — a unit is a short record, so its form is its page. */
export function UnitEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: units, isLoading } = useUnitsOfMeasure();
  const deleteUnit = useDeleteUnitOfMeasure();
  const unit = id ? units?.find((u) => u.id === id) : undefined;
  const derived = unit ? (units ?? []).filter((u) => u.baseUnitId === unit.id) : [];

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && !unit) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={UNITS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  const back = () => navigate(UNITS_PATH, { replace: true });

  async function handleDelete() {
    if (!unit || !(await confirmDialog(t('inventory.unitsOfMeasure.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteUnit.mutateAsync(unit.id);
      toast.success(t('inventory.unitsOfMeasure.deleteSuccess'));
      back();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={UNITS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('inventory.tabs.unitsOfMeasure')}
        title={unit ? t('inventory.unitsOfMeasure.editTitle', { name: unit.name }) : t('inventory.unitsOfMeasure.newUnit')}
        actions={
          unit ? (
            <Can permission={INV.settingsManage}>
              <Button
                variant="ghost"
                className="text-danger hover:bg-danger-soft hover:text-danger"
                disabled={deleteUnit.isPending}
                onClick={() => void handleDelete()}
              >
                <Trash2 />
                {t('common.delete')}
              </Button>
            </Can>
          ) : undefined
        }
      />
      <div className="mx-auto grid w-full max-w-3xl gap-5">
        <SectionCard>
          <div className="pt-5">
            {unit ? (
              <EditUnitOfMeasureForm key={unit.id} units={units ?? []} unit={unit} onDone={back} />
            ) : (
              <CreateUnitOfMeasureForm units={units ?? []} onDone={back} />
            )}
          </div>
        </SectionCard>
        {derived.length > 0 ? (
          <SectionCard title={t('inventory.unitsOfMeasure.derivedUnits')} description={String(derived.length)}>
            <ul className="flex flex-wrap gap-2 pt-4">
              {derived.map((d) => (
                <li key={d.id}>
                  <Link
                    to={`${UNITS_PATH}/${d.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{d.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      = {d.conversionFactor} {unit?.symbol}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
