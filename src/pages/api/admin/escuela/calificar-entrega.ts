import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../features/school/adminApiAuth';
export const prerender = false;
const json = (body: Record<string,unknown>, status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const POST: APIRoute = async ({request,url,cookies,locals}) => {
  if (!(await isSchoolAdminRequest(cookies.get('admin_session')?.value, locals.adminEmail))) return json({error:'Se requiere una sesión administrativa.'},401);
  const origin=request.headers.get('origin'); if(origin && origin!==url.origin) return json({error:'Origen no válido.'},403);
  let body:{progressId?:unknown;grade?:unknown;feedback?:unknown;scale?:unknown};
  try { body=await request.json() as typeof body; } catch { return json({error:'JSON inválido.'},400); }
  const progressId=typeof body.progressId==='string'?body.progressId.trim():'';
  const grade=typeof body.grade==='number'?body.grade:Number(body.grade);
  const scale=body.scale===10?10:100;
  const feedback=typeof body.feedback==='string'?body.feedback.trim().slice(0,10000):'';
  if(!progressId || !Number.isFinite(grade) || grade<0 || grade>scale) return json({error:`La calificación debe estar entre 0 y ${scale}.`},400);
  const row=await env.DB.prepare(`SELECT p.id,p.student_email,l.id AS lesson_id,l.title AS lesson_title,l.tex_node_id,l.course_id,c.title AS course_title FROM school_lesson_progress p JOIN school_lessons l ON l.id=p.lesson_id JOIN school_courses c ON c.id=l.course_id WHERE p.id=? AND p.submission_at IS NOT NULL`).bind(progressId).first<{id:string;student_email:string;lesson_id:string;lesson_title:string;tex_node_id:string|null;course_id:string;course_title:string}>();
  if(!row) return json({error:'No se encontró la entrega.'},404);
  const storedGrade=scale===10?grade*10:grade;
  const now=new Date().toISOString();
  await env.DB.prepare('UPDATE school_lesson_progress SET grade=?,feedback=?,graded_at=?,graded_by=\'admin\',updated_at=? WHERE id=?').bind(storedGrade,feedback,now,now,progressId).run();
  const shownGrade=row.tex_node_id?`${(storedGrade/10).toFixed(1)}/10`:`${storedGrade}/100`;
  await env.DB.prepare('INSERT INTO school_notifications (id,student_email,course_id,lesson_id,title,message,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),row.student_email,row.course_id,row.lesson_id,`Nueva retroalimentación: ${row.lesson_title}`,`Se calificó “${row.lesson_title}” de ${row.course_title}: ${shownGrade}.\n\n${feedback || 'El administrador guardó tu calificación.'}`,now).run();
  return json({ok:true,grade,gradedAt:now});
};
