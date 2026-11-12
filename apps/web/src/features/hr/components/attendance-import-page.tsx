import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AttendanceDateFormatDto, AttendanceImportResultDto } from '@erp-platform/contracts';
import { Button, Input, Label, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from '@erp-platform/ui';
import { FileSpreadsheet } from 'lucide-react';

import { ApiError } from '../../../lib/api-client';
import { readSpreadsheet } from '../../../lib/xlsx';
import { SectionCard } from '../../../components/document/document-layout';
import { useImportAttendance } from '../api/queries';

const NONE = '__none__';
const KEY_HINT = /(id|no|code|رقم|كود|الموظف|emp|user|ac-no)/i;
const DATE_HINT = /(date|time|تاريخ|وقت|الوقت|check|clock)/i;

/** Import from any fingerprint device: pick the file, say which column is which, done. */
export function AttendanceImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const importAttendance = useImportAttendance();
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][] | null>(null);
  const [keyCol, setKeyCol] = useState(0);
  const [dateCol, setDateCol] = useState(1);
  const [timeCol, setTimeCol] = useState(-1);
  const [dateFormat, setDateFormat] = useState<AttendanceDateFormatDto>('dmy');
  const [result, setResult] = useState<AttendanceImportResultDto | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setResult(null);
    try {
      const rows = (await readSpreadsheet(file)).filter((r) => r.some((c) => c.trim()));
      if (rows.length < 2) throw new Error('empty');
      const header = rows[0]!;
      // Guess the columns from the header names; the user can change them.
      const key = header.findIndex((h) => KEY_HINT.test(h));
      const dates = header.map((h, i) => (DATE_HINT.test(h) && i !== key ? i : -1)).filter((i) => i >= 0);
      setKeyCol(key >= 0 ? key : 0);
      setDateCol(dates[0] ?? Math.min(1, header.length - 1));
      setTimeCol(dates.length > 1 ? dates[1]! : -1);
      setFileName(file.name);
      setTable(rows);
    } catch {
      toast.error(t('hr.attendanceImport.unreadable'));
    }
  }

  async function submit() {
    if (!table) return;
    const rows = table.slice(1).map((r) => ({
      employeeKey: r[keyCol] ?? '',
      date: r[dateCol] ?? '',
      time: timeCol >= 0 ? (r[timeCol] ?? '') : undefined,
    }));
    try {
      setResult(await importAttendance.mutateAsync({ fileName, dateFormat, rows }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const header = table?.[0] ?? [];
  const columnSelect = (value: number, onChange: (v: number) => void, optional = false) => (
    <Select value={value < 0 ? NONE : String(value)} onValueChange={(v) => onChange(v === NONE ? -1 : Number(v))}>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {optional ? <SelectItem value={NONE}>{t('hr.attendanceImport.sameCell')}</SelectItem> : null}
        {header.map((h, i) => (
          <SelectItem key={i} value={String(i)}>
            {h || t('hr.attendanceImport.column', { n: i + 1 })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="grid gap-5">
      <PageHeader title={t('hr.attendanceImport.title')} description={t('hr.attendanceImport.subtitle')} />
      <SectionCard title={t('hr.attendanceImport.step1')}>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm hover:bg-muted/40">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          <span>{fileName || t('hr.attendanceImport.pickFile')}</span>
          <Input type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      </SectionCard>

      {table ? (
        <SectionCard title={t('hr.attendanceImport.step2')} description={t('hr.attendanceImport.rows', { count: table.length - 1 })}>
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-4">
              <div className="grid gap-1.5">
                <Label>{t('hr.attendanceImport.keyColumn')}</Label>
                {columnSelect(keyCol, setKeyCol)}
              </div>
              <div className="grid gap-1.5">
                <Label>{t('hr.attendanceImport.dateColumn')}</Label>
                {columnSelect(dateCol, setDateCol)}
              </div>
              <div className="grid gap-1.5">
                <Label>{t('hr.attendanceImport.timeColumn')}</Label>
                {columnSelect(timeCol, setTimeCol, true)}
              </div>
              <div className="grid gap-1.5">
                <Label>{t('hr.attendanceImport.dateFormat')}</Label>
                <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as AttendanceDateFormatDto)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['dmy', 'mdy', 'ymd'] as const).map((f) => (
                      <SelectItem key={f} value={f}>
                        {t(`hr.attendanceImport.formats.${f}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('hr.attendanceImport.keyHint')}</p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {header.map((h, i) => (
                      <th
                        key={i}
                        className={`px-3 py-2 text-start font-medium ${[keyCol, dateCol, timeCol].includes(i) ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        {h || t('hr.attendanceImport.column', { n: i + 1 })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.slice(1, 6).map((r, ri) => (
                    <tr key={ri} className="border-t">
                      {header.map((_, i) => (
                        <td key={i} className="px-3 py-1.5 tabular-nums" dir="ltr">
                          {r[i] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button onClick={submit} disabled={importAttendance.isPending}>
                {t('hr.attendanceImport.run')}
              </Button>
              <Button variant="outline" onClick={() => navigate('/hr/attendance')}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {result ? (
        <SectionCard title={t('hr.attendanceImport.result')}>
          <ul className="grid gap-1.5 text-sm">
            <li>{t('hr.attendanceImport.imported', { count: result.imported, total: result.rowsTotal })}</li>
            {result.duplicates ? <li className="text-muted-foreground">{t('hr.attendanceImport.duplicates', { count: result.duplicates })}</li> : null}
            {result.from ? <li>{t('hr.attendanceImport.period', { from: result.from, to: result.to, days: result.days })}</li> : null}
            {result.unmatchedRows ? (
              <li className="text-warning">
                {t('hr.attendanceImport.unmatched', { count: result.unmatchedRows })} <span dir="ltr">{result.unmatchedKeys.join('، ')}</span>
              </li>
            ) : null}
            {result.invalidRows.length ? (
              <li className="text-destructive">{t('hr.attendanceImport.invalid', { rows: result.invalidRows.map((n) => n + 1).join('، ') })}</li>
            ) : null}
          </ul>
          <Button className="mt-4" onClick={() => navigate('/hr/attendance')}>
            {t('hr.attendanceImport.openSheet')}
          </Button>
        </SectionCard>
      ) : null}
    </div>
  );
}
