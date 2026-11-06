import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../features/school/adminApiAuth';

export const prerender = false;
const json = (body: Record<string,unknown>, status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

export const POST: APIRoute = async ({request,url,cookies,locals}) => {
  if (!(await isSchoolAdminRequest(cookies.get('admin_session')?.value,locals.adminEmail))) return json({error:'Se requiere una sesión administrativa.'},401);
  const origin=request.headers.get('origin'); if(origin&&origin!==url.origin)return json({error:'Origen no válido.'},403);
  let body:{studentEmail?:unknown;lessonId?:unknown;locked?:unknown};
  try{body=await request.json() as typeof body;}catch{return json({error:'JSON inválido.'},400);}
  const email=typeof body.studentEmail==='string'?body.studentEmail.trim().toLowerCase():'';
  const lessonId=typeof body.lessonId==='string'?body.lessonId.trim():'';
  if(!email||!lessonId||typeof body.locked!=='boolean')return json({error:'Indica alumno, actividad y el estado de bloqueo.'},400);
  const lesson=await env.DB.prepare(`SELECT id FROM school_lessons WHERE id=?`).bind(lessonId).first();
  if(!lesson)return json({error:'No se encontró la actividad.'},404);
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO school_lesson_resubmission_controls (student_email,lesson_id,locked,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(student_email,lesson_id) DO UPDATE SET locked=excluded.locked,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(email,lessonId,body.locked?1:0,locals.adminEmail??'admin',now).run();
  return json({ok:true,locked:body.locked});
};
