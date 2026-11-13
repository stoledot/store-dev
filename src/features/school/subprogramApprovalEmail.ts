import type { D1Database } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { getEmailProvider } from '../email';
import { getSetting } from '../settings/db';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));

export async function sendSubprogramApprovalEmails(db: D1Database): Promise<void> {
  const rows = (await db.prepare(`
    SELECT e.diagnostic_id,c.email,s.title
      FROM school_subprogram_approval_emails e
      JOIN school_subprogram_diagnostics d ON d.id=e.diagnostic_id
      JOIN school_subprograms s ON s.id=d.subprogram_id
      JOIN customer_accounts c ON c.client_number=d.client_number
     WHERE (e.status='pending' AND e.next_attempt_at<=?) OR (e.status='sending' AND e.claimed_at<?)
     ORDER BY d.reviewed_at LIMIT 50
  `).bind(new Date().toISOString(), new Date(Date.now() - 20 * 60000).toISOString()).all<{
    diagnostic_id: string; email: string; title: string;
  }>()).results;
  if (!rows.length) return;
  const mailer = await getEmailProvider();
  const origin = (await getSetting(db, 'store_url')) || env.CANONICAL_ORIGIN;
  if (!mailer || !origin) throw new Error('Configura el proveedor de correo y la URL de la tienda para enviar aprobaciones escolares.');
  const paymentsUrl = new URL('/account/payments', origin);
  if (!['https:', 'http:'].includes(paymentsUrl.protocol)) throw new Error('La URL de la tienda no es válida.');
  for (const row of rows) {
    const token = crypto.randomUUID();
    const now = new Date();
    const claimed = await db.prepare(`
      UPDATE school_subprogram_approval_emails
         SET status='sending',claim_token=?,claimed_at=?,attempts=attempts+1
       WHERE diagnostic_id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='sending' AND claimed_at<?))
    `).bind(token, now.toISOString(), row.diagnostic_id, now.toISOString(), new Date(now.getTime() - 20 * 60000).toISOString()).run();
    if (!claimed.meta.changes) continue;
    try {
      const message = `Tu diagnóstico de ${row.title} fue aprobado. Consulta la modalidad y los pagos asignados en ${paymentsUrl.href}.`;
      await mailer.send({
        to: row.email,
        subject: `Diagnóstico aprobado: ${row.title}`,
        text: message,
        html: `<p>Tu diagnóstico de <strong>${escapeHtml(row.title)}</strong> fue aprobado.</p><p><a href="${escapeHtml(paymentsUrl.href)}">Consulta tus pagos asignados</a>.</p>`,
        idempotencyKey: `subprogram-approval/${row.diagnostic_id}`,
      });
      await db.prepare(`
        UPDATE school_subprogram_approval_emails SET status='sent',sent_at=?,claim_token=NULL,last_error=NULL
        WHERE diagnostic_id=? AND claim_token=?
      `).bind(new Date().toISOString(), row.diagnostic_id, token).run();
    } catch (error) {
      console.error(`No se pudo enviar la aprobación escolar ${row.diagnostic_id}:`, error);
      await db.prepare(`
        UPDATE school_subprogram_approval_emails SET status='pending',claim_token=NULL,last_error=?,next_attempt_at=?
        WHERE diagnostic_id=? AND claim_token=?
      `).bind(error instanceof Error ? error.message.slice(0, 1000) : 'Error de envío', new Date(Date.now() + 3600000).toISOString(), row.diagnostic_id, token).run();
    }
  }
}
