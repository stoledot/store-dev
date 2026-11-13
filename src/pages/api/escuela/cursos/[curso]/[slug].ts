import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled, getCustomerEmail } from '../../../../../features/auth/customer';
import { ensureCustomerAccount } from '../../../../../features/auth/customerIdentity';
import { validateLatexDraft } from '../../../../../features/mathTexts/latexDraft';
import { checkXmlLessonStart } from '../../../../../features/school/xmlLessonLimits';
import { subprogramCourseAccessSql } from '../../../../../features/school/subprogramAccess';

export const prerender = false;
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
type Question = { id: string; type: 'multiple_choice'|'multiple_choice_multi'|'short_answer'|'long_answer'|'file_upload'; prompt: string; options?: Array<string|{id:string;label:string}>; required?: boolean; correct?: string|string[]|null; explanation?:string; maxSelections?:number };
const parseQuestions = (raw: string): Question[] => {
  try { const value = JSON.parse(raw) as {questions?: unknown}; return Array.isArray(value.questions) ? value.questions as Question[] : []; }
  catch { return []; }
};
const safeName = (name: string) => name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-120) || 'entrega';
const allowedFiles = new Map([['pdf','application/pdf'],['png','image/png'],['jpg','image/jpeg'],['jpeg','image/jpeg'],['webp','image/webp'],['txt','text/plain'],['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document']]);

export const POST: APIRoute = async ({ request, cookies, params, url, locals }) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'Solicitud de origen no válido.' }, 403);
  if (!(await accountsEnabled())) return json({ error: 'Las cuentas no están habilitadas.' }, 403);
  const email = await getCustomerEmail(cookies);
  if (!email) return json({ error: 'Inicia sesión para registrar tu avance.' }, 401);
  const clientNumber = await ensureCustomerAccount(env.DB, email);
  const contentType = request.headers.get('content-type') || '';
  let action = '';
  let latexSource:unknown=null;
  let form: FormData | null = null;
  if (contentType.includes('application/json')) {
    let body: {action?:unknown;source?:unknown}; try { body = await request.json() as typeof body; } catch { return json({error:'JSON inválido.'},400); }
    action = typeof body.action === 'string' ? body.action : '';
    latexSource=body.source;
  } else {
    try { form = await request.formData(); } catch { return json({error:'No se pudo leer la entrega.'},400); }
    action = 'submit';
  }
  if (action !== 'read' && action !== 'submit' && action !== 'save_latex') return json({ error: 'Acción no válida.' }, 400);

  const access = await env.DB.prepare(`
    SELECT c.id AS course_id,c.omitted_activities_allowed FROM school_courses c
    WHERE c.slug=? AND c.status='published' AND c.content_kind IN ('course','reading') AND NOT EXISTS(SELECT 1 FROM school_course_access_overrides ov WHERE ov.course_id=c.id AND ov.student_email=? COLLATE NOCASE AND ov.expires_at<date('now')) AND (
      EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.school_course_id=c.id AND lower(trim(o.email))=lower(trim(?)) AND o.status='paid' AND COALESCE(o.refunded_cents,0)<o.amount_total_cents)
      OR EXISTS (SELECT 1 FROM content_subscription_courses sc JOIN school_subscriptions ss ON ss.content_subscription_id=sc.subscription_id WHERE sc.course_id=c.id AND lower(trim(ss.student_email))=lower(trim(?)) AND ss.status IN ('active','trialing') AND (ss.current_period_end IS NULL OR ss.current_period_end>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
      OR EXISTS (SELECT 1 FROM school_course_assignments x WHERE x.course_id=c.id AND x.student_email=? COLLATE NOCASE AND x.status='active' AND EXISTS(SELECT 1 FROM school_area_diagnostics d WHERE d.student_email=x.student_email COLLATE NOCASE AND d.area_id=c.area_id AND d.status='approved' AND d.approved_level=c.level_code AND d.attempt_no=(SELECT MAX(d2.attempt_no) FROM school_area_diagnostics d2 WHERE d2.student_email=d.student_email COLLATE NOCASE AND d2.area_id=d.area_id)) AND EXISTS (SELECT 1 FROM school_fee_payments p WHERE p.student_email=x.student_email COLLATE NOCASE AND p.fee_type='enrollment' AND p.valid_until>=date('now')) AND EXISTS (SELECT 1 FROM school_fee_payments p WHERE p.student_email=x.student_email COLLATE NOCASE AND p.fee_type='monthly' AND p.valid_until>=date('now')))
      OR ${subprogramCourseAccessSql}
      OR EXISTS (SELECT 1 FROM school_classroom_students rs JOIN school_students st ON st.student_number=rs.student_number JOIN school_classrooms cr ON cr.id=rs.classroom_id JOIN school_academic_cycles cy ON cy.id=cr.cycle_id WHERE cr.course_id=c.id AND st.client_number=? AND st.status='active' AND rs.status='active' AND cr.status='active' AND date('now') BETWEEN cr.starts_on AND cr.ends_on AND cy.status='active')
    ) LIMIT 1`).bind(params.curso ?? '', email, email, email, email, clientNumber, clientNumber).first<{course_id:string;omitted_activities_allowed:number}>();
  if (!access) return json({ error: 'No tienes acceso vigente a este curso.' }, 403);

  const blocked = await env.DB.prepare(`SELECT SUM(CASE WHEN l.lesson_type='reading' THEN 1 ELSE 0 END) AS pending_readings,SUM(CASE WHEN l.lesson_type<>'reading' AND l.required_to_complete=1 THEN 1 ELSE 0 END) AS pending_activities FROM school_lessons l LEFT JOIN school_lesson_progress p ON p.lesson_id=l.id AND p.student_email=? COLLATE NOCASE WHERE l.course_id=? AND l.status='published' AND l.required_to_complete=1 AND l.sequence_no<(SELECT sequence_no FROM school_lessons WHERE course_id=? AND slug=? AND status='published') AND COALESCE(p.status,'not_started')<>'completed'`).bind(email,access.course_id,access.course_id,params.slug??'').first<{pending_readings:number|null;pending_activities:number|null}>();
  if (Number(blocked?.pending_readings??0)>0 || Number(blocked?.pending_activities??0)>access.omitted_activities_allowed) return json({error:'Completa una unidad anterior antes de continuar; revisa tu límite de omisiones del curso.'},403);

  const lesson = await env.DB.prepare(`SELECT id,lesson_type,content_version,assessment_json,tex_node_id,xml_lesson_id,inputlatex_instruction FROM school_lessons WHERE course_id=? AND slug=? AND status='published' LIMIT 1`)
    .bind(access.course_id, params.slug ?? '').first<{id:string;lesson_type:string;content_version:number;assessment_json:string;tex_node_id:string|null;xml_lesson_id:string|null;inputlatex_instruction:string}>();
  if (!lesson) return json({error:'La lección no existe o no está publicada.'},404);
  // Store practice independently from graded progress so unfinished or invalid TeX never changes a student's completion status.
  if(action==='save_latex'){
    if(!lesson.xml_lesson_id||!lesson.inputlatex_instruction?.trim())return json({error:'Esta lección no tiene editor de LaTeX habilitado.'},400);
    if(typeof latexSource!=='string'||latexSource.length>20000)return json({error:'El código debe ser texto y no superar 20 000 caracteres.'},400);
    const nowDraft=new Date().toISOString(),latexDiagnostics=validateLatexDraft(latexSource);
    await env.DB.prepare(`INSERT INTO school_latex_drafts(student_email,course_id,xml_lesson_id,source,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(student_email,course_id,xml_lesson_id) DO UPDATE SET source=excluded.source,updated_at=excluded.updated_at`).bind(email,access.course_id,lesson.xml_lesson_id,latexSource,nowDraft).run();
    return json({ok:true,savedAt:nowDraft,diagnostics:latexDiagnostics});
  }
  const xmlLimit=await checkXmlLessonStart(env.DB,email,access.course_id,lesson.id,locals.settings?.timeZone??'UTC');if(!xmlLimit.allowed)return json({error:xmlLimit.message??'Se alcanzó el máximo de lecciones.'},429);
  const now = new Date().toISOString();
  const old = await env.DB.prepare('SELECT submission_file_key,submission_at FROM school_lesson_progress WHERE student_email=? COLLATE NOCASE AND lesson_id=?').bind(email,lesson.id).first<{submission_file_key:string|null;submission_at:string|null}>();
  const retryControl = await env.DB.prepare('SELECT locked FROM school_lesson_resubmission_controls WHERE student_email=? COLLATE NOCASE AND lesson_id=?').bind(email,lesson.id).first<{locked:number}>();

  if (lesson.lesson_type === 'reading') {
    if (action !== 'read') return json({error:'Esta lección se completa al leerla.'},400);
    await env.DB.prepare(`INSERT INTO school_lesson_progress (id,student_email,lesson_id,status,started_at,completed_at,content_version,last_activity_at,updated_at)
      VALUES (?,?,?,'completed',?,?,?,?,?) ON CONFLICT(student_email,lesson_id) DO UPDATE SET status='completed',started_at=COALESCE(school_lesson_progress.started_at,excluded.started_at),completed_at=COALESCE(school_lesson_progress.completed_at,excluded.completed_at),content_version=excluded.content_version,last_activity_at=excluded.last_activity_at,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(),email,lesson.id,now,now,lesson.content_version,now,now).run();
    return json({ok:true,status:'completed',kind:'read'});
  }
  if (action !== 'submit' || !form) return json({error:'Debes enviar una respuesta para registrar esta actividad.'},400);
  if (old?.submission_at && retryControl?.locked===1) return json({error:'La administración bloqueó los reenvíos de esta actividad.'},403);

  // Read trusted answer keys from D1 so grading never depends on client-supplied correctness data.
  const questions = parseQuestions(lesson.assessment_json || '{"questions":[]}');
  const answers: Record<string,string|string[]> = {};
  for (const question of questions) {
    if (!question || typeof question.id !== 'string' || !['multiple_choice','multiple_choice_multi','short_answer','long_answer','file_upload'].includes(question.type)) continue;
    if (question.type === 'file_upload') continue;
    const values = form.getAll(`answer_${question.id}`).filter((value): value is string => typeof value === 'string').map(value=>value.trim());
    const answer = question.type==='multiple_choice_multi' ? [...new Set(values)] : (values[0]??'');
    if (question.required !== false && (Array.isArray(answer)?answer.length===0:!answer)) return json({error:`Responde la pregunta: ${question.prompt}`},400);
    if ((Array.isArray(answer)?answer.some(value=>value.length>20000):answer.length>20000)) return json({error:'Una respuesta excede el límite de 20 000 caracteres.'},400);
    if (question.type === 'multiple_choice' || question.type === 'multiple_choice_multi') {
      const allowed=(question.options??[]).map(option=>typeof option==='string'?option:option.id);
      if(Array.isArray(answer)){
        const correct=Array.isArray(question.correct)?question.correct:[];
        const max=Math.min(correct.length,question.maxSelections??correct.length);
        if(answer.length>max)return json({error:`Puedes seleccionar como máximo ${max} respuestas.`},400);
        if(answer.some(value=>!allowed.includes(value)))return json({error:'Una respuesta seleccionada no pertenece a las opciones disponibles.'},400);
      }else if(answer&&!allowed.includes(answer))return json({error:'Selecciona una de las opciones disponibles.'},400);
    }
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
  const autoGrade = questions.length > 0 && questions.every((question) => question.type === 'multiple_choice' && typeof question.correct === 'string' || question.type === 'multiple_choice_multi' && Array.isArray(question.correct) && question.correct.length>0);
  let automaticScore=0;let correctCount=0;let explanation='';
  if(autoGrade) for(const question of questions){if(question.type==='multiple_choice'){const isCorrect=answers[question.id]===question.correct;automaticScore+=isCorrect?100:0;if(isCorrect)correctCount++;}else{const selected=(answers[question.id] as string[])??[],correct=question.correct as string[],hits=selected.filter(value=>correct.includes(value)).length,wrong=selected.length-hits;const points=Math.max(0,Math.min(1,(hits-wrong)/correct.length))*100;automaticScore+=points;if(points===100)correctCount++;}if(question.explanation)explanation+=`${question.explanation}\n`;}
  const grade = autoGrade ? Math.round((automaticScore / questions.length) * (lesson.tex_node_id ? 10 : 100) * 10) / 10 : null;
  const gradeFeedback = autoGrade ? `Calificación automática: ${grade}/${lesson.tex_node_id?10:100}. ${correctCount} de ${questions.length} reactivos completamente correctos.${explanation?`\n\nExplicación:\n${explanation.trim()}`:''}` : '';
  const newKey = uploaded?.key ?? old?.submission_file_key ?? null;
  const newName = uploaded?.name ?? null;
  const newType = uploaded?.type ?? null;
  const newSize = uploaded?.size ?? null;
  try {
    // Save the student's submission and its automatic grade together; non-objective activities remain available for teacher review.
    await env.DB.prepare(`INSERT INTO school_lesson_progress (id,student_email,lesson_id,status,attempts,started_at,completed_at,content_version,last_activity_at,updated_at,student_response,submission_at,submission_file_key,submission_file_name,submission_file_type,submission_file_size,grade,feedback,graded_at,graded_by)
      VALUES (?,?,?,'completed',1,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?)
      ON CONFLICT(student_email,lesson_id) DO UPDATE SET status='completed',started_at=COALESCE(school_lesson_progress.started_at,excluded.started_at),completed_at=COALESCE(school_lesson_progress.completed_at,excluded.completed_at),attempts=school_lesson_progress.attempts+1,content_version=excluded.content_version,last_activity_at=excluded.last_activity_at,updated_at=excluded.updated_at,student_response=excluded.student_response,submission_at=excluded.submission_at,submission_file_key=COALESCE(excluded.submission_file_key,school_lesson_progress.submission_file_key),submission_file_name=COALESCE(excluded.submission_file_name,school_lesson_progress.submission_file_name),submission_file_type=COALESCE(excluded.submission_file_type,school_lesson_progress.submission_file_type),submission_file_size=COALESCE(excluded.submission_file_size,school_lesson_progress.submission_file_size),grade=excluded.grade,feedback=excluded.feedback,graded_at=excluded.graded_at,graded_by=excluded.graded_by`)
      .bind(crypto.randomUUID(),email,lesson.id,now,now,lesson.content_version,now,now,studentResponse,now,newKey,newName,newType,newSize,grade,gradeFeedback,autoGrade?now:null,autoGrade?'auto':null).run();
  } catch (error) {
    if (uploaded && env.FILES) await env.FILES.delete(uploaded.key).catch(()=>undefined);
    throw error;
  }
  if (uploaded && old?.submission_file_key && env.FILES) await env.FILES.delete(old.submission_file_key).catch(()=>undefined);

  const counts = await env.DB.prepare(`SELECT SUM(CASE WHEN required_to_complete=1 THEN 1 ELSE 0 END) AS required_count,
    SUM(CASE WHEN required_to_complete=1 AND lesson_type<>'reading' THEN 1 ELSE 0 END) AS required_activities,
    SUM(CASE WHEN required_to_complete=1 AND EXISTS(SELECT 1 FROM school_lesson_progress p WHERE p.lesson_id=school_lessons.id AND p.student_email=? COLLATE NOCASE AND p.status='completed') THEN 1 ELSE 0 END) AS completed_count
    FROM school_lessons WHERE course_id=? AND status='published'`).bind(email,access.course_id).first<{required_count:number|null;required_activities:number|null;completed_count:number|null}>();
  const required=Number(counts?.required_count??0), completed=Number(counts?.completed_count??0);
  const allowedOmissions=Math.min(access.omitted_activities_allowed,Number(counts?.required_activities??0));
  const completionTarget=Math.max(0,required-allowedOmissions);
  const courseStatus=required>0 && completed>=completionTarget?'completed':'in_progress';
  await env.DB.prepare(`INSERT INTO school_course_progress (id,student_email,course_id,status,started_at,completed_at,updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(student_email,course_id) DO UPDATE SET status=excluded.status,started_at=COALESCE(school_course_progress.started_at,excluded.started_at),completed_at=CASE WHEN excluded.status='completed' THEN COALESCE(school_course_progress.completed_at,excluded.completed_at) ELSE NULL END,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),email,access.course_id,courseStatus,now,courseStatus==='completed'?now:null,now).run();
  return json({ok:true,status:'completed',kind:'submitted',courseStatus,completedLessons:completed,requiredLessons:required,grade,gradeScale:lesson.tex_node_id?10:100});
};
