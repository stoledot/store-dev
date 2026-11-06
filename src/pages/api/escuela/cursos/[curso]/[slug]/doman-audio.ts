import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled,getCustomerEmail } from '../../../../../../features/auth/customer';
import { ensureCustomerAccount } from '../../../../../../features/auth/customerIdentity';
import { domanLessonAccess } from '../../../../../../features/school/domanStudentAccess';
export const prerender=false;
export const GET:APIRoute=async({cookies,params,url})=>{
 if(!(await accountsEnabled()))return Response.json({error:'Inicia sesión.'},{status:401});const email=await getCustomerEmail(cookies);if(!email)return Response.json({error:'Inicia sesión.'},{status:401});
 const client=await ensureCustomerAccount(env.DB,email),course=decodeURIComponent(params.curso??''),lesson=decodeURIComponent(params.slug??''),access=await domanLessonAccess(env.DB,email,client,course,lesson);if(!access)return Response.json({error:'No tienes acceso a esta lección.'},{status:403});
 const lessonRow=await env.DB.prepare('SELECT assessment_json FROM school_lessons WHERE id=?').bind(access.lessonId).first<{assessment_json:string}>();let groups:any[]=[];try{const parsed=JSON.parse(lessonRow?.assessment_json||'{}');for(const block of parsed.blocks||[])if(block?.type==='domanslides')groups.push(...(block.slides||[]));}catch{}
 const filters:Array<Record<string,string>>=[];const flatten=(group:any,inherited:Record<string,string>={})=>{const merged={...inherited,...(group?.filters||{})};filters.push(merged);for(const child of group?.children||[])flatten(child,merged)};groups.forEach(group=>flatten(group));
 const rows=(await env.DB.prepare("SELECT id,text_value,category,audio_type,level,duration_seconds FROM school_doman_audio_assets WHERE status='active' ORDER BY created_at,id LIMIT 3000").all<{id:string;text_value:string;category:string;audio_type:string;level:string;duration_seconds:number}>()).results??[];
 const parts=(s:string|undefined)=>s?.trim()?s.trim().split(/\s+/):[];const eligible=rows.filter(row=>filters.some(f=>{const cs=parts(f.category),ts=parts(f.type),ls=parts(f.level);let matches=true;try{if(f.regex)matches=new RegExp(f.regex,'u').test(row.text_value)}catch{matches=false}return matches&&(!cs.length||cs.includes(row.category))&&(!ts.length||ts.includes(row.audio_type))&&(!ls.length||ls.includes(row.level))}));
 return Response.json({items:eligible.map(x=>({...x,url:`/api/escuela/cursos/${encodeURIComponent(course)}/${encodeURIComponent(lesson)}/audio/${encodeURIComponent(x.id)}`}))},{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
};
