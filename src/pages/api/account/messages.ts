export const prerender = false;
import { env } from 'cloudflare:workers';
import { accountsEnabled, getCustomerEmail } from '../../../features/auth/customer';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } });
export async function GET({ cookies, url }: any) {
  if (!(await accountsEnabled())) return json({error:'Cuentas deshabilitadas'},403);
  const email = await getCustomerEmail(cookies);
  if (!email) return json({error:'Inicia sesión'},401);
  const before = url.searchParams.get('before');
  const since = new Date(Date.now()-2*24*60*60*1000).toISOString();
  await env.DB.prepare("UPDATE customer_messages SET read_at=datetime('now') WHERE customer_email=? COLLATE NOCASE AND sender_role='admin' AND read_at IS NULL").bind(email).run();
  const query = before
    ? env.DB.prepare('SELECT id,sender_role,sender_label,body,created_at FROM customer_messages WHERE customer_email=? COLLATE NOCASE AND created_at < ? ORDER BY created_at DESC LIMIT 51').bind(email,before)
    : env.DB.prepare('SELECT id,sender_role,sender_label,body,created_at FROM customer_messages WHERE customer_email=? COLLATE NOCASE AND created_at >= ? ORDER BY created_at DESC LIMIT 51').bind(email,since);
  const {results=[]} = await query.all<any>();
  const messages = results.slice(0,50).reverse();
  let hasMore = results.length > 50;
  if (!hasMore) {
    const anchor = messages[0]?.created_at ?? (before || since);
    const older = await env.DB.prepare('SELECT 1 AS yes FROM customer_messages WHERE customer_email=? COLLATE NOCASE AND created_at < ? LIMIT 1').bind(email,anchor).first();
    hasMore = !!older;
  }
  return json({messages,hasMore,cursor:messages[0]?.created_at ?? before ?? since});
}
export async function POST({ cookies, request }: any) {
  if (!(await accountsEnabled())) return json({error:'Cuentas deshabilitadas'},403);
  const email = await getCustomerEmail(cookies);
  if (!email) return json({error:'Inicia sesión'},401);
  let body: any; try { body = await request.json(); } catch { return json({error:'Solicitud inválida'},400); }
  const text = String(body?.body ?? '').trim();
  if (!text || text.length > 5000) return json({error:'El mensaje debe tener entre 1 y 5000 caracteres.'},400);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO customer_messages(id,customer_email,sender_role,sender_label,body) VALUES (?,?,?,?,?)').bind(id,email,'customer','Alumno',text).run();
  const message = await env.DB.prepare('SELECT id,sender_role,sender_label,body,created_at FROM customer_messages WHERE id=?').bind(id).first();
  return json({message},201);
}
