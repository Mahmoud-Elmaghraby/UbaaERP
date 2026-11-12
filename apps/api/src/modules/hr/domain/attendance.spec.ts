import { datesBetween, dayKind, evaluateDay, punchWindow, scheduledMinutes, shiftEnd, weekdayOf, type ShiftRule } from './attendance';
import { parseDate, parsePunch, parseTime } from './punch-parse';

const day: ShiftRule = { startMinute: 540, endMinute: 1020, graceMinutes: 15, breakMinutes: 0, weeklyOffDays: [5] }; // 09–17, Fri off
const night: ShiftRule = { startMinute: 1320, endMinute: 360, graceMinutes: 10, breakMinutes: 60, weeklyOffDays: [] }; // 22–06

describe('shift arithmetic', () => {
  it('handles day and night shifts', () => {
    expect(scheduledMinutes(day)).toBe(480);
    expect(shiftEnd(night)).toBe(1320 + 480);
    expect(scheduledMinutes(night)).toBe(420);
    expect(punchWindow(day)).toEqual({ from: 300, to: 1740 });
  });

  it('knows weekdays, weekends and holidays', () => {
    expect(weekdayOf('2026-11-13')).toBe(5); // a Friday
    expect(dayKind('2026-11-13', day, new Set())).toBe('weekend');
    expect(dayKind('2026-11-12', day, new Set(['2026-11-12']))).toBe('holiday');
    expect(dayKind('2026-11-12', day, new Set())).toBe('work');
    expect(datesBetween('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });
});

describe('evaluateDay', () => {
  it('marks absence and a missing punch', () => {
    expect(evaluateDay('work', day, [], 30)).toMatchObject({ status: 'absent', workedMinutes: 0 });
    expect(evaluateDay('weekend', day, [], 30).status).toBe('weekend');
    expect(evaluateDay('work', day, [545], 30)).toMatchObject({ status: 'present', missingPunch: true, checkInMinute: 545, checkOutMinute: null });
  });

  it('forgives lateness within grace, counts it from the start beyond it', () => {
    expect(evaluateDay('work', day, [550, 1020], 30).lateMinutes).toBe(0);
    expect(evaluateDay('work', day, [560, 1020], 30).lateMinutes).toBe(20);
  });

  it('counts early leave and overtime over the threshold only', () => {
    const r = evaluateDay('work', day, [540, 700, 990], 30);
    expect(r).toMatchObject({ checkInMinute: 540, checkOutMinute: 990, earlyLeaveMinutes: 30, workedMinutes: 450, overtimeMinutes: 0 });
    expect(evaluateDay('work', day, [540, 1040], 30).overtimeMinutes).toBe(0); // 20 min < 30
    expect(evaluateDay('work', day, [540, 1080], 30).overtimeMinutes).toBe(60);
  });

  it('treats every minute on a holiday as overtime, without lateness', () => {
    expect(evaluateDay('holiday', day, [600, 840], 30)).toMatchObject({ status: 'holiday', workedMinutes: 240, overtimeMinutes: 240, lateMinutes: 0 });
  });

  it('runs a night shift across midnight with its break', () => {
    // in 22:05, out 06:00 next day (1440 + 360)
    const r = evaluateDay('work', night, [1325, 1800], 30);
    expect(r).toMatchObject({ lateMinutes: 0, workedMinutes: 475 - 60, earlyLeaveMinutes: 0, overtimeMinutes: 0 });
  });
});

describe('punch parsing', () => {
  it('reads dates in the common shapes', () => {
    expect(parseDate('2026-11-03', 'dmy')).toBe('2026-11-03');
    expect(parseDate('3/11/2026', 'dmy')).toBe('2026-11-03');
    expect(parseDate('11/3/2026', 'mdy')).toBe('2026-11-03');
    expect(parseDate('٠٣/١١/٢٠٢٦', 'dmy')).toBe('2026-11-03');
    expect(parseDate('31/2/2026', 'dmy')).toBeNull();
    expect(parseDate('46329', 'dmy')).toBe('2026-11-03');
  });

  it('reads times in 24h, AM/PM and Arabic markers', () => {
    expect(parseTime('08:05')).toBe(485);
    expect(parseTime('8:05:40')).toBe(485);
    expect(parseTime('8:05 PM')).toBe(1205);
    expect(parseTime('12:10 am')).toBe(10);
    expect(parseTime('08:05 م')).toBe(1205);
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('0.5')).toBe(720);
  });

  it('reads a date-time in one cell or two', () => {
    expect(parsePunch('2026-11-03 08:05:12', undefined, 'dmy')).toEqual({ date: '2026-11-03', minute: 485 });
    expect(parsePunch('2026-11-03T17:30', undefined, 'dmy')).toEqual({ date: '2026-11-03', minute: 1050 });
    expect(parsePunch('3/11/2026', '5:30 PM', 'dmy')).toEqual({ date: '2026-11-03', minute: 1050 });
    expect(parsePunch('46329.3368055556', undefined, 'dmy')).toEqual({ date: '2026-11-03', minute: 485 });
    expect(parsePunch('2026-11-03', undefined, 'dmy')).toBeNull();
    expect(parsePunch('garbage', '08:00', 'dmy')).toBeNull();
  });
});
