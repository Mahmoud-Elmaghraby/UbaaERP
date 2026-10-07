import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import type {
  ProductImportRequestDto,
  ProductImportResultDto,
  ProductImportRowDto,
} from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { useWarehouses } from '../../api/warehouses/queries';
import { VARIANT_LOOKUP_QUERY_KEY } from '../../api/products/queries';
import { ApiError, apiPost } from '../../../../lib/api-client';
import { downloadXlsx, readSpreadsheet } from '../../../../lib/xlsx';
import { normalizeForSearch } from '../../../../lib/search-normalize';

type Field = Exclude<keyof ProductImportRowDto, 'rowNumber'>;

/** Import fields in template order, with the header spellings recognised automatically. */
const FIELDS: { field: Field; synonyms: string[]; required?: boolean }[] = [
  { field: 'code', synonyms: ['الكود', 'كود الصنف', 'رقم الصنف', 'code', 'item code', 'sku', 'internal reference'] },
  { field: 'name', synonyms: ['الاسم', 'اسم الصنف', 'الصنف', 'name', 'item name', 'product'], required: true },
  { field: 'description', synonyms: ['الوصف', 'وصف', 'description'] },
  { field: 'barcode', synonyms: ['الباركود', 'باركود', 'barcode', 'ean'] },
  { field: 'category', synonyms: ['التصنيف', 'تصنيف', 'الفئة', 'المجموعة', 'category'] },
  { field: 'brand', synonyms: ['الماركة', 'ماركة', 'العلامة التجارية', 'brand'] },
  { field: 'unit', synonyms: ['الوحدة', 'وحدة القياس', 'وحده', 'unit', 'uom'] },
  { field: 'itemType', synonyms: ['النوع', 'نوع الصنف', 'type', 'item type'] },
  { field: 'trackingType', synonyms: ['التتبع', 'نوع التتبع', 'tracking'] },
  { field: 'salePrice', synonyms: ['سعر البيع', 'البيع', 'sale price', 'price', 'sales price'] },
  { field: 'purchasePrice', synonyms: ['سعر الشراء', 'الشراء', 'التكلفة', 'purchase price', 'cost'] },
  { field: 'isActive', synonyms: ['نشط', 'الحالة', 'active', 'status'] },
  { field: 'openingQuantity', synonyms: ['رصيد أول المدة', 'الرصيد', 'الكمية', 'opening quantity', 'quantity', 'qty'] },
  { field: 'openingCost', synonyms: ['تكلفة الوحدة', 'تكلفة الرصيد', 'opening cost', 'unit cost'] },
];
const IGNORE = '__ignore__';

function guessField(header: string, taken: Set<Field>): Field | null {
  const key = normalizeForSearch(header);
  for (const { field, synonyms } of FIELDS) {
    if (taken.has(field)) continue;
    if (synonyms.some((synonym) => normalizeForSearch(synonym) === key)) return field;
  }
  return null;
}

/** استيراد الأصناف من Excel: template → upload → map columns → test → import. */
export function ProductImportPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: warehouses } = useWarehouses();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [header, setHeader] = useState<string[]>([]);
  const [body, setBody] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<(Field | null)[]>([]);
  const [mode, setMode] = useState<'create' | 'upsert'>('create');
  const [createMissingCategories, setCreateMissingCategories] = useState(true);
  const [createMissingBrands, setCreateMissingBrands] = useState(true);
  const [createMissingUnits, setCreateMissingUnits] = useState(false);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [openingWarehouseId, setOpeningWarehouseId] = useState('');
  const [result, setResult] = useState<ProductImportResultDto | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);

  const run = useMutation({
    mutationFn: (input: ProductImportRequestDto) => apiPost<ProductImportResultDto>('/products/import', input),
    onSuccess: (data) => {
      if (data.committed) {
        void queryClient.invalidateQueries({ queryKey: ['products'] });
        void queryClient.invalidateQueries({ queryKey: VARIANT_LOOKUP_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ['product-categories'] });
        void queryClient.invalidateQueries({ queryKey: ['product-brands'] });
        void queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      }
    },
  });

  const mapsOpening = mapping.includes('openingQuantity');
  const rows = useMemo<ProductImportRowDto[]>(
    () =>
      body.map((cells, index) => {
        const row: ProductImportRowDto = { rowNumber: index + 2 };
        mapping.forEach((field, column) => {
          if (field && cells[column]) row[field] = cells[column];
        });
        return row;
      }),
    [body, mapping],
  );

  function downloadTemplate() {
    downloadXlsx(
      t('inventory.import.templateName'),
      FIELDS.map(({ synonyms }) => synonyms[0]!),
      [
        ['ITM-1001', 'لبن كامل الدسم 1 لتر', '', '6221234567890', 'أغذية > ألبان', 'جهينة', 'قطعة', 'مخزني', 'بدون', 38.5, 32, 'نعم', 24, 32],
        ['', 'خدمة توصيل', '', '', '', '', 'خدمة', 'خدمة', '', 50, '', 'نعم', '', ''],
      ],
    );
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const table = await readSpreadsheet(file);
      if (table.length < 2) {
        toast.error(t('inventory.import.emptyFile'));
        return;
      }
      const [first, ...rest] = table;
      const taken = new Set<Field>();
      const guessed = first!.map((cell) => {
        const field = guessField(cell, taken);
        if (field) taken.add(field);
        return field;
      });
      setFileName(file.name);
      setHeader(first!);
      setBody(rest);
      setMapping(guessed);
      setResult(null);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === 'old-xls' ? t('inventory.import.oldXls') : t('inventory.import.readError'),
      );
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function submit(dryRun: boolean) {
    if (!mapping.includes('name') && !(mode === 'upsert' && mapping.includes('code'))) {
      toast.error(t('inventory.import.nameRequired'));
      return;
    }
    if (mapsOpening && !openingWarehouseId) {
      toast.error(t('inventory.import.openingWarehouseRequired'));
      return;
    }
    try {
      const data = await run.mutateAsync({
        rows,
        mode,
        dryRun,
        skipInvalid,
        createMissingCategories,
        createMissingBrands,
        createMissingUnits,
        openingWarehouseId: mapsOpening ? openingWarehouseId : null,
      });
      setResult(data);
      if (!dryRun && data.committed) toast.success(t('inventory.import.done', { created: data.created, updated: data.updated }));
      else if (!dryRun) toast.error(t('inventory.import.notCommitted'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  function downloadErrors() {
    if (!result) return;
    const failed = new Map(result.rows.filter((row) => row.status === 'error').map((row) => [row.rowNumber, row]));
    downloadXlsx(
      t('inventory.import.errorsFile'),
      [t('inventory.import.row'), t('inventory.import.error'), ...header],
      body
        .map((cells, index) => ({ cells, rowNumber: index + 2 }))
        .filter(({ rowNumber }) => failed.has(rowNumber))
        .map(({ cells, rowNumber }) => [
          rowNumber,
          failed
            .get(rowNumber)!
            .errors.map((error) => error.message)
            .join('؛ '),
          ...cells,
        ]),
    );
  }

  const shownRows = (result?.rows ?? []).filter((row) => !errorsOnly || row.status === 'error');

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.import.title')}
        description={t('inventory.import.description')}
        actions={
          <Button variant="outline" onClick={downloadTemplate}>
            <Download />
            {t('inventory.import.template')}
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t('inventory.import.fileHint')}</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button onClick={() => inputRef.current?.click()}>
            <Upload />
            {fileName ? t('inventory.import.changeFile') : t('inventory.import.chooseFile')}
          </Button>
          {fileName ? (
            <p className="text-sm">
              {fileName} — {t('inventory.import.rowsCount', { count: body.length })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {header.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('inventory.import.mappingTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {header.map((title, column) => (
                <div key={`${title}-${column}`} className="grid gap-1.5">
                  <Label className="truncate" title={title}>
                    {title || t('inventory.import.column', { number: column + 1 })}
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                      {body[0]?.[column] ? `(${body[0][column]})` : ''}
                    </span>
                  </Label>
                  <Select
                    value={mapping[column] ?? IGNORE}
                    onValueChange={(value) => {
                      const next = mapping.map((field) => (field === value ? null : field));
                      next[column] = value === IGNORE ? null : (value as Field);
                      setMapping(next);
                      setResult(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IGNORE}>{t('inventory.import.ignore')}</SelectItem>
                      {FIELDS.map(({ field }) => (
                        <SelectItem key={field} value={field}>
                          {t(`inventory.import.fields.${field}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{t('inventory.import.mode')}</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create">{t('inventory.import.modes.create')}</SelectItem>
                    <SelectItem value="upsert">{t('inventory.import.modes.upsert')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mapsOpening ? (
                <div className="grid gap-1.5">
                  <Label>{t('inventory.import.openingWarehouse')}</Label>
                  <Select value={openingWarehouseId} onValueChange={setOpeningWarehouseId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('inventory.transfers.pickWarehouse')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(warehouses ?? [])
                        .filter((warehouse) => warehouse.isActive)
                        .map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('inventory.import.openingHint')}</p>
                </div>
              ) : null}
              <div className="grid gap-2 sm:col-span-2">
                {(
                  [
                    [createMissingCategories, setCreateMissingCategories, 'createMissingCategories'],
                    [createMissingBrands, setCreateMissingBrands, 'createMissingBrands'],
                    [createMissingUnits, setCreateMissingUnits, 'createMissingUnits'],
                    [skipInvalid, setSkipInvalid, 'skipInvalid'],
                  ] as const
                ).map(([value, set, key]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={value} onCheckedChange={(checked) => set(checked === true)} />
                    {t(`inventory.import.options.${key}`)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => submit(true)} disabled={run.isPending || rows.length === 0}>
                {t('inventory.import.test')}
              </Button>
              <Button
                onClick={() => submit(false)}
                disabled={run.isPending || rows.length === 0 || !result || !result.dryRun || (result.failed > 0 && !skipInvalid)}
                title={!result ? t('inventory.import.testFirst') : undefined}
              >
                {t('inventory.import.import', { count: rows.length })}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {result.dryRun ? t('inventory.import.testResult') : t('inventory.import.result')}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="success">{t('inventory.import.createdCount', { count: result.created })}</Badge>
              <Badge variant="info">{t('inventory.import.updatedCount', { count: result.updated })}</Badge>
              <Badge variant={result.failed ? 'danger' : 'neutral'}>
                {t('inventory.import.failedCount', { count: result.failed })}
              </Badge>
              {result.failed ? (
                <>
                  <label className="flex items-center gap-2">
                    <Checkbox checked={errorsOnly} onCheckedChange={(checked) => setErrorsOnly(checked === true)} />
                    {t('inventory.import.errorsOnly')}
                  </label>
                  <Button variant="outline" size="sm" onClick={downloadErrors}>
                    <Download />
                    {t('inventory.import.downloadErrors')}
                  </Button>
                </>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-0">
            {result.committed && result.openingCountId ? (
              <p className="px-5 text-sm">
                {t('inventory.import.openingCreated')}{' '}
                <Link className="text-primary underline" to={`/inventory/counts/${result.openingCountId}`}>
                  {t('inventory.import.openOpening')}
                </Link>
              </p>
            ) : null}
            {result.dryRun && result.failed === 0 ? (
              <p className="px-5 text-sm text-muted-foreground">{t('inventory.import.readyHint')}</p>
            ) : null}
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">{t('inventory.import.row')}</TableHead>
                    <TableHead>{t('inventory.import.fields.code')}</TableHead>
                    <TableHead>{t('inventory.import.fields.name')}</TableHead>
                    <TableHead>{t('inventory.import.status')}</TableHead>
                    <TableHead>{t('inventory.import.error')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownRows.slice(0, 1000).map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell dir="ltr" className="text-end">
                        {row.code ?? (row.status === 'create' ? t('inventory.import.autoCode') : '')}
                      </TableCell>
                      <TableCell>{row.name ?? ''}</TableCell>
                      <TableCell>
                        <Badge
                          variant={row.status === 'error' ? 'danger' : row.status === 'update' ? 'info' : 'success'}
                        >
                          {t(`inventory.import.statuses.${row.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-destructive">
                        {row.errors
                          .map((error) =>
                            error.field ? `${t(`inventory.import.fields.${error.field}`)}: ${error.message}` : error.message,
                          )
                          .join('؛ ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
