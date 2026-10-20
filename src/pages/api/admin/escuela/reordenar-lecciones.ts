import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../features/school/adminApiAuth';

export const prerender = false;
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export const POST: APIRoute = async ({ request, url, cookies, locals }) => {
  if (!(await isSchoolAdminRequest(cookies.get('admin_session')?.value, locals.adminEmail))) return json({ error: 'Se requiere una sesión administrativa.' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'Origen no válido.' }, 403);
  let body: { courseId?: unknown; lessonIds?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return json({ error: 'JSON inválido.' }, 400); }
  const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : '';
  const lessonIds = body.lessonIds;
  if (!courseId || !Array.isArray(lessonIds) || lessonIds.length > 500 || lessonIds.some((id) => typeof id !== 'string' || !id)) {
    return json({ error: 'Curso u orden de lecciones inválido.' }, 400);
  }
  if (new Set(lessonIds).size !== lessonIds.length) return json({ error: 'Hay lecciones repetidas en el orden.' }, 400);
  const rows = await env.DB.prepare('SELECT id FROM school_lessons WHERE course_id = ? ORDER BY sequence_no, id').bind(courseId).all<{ id: string }>();
  const current = rows.results ?? [];
  if (current.length !== lessonIds.length || current.some((row) => !lessonIds.includes(row.id))) {
    return json({ error: 'El orden debe incluir exactamente todas las lecciones de este curso.' }, 400);
  }
  if (lessonIds.length === 0) return json({ ok: true, count: 0 });
  const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(sequence_no), 0) AS n FROM school_lessons WHERE course_id = ?').bind(courseId).first<{ n: number }>();
  const base = Number(maxRow?.n ?? 0) + lessonIds.length + 10;
  // Dos fases dentro de un D1 batch atómico: primero valores temporales positivos
  // fuera del rango actual; luego la secuencia compacta 1..N. No se viola UNIQUE.
  const statements = [
    ...lessonIds.map((id, i) => env.DB.prepare('UPDATE school_lessons SET sequence_no = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ? AND course_id = ?').bind(base + i, id, courseId)),
    ...lessonIds.map((id, i) => env.DB.prepare('UPDATE school_lessons SET sequence_no = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ? AND course_id = ?').bind(i + 1, id, courseId)),
  ];
  await env.DB.batch(statements);
  return json({ ok: true, count: lessonIds.length });
};
