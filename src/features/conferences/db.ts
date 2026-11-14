import type { D1Database } from '@cloudflare/workers-types';
import { enrollmentPaymentValidSql } from '../school/enrollmentEligibility.ts';
import { manualGroupPaymentValidSql } from '../school/manualGroupPayment.ts';

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
  conference_title?: string;
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
      (public_id, conference_id, name, email, access_key, source_order_id, manual_invitation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conference_id, email) DO UPDATE SET
        name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE conference_participants.name END,
        access_key = CASE
          WHEN excluded.source_order_id IS NOT NULL
            AND conference_participants.source_order_id IS NOT excluded.source_order_id
          THEN excluded.access_key
          ELSE conference_participants.access_key
        END,
        source_order_id = COALESCE(excluded.source_order_id, conference_participants.source_order_id),
        manual_invitation = MAX(conference_participants.manual_invitation, excluded.manual_invitation,
          CASE WHEN conference_participants.source_order_id IS NULL THEN 1 ELSE 0 END)`)
    .bind(
      `cp_${crypto.randomUUID().replaceAll('-', '')}`,
      conferenceId,
      name.trim().slice(0, 200),
      normalized,
      accessKey(),
      sourceOrderId,
      sourceOrderId === null ? 1 : 0,
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


/**
 * Retrieves all conferences that a user with the given email is participating in.
 * CREATE TABLE conference_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  time_zone TEXT NOT NULL DEFAULT 'UTC',
  zoom_meeting_id TEXT,
  join_url TEXT,
  passcode TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
 */

const conferenceEntitlementSql = `(
  NOT EXISTS (SELECT 1 FROM school_extended_manual_access a JOIN customer_accounts account ON account.client_number=a.client_number
    WHERE account.email=? COLLATE NOCASE AND a.resource_type='conference' AND a.resource_id=CAST(c.id AS TEXT)
      AND a.decision='deny' AND (a.expires_at IS NULL OR date(a.expires_at)>=date('now')))
  AND (
  (c.status='published' AND EXISTS (SELECT 1 FROM school_extended_manual_access a JOIN customer_accounts account ON account.client_number=a.client_number
    WHERE account.email=? COLLATE NOCASE AND a.resource_type='conference' AND a.resource_id=CAST(c.id AS TEXT)
      AND a.decision='allow' AND (a.expires_at IS NULL OR date(a.expires_at)>=date('now'))))
  OR
  EXISTS (SELECT 1 FROM conference_participants cp WHERE cp.conference_id=c.id
    AND lower(trim(cp.email))=lower(trim(?)) AND (cp.source_order_id IS NULL OR cp.manual_invitation=1))
  OR EXISTS (SELECT 1 FROM conference_access ca JOIN orders o ON o.id=ca.order_id
    WHERE ca.conference_id=c.id AND lower(trim(o.email))=lower(trim(?))
      AND o.status='paid' AND COALESCE(o.refunded_cents,0)<o.amount_total_cents)
  OR (c.status='published' AND EXISTS (
    SELECT 1 FROM school_subprogram_groups g JOIN customer_accounts account ON account.email=? COLLATE NOCASE
    WHERE g.conference_id=c.id AND g.status='active'
      AND ${manualGroupPaymentValidSql('account.client_number', 'g.id')}
      AND NOT EXISTS (SELECT 1 FROM school_manual_access deny WHERE deny.client_number=account.client_number
        AND deny.decision='deny' AND ((deny.resource_type='group' AND deny.resource_id=g.id)
          OR (deny.resource_type='subprogram' AND deny.resource_id=g.subprogram_id))
        AND (deny.expires_at IS NULL OR date(deny.expires_at)>=date('now')))
      AND (EXISTS (SELECT 1 FROM school_manual_access a WHERE a.client_number=account.client_number
        AND a.resource_type='group' AND a.resource_id=g.id AND a.decision='allow'
        AND (a.expires_at IS NULL OR date(a.expires_at)>=date('now')))
      OR EXISTS (SELECT 1 FROM school_subprogram_group_members member
        JOIN school_subprogram_enrollments e ON e.id=member.enrollment_id AND e.subprogram_id=g.subprogram_id
        WHERE member.group_id=g.id AND e.client_number=account.client_number AND ${enrollmentPaymentValidSql}))
  )))
)`;

export async function getUserConferences(
  db: D1Database,
  email: string,
): Promise<Conference[]> {
  return db
    .prepare(`
      SELECT c.*
      FROM conferences c
      WHERE ${conferenceEntitlementSql}
      ORDER BY c.title COLLATE NOCASE,c.id
    `)
    .bind(email, email, email, email, email)
    .all<Conference>()
    .then(result => result.results ?? []);
}

export async function getUserConferencesSessions(
  db: D1Database,
  email: string,
): Promise<ConferenceSession[]> {
  return db
    .prepare(`
      SELECT s.*,c.title AS conference_title
      FROM conference_sessions s
      JOIN conferences c ON c.id = s.conference_id
      WHERE ${conferenceEntitlementSql}
      ORDER BY s.starts_at,s.id
      `)
    .bind(email, email, email, email, email)
    .all<ConferenceSession>()
    .then(result => result.results ?? []);
}