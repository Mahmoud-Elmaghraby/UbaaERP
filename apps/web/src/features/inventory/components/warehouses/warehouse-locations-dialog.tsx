import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
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
  DialogTrigger,
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

/**
 * Nested "storage locations" management for one warehouse (CLAUDE.md Stage 3
 * decision: every warehouse always has at least one location — the
 * auto-created "default" one — so this list is never truly empty for an
 * existing warehouse, only for a warehouse still being created).
 */
export function WarehouseLocationsDialog({
  warehouse,
  onClose,
}: {
  warehouse: WarehouseDto | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: locations, isLoading } = useWarehouseLocations(warehouse?.id);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseLocationDto | null>(null);
  const deleteLocation = useDeleteWarehouseLocation(warehouse?.id ?? '');

  async function handleDelete(id: string) {
    if (!window.confirm(t('inventory.warehouses.deleteLocationConfirm'))) return;
    try {
      await deleteLocation.mutateAsync(id);
      toast.success(t('inventory.warehouses.deleteLocationSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={warehouse !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('inventory.warehouses.manageLocations')} — {warehouse?.name}
          </DialogTitle>
        </DialogHeader>
        {warehouse ? (
          <div className="grid gap-4">
            <div className="flex justify-end">
              <Can permission="inventory.manage">
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button>{t('inventory.warehouses.newLocation')}</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('inventory.warehouses.newLocation')}</DialogTitle>
                    </DialogHeader>
                    <CreateLocationForm
                      warehouseId={warehouse.id}
                      onDone={() => setAddOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              </Can>
            </div>

            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inventory.warehouses.locationCode')}</TableHead>
                    <TableHead>{t('inventory.warehouses.locationName')}</TableHead>
                    <TableHead>{t('common.active')}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(locations ?? []).map((location) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-medium">{location.code}</TableCell>
                      <TableCell>{location.name}</TableCell>
                      <TableCell>
                        <Badge variant={location.isActive ? 'success' : 'neutral'} dot>
                          {location.isActive ? t('common.active') : t('common.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Can permission="inventory.manage">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(location)}>
                                {t('common.edit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => handleDelete(location.id)}>
                                {t('common.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Can>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(locations ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        {t('common.noResults')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}

            <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('common.edit')}</DialogTitle>
                </DialogHeader>
                {editing ? (
                  <EditLocationForm
                    warehouseId={warehouse.id}
                    location={editing}
                    onDone={() => setEditing(null)}
                  />
                ) : null}
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
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
