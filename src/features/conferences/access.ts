import type { D1Database } from '@cloudflare/workers-types';
import { upsertParticipant, listSessions, getConferenceForProduct } from './db.ts';

export interface ConferenceAccess {
  id: number; order_id: number; order_item_id: number; seat_number: number;
  access_key: string; zoom_url: string; instructions: string; created_at: string; conference_id: number | null;
}
interface ConferenceLine { id: number; product_id: number | null; quantity: number; description: string | null; name: string; slug: string | null; }

/** Idempotently creates a paid-order entitlement for products linked to a managed conference.
 * Legacy slug-based access remains available for existing stores/products. */
export async function ensureConferenceAccessForOrder(db:D1Database, orderId:number, config:{zoomUrl?:string;instructions?:string} = {}):Promise<ConferenceAccess[]> {
  const order = await db.prepare("SELECT id,status,email,refunded_cents,amount_total_cents FROM orders WHERE id=?").bind(orderId)
    .first<{id:number;status:string;email:string|null;refunded_cents:number;amount_total_cents:number}>();
  if (!order || order.status!=='paid' || order.refunded_cents>=order.amount_total_cents || !order.email) return [];
  const {results:lines} = await db.prepare(`SELECT oi.id,oi.product_id,oi.quantity,oi.name,p.description,p.slug
    FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? ORDER BY oi.id`)
    .bind(orderId).all<ConferenceLine>();
  for (const line of lines ?? []) {
    const existing = await db.prepare('SELECT * FROM conference_access WHERE order_item_id=? ORDER BY seat_number LIMIT 1')
      .bind(line.id).first<ConferenceAccess>();
    const linked = !existing && line.product_id ? await getConferenceForProduct(db,line.product_id) : null;
    const legacy = !linked && (line.slug?.trim().toLowerCase() === 'conferencia' || line.name.trim().toLowerCase() === 'conferencia');
    if (!existing && !linked && !legacy) continue;
    let key = existing?.access_key ?? '';
    let zoomUrl = existing?.zoom_url ?? config.zoomUrl?.trim() ?? '';
    let instructions = existing?.instructions ?? (config.instructions?.trim() || line.description?.trim() || '');
    if (!existing && linked) {
      const participant = await upsertParticipant(db,linked.id,'',order.email,orderId);
      key = participant.access_key;
      const sessions = await listSessions(db,linked.id);
      zoomUrl = sessions[0]?.join_url ?? '';
      instructions = [linked.title, linked.description, ...(!sessions.length ? ['Sesiones por programar.'] : []), ...sessions.map((session, index) =>
        `Sesión ${index + 1}: ${session.title}\nFecha y hora: ${session.starts_at} (${session.time_zone})\nDuración: ${session.duration_minutes} minutos\nEnlace Zoom: ${session.join_url ?? 'Pendiente'}\nClave de acceso Zoom: ${session.passcode ?? 'No disponible'}`,
      )].filter(Boolean).join('\n\n');
    } else if (!existing) {
      if (!zoomUrl || !/^https:\/\/(?:[\w-]+\.)?zoom\.us\//i.test(zoomUrl)) throw new Error('Configura una URL Zoom HTTPS o vincula el producto a una conferencia administrada.');
    }
    for(let seat=1;seat<=line.quantity;seat++) {
      const fallbackKey = crypto.randomUUID().replaceAll('-','').slice(0,20).toUpperCase();
      await db.prepare(`INSERT INTO conference_access(order_id,order_item_id,seat_number,access_key,zoom_url,instructions,conference_id)
        VALUES(?,?,?,CASE WHEN ? <> '' AND NOT EXISTS (SELECT 1 FROM conference_access WHERE access_key=?) THEN ? ELSE ? END,?,?,?)
        ON CONFLICT(order_item_id,seat_number) DO NOTHING`)
        .bind(orderId,line.id,seat,seat===1 ? key : '',key,key,fallbackKey,zoomUrl,instructions, existing?.conference_id ?? linked?.id ?? null).run();
    }
  }
  return listConferenceAccessForOrder(db, orderId);
}
export async function listConferenceAccessForOrder(db:D1Database,orderId:number):Promise<ConferenceAccess[]> {
  const {results}=await db.prepare(`SELECT ca.* FROM conference_access ca JOIN orders o ON o.id=ca.order_id
    WHERE ca.order_id=? AND NOT EXISTS (
      SELECT 1 FROM school_extended_manual_access a JOIN customer_accounts account ON account.client_number=a.client_number
      WHERE account.email=COALESCE((SELECT current_email FROM customer_email_aliases WHERE old_email=o.email COLLATE NOCASE),o.email) COLLATE NOCASE
        AND a.resource_type='conference' AND a.resource_id=CAST(ca.conference_id AS TEXT)
        AND a.decision='deny' AND (a.expires_at IS NULL OR date(a.expires_at)>=date('now'))
    ) ORDER BY ca.order_item_id,ca.seat_number`).bind(orderId).all<ConferenceAccess>();
  const accessRows = results ?? [];
  // Read session details from the conference, not the mutable product catalog.
  // Rescheduling and session deletion therefore update historical order views.
  for (const access of accessRows) {
    if (!access.conference_id) continue;
    const conference = await db.prepare('SELECT title, description FROM conferences WHERE id=?').bind(access.conference_id).first<{title:string;description:string}>();
    if (!conference) continue;
    const {results:sessions} = await db.prepare('SELECT title, starts_at, duration_minutes, time_zone, join_url, passcode FROM conference_sessions WHERE conference_id=? ORDER BY starts_at,id').bind(access.conference_id).all<{title:string;starts_at:string;duration_minutes:number;time_zone:string;join_url:string|null;passcode:string|null}>();
    access.zoom_url = sessions?.[0]?.join_url ?? '';
    access.instructions = [conference.title, conference.description, ...(sessions ?? []).map((session,index) =>
      `Sesión ${index+1}: ${session.title}\nFecha y hora: ${session.starts_at} (${session.time_zone})\nDuración: ${session.duration_minutes} minutos\nEnlace Zoom: ${session.join_url ?? 'Pendiente'}\nClave de acceso Zoom: ${session.passcode ?? 'No disponible'}`
    )].filter(Boolean).join('\n\n');
  }
  return accessRows;
}

/** Mark automatic purchase enrollments as confirmed only after the order receipt was sent. */
export async function markOrderConferenceParticipantsInvited(db:D1Database, orderId:number):Promise<void> {
  await db.prepare(`UPDATE conference_participants SET status='invited', invited_at=COALESCE(invited_at,CURRENT_TIMESTAMP), last_email_at=CURRENT_TIMESTAMP
    WHERE email=(SELECT lower(trim(email)) FROM orders WHERE id=?)
      AND conference_id IN (SELECT conference_id FROM conference_access WHERE order_id=?)`).bind(orderId,orderId).run();
}
