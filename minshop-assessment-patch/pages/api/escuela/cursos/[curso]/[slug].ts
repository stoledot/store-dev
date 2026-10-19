import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled, getCustomerEmail } from '../../../../../features/auth/customer';

export const prerender = false;
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
type Question = { id: string; type: 'multiple_choice'|'short_answer'|'long_answer'|'file_upload'; prompt: string; options?: string[]; required?: boolean };
const parseQuestions = (raw: string): Question[] => {
  try { const value = JSON.parse(raw) as {questions?: unknown}; return Array.isArray(value.questions) ? value.questions as Question[] : []; }
  catch { return []; }
};
const safeName = (name: string) => name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'entrega';
const allowedFiles = new Map([['pdf','application/pdf'],['png','image/png'],['jpg','image/jpeg'],['jpeg','image/jpeg'],['webp','image/webp'],['txt','text/plain'],['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document']]);

export const POST: APIRoute = async ({ request, cookies, params, url }) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'Solicitud de origen no válido.' }, 403);
  if (!(await accountsEnabled())) return json({ error: 'Las cuentas no están habilitadas.' }, 403);
  const email = await getCustomerEmail(cookies);
  if (!email) return json({ error: 'Inicia sesión para registrar tu avance.' }, 401);
  const contentType = request.headers.get('content-type') || '';
  let action = '';
  let form: FormData | null = null;
  if (contentType.includes('application/json')) {
    let body: {action?:unknown}; try { body = await request.json() as typeof body; } catch { return json({error:'JSON inválido.'},400); }
    action = typeof body.action === 'string' ? body.action : '';
  } else {
    try { form = await request.formData(); } catch { return json({error:'No se pudo leer la entrega.'},400); }
    action = 'submit';
  }
  if (action !== 'read' && action !== 'submit') return json({ error: 'Acción no válida.' }, 400);

  const access = await env.DB.prepare(`
    SELECT c.id AS course_id FROM school_course_assignments x
    JOIN school_courses c ON c.id=x.course_id
    JOIN school_student_intake i ON i.student_email=x.student_email COLLATE NOCASE
      AND i.status='approved' AND i.selected_area_id=c.area_id AND i.approved_level=c.level_code
    WHERE x.student_email=? COLLATE NOCASE AND x.status='active' AND c.slug=? AND c.status='published'
      AND EXISTS (SELECT 1 FROM school_fee_payments p WHERE p.student_email=x.student_email COLLATE NOCASE AND p.fee_type='enrollment' AND p.valid_until>=date('now'))
      AND EXISTS (SELECT 1 FROM school_fee_payments p WHERE p.student_email=x.student_email COLLATE NOCASE AND p.fee_type='monthly' AND p.valid_until>=date('now'))
    LIMIT 1`).bind(email, params.curso ?? '').first<{course_id:string}>();
  if (!access) return json({ error: 'No tienes acceso vigente a este curso.' }, 403);

  const lesson = await env.DB.prepare(`SELECT id,lesson_type,content_version,assessment_json FROM school_lessons WHERE course_id=? AND slug=? AND status='published' LIMIT 1`)
    .bind(access.course_id, params.slug ?? '').first<{id:string;lesson_type:string;content_version:number;assessment_json:string}>();
  if (!lesson) return json({error:'La lección no existe o no está publicada.'},404);
  const now = new Date().toISOString();
  const old = await env.DB.prepare('SELECT submission_file_key FROM school_lesson_progress WHERE student_email=? COLLATE NOCASE AND lesson_id=?').bind(email,lesson.id).first<{submission_file_key:string|null}>();

  if (lesson.lesson_type === 'reading') {
    if (action !== 'read') return json({error:'Esta lección se completa al leerla.'},400);
    await env.DB.prepare(`INSERT INTO school_lesson_progress (id,student_email,lesson_id,status,started_at,completed_at,content_version,last_activity_at,updated_at)
      VALUES (?,?,?,'completed',?,?,?,?,?) ON CONFLICT(student_email,lesson_id) DO UPDATE SET status='completed',started_at=COALESCE(school_lesson_progress.started_at,excluded.started_at),completed_at=COALESCE(school_lesson_progress.completed_at,excluded.completed_at),content_version=excluded.content_version,last_activity_at=excluded.last_activity_at,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(),email,lesson.id,now,now,lesson.content_version,now,now).run();
    return json({ok:true,status:'completed',kind:'read'});
  }
  if (action !== 'submit' || !form) return json({error:'Debes enviar una respuesta para registrar esta actividad.'},400);

  const questions = parseQuestions(lesson.assessment_json || '{"questions":[]}');
  const answers: Record<string,string> = {};
  for (const question of questions) {
    if (!question || typeof question.id !== 'string' || !['multiple_choice','short_answer','long_answer','file_upload'].includes(question.type)) continue;
    if (question.type === 'file_upload') continue;
    const value = form.get(`answer_${question.id}`);
    const answer = typeof value === 'string' ? value.trim() : '';
    if (question.required !== false && !answer) return json({error:`Responde la pregunta: ${question.prompt}`},400);
    if (answer.length > 20000) return json({error:'Una respuesta excede el límite de 20 000 caracteres.'},400);
    if (question.type === 'multiple_choice' && answer && !(question.options ?? []).includes(answer)) return json({error:'Selecciona una de las opciones disponibles.'},400);
    answers[question.id] = answer;
  }
  // Compatibilidad con lecciones antiguas sin preguntas configuradas.
  if (questions.length === 0) {
    const answer = form.get('answer_general');
    const text = typeof answer === 'string' ? answer.trim() : '';
    if (text.length < 5) return json({error:'Escribe una respuesta de al menos 5 caracteres.'},400);
    if (text.length > 20000) return json({error:'La respuesta excede el límite de 20 000 caracteres.'},400);
    answers.general = text;
  }

  let uploaded: {key:string;name:string;type:string;size:number}|null = null;
  const fileEntry = form.get('submission_file');
  if (fileEntry instanceof File && fileEntry.size > 0) {
    if (fileEntry.size > 10 * 1024 * 1024) return json({error:'El archivo no puede superar 10 MB.'},400);
    const type = fileEntry.type || 'application/octet-stream';
    const extension = fileEntry.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedFiles.has(extension) || allowedFiles.get(extension) !== type) return json({error:'Formato no permitido o extensión y tipo no coinciden. Usa PDF, PNG, JPG, WEBP, TXT o DOCX.'},400);
    if (!env.FILES) return json({error:'El almacenamiento privado FILES no está configurado.'},503);
    const name = safeName(fileEntry.name);
    const key = `school-submissions/${lesson.id}/${crypto.randomUUID()}-${name}`;
    await env.FILES.put(key, await fileEntry.arrayBuffer(), {httpMetadata:{contentType:type}, customMetadata:{studentEmail:email,lessonId:lesson.id}});
    uploaded = {key,name,type,size:fileEntry.size};
  }
  const hasFileQuestion = questions.some((q)=>q.type==='file_upload' && q.required !== false);
  if (hasFileQuestion && !uploaded && !old?.submission_file_key) return json({error:'Adjunta el archivo solicitado antes de enviar.'},400);
  const studentResponse = JSON.stringify(answers);
  const newKey = uploaded?.key ?? old?.submission_file_key ?? null;
  const newName = uploaded?.name ?? null;
  const newType = uploaded?.type ?? null;
  const newSize = uploaded?.size ?? null;
  try {
    await env.DB.prepare(`INSERT INTO school_lesson_progress (id,student_email,lesson_id,status,attempts,started_at,completed_at,content_version,last_activity_at,updated_at,student_response,submission_at,submission_file_key,submission_file_name,submission_file_type,submission_file_size,grade,feedback,graded_at,graded_by)
      VALUES (?,?,?,'completed',1,?,?,?,?,?,?,?, ?,?,?,?,NULL,'',NULL,NULL)
      ON CONFLICT(student_email,lesson_id) DO UPDATE SET status='completed',started_at=COALESCE(school_lesson_progress.started_at,excluded.started_at),completed_at=COALESCE(school_lesson_progress.completed_at,excluded.completed_at),attempts=school_lesson_progress.attempts+1,content_version=excluded.content_version,last_activity_at=excluded.last_activity_at,updated_at=excluded.updated_at,student_response=excluded.student_response,submission_at=excluded.submission_at,submission_file_key=COALESCE(excluded.submission_file_key,school_lesson_progress.submission_file_key),submission_file_name=COALESCE(excluded.submission_file_name,school_lesson_progress.submission_file_name),submission_file_type=COALESCE(excluded.submission_file_type,school_lesson_progress.submission_file_type),submission_file_size=COALESCE(excluded.submission_file_size,school_lesson_progress.submission_file_size),grade=NULL,feedback='',graded_at=NULL,graded_by=NULL`)
      .bind(crypto.randomUUID(),email,lesson.id,now,now,lesson.content_version,now,now,studentResponse,now,newKey,newName,newType,newSize).run();
  } catch (error) {
    if (uploaded && env.FILES) await env.FILES.delete(uploaded.key).catch(()=>undefined);
    throw error;
  }
  if (uploaded && old?.submission_file_key && env.FILES) await env.FILES.delete(old.submission_file_key).catch(()=>undefined);

  const counts = await env.DB.prepare(`SELECT SUM(CASE WHEN required_to_complete=1 THEN 1 ELSE 0 END) AS required_count,
    SUM(CASE WHEN required_to_complete=1 AND EXISTS(SELECT 1 FROM school_lesson_progress p WHERE p.lesson_id=school_lessons.id AND p.student_email=? COLLATE NOCASE AND p.status='completed') THEN 1 ELSE 0 END) AS completed_count
    FROM school_lessons WHERE course_id=? AND status='published'`).bind(email,access.course_id).first<{required_count:number|null;completed_count:number|null}>();
  const required=Number(counts?.required_count??0), completed=Number(counts?.completed_count??0);
  const courseStatus=required>0 && completed>=required?'completed':'in_progress';
  await env.DB.prepare(`INSERT INTO school_course_progress (id,student_email,course_id,status,started_at,completed_at,updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(student_email,course_id) DO UPDATE SET status=excluded.status,started_at=COALESCE(school_course_progress.started_at,excluded.started_at),completed_at=CASE WHEN excluded.status='completed' THEN COALESCE(school_course_progress.completed_at,excluded.completed_at) ELSE NULL END,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),email,access.course_id,courseStatus,now,courseStatus==='completed'?now:null,now).run();
  return json({ok:true,status:'completed',kind:'submitted',courseStatus,completedLessons:completed,requiredLessons:required});
};
