import type { D1Database } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { getEmailProvider } from '../email';
import { getSetting } from '../settings/db';

const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Drains the durable, idempotent publication-notice queue in bounded batches. */
export async function sendMagazineIssueNotifications(db:D1Database):Promise<void>
{
 const origin=(await getSetting(db,'store_url'))||env.CANONICAL_ORIGIN;if(!origin)return;
 const mailer=await getEmailProvider();if(!mailer)return;
 const stale=new Date(Date.now()-15*60_000).toISOString();
 const rows = (await db.prepare(`SELECT n.issue_id,n.student_email,i.title AS issue_title,i.slug AS issue_slug,i.issue_number,i.volume,i.issue_date,m.title AS magazine_title,m.slug AS magazine_slug FROM math_magazine_issue_notifications n JOIN math_magazine_issues i ON i.id=n.issue_id JOIN math_magazines m ON m.id=i.magazine_id WHERE i.status='published' AND m.status='published' AND (n.status='pending' OR (n.status='sending' AND n.claimed_at<?)) ORDER BY i.issue_date,n.student_email LIMIT 50`).bind(stale).all<{issue_id:string;student_email:string;issue_title:string;issue_slug:string;issue_number:string;volume:string;issue_date:string;magazine_title:string;magazine_slug:string}>()).results??[];
 for(const row of rows){const now=new Date().toISOString(),claim=await db.prepare("UPDATE math_magazine_issue_notifications SET status='sending',claimed_at=?,attempts=attempts+1 WHERE issue_id=? AND student_email=? COLLATE NOCASE AND (status='pending' OR (status='sending' AND claimed_at<?))").bind(now,row.issue_id,row.student_email,stale).run();if(!claim.meta.changes)continue;const link=`${origin.replace(/\/$/,'')}/revistas/${encodeURIComponent(row.magazine_slug)}/${encodeURIComponent(row.issue_slug)}`,number=`${row.volume?`Vol. ${row.volume} · `:''}Núm. ${row.issue_number}`;
  try{await mailer.send({to:row.student_email,subject:`Nueva edición: ${row.magazine_title}`,idempotencyKey:`magazine-issue/${row.issue_id}/${row.student_email.toLowerCase()}`,text:`Ya está disponible ${row.issue_title} (${number}), publicada el ${row.issue_date}, de ${row.magazine_title}. Léela aquí: ${link}`,html:`<p>Ya está disponible una nueva edición de <strong>${esc(row.magazine_title)}</strong>.</p><p>${esc(row.issue_title)} · ${esc(number)} · ${esc(row.issue_date)}</p><p><a href="${esc(link)}">Abrir edición</a></p>`});await db.prepare("UPDATE math_magazine_issue_notifications SET status='sent',sent_at=?,last_error=NULL WHERE issue_id=? AND student_email=? COLLATE NOCASE").bind(new Date().toISOString(),row.issue_id,row.student_email).run();}
  catch(error){console.error('Magazine issue notification failed:',error);await db.prepare("UPDATE math_magazine_issue_notifications SET status='pending',last_error=? WHERE issue_id=? AND student_email=? COLLATE NOCASE").bind((error instanceof Error?error.message:String(error)).slice(0,500),row.issue_id,row.student_email).run();}
 }
}
