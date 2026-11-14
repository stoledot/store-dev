import { futureChargeDates, type FrequencyUnit } from './scheduleDates.ts';

export const SCHOOL_TIME_ZONE = 'America/Mexico_City';
const DAY = 86400000;

export function parseSchoolDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())
    || date.toISOString().slice(0, 10) !== value) {
    throw new Error('La fecha del período no es válida.');
  }
  return date;
}

export function addSchoolDays(value: string, days: number): string {
  return new Date(parseSchoolDate(value).getTime() + days * DAY).toISOString().slice(0, 10);
}

export function schoolToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function schoolMidnight(value: string): string {
  const target = parseSchoolDate(value).getTime();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const represented = Date.UTC(part('year'), part('month') - 1, part('day'),
      part('hour'), part('minute'), part('second'));
    const difference = target - represented;
    if (difference === 0) return new Date(instant).toISOString();
    instant += difference;
  }
  throw new Error('No se pudo determinar el inicio del día en la zona horaria escolar.');
}

export interface CalendarPolicy {
  period_start_on: string;
  period_end_on: string;
  frequency_unit: FrequencyUnit;
  frequency_count: number;
  advance_days: number;
  proration_method: 'days' | 'classes';
  class_weekdays: number[];
  class_dates_added: string[];
  class_dates_excluded: string[];
}

export interface PaymentPeriod {
  start: string;
  end: string;
  available: string;
  validFrom: string;
  validUntil: string;
  overdueFrom: string;
}

function shiftEnd(value: string, unit: FrequencyUnit, count: number, occurrence: number): string {
  const date = parseSchoolDate(value);
  if (unit === 'week') return addSchoolDays(value, occurrence * count * 7);
  if (unit === 'once') return value;
  const month = date.getUTCMonth() + occurrence * count * (unit === 'year' ? 12 : 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const wasLast = date.getUTCDate() === new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(date.getUTCFullYear(), month, wasLast ? last : Math.min(date.getUTCDate(), last))).toISOString().slice(0, 10);
}

export function calendarPeriods(policy: CalendarPolicy, today: string): PaymentPeriod[] {
  parseSchoolDate(today);
  parseSchoolDate(policy.period_start_on);
  parseSchoolDate(policy.period_end_on);
  if (policy.period_end_on < policy.period_start_on) throw new Error('El fin del período no puede ser anterior a su inicio.');
  if (!Number.isSafeInteger(policy.advance_days) || policy.advance_days < 0 || policy.advance_days > 366) {
    throw new Error('La anticipación debe ser de 0 a 366 días.');
  }
  const dates = futureChargeDates(policy.period_start_on, policy.frequency_unit, policy.frequency_count, today);
  return dates.map((start, index) => {
    const end = shiftEnd(policy.period_end_on, policy.frequency_unit, policy.frequency_count, index);
    if (end < start || (dates[index + 1] && end >= dates[index + 1])) {
      throw new Error('Los períodos de pago no pueden superponerse.');
    }
    return {
      start, end, available: addSchoolDays(start, -policy.advance_days),
      validFrom: schoolMidnight(start),
      validUntil: schoolMidnight(addSchoolDays(end, 1)),
      overdueFrom: schoolMidnight(addSchoolDays(start, 1)),
    };
  });
}

export function proratedAmount(amount: number, period: PaymentPeriod, from: string, policy: CalendarPolicy): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('El importe del pago no es válido.');
  if (from > period.end) throw new Error('La fecha de ingreso está fuera del período.');
  let total = 0;
  let remaining = 0;
  const added = new Set(policy.class_dates_added);
  const excluded = new Set(policy.class_dates_excluded);
  for (let day = period.start; day <= period.end; day = addSchoolDays(day, 1)) {
    const included = policy.proration_method === 'days'
      || ((!excluded.has(day) && policy.class_weekdays.includes(parseSchoolDate(day).getUTCDay())) || added.has(day));
    if (included) {
      total++;
      if (day >= from) remaining++;
    }
  }
  if (!total || !remaining) throw new Error('No quedan clases para este período; selecciona el siguiente período.');
  if (!Number.isSafeInteger(amount * remaining)) throw new Error('No se puede calcular el importe proporcional.');
  const result = Math.round(amount * remaining / total);
  if (!result) throw new Error('El importe proporcional es menor que la unidad mínima de la moneda.');
  return result;
}

export function hasScheduledClasses(period: PaymentPeriod, policy: CalendarPolicy): boolean {
  const added = new Set(policy.class_dates_added);
  const excluded = new Set(policy.class_dates_excluded);
  for (let day = period.start; day <= period.end; day = addSchoolDays(day, 1)) {
    if ((!excluded.has(day) && policy.class_weekdays.includes(parseSchoolDate(day).getUTCDay())) || added.has(day)) return true;
  }
  return false;
}
