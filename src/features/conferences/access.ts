import type { D1Database } from '@cloudflare/workers-types';
import { upsertParticipant, listSessions, getConferenceForProduct } from './db';

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
    const linked = line.product_id ? await getConferenceForProduct(db,line.product_id) : null;
    const legacy = !linked && (line.slug?.trim().toLowerCase() === 'conferencia' || line.name.trim().toLowerCase() === 'conferencia');
    if (!linked && !legacy) continue;
    let key = '';
    let zoomUrl = config.zoomUrl?.trim() ?? '';
    let instructions = config.instructions?.trim() || line.description?.trim() || '';
    if (linked) {
      const participant = await upsertParticipant(db,linked.id,'',order.email,orderId);
      key = participant.access_key;
      const sessions = await listSessions(db,linked.id);
      if (!sessions.length) throw new Error(`La conferencia "${linked.title}" no tiene sesiones configuradas.`);
      zoomUrl = sessions[0].join_url ?? '';
      instructions = [linked.title, linked.description, ...sessions.map((session, index) =>
        `Sesión ${index + 1}: ${session.title}\nFecha y hora: ${session.starts_at} (${session.time_zone})\nDuración: ${session.duration_minutes} minutos\nEnlace Zoom: ${session.join_url ?? 'Pendiente'}\nClave de acceso Zoom: ${session.passcode ?? 'No disponible'}`,
      )].filter(Boolean).join('\n\n');
    } else {
      if (!zoomUrl || !/^https:\/\/(?:[\w-]+\.)?zoom\.us\//i.test(zoomUrl)) throw new Error('Configura una URL Zoom HTTPS o vincula el producto a una conferencia administrada.');
    }
    for(let seat=1;seat<=line.quantity;seat++) {
      const accessKey = seat===1 && key ? key : crypto.randomUUID().replaceAll('-','').slice(0,20).toUpperCase();
      await db.prepare(`INSERT OR IGNORE INTO conference_access(order_id,order_item_id,seat_number,access_key,zoom_url,instructions,conference_id) VALUES(?,?,?,?,?,?,?)`)
        .bind(orderId,line.id,seat,accessKey,zoomUrl,instructions, linked?.id ?? null).run();
    }
  }
  const {results} = await db.prepare('SELECT * FROM conference_access WHERE order_id=? ORDER BY order_item_id,seat_number').bind(orderId).all<ConferenceAccess>();
  return results ?? [];
}
export async function listConferenceAccessForOrder(db:D1Database,orderId:number):Promise<ConferenceAccess[]> {
  const {results}=await db.prepare('SELECT * FROM conference_access WHERE order_id=? ORDER BY order_item_id,seat_number').bind(orderId).all<ConferenceAccess>();
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
  await db.prepare("UPDATE conference_participants SET status='invited', invited_at=COALESCE(invited_at,CURRENT_TIMESTAMP), last_email_at=CURRENT_TIMESTAMP WHERE source_order_id=?").bind(orderId).run();
}
