import type { ConferenceSession } from './db.ts';

export function sessionStart(session: Pick<ConferenceSession, 'starts_at' | 'time_zone'>): Date {
  const raw = session.starts_at.trim();
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    const instant = new Date(raw);
    if (Number.isNaN(instant.getTime())) throw new Error(`Fecha de conferencia inválida: ${raw}`);
    return instant;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!match) throw new Error(`Fecha de conferencia inválida: ${raw}`);
  const [, year, month, day, hour, minute, second = '0'] = match;
  const expected = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const calendar = new Date(expected);
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() !== Number(month) - 1
      || calendar.getUTCDate() !== Number(day) || calendar.getUTCHours() !== Number(hour)
      || calendar.getUTCMinutes() !== Number(minute) || calendar.getUTCSeconds() !== Number(second)) {
    throw new Error(`Fecha de conferencia inválida: ${raw}`);
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: session.time_zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let instant = expected;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const difference = expected - observed;
    if (!difference) return new Date(instant);
    instant += difference;
  }
  throw new Error(`La fecha ${raw} no existe en la zona ${session.time_zone}.`);
}

export function sortConferenceSessions(sessions: ConferenceSession[]): ConferenceSession[] {
  return sessions.map(session => ({ session, timestamp: sessionStart(session).getTime() }))
    .sort((a, b) => a.timestamp - b.timestamp || a.session.id - b.session.id)
    .map(item => item.session);
}

export function formatConferenceSession(session: ConferenceSession): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: session.time_zone,
  }).format(sessionStart(session));
}
