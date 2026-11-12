import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled, getCustomerEmail } from '../../../../../../../features/auth/customer';
import { ensureCustomerAccount } from '../../../../../../../features/auth/customerIdentity';

export const prerender = false;

// Sirve la construcción privada solo a un alumno que puede abrir la lección correspondiente.
export const GET: APIRoute = async ({ params, cookies }) => {
  if (!(await accountsEnabled())) return new Response('No disponible.', { status: 404 });
  const email = await getCustomerEmail(cookies);
  if (!email) return new Response('Inicia sesión para ver esta construcción.', { status: 401 });
  if (!env.FILES) return new Response('Almacenamiento no configurado.', { status: 503 });
  const courseSlug = params.curso ?? '', lessonSlug = params.slug ?? '', ref = params.ref ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(ref)) return new Response('Construcción no encontrada.', { status: 404 });
  const clientNumber = await ensureCustomerAccount(env.DB, email);

  // Comprobar compra, asignación académica con cuotas vigentes o matrícula en aula activa.
  const access = await env.DB.prepare(`SELECT c.id AS course_id,c.omitted_activities_allowed FROM school_courses c
    WHERE c.slug=? AND c.status='published' AND c.content_kind IN ('course','reading') AND NOT EXISTS(SELECT 1 FROM school_course_access_overrides ov WHERE ov.course_id=c.id AND ov.student_email=? COLLATE NOCASE AND ov.expires_at<date('now')) AND (
      EXISTS(SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.school_course_id=c.id AND lower(trim(o.email))=lower(trim(?)) AND o.status='paid' AND COALESCE(o.refunded_cents,0)<o.amount_total_cents)
      OR EXISTS(SELECT 1 FROM content_subscription_courses sc JOIN school_subscriptions ss ON ss.content_subscription_id=sc.subscription_id WHERE sc.course_id=c.id AND lower(trim(ss.student_email))=lower(trim(?)) AND ss.status IN ('active','trialing') AND (ss.current_period_end IS NULL OR ss.current_period_end>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
      OR EXISTS(SELECT 1 FROM school_course_assignments x WHERE x.course_id=c.id AND x.student_email=? COLLATE NOCASE AND x.status='active'
        AND EXISTS(SELECT 1 FROM school_area_diagnostics d WHERE d.student_email=x.student_email COLLATE NOCASE AND d.area_id=c.area_id AND d.status='approved' AND d.approved_level=c.level_code
          AND d.attempt_no=(SELECT MAX(d2.attempt_no) FROM school_area_diagnostics d2 WHERE d2.student_email=d.student_email COLLATE NOCASE AND d2.area_id=d.area_id))
        AND EXISTS(SELECT 1 FROM school_fee_payments f WHERE f.student_email=x.student_email COLLATE NOCASE AND f.fee_type='enrollment' AND f.valid_until>=date('now'))
        AND EXISTS(SELECT 1 FROM school_fee_payments f WHERE f.student_email=x.student_email COLLATE NOCASE AND f.fee_type='monthly' AND f.valid_until>=date('now')))
      OR EXISTS(SELECT 1 FROM school_classroom_students rs JOIN school_students st ON st.student_number=rs.student_number JOIN school_classrooms cr ON cr.id=rs.classroom_id JOIN school_academic_cycles cy ON cy.id=cr.cycle_id
        WHERE cr.course_id=c.id AND st.client_number=? AND st.status='active' AND rs.status='active' AND cr.status='active' AND date('now') BETWEEN cr.starts_on AND cr.ends_on AND cy.status='active'))
    LIMIT 1`).bind(courseSlug, email, email, email, email, clientNumber).first<{course_id:string;omitted_activities_allowed:number}>();
  if (!access) return new Response('Construcción no encontrada.', { status: 404 });

  const lesson = await env.DB.prepare(`SELECT sequence_no,assessment_json FROM school_lessons WHERE course_id=? AND slug=? AND status='published' LIMIT 1`)
    .bind(access.course_id, lessonSlug).first<{sequence_no:number;assessment_json:string|null}>();
  if (!lesson) return new Response('Construcción no encontrada.', { status: 404 });
  // Aplicar la misma regla de unidades previas y omisiones que usa el lector del curso.
  const prior = (await env.DB.prepare(`SELECT l.lesson_type,l.required_to_complete,COALESCE(p.status,'not_started') AS progress_status FROM school_lessons l
    LEFT JOIN school_lesson_progress p ON p.lesson_id=l.id AND p.student_email=? COLLATE NOCASE
    WHERE l.course_id=? AND l.status='published' AND l.sequence_no<? ORDER BY l.sequence_no`)
    .bind(email, access.course_id, lesson.sequence_no).all<{lesson_type:string;required_to_complete:number;progress_status:string}>()).results ?? [];
  let skipped = 0;
  for (const item of prior) {
    if (item.progress_status === 'completed' || item.required_to_complete !== 1) continue;
    if (item.lesson_type !== 'reading' && skipped < access.omitted_activities_allowed) { skipped++; continue; }
    return new Response('Completa las unidades anteriores para ver esta construcción.', { status: 403 });
  }
  let linked = false;
  try {
    const blocks = JSON.parse(lesson.assessment_json || '{}')?.blocks;
    linked = Array.isArray(blocks) && blocks.some((block: unknown) => typeof block === 'object' && block !== null && (block as {type?:unknown}).type === 'geogebragraphics' && (block as {ref?:unknown}).ref === ref);
  } catch { /* JSON previo/incompleto: denegar la lectura sin exponer el objeto. */ }
  if (!linked) return new Response('Construcción no encontrada.', { status: 404 });

  // La fila D1 resuelve el modo GeoGebra y su clave R2 privada para esta referencia.
  const asset = await env.DB.prepare(`SELECT object_key,app_name FROM school_course_geogebra_assets WHERE course_id=? AND asset_ref=? LIMIT 1`)
    .bind(access.course_id, ref).first<{object_key:string;app_name:'graphing'|'3d'}>();
  if (!asset) return new Response('La construcción aún no está disponible.', { status: 404 });
  const object = await env.FILES.get(asset.object_key);
  if (!object || object.size > 2_000_000) return new Response('La construcción aún no está disponible.', { status: 404 });
  return Response.json({xml:await object.text(),appName:asset.app_name},{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'}});
};
