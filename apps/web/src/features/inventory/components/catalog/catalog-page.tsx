import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderTree, MoreHorizontal, Plus, Tag } from 'lucide-react';
import type { ProductBrandDto, ProductCategoryDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Combobox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import {
  useCategoryOptions,
  useCreateProductBrand,
  useCreateProductCategory,
  useDeleteProductBrand,
  useDeleteProductCategory,
  useProductBrands,
  useUpdateProductBrand,
  useUpdateProductCategory,
  type CategoryOption,
} from '../../api/catalog/queries';
import { ApiError } from '../../../../lib/api-client';
import { INV } from '../../../../lib/permissions';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Categories (tree) and brands used to classify products — Inventory › التصنيفات والماركات. */
export function CatalogPage() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('inventory.catalog.title')} description={t('inventory.catalog.description')} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CategoriesCard />
        <BrandsCard />
      </div>
    </div>
  );
}

function CategoriesCard() {
  const { t } = useTranslation();
  const { options, isLoading } = useCategoryOptions();
  const deleteCategory = useDeleteProductCategory();
  const [editing, setEditing] = useState<ProductCategoryDto | 'new' | null>(null);
  const [newParentId, setNewParentId] = useState<string | null>(null);

  async function remove(category: ProductCategoryDto) {
    if (!window.confirm(t('inventory.catalog.deleteCategoryConfirm', { name: category.name }))) return;
    try {
      await deleteCategory.mutateAsync(category.id);
      toast.success(t('inventory.catalog.deleted'));
    } catch (err) {
      toast.error(errorMessage(err, t('common.error')));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t('inventory.catalog.categories')}</CardTitle>
        <Can permission={INV.productsManage}>
          <Button
            size="sm"
            onClick={() => {
              setNewParentId(null);
              setEditing('new');
            }}
          >
            <Plus />
            {t('inventory.catalog.newCategory')}
          </Button>
        </Can>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : options.length === 0 ? (
          <EmptyState icon={<FolderTree />} title={t('inventory.catalog.noCategories')} />
        ) : (
          <ul className="divide-y">
            {options.map((option) => (
              <li key={option.id} className="flex items-center gap-2 px-5 py-2.5">
                <span
                  className="min-w-0 flex-1 truncate text-sm"
                  style={{ paddingInlineStart: `${option.depth * 1.25}rem` }}
                >
                  {option.depth > 0 ? <span className="text-muted-foreground">└ </span> : null}
                  <span className={option.depth === 0 ? 'font-medium' : undefined}>{option.category.name}</span>
                </span>
                {!option.isActive ? <Badge variant="neutral">{t('common.inactive')}</Badge> : null}
                <Can permission={INV.productsManage}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setNewParentId(option.id);
                          setEditing('new');
                        }}
                      >
                        {t('inventory.catalog.addSubCategory')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditing(option.category)}>{t('common.edit')}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => remove(option.category)}>{t('common.delete')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Can>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' ? t('inventory.catalog.newCategory') : t('inventory.catalog.editCategory')}
            </DialogTitle>
          </DialogHeader>
          {editing !== null ? (
            <CategoryForm
              key={editing === 'new' ? `new-${newParentId}` : editing.id}
              category={editing === 'new' ? null : editing}
              defaultParentId={newParentId}
              options={options}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CategoryForm({
  category,
  defaultParentId,
  options,
  onDone,
}: {
  category: ProductCategoryDto | null;
  defaultParentId: string | null;
  options: CategoryOption[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateProductCategory();
  const update = useUpdateProductCategory();
  const [name, setName] = useState(category?.name ?? '');
  const [parentId, setParentId] = useState<string | null>(category ? category.parentId : defaultParentId);
  const [isActive, setIsActive] = useState(category?.isActive ?? true);

  // A category can't be its own parent or sit under its own descendants.
  const parentOptions = useMemo(() => {
    if (!category) return options;
    const self = options.find((option) => option.id === category.id);
    return options.filter((option) => option.id !== category.id && !(self && option.path.startsWith(`${self.path} › `)));
  }, [options, category]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      if (category) await update.mutateAsync({ id: category.id, input: { name: name.trim(), parentId, isActive } });
      else await create.mutateAsync({ name: name.trim(), parentId, isActive });
      toast.success(t('inventory.catalog.saved'));
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error')));
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.catalog.name')}</label>
        <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.catalog.parent')}</label>
        <div className="flex gap-2">
          <Combobox
            items={parentOptions}
            value={parentId}
            onValueChange={(id) => setParentId(id)}
            getValue={(option) => option.id}
            getLabel={(option) => option.path}
            placeholder={t('inventory.catalog.topLevel')}
            searchPlaceholder={t('common.search')}
            emptyText={t('common.noResults')}
          />
          {parentId ? (
            <Button type="button" variant="outline" onClick={() => setParentId(null)}>
              {t('inventory.catalog.topLevel')}
            </Button>
          ) : null}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
        {t('common.active')}
      </label>
      <Button type="submit" disabled={create.isPending || update.isPending || !name.trim()}>
        {t('common.save')}
      </Button>
    </form>
  );
}

function BrandsCard() {
  const { t } = useTranslation();
  const { data: brands, isLoading } = useProductBrands();
  const deleteBrand = useDeleteProductBrand();
  const [editing, setEditing] = useState<ProductBrandDto | 'new' | null>(null);

  async function remove(brand: ProductBrandDto) {
    if (!window.confirm(t('inventory.catalog.deleteBrandConfirm', { name: brand.name }))) return;
    try {
      await deleteBrand.mutateAsync(brand.id);
      toast.success(t('inventory.catalog.deleted'));
    } catch (err) {
      toast.error(errorMessage(err, t('common.error')));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t('inventory.catalog.brands')}</CardTitle>
        <Can permission={INV.productsManage}>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus />
            {t('inventory.catalog.newBrand')}
          </Button>
        </Can>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (brands ?? []).length === 0 ? (
          <EmptyState icon={<Tag />} title={t('inventory.catalog.noBrands')} />
        ) : (
          <ul className="divide-y">
            {(brands ?? []).map((brand) => (
              <li key={brand.id} className="flex items-center gap-2 px-5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{brand.name}</span>
                {!brand.isActive ? <Badge variant="neutral">{t('common.inactive')}</Badge> : null}
                <Can permission={INV.productsManage}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(brand)}>{t('common.edit')}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => remove(brand)}>{t('common.delete')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Can>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? t('inventory.catalog.newBrand') : t('inventory.catalog.editBrand')}</DialogTitle>
          </DialogHeader>
          {editing !== null ? (
            <BrandForm
              key={editing === 'new' ? 'new' : editing.id}
              brand={editing === 'new' ? null : editing}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function BrandForm({ brand, onDone }: { brand: ProductBrandDto | null; onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateProductBrand();
  const update = useUpdateProductBrand();
  const [name, setName] = useState(brand?.name ?? '');
  const [isActive, setIsActive] = useState(brand?.isActive ?? true);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      if (brand) await update.mutateAsync({ id: brand.id, input: { name: name.trim(), isActive } });
      else await create.mutateAsync({ name: name.trim(), isActive });
      toast.success(t('inventory.catalog.saved'));
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, t('common.error')));
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.catalog.name')}</label>
        <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
        {t('common.active')}
      </label>
      <Button type="submit" disabled={create.isPending || update.isPending || !name.trim()}>
        {t('common.save')}
      </Button>
    </form>
  );
}
