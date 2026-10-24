import type { D1Database } from '@cloudflare/workers-types';

export interface Conference {
  id: number;
  public_id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ConferenceSession {
  id: number;
  conference_id: number;
  title: string;
  starts_at: string;
  duration_minutes: number;
  time_zone: string;
  zoom_meeting_id: string | null;
  join_url: string | null;
  passcode: string | null;
}

export interface ConferenceParticipant {
  id: number;
  public_id: string;
  conference_id: number;
  name: string;
  email: string;
  access_key: string;
  source_order_id: number | null;
  status: string;
  invited_at: string | null;
  last_email_at: string | null;
  created_at: string;
}

const publicId = () => `conf_${crypto.randomUUID().replaceAll('-', '')}`;
const accessKey = () => crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();

export async function listConferences(db: D1Database): Promise<Conference[]> {
  const { results } = await db
    .prepare('SELECT * FROM conferences ORDER BY created_at DESC')
    .all<Conference>();
  return results ?? [];
}

export async function getConference(db: D1Database, id: number): Promise<Conference | null> {
  return db.prepare('SELECT * FROM conferences WHERE id = ?').bind(id).first<Conference>();
}

export async function createConference(
  db: D1Database,
  title: string,
  description: string,
): Promise<number> {
  const row = await db
    .prepare('INSERT INTO conferences (public_id, title, description) VALUES (?, ?, ?) RETURNING id')
    .bind(publicId(), title.trim().slice(0, 200), description.trim().slice(0, 5000))
    .first<{ id: number }>();
  if (!row) throw new Error('No se pudo crear la conferencia.');
  return row.id;
}

export async function saveConference(
  db: D1Database,
  id: number,
  title: string,
  description: string,
  status: string,
): Promise<void> {
  if (!['draft', 'published', 'cancelled', 'completed'].includes(status)) {
    throw new Error('Estado inválido.');
  }
  await db
    .prepare('UPDATE conferences SET title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(title.trim().slice(0, 200), description.trim().slice(0, 5000), status, id)
    .run();
}

export async function listSessions(db: D1Database, id: number): Promise<ConferenceSession[]> {
  const { results } = await db
    .prepare('SELECT * FROM conference_sessions WHERE conference_id = ? ORDER BY starts_at, id')
    .bind(id)
    .all<ConferenceSession>();
  return results ?? [];
}

export async function addSession(
  db: D1Database,
  session: Omit<ConferenceSession, 'id' | 'zoom_meeting_id' | 'join_url' | 'passcode'> & {
    zoom_meeting_id?: string;
    join_url?: string;
    passcode?: string;
  },
): Promise<void> {
  await db
    .prepare(`INSERT INTO conference_sessions
      (conference_id, title, starts_at, duration_minutes, time_zone, zoom_meeting_id, join_url, passcode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      session.conference_id,
      session.title,
      session.starts_at,
      session.duration_minutes,
      session.time_zone,
      session.zoom_meeting_id ?? null,
      session.join_url ?? null,
      session.passcode ?? null,
    )
    .run();
}


export async function updateSession(
  db: D1Database,
  sessionId: number,
  conferenceId: number,
  input: { title: string; starts_at: string; duration_minutes: number; time_zone: string },
): Promise<void> {
  await db.prepare(`UPDATE conference_sessions SET title=?, starts_at=?, duration_minutes=?, time_zone=? WHERE id=? AND conference_id=?`)
    .bind(input.title.trim().slice(0, 200), input.starts_at.replace('T', ' '), input.duration_minutes, input.time_zone, sessionId, conferenceId).run();
}

export async function deleteSession(db: D1Database, sessionId: number, conferenceId: number): Promise<void> {
  await db.prepare('DELETE FROM conference_sessions WHERE id=? AND conference_id=?').bind(sessionId, conferenceId).run();
}

export async function listParticipants(
  db: D1Database,
  id: number,
): Promise<ConferenceParticipant[]> {
  const { results } = await db
    .prepare('SELECT * FROM conference_participants WHERE conference_id = ? ORDER BY created_at DESC')
    .bind(id)
    .all<ConferenceParticipant>();
  return results ?? [];
}

export async function upsertParticipant(
  db: D1Database,
  conferenceId: number,
  name: string,
  email: string,
  sourceOrderId: number | null = null,
): Promise<ConferenceParticipant> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Correo electrónico inválido.');
  }
  await db
    .prepare(`INSERT INTO conference_participants
      (public_id, conference_id, name, email, access_key, source_order_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(conference_id, email) DO UPDATE SET
        name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE conference_participants.name END,
        access_key = CASE
          WHEN excluded.source_order_id IS NOT NULL
            AND conference_participants.source_order_id IS NOT excluded.source_order_id
          THEN excluded.access_key
          ELSE conference_participants.access_key
        END,
        source_order_id = COALESCE(excluded.source_order_id, conference_participants.source_order_id)`)
    .bind(
      `cp_${crypto.randomUUID().replaceAll('-', '')}`,
      conferenceId,
      name.trim().slice(0, 200),
      normalized,
      accessKey(),
      sourceOrderId,
    )
    .run();
  const row = await db
    .prepare('SELECT * FROM conference_participants WHERE conference_id = ? AND email = ?')
    .bind(conferenceId, normalized)
    .first<ConferenceParticipant>();
  if (!row) throw new Error('No se pudo registrar al participante.');
  return row;
}

export async function markParticipantEmail(
  db: D1Database,
  id: number,
  ok: boolean,
): Promise<void> {
  await db
    .prepare(`UPDATE conference_participants SET
      status = ?,
      invited_at = CASE WHEN ? = 1 THEN COALESCE(invited_at, CURRENT_TIMESTAMP) ELSE invited_at END,
      last_email_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_email_at END
      WHERE id = ?`)
    .bind(ok ? 'invited' : 'failed', ok ? 1 : 0, ok ? 1 : 0, id)
    .run();
}

export async function getConferenceForProduct(
  db: D1Database,
  productId: number,
): Promise<Conference | null> {
  return db
    .prepare(`SELECT c.* FROM conferences c
      JOIN product_conferences pc ON pc.conference_id = c.id
      WHERE pc.product_id = ?`)
    .bind(productId)
    .first<Conference>();
}

export async function setProductConference(
  db: D1Database,
  productId: number,
  conferenceId: number | null,
): Promise<void> {
  if (conferenceId == null) {
    await db.prepare('DELETE FROM product_conferences WHERE product_id = ?').bind(productId).run();
    return;
  }
  await db
    .prepare(`INSERT INTO product_conferences (product_id, conference_id) VALUES (?, ?)
      ON CONFLICT(product_id) DO UPDATE SET conference_id = excluded.conference_id`)
    .bind(productId, conferenceId)
    .run();
}
