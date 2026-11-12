import type { D1Database } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { getEmailProvider } from '../email';
import { formatMoney } from '../../money';
import { getSetting } from '../settings/db';

const html=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Sends the Mexican five-calendar-day recurring-charge reminder, once per period. */
export async function sendUpcomingSubscriptionReminders(db:D1Database):Promise<void>{
 const origin=(await getSetting(db,'store_url'))||env.CANONICAL_ORIGIN;if(!origin)return;
 const mailer=await getEmailProvider();if(!mailer)return;
 const now=Date.now(),lower=new Date(now+5*86400000).toISOString(),upper=new Date(now+5*86400000+10*60000).toISOString();
 const rows=(await db.prepare(`SELECT ss.id,ss.student_email,ss.current_period_end,ss.unit_amount_minor,ss.currency,ss.interval_unit,ss.interval_count,s.title FROM school_subscriptions ss JOIN content_subscriptions s ON s.id=ss.content_subscription_id WHERE ss.status='active' AND ss.cancel_at_period_end=0 AND ss.current_period_end>? AND ss.current_period_end<=? ORDER BY ss.current_period_end LIMIT 100`).bind(lower,upper).all<{id:string;student_email:string;current_period_end:string;unit_amount_minor:number;currency:string;interval_unit:string;interval_count:number;title:string}>()).results??[];
 for(const row of rows){
  const claimedAt=new Date().toISOString(),staleAt=new Date(now-20*60000).toISOString();
  const claim=await db.prepare(`INSERT INTO subscription_renewal_reminders(subscription_id,period_end,status,claimed_at) VALUES(?,?,'sending',?) ON CONFLICT(subscription_id,period_end) DO UPDATE SET claimed_at=excluded.claimed_at WHERE subscription_renewal_reminders.status='sending' AND subscription_renewal_reminders.claimed_at<?`).bind(row.id,row.current_period_end,claimedAt,staleAt).run();
  if(!claim.meta.changes)continue;
  const amount=formatMoney(row.unit_amount_minor,row.currency),when=new Date(row.current_period_end).toLocaleDateString('es-MX',{year:'numeric',month:'long',day:'numeric',timeZone:'America/Mexico_City'}),url=`${origin.replace(/\/$/,'')}/account/suscripciones`,period=`cada ${row.interval_count===1?'':`${row.interval_count} `}${row.interval_unit==='year'?'año':'mes'}`;
  try{await mailer.send({to:row.student_email,subject:`Aviso de renovación de ${row.title}`,text:`Te avisamos que tu suscripción ${row.title} se renovará el ${when}. El cargo será de ${amount}, ${period}. Si no deseas renovar, puedes cancelar desde ${url}.`,html:`<p>Te avisamos que tu suscripción <strong>${html(row.title)}</strong> se renovará el ${html(when)}.</p><p>El cargo será de <strong>${html(amount)}</strong>, ${html(period)}.</p><p>Si no deseas renovar, puedes <a href="${html(url)}">cancelar desde Mi cuenta</a>.</p>`});await db.prepare("UPDATE subscription_renewal_reminders SET status='sent',sent_at=? WHERE subscription_id=? AND period_end=?").bind(new Date().toISOString(),row.id,row.current_period_end).run();}
  catch(error){console.error('Subscription renewal reminder failed:',error);await db.prepare('UPDATE subscription_renewal_reminders SET claimed_at=? WHERE subscription_id=? AND period_end=? AND status=\'sending\'').bind(staleAt,row.id,row.current_period_end).run();}
 }
}
