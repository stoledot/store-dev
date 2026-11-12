import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sendAdvertisingInquiryNotifications } from '../../features/advertising/notifications';
export const prerender=false;
export const POST:APIRoute=async({request,locals,redirect})=>{
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==new URL(request.url).host)return new Response('Origen inválido.',{status:403});
  const form=await request.formData();if(String(form.get('website_confirm')??'').trim())return redirect('/anunciarte?sent=1',303);
  const value=(key:string,max:number)=>String(form.get(key)??'').trim().slice(0,max);
  const company=value('company_name',180),contact=value('contact_name',160),email=value('email',254).toLowerCase(),phone=value('phone',40),website=value('website',500),format=value('format_preference',20),message=value('message',3000),viewsRaw=value('monthly_views',12),budgetRaw=value('monthly_budget',30);
  const views=viewsRaw?Number(viewsRaw):null,budget=budgetRaw?Math.round(Number(budgetRaw)*100):null;
  if(!company||!contact||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['views','budget','sponsorship'].includes(format)||views!==null&&(!Number.isSafeInteger(views)||views<1||views>100_000_000)||budget!==null&&(!Number.isSafeInteger(budget)||budget<1||budget>1_000_000_000)||website&&!/^https:\/\//i.test(website))return redirect('/anunciarte?error=1',303);
  const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM advertising_inquiries WHERE lower(email)=lower(?) AND created_at>=datetime('now','-1 day')").bind(email).first<{n:number}>();if((recent?.n??0)>=5)return redirect('/anunciarte?error=1',303);
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO advertising_inquiries(id,company_name,contact_name,email,phone,website,format_preference,monthly_views,monthly_budget_minor,message) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,company,contact,email,phone,website,format,views,budget,message).run();
  try{await sendAdvertisingInquiryNotifications(env.DB);}catch(error){console.error('Could not send advertising inquiry notice:',error);}
  return redirect('/anunciarte?sent=1',303);
};
