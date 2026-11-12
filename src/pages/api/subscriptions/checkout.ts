import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled,getCustomerEmail } from '../../../features/auth/customer';
import { parsePublicId } from '../../../features/ids/publicId';
import { getSecret } from '../../../features/secrets/store';
import { createStripeSubscriptionCheckout } from '../../../features/payments/stripe';
import { formatMoney } from '../../../money';
import { hasSubscriptionConsent, subscriptionPoliciesReady } from '../../../features/subscriptions/consent';
export const prerender=false;
export const POST:APIRoute=async({request,cookies,redirect})=>{
 if(!(await accountsEnabled()))return new Response('Las cuentas están deshabilitadas.',{status:404});
 const email=await getCustomerEmail(cookies);if(!email)return redirect('/account/login',303);
 const form=await request.formData(),publicId=parsePublicId(String(form.get('product_id')||''),'product'),planSlug=String(form.get('subscription_slug')||'');
 if(!publicId||!/^[a-z0-9-]{1,100}$/.test(planSlug))return new Response('Oferta no válida.',{status:400});
 if(!hasSubscriptionConsent(form))return new Response('Debes aceptar cada condición y autorizar expresamente los cargos recurrentes para continuar.',{status:400});
 const offer=await env.DB.prepare("SELECT p.id,p.slug AS product_slug,s.id AS plan_id,s.title AS plan_title,s.stripe_price_id,s.unit_amount_minor,s.currency,s.interval_unit,s.interval_count,s.refund_policy_text,s.privacy_notice_text,s.privacy_notice_url,s.subscription_terms_text,s.updated_at FROM products p JOIN product_content_subscriptions ps ON ps.product_id=p.id JOIN content_subscriptions s ON s.id=ps.subscription_id WHERE p.public_id=? AND p.active=1 AND s.slug=? AND s.status='active' LIMIT 1").bind(publicId,planSlug).first<any>();
 if(!offer)return new Response('La oferta ya no está disponible.',{status:404});
 const policies=[offer.refund_policy_text,offer.privacy_notice_text,offer.subscription_terms_text];
 if(!subscriptionPoliciesReady(policies.map(x=>String(x||''))))return new Response('Este plan todavía tiene textos legales de ejemplo. El comercio debe completarlos en Administración → Suscripciones antes de aceptar pagos.',{status:409});
 if(form.get('policy_version')!==offer.updated_at)return new Response('Las condiciones cambiaron. Vuelve al producto y revísalas antes de continuar.',{status:409});
 const amount=formatMoney(offer.unit_amount_minor,offer.currency),interval=`cada ${offer.interval_count===1?'':`${offer.interval_count} `}${offer.interval_unit==='year'?'año':'mes'}`;
 const acceptedAt=new Date().toISOString(),consentId=crypto.randomUUID(),snapshot={version:2,policyVersion:offer.updated_at,planTitle:offer.plan_title,productSlug:offer.product_slug,amount,currency:offer.currency,interval,automaticRenewal:true,refundPolicy:offer.refund_policy_text,privacyNotice:offer.privacy_notice_text,privacyNoticeUrl:offer.privacy_notice_url||'',subscriptionTerms:offer.subscription_terms_text,recurringDisclosure:`Se cobrará ${amount} ${interval}, automáticamente, hasta que canceles. Puedes solicitar la cancelación desde Mi cuenta → Suscripciones; se detendrán las renovaciones futuras.`,acceptedAt,consent:'Acepto las condiciones y la política de reembolso, confirmo haber consultado el aviso de privacidad y autorizo expresamente los cargos recurrentes descritos.'};
 const secretKey=await getSecret(env.DB,'stripe_secret_key'),webhookSecret=await getSecret(env.DB,'stripe_webhook_secret');if(!secretKey||!webhookSecret)return new Response('Stripe aún no está configurado en administración.',{status:503});
 await env.DB.prepare('INSERT INTO subscription_consents(id,student_email,content_subscription_id,product_id,accepted_policy_json,accepted_at) VALUES(?,?,?,?,?,?)').bind(consentId,email,offer.plan_id,offer.id,JSON.stringify(snapshot),acceptedAt).run();
 try{const base=new URL(request.url).origin,url=await createStripeSubscriptionCheckout({secretKey,priceId:offer.stripe_price_id,expectedAmount:offer.unit_amount_minor,expectedCurrency:offer.currency,intervalUnit:offer.interval_unit,intervalCount:offer.interval_count,email,successUrl:`${base}/account/suscripciones?checkout=processing`,cancelUrl:`${base}/products/${encodeURIComponent(offer.product_slug)}?subscription=cancelled`,metadata:{content_subscription_id:offer.plan_id,student_email:email,stripe_price_id:offer.stripe_price_id,consent_id:consentId}});return redirect(url,303);}catch(err){console.error('Stripe subscription checkout failed:',err);return new Response(err instanceof Error&&err.message.includes('no coincide')?err.message:'No se pudo iniciar el pago recurrente. Revisa que el Price de Stripe esté activo.',{status:502});}
};
