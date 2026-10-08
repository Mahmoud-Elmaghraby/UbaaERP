import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  printTemplateConfigSchema,
  type PrintDocumentDto,
  type PrintTemplateConfigDto,
} from '@erp-platform/contracts';
import {
  Button,
  Can,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
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
  Textarea,
  toast,
} from '@erp-platform/ui';
import { amountInWordsAr } from '@erp-platform/shared-kernel';

import {
  useCreateDocumentTemplate,
  useDocumentTemplates,
  useTenantSettings,
  useUpdateDocumentTemplate,
} from './queries';
import { usePrintDocumentTypes } from '../printing/queries';
import { A4Layout } from '../printing/layouts/a4-layout';
import { ThermalLayout } from '../printing/layouts/thermal-layout';
import { ApiError } from '../../lib/api-client';

const TOGGLES = ['showLogo', 'showSku', 'showUnit', 'showTaxDetails', 'showAmountInWords', 'showSignatures'] as const;

/**
 * Print templates (قوالب الطباعة): one template per printable document type,
 * stored as a JSON config in document_templates and applied by the central
 * print service. A live preview with sample data shows the result.
 */
export function TemplatesTab() {
  const { t } = useTranslation();
  const { data: types, isLoading } = usePrintDocumentTypes();
  const [documentType, setDocumentType] = useState<string>('');

  useEffect(() => {
    if (!documentType && types?.[0]) setDocumentType(types[0].documentType);
  }, [types, documentType]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  const type = types?.find((candidate) => candidate.documentType === documentType);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t('settings.printTemplates.documentType')}</span>
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(types ?? []).map((candidate) => (
                <SelectItem key={candidate.documentType} value={candidate.documentType}>
                  {candidate.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{t('settings.printTemplates.hint')}</p>
      </div>
      {type ? <TemplateEditor key={type.documentType} documentType={type.documentType} label={type.label} paperSizes={type.paperSizes} /> : null}
    </div>
  );
}

function TemplateEditor({
  documentType,
  label,
  paperSizes,
}: {
  documentType: string;
  label: string;
  paperSizes: PrintTemplateConfigDto['paperSize'][];
}) {
  const { t } = useTranslation();
  const { data: templates } = useDocumentTemplates();
  const create = useCreateDocumentTemplate();
  const update = useUpdateDocumentTemplate();
  const existing = useMemo(
    () =>
      (templates ?? [])
        .filter((template) => template.documentType === documentType)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0],
    [templates, documentType],
  );
  const stored = useMemo(() => {
    try {
      return printTemplateConfigSchema.parse(existing?.content ? JSON.parse(existing.content) : {});
    } catch {
      return printTemplateConfigSchema.parse({});
    }
  }, [existing]);

  const form = useForm<PrintTemplateConfigDto>({
    resolver: zodResolver(printTemplateConfigSchema),
    defaultValues: stored,
  });
  useEffect(() => form.reset(stored), [stored, form]);
  const values = form.watch();
  const previewConfig = printTemplateConfigSchema.safeParse(values);

  async function onSubmit(config: PrintTemplateConfigDto) {
    const cleaned = {
      ...config,
      title: config.title?.trim() || null,
      headerNote: config.headerNote?.trim() || null,
      termsText: config.termsText?.trim() || null,
      footerText: config.footerText?.trim() || null,
    };
    try {
      const content = JSON.stringify(cleaned);
      if (existing) await update.mutateAsync({ id: existing.id, input: { content, isDefault: true } });
      else await create.mutateAsync({ documentType, name: label, content, isDefault: true });
      toast.success(t('settings.printTemplates.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.templates.updateError'));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              {paperSizes.length > 1 ? (
                <FormField
                  control={form.control}
                  name="paperSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.printTemplates.paperSize')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {paperSizes.map((size) => (
                            <SelectItem key={size} value={size}>
                              {t(`printing.paper.${size}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.printTemplates.title')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} placeholder={label} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accentColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.printTemplates.accentColor')}</FormLabel>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="h-9 w-12 cursor-pointer rounded border"
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                      <FormControl>
                        <Input dir="ltr" className="w-32" {...field} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-2">
                {TOGGLES.map((name) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                        </FormControl>
                        <FormLabel className="!mt-0 text-sm font-normal">{t(`settings.printTemplates.${name}`)}</FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              {(['headerNote', 'termsText', 'footerText'] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t(`settings.printTemplates.${name}`)}</FormLabel>
                      <FormControl>
                        <Textarea rows={name === 'termsText' ? 4 : 2} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <Can permission="settings.manage">
                <Button type="submit" disabled={create.isPending || update.isPending}>
                  {t('common.save')}
                </Button>
              </Can>
            </form>
          </Form>
        </CardContent>
      </Card>
      <Card className="overflow-auto bg-neutral-100">
        <CardContent className="p-4">
          <p className="mb-2 text-xs text-muted-foreground">{t('settings.printTemplates.preview')}</p>
          <TemplatePreview label={label} config={previewConfig.success ? previewConfig.data : stored} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Sample document rendered with the real layouts, so the preview is exactly what prints. */
function TemplatePreview({ label, config }: { label: string; config: PrintTemplateConfigDto }) {
  const { data: settings } = useTenantSettings();
  const currency = settings?.currencyCode ?? 'EGP';
  const money = (minor: number) => ({ amountMinorUnits: String(minor), currency });
  const sample: PrintDocumentDto = {
    documentType: 'sample',
    id: 'sample',
    title: label,
    number: 'INV-00042',
    status: 'posted',
    statusLabel: null,
    date: new Date().toISOString().slice(0, 10),
    dueDate: null,
    currency,
    company: {
      name: settings?.companyName ?? null,
      address: settings?.address ?? null,
      taxRegistrationNumber: settings?.taxRegistrationNumber ?? null,
      commercialRegister: settings?.commercialRegister ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
      website: settings?.website ?? null,
      logoUrl: settings?.logoUrl ?? null,
    },
    party: { roleLabel: 'العميل', name: 'شركة المثال للتوريدات', code: 'C-001', taxNumber: '100-200-300' },
    fields: [{ label: 'أمر البيع', value: 'SO-00017' }],
    lines: [
      {
        description: 'صنف تجريبي أ',
        sku: 'A-100',
        quantity: 2,
        unit: 'قطعة',
        unitPrice: money(15000),
        amount: money(30000),
        taxes: [{ name: 'ق.م 14%', kind: 'vat', rate: '14', amount: money(4200) }],
      },
      {
        description: 'صنف تجريبي ب',
        sku: 'B-200',
        quantity: 1,
        unit: 'كرتونة',
        unitPrice: money(20000),
        amount: money(20000),
        taxes: [{ name: 'ق.م 14%', kind: 'vat', rate: '14', amount: money(2800) }],
      },
    ],
    totals: {
      netAmount: money(50000),
      vatAmount: money(7000),
      totalAmount: money(57000),
      amountInWords: amountInWordsAr(57000n, currency),
    },
    notes: null,
    paperSizes: ['a4', 'thermal80'],
  };
  return config.paperSize === 'thermal80' ? (
    <div className="mx-auto w-fit bg-white p-3 shadow">
      <ThermalLayout document={sample} template={config} />
    </div>
  ) : (
    <div className="origin-top scale-[0.8]">
      <div className="mx-auto w-fit bg-white p-[12mm] shadow">
        <A4Layout document={sample} template={config} />
      </div>
    </div>
  );
}
