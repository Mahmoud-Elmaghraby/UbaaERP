import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Plus } from 'lucide-react';
import {
  createWarehouseLocationSchema,
  updateWarehouseLocationSchema,
  type CreateWarehouseLocationDto,
  type UpdateWarehouseLocationDto,
  type WarehouseDto,
  type WarehouseLocationDto,
} from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
} from '@erp-platform/ui';

import {
  useAddWarehouseLocation,
  useDeleteWarehouseLocation,
  useUpdateWarehouseLocation,
  useWarehouseLocations,
} from '../../api/warehouses/queries';
import { ApiError } from '../../../../lib/api-client';
import { INV } from '../../../../lib/permissions';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { SectionCard } from '../../../../components/document/document-layout';
import { AMOUNT_CELL } from '../../../../components/amount';
import { formatQuantity } from '../../../../components/report/report-format';

/**
 * Storage locations of one warehouse, shown inline on the warehouse page (CLAUDE.md Stage 3
 * decision: every warehouse always has at least one location — the auto-created "default" one).
 * Add / edit stay small dialogs; the list itself is part of the page.
 */
export function WarehouseLocationsSection({
  warehouse,
  onHandByLocation,
}: {
  warehouse: WarehouseDto;
  /** Stock on hand per location id, when the page has it. */
  onHandByLocation?: Map<string, number>;
}) {
  const { t } = useTranslation();
  const { data: locations, isLoading } = useWarehouseLocations(warehouse.id);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseLocationDto | null>(null);
  const deleteLocation = useDeleteWarehouseLocation(warehouse.id);

  async function handleDelete(id: string) {
    if (!(await confirmDialog(t('inventory.warehouses.deleteLocationConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteLocation.mutateAsync(id);
      toast.success(t('inventory.warehouses.deleteLocationSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <SectionCard
      title={t('inventory.warehouses.locationsSection')}
      description={locations ? String(locations.length) : undefined}
      actions={
        <Can permission={INV.settingsManage}>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus />
            {t('inventory.warehouses.newLocation')}
          </Button>
        </Can>
      }
      flush
    >
      {isLoading ? (
        <Skeleton className="m-4 h-24" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('inventory.warehouses.locationCode')}</TableHead>
              <TableHead>{t('inventory.warehouses.locationName')}</TableHead>
              {onHandByLocation ? <TableHead className="text-end">{t('inventory.products.onHand')}</TableHead> : null}
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(locations ?? []).map((location) => (
              <TableRow key={location.id}>
                <TableCell className="font-medium tabular-nums" dir="ltr">{location.code}</TableCell>
                <TableCell>{location.name}</TableCell>
                {onHandByLocation ? (
                  <TableCell className={AMOUNT_CELL}>{formatQuantity(onHandByLocation.get(location.id) ?? 0)}</TableCell>
                ) : null}
                <TableCell>
                  <Badge variant={location.isActive ? 'success' : 'neutral'} dot>
                    {location.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Can permission={INV.settingsManage}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(location)}>{t('common.edit')}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void handleDelete(location.id)}>{t('common.delete')}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Can>
                </TableCell>
              </TableRow>
            ))}
            {(locations ?? []).length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('inventory.warehouses.newLocation')}</DialogTitle>
          </DialogHeader>
          <CreateLocationForm warehouseId={warehouse.id} onDone={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <EditLocationForm warehouseId={warehouse.id} location={editing} onDone={() => setEditing(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function CreateLocationForm({ warehouseId, onDone }: { warehouseId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const addLocation = useAddWarehouseLocation(warehouseId);

  const form = useForm<CreateWarehouseLocationDto>({
    resolver: zodResolver(createWarehouseLocationSchema),
    defaultValues: { code: '', name: '', isActive: true },
  });

  async function onSubmit(values: CreateWarehouseLocationDto) {
    try {
      await addLocation.mutateAsync(values);
      toast.success(t('inventory.warehouses.createLocationSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t('inventory.warehouses.createLocationError'),
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.locationCode')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.locationName')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t('common.active')}</FormLabel>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={addLocation.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

function EditLocationForm({
  warehouseId,
  location,
  onDone,
}: {
  warehouseId: string;
  location: WarehouseLocationDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateLocation = useUpdateWarehouseLocation(warehouseId);

  const form = useForm<UpdateWarehouseLocationDto>({
    resolver: zodResolver(updateWarehouseLocationSchema),
    defaultValues: { code: location.code, name: location.name, isActive: location.isActive },
  });

  async function onSubmit(values: UpdateWarehouseLocationDto) {
    try {
      await updateLocation.mutateAsync({ locationId: location.id, input: values });
      toast.success(t('inventory.warehouses.updateLocationSuccess'));
      onDone();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t('inventory.warehouses.updateLocationError'),
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.locationCode')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inventory.warehouses.locationName')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t('common.active')}</FormLabel>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={updateLocation.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
