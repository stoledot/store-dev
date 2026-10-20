import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../features/school/adminApiAuth';
export const prerender = false;
const json = (body: Record<string,unknown>, status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const POST: APIRoute = async ({request,url,cookies,locals}) => {
  if (!(await isSchoolAdminRequest(cookies.get('admin_session')?.value, locals.adminEmail))) return json({error:'Se requiere una sesión administrativa.'},401);
  const origin=request.headers.get('origin'); if(origin && origin!==url.origin) return json({error:'Origen no válido.'},403);
  let body:{progressId?:unknown;grade?:unknown;feedback?:unknown};
  try { body=await request.json() as typeof body; } catch { return json({error:'JSON inválido.'},400); }
  const progressId=typeof body.progressId==='string'?body.progressId.trim():'';
  const grade=typeof body.grade==='number'?body.grade:Number(body.grade);
  const feedback=typeof body.feedback==='string'?body.feedback.trim().slice(0,10000):'';
  if(!progressId || !Number.isFinite(grade) || grade<0 || grade>100) return json({error:'La calificación debe ser un número entre 0 y 100.'},400);
  const row=await env.DB.prepare('SELECT id FROM school_lesson_progress WHERE id=? AND submission_at IS NOT NULL').bind(progressId).first();
  if(!row) return json({error:'No se encontró la entrega.'},404);
  const now=new Date().toISOString();
  await env.DB.prepare('UPDATE school_lesson_progress SET grade=?,feedback=?,graded_at=?,graded_by=\'admin\',updated_at=? WHERE id=?').bind(grade,feedback,now,now,progressId).run();
  return json({ok:true,grade,gradedAt:now});
};
