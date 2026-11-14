import type { D1Database } from '@cloudflare/workers-types';

export async function magazineAccessMode(db:D1Database,email:string,magazineId:string):Promise<'latest'|'all'|null>{
 const manual=await db.prepare(`SELECT a.decision FROM school_manual_access a JOIN customer_accounts c ON c.client_number=a.client_number
   WHERE c.email=? COLLATE NOCASE AND a.resource_type='magazine' AND a.resource_id=?
     AND (a.expires_at IS NULL OR date(a.expires_at)>=date('now'))`).bind(email,magazineId).first<{decision:'allow'|'deny'}>();
 if(manual)return manual.decision==='allow'?'all':null;
 const row=await db.prepare(`SELECT CASE WHEN MAX(CASE WHEN cs.magazine_access='all' THEN 1 ELSE 0 END)=1 THEN 'all' WHEN COUNT(*)>0 THEN 'latest' ELSE NULL END AS access_mode FROM school_subscriptions ss JOIN content_subscriptions cs ON cs.id=ss.content_subscription_id WHERE cs.magazine_id=? AND cs.status='active' AND lower(trim(ss.student_email))=lower(trim(?)) AND ss.status IN ('active','trialing') AND (ss.current_period_end IS NULL OR ss.current_period_end>strftime('%Y-%m-%dT%H:%M:%fZ','now'))`).bind(magazineId,email).first<{access_mode:'latest'|'all'|null}>();
 return row?.access_mode??null;
}

export async function magazineCanReadIssue(db:D1Database,email:string,magazineId:string,issueId:string):Promise<boolean>{
 const mode=await magazineAccessMode(db,email,magazineId);if(!mode)return false;if(mode==='all')return true;
 const latest=await db.prepare("SELECT id FROM math_magazine_issues WHERE magazine_id=? AND status='published' ORDER BY issue_date DESC,updated_at DESC LIMIT 1").bind(magazineId).first<{id:string}>();
 return latest?.id===issueId;
}
