export type FrequencyUnit = 'once' | 'week' | 'month' | 'year';

function parseDate(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Fecha de programación inválida.');
  }
  return parsed;
}

function addMonths(date: Date, count: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + count;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

export function validityEnd(paidAt: Date, count: number | null, unit: string | null): string | null {
  if (count === null && unit === null) return null;
  if (!Number.isSafeInteger(count) || count === null || count < 1 || !unit || !['day', 'week', 'month', 'year'].includes(unit)) {
    throw new Error('Vigencia de pago inválida.');
  }
  if (unit === 'day' || unit === 'week') {
    return new Date(paidAt.getTime() + count * (unit === 'week' ? 7 : 1) * 86400000).toISOString();
  }
  const date = addMonths(paidAt, count * (unit === 'year' ? 12 : 1));
  date.setUTCHours(paidAt.getUTCHours(), paidAt.getUTCMinutes(), paidAt.getUTCSeconds(), paidAt.getUTCMilliseconds());
  return date.toISOString();
}

export function futureChargeDates(anchor: string, unit: FrequencyUnit, count: number, today: string): string[] {
  if (!Number.isSafeInteger(count) || count < 1 || !['once', 'week', 'month', 'year'].includes(unit)
    || (unit === 'once' && count !== 1)) throw new Error('Frecuencia de pago inválida.');
  const start = parseDate(anchor);
  const end = addMonths(parseDate(today), 12);
  const dates: string[] = [];
  for (let occurrence = 0; ; occurrence++) {
    const date = unit === 'week'
      ? new Date(start.getTime() + occurrence * count * 7 * 86400000)
      : addMonths(start, occurrence * count * (unit === 'year' ? 12 : 1));
    if (date >= end) break;
    dates.push(date.toISOString().slice(0, 10));
    if (unit === 'once') break;
    if (dates.length > 2000) throw new Error('La programación contiene demasiados cargos; requiere revisión.');
  }
  return dates;
}
