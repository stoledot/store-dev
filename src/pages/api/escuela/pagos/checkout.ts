import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled, getCustomerEmail } from '../../../../features/auth/customer';
import { getPaymentProvider, isMethodAvailable } from '../../../../features/payments';
import { getStoreSettings } from '../../../../features/settings/db';

export const prerender = false;
export const POST: APIRoute = async ({ request, cookies, url, redirect }) => {
  const email = await getCustomerEmail(cookies);
  if (!(await accountsEnabled()) || !email) return redirect('/account/login',303);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return new Response('Forbidden', {status:403});
  const form = await request.formData();
  const id = String(form.get('obligation_id') ?? '').trim();
  if (!id || id.length > 80) return redirect('/account/payments?error=Pago%20no%20válido',303);

  const settings = await getStoreSettings(env.DB);
  // Assigned school payments currently settle through Stripe Checkout so the
  // signed Stripe webhook can bind the exact obligation to the paid order.
  if (!isMethodAvailable('stripe', settings) || settings.disabledPaymentMethods.includes('stripe')) {
    return redirect('/account/payments?error=El%20pago%20en%20línea%20no%20está%20disponible.%20Contacta%20a%20la%20escuela.',303);
  }

  const lockToken = crypto.randomUUID();
  const obligation = await env.DB.prepare(`
    UPDATE school_payment_obligations
       SET checkout_lock_token=?, checkout_locked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id=? AND student_email=? COLLATE NOCASE AND status='pending'
       AND (available_at IS NULL OR date(available_at)<=date('now'))
       AND (checkout_locked_at IS NULL OR datetime(checkout_locked_at)<datetime('now','-24 hours'))
     RETURNING id,student_email,title_snapshot,description_snapshot,amount_cents,currency,due_at
  `).bind(lockToken,id,email).first<{
    id:string;student_email:string;title_snapshot:string;description_snapshot:string;
    amount_cents:number;currency:string;due_at:string;
  }>();
  if (!obligation) return redirect('/account/payments?error=Este%20pago%20no%20está%20disponible%20o%20ya%20se%20está%20procesando.',303);

  try {
    const publicId = crypto.randomUUID();
    const provider = await getPaymentProvider('stripe');
    const result = await provider.createCheckout({
      lineItems: [{name: obligation.title_snapshot, amountCents: obligation.amount_cents, currency: obligation.currency.toLowerCase(), quantity: 1}],
      customerEmail: obligation.student_email,
      successUrl: `${url.origin}/account/payments?success=1`,
      cancelUrl: `${url.origin}/account/payments?error=El%20pago%20no%20se%20completó.%20Puedes%20intentarlo%20nuevamente.`,
      metadata: {
        public_id: publicId,
        school_obligation_id: obligation.id,
        school_student_email: obligation.student_email,
        items: JSON.stringify([{id:null,q:1,n:obligation.title_snapshot,p:obligation.amount_cents,v:null}]),
      },
    });
    if (!result.providerSessionId) throw new Error('Stripe no devolvió el identificador de sesión.');
    const linked = await env.DB.prepare(`UPDATE school_payment_obligations SET checkout_session_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND checkout_lock_token=?`).bind(result.providerSessionId, obligation.id, lockToken).run();
    if ((linked.meta?.changes ?? 0) === 0) throw new Error('La sesión de pago ya no pudo vincularse con la obligación.');
    // Keep the lock token until the signed webhook confirms payment or expiry.
    return redirect(result.url,303);
  } catch (error) {
    await env.DB.prepare(`UPDATE school_payment_obligations SET checkout_lock_token=NULL,checkout_locked_at=NULL,checkout_session_id=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND checkout_lock_token=?`).bind(obligation.id,lockToken).run();
    console.error('School payment checkout failed:', error);
    return redirect('/account/payments?error=No%20se%20pudo%20iniciar%20el%20pago.%20Intenta%20de%20nuevo.',303);
  }
};
