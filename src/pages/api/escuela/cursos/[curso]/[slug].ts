import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled, getCustomerEmail } from '../../../../../features/auth/customer';

export const prerender = false;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, cookies, params, url }) => {
  // Reject cross-origin form/script posts. Browsers send Origin for fetch POSTs.
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'Solicitud de origen no válido.' }, 403);
  if (!(await accountsEnabled())) return json({ error: 'Las cuentas no están habilitadas.' }, 403);
  const email = await getCustomerEmail(cookies);
  if (!email) return json({ error: 'Inicia sesión para registrar tu avance.' }, 401);

  let body: { action?: unknown; response?: unknown };
  try {
    body = await request.json() as { action?: unknown; response?: unknown };
  } catch {
    return json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, 400);
  }

  const action = body.action;
  if (action !== 'read' && action !== 'submit') return json({ error: 'Acción no válida.' }, 400);

  // Access is derived from the verified session and server-side assignment/payments,
  // never from an email or course id supplied by the browser.
  const access = await env.DB.prepare(`
    SELECT c.id AS course_id
    FROM school_course_assignments x
    JOIN school_courses c ON c.id = x.course_id
    JOIN school_student_intake i
      ON i.student_email = x.student_email COLLATE NOCASE
     AND i.status = 'approved'
     AND i.selected_area_id = c.area_id
     AND i.approved_level = c.level_code
    WHERE x.student_email = ? COLLATE NOCASE
      AND x.status = 'active'
      AND c.slug = ?
      AND c.status = 'published'
      AND EXISTS (
        SELECT 1 FROM school_fee_payments p
        WHERE p.student_email = x.student_email COLLATE NOCASE
          AND p.fee_type = 'enrollment' AND p.valid_until >= date('now')
      )
      AND EXISTS (
        SELECT 1 FROM school_fee_payments p
        WHERE p.student_email = x.student_email COLLATE NOCASE
          AND p.fee_type = 'monthly' AND p.valid_until >= date('now')
      )
    LIMIT 1
  `).bind(email, params.curso ?? '').first<{ course_id: string }>();
  if (!access) return json({ error: 'No tienes acceso vigente a este curso.' }, 403);

  const lesson = await env.DB.prepare(`
    SELECT id, lesson_type, content_version
    FROM school_lessons
    WHERE course_id = ? AND slug = ? AND status = 'published'
    LIMIT 1
  `).bind(access.course_id, params.slug ?? '').first<{
    id: string;
    lesson_type: 'reading' | 'quiz' | 'exercise' | 'assignment';
    content_version: number;
  }>();
  if (!lesson) return json({ error: 'La lección no existe o no está publicada.' }, 404);

  let studentResponse = '';
  if (lesson.lesson_type === 'reading') {
    if (action !== 'read') return json({ error: 'Esta lección se completa al leerla.' }, 400);
  } else {
    if (action !== 'submit') return json({ error: 'Debes enviar una respuesta para registrar esta actividad.' }, 400);
    if (typeof body.response !== 'string') return json({ error: 'Escribe tu respuesta antes de enviar.' }, 400);
    studentResponse = body.response.trim();
    if (studentResponse.length < 5) return json({ error: 'La respuesta debe tener al menos 5 caracteres.' }, 400);
    if (studentResponse.length > 20000) return json({ error: 'La respuesta excede el límite de 20 000 caracteres.' }, 400);
  }

  const now = new Date().toISOString();
  const progressId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO school_lesson_progress (
      id, student_email, lesson_id, status, attempts, started_at, completed_at,
      content_version, last_activity_at, updated_at, student_response, submission_at
    ) VALUES (
      ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(student_email, lesson_id) DO UPDATE SET
      status = 'completed',
      started_at = COALESCE(school_lesson_progress.started_at, excluded.started_at),
      completed_at = COALESCE(school_lesson_progress.completed_at, excluded.completed_at),
      attempts = school_lesson_progress.attempts + CASE WHEN ? = 'submit' THEN 1 ELSE 0 END,
      content_version = excluded.content_version,
      last_activity_at = excluded.last_activity_at,
      updated_at = excluded.updated_at,
      student_response = CASE WHEN ? = 'submit' THEN excluded.student_response ELSE school_lesson_progress.student_response END,
      submission_at = CASE WHEN ? = 'submit' THEN excluded.submission_at ELSE school_lesson_progress.submission_at END
  `).bind(
    progressId,
    email,
    lesson.id,
    action === 'submit' ? 1 : 0,
    now,
    now,
    lesson.content_version,
    now,
    now,
    action === 'submit' ? studentResponse : '',
    action === 'submit' ? now : null,
    action,
    action,
    action,
  ).run();

  // Refresh the aggregate course status for the student's admin/student progress views.
  const counts = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN required_to_complete = 1 THEN 1 ELSE 0 END) AS required_count,
      SUM(CASE WHEN required_to_complete = 1 AND EXISTS (
        SELECT 1 FROM school_lesson_progress p
        WHERE p.lesson_id = school_lessons.id
          AND p.student_email = ? COLLATE NOCASE
          AND p.status = 'completed'
      ) THEN 1 ELSE 0 END) AS completed_count
    FROM school_lessons
    WHERE course_id = ? AND status = 'published'
  `).bind(email, access.course_id).first<{ required_count: number | null; completed_count: number | null }>();

  const required = Number(counts?.required_count ?? 0);
  const completed = Number(counts?.completed_count ?? 0);
  const courseStatus = required > 0 && completed >= required ? 'completed' : 'in_progress';
  await env.DB.prepare(`
    INSERT INTO school_course_progress (
      id, student_email, course_id, status, started_at, completed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_email, course_id) DO UPDATE SET
      status = excluded.status,
      started_at = COALESCE(school_course_progress.started_at, excluded.started_at),
      completed_at = CASE WHEN excluded.status = 'completed'
        THEN COALESCE(school_course_progress.completed_at, excluded.completed_at)
        ELSE NULL END,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(), email, access.course_id, courseStatus, now,
    courseStatus === 'completed' ? now : null, now,
  ).run();

  return json({
    ok: true,
    status: 'completed',
    kind: lesson.lesson_type === 'reading' ? 'read' : 'submitted',
    courseStatus,
    completedLessons: completed,
    requiredLessons: required,
  });
};
