import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled, getCustomerEmail } from '../../../../features/auth/customer';
import { getPaymentProvider, isMethodAvailable } from '../../../../features/payments';
import { getStoreSettings } from '../../../../features/settings/db';
import { claimOrderIdentity } from '../../../../features/orders/guestAccess';
import { claimSchoolCheckout } from '../../../../features/school/schoolCheckout';

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
  const requestedMethod = String(form.get('method') ?? 'stripe');
  if (requestedMethod !== 'stripe' && requestedMethod !== 'demo') {
    return redirect('/account/payments?error=Método%20de%20pago%20no%20válido.',303);
  }
  const method = requestedMethod;
  if (!isMethodAvailable(method, settings) || settings.disabledPaymentMethods.includes(method)) {
    return redirect('/account/payments?error=El%20pago%20en%20línea%20no%20está%20disponible.%20Contacta%20a%20la%20escuela.',303);
  }

  const lockToken = crypto.randomUUID();
  const obligation = await claimSchoolCheckout(env.DB, id, email, lockToken);
  if (!obligation) return redirect('/account/payments?error=Este%20pago%20no%20está%20disponible%2C%20requiere%20inscripción%20vigente%20o%20ya%20se%20está%20procesando.',303);

  try {
    const identity = method === 'demo' ? await claimOrderIdentity(env.DB) : null;
    const publicId = identity?.publicId ?? crypto.randomUUID();
    const provider = await getPaymentProvider(method);
    const errorMsg = encodeURIComponent('El pago no se completó. Puedes intentarlo nuevamente.');
    const items = JSON.stringify([{
      id: null, q: 1, n: obligation.title_snapshot, p: obligation.amount_cents, v: null
    }]);
    const result = await provider.createCheckout({
      lineItems: [{
        name: obligation.title_snapshot,
        amountCents: obligation.amount_cents,
        currency: obligation.currency.toLowerCase(),
        quantity: 1
      }],
      customerEmail: obligation.student_email,
      accessToken: identity?.accessToken,
      orderItemsJson: items,
      successUrl: `${url.origin}/account/payments?success=1`,
      cancelUrl: `${url.origin}/account/payments?error=${errorMsg}`,
      metadata: {
        public_id: publicId,
        school_obligation_id: obligation.id,
        school_student_email: obligation.student_email,
        items,
      },
    });

    if (!result.providerSessionId) throw new Error('El proveedor no devolvió el identificador de sesión.');
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
