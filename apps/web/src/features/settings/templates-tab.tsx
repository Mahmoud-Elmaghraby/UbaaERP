import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import {
  createDocumentTemplateSchema,
  updateDocumentTemplateSchema,
  type CreateDocumentTemplateDto,
  type DocumentTemplateDto,
  type UpdateDocumentTemplateDto,
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
  Textarea,
  toast,
} from '@erp-platform/ui';

import {
  useCreateDocumentTemplate,
  useDeleteDocumentTemplate,
  useDocumentTemplates,
  useUpdateDocumentTemplate,
} from './queries';
import { ApiError } from '../../lib/api-client';

export function TemplatesTab() {
  const { t } = useTranslation();
  const { data: templates, isLoading } = useDocumentTemplates();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentTemplateDto | null>(null);
  const deleteTemplate = useDeleteDocumentTemplate();

  async function handleDelete(id: string) {
    if (!window.confirm(t('settings.templates.deleteConfirm'))) return;
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success(t('settings.templates.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('settings.tabs.templates')}</p>
        <Can permission="settings.manage">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>{t('settings.templates.newTemplate')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('settings.templates.newTemplate')}</DialogTitle>
              </DialogHeader>
              <CreateTemplateForm onDone={() => setCreateOpen(false)} />
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
              <TableHead>{t('settings.templates.documentType')}</TableHead>
              <TableHead>{t('settings.templates.name')}</TableHead>
              <TableHead>{t('settings.templates.isDefault')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(templates ?? []).map((template) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">{template.documentType}</TableCell>
                <TableCell>{template.name}</TableCell>
                <TableCell>
                  {template.isDefault ? (
                    <Badge>{t('settings.templates.defaultBadge')}</Badge>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  <Can permission="settings.manage">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(template)}>
                          {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleDelete(template.id)}>
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Can>
                </TableCell>
              </TableRow>
            ))}
            {(templates ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
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
          {editing ? <EditTemplateForm template={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateTemplateForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createTemplate = useCreateDocumentTemplate();

  const form = useForm<CreateDocumentTemplateDto>({
    resolver: zodResolver(createDocumentTemplateSchema),
    defaultValues: { documentType: '', name: '', content: '', isDefault: false },
  });

  async function onSubmit(values: CreateDocumentTemplateDto) {
    try {
      await createTemplate.mutateAsync(values);
      toast.success(t('settings.templates.createSuccess'));
      onDone();
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.templates.createError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="documentType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.templates.documentType')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder="sales_invoice" />
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
              <FormLabel>{t('settings.templates.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.templates.content')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={6} dir="ltr" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isDefault"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t('settings.templates.isDefault')}</FormLabel>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={createTemplate.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

function EditTemplateForm({
  template,
  onDone,
}: {
  template: DocumentTemplateDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateTemplate = useUpdateDocumentTemplate();

  const form = useForm<UpdateDocumentTemplateDto>({
    resolver: zodResolver(updateDocumentTemplateSchema),
    defaultValues: { name: template.name, content: template.content, isDefault: template.isDefault },
  });

  async function onSubmit(values: UpdateDocumentTemplateDto) {
    try {
      await updateTemplate.mutateAsync({ id: template.id, input: values });
      toast.success(t('settings.templates.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.templates.updateError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.templates.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.templates.content')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={6} dir="ltr" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isDefault"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t('settings.templates.isDefault')}</FormLabel>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={updateTemplate.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
