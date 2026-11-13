import { describe, expect, it } from 'vitest';
import { sessionStart, sortConferenceSessions } from './dates';
import type { ConferenceSession } from './db';

describe('sessionStart', () => {
  it('interprets the scheduled wall time in the conference time zone', () => {
    expect(sessionStart({ starts_at: '2026-01-15 10:00', time_zone: 'America/Mexico_City' }).toISOString())
      .toBe('2026-01-15T16:00:00.000Z');
    expect(sessionStart({ starts_at: '2026-07-15 10:00', time_zone: 'America/New_York' }).toISOString())
      .toBe('2026-07-15T14:00:00.000Z');
  });

  it('respects explicit offsets and rejects nonexistent local times', () => {
    expect(sessionStart({ starts_at: '2026-01-15T10:00:00Z', time_zone: 'America/Mexico_City' }).toISOString())
      .toBe('2026-01-15T10:00:00.000Z');
    expect(() => sessionStart({ starts_at: '2026-03-08 02:30', time_zone: 'America/New_York' })).toThrow();
    expect(() => sessionStart({ starts_at: '2026-02-31 10:00', time_zone: 'UTC' })).toThrow();
    expect(() => sessionStart({ starts_at: '2026-01-15 10:00', time_zone: 'Invalid/Zone' })).toThrow();
  });

  it('orders sessions by actual instant rather than local clock time', () => {
    const sessions: ConferenceSession[] = [
      { id: 1, conference_id: 1, title: 'México', starts_at: '2026-01-15 09:00', time_zone: 'America/Mexico_City', duration_minutes: 60, zoom_meeting_id: null, join_url: null, passcode: null },
      { id: 2, conference_id: 2, title: 'UTC', starts_at: '2026-01-15 12:00', time_zone: 'UTC', duration_minutes: 60, zoom_meeting_id: null, join_url: null, passcode: null },
    ];
    expect(sortConferenceSessions(sessions).map(session => session.id)).toEqual([2, 1]);
  });
});
