import type { D1Database } from '@cloudflare/workers-types';

/** Check both the learner's current course entitlement and lesson membership before audio is exposed. */
export async function domanLessonAccess(db:D1Database,email:string,clientNumber:string,courseSlug:string,lessonSlug:string){
 const course=await db.prepare(`SELECT c.id FROM school_courses c WHERE c.slug=? AND c.status='published' AND c.content_kind IN ('course','reading') AND NOT EXISTS(SELECT 1 FROM school_course_access_overrides ov WHERE ov.course_id=c.id AND ov.student_email=? COLLATE NOCASE AND ov.expires_at<date('now')) AND (
  EXISTS(SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.school_course_id=c.id AND lower(trim(o.email))=lower(trim(?)) AND o.status='paid' AND COALESCE(o.refunded_cents,0)<o.amount_total_cents)
  OR EXISTS(SELECT 1 FROM content_subscription_courses sc JOIN school_subscriptions ss ON ss.content_subscription_id=sc.subscription_id WHERE sc.course_id=c.id AND lower(trim(ss.student_email))=lower(trim(?)) AND ss.status IN ('active','trialing') AND (ss.current_period_end IS NULL OR ss.current_period_end>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
  OR EXISTS(SELECT 1 FROM school_course_assignments x WHERE x.course_id=c.id AND x.student_email=? COLLATE NOCASE AND x.status='active' AND EXISTS(SELECT 1 FROM school_area_diagnostics d WHERE d.student_email=x.student_email COLLATE NOCASE AND d.area_id=c.area_id AND d.status='approved' AND d.approved_level=c.level_code AND d.attempt_no=(SELECT MAX(d2.attempt_no) FROM school_area_diagnostics d2 WHERE d2.student_email=d.student_email COLLATE NOCASE AND d2.area_id=d.area_id)) AND EXISTS(SELECT 1 FROM school_fee_payments p WHERE p.student_email=x.student_email COLLATE NOCASE AND p.fee_type='enrollment' AND p.valid_until>=date('now')) AND EXISTS(SELECT 1 FROM school_fee_payments p WHERE p.student_email=x.student_email COLLATE NOCASE AND p.fee_type='monthly' AND p.valid_until>=date('now')))
  OR EXISTS(SELECT 1 FROM school_classroom_students rs JOIN school_students st ON st.student_number=rs.student_number JOIN school_classrooms cr ON cr.id=rs.classroom_id JOIN school_academic_cycles cy ON cy.id=cr.cycle_id WHERE cr.course_id=c.id AND st.client_number=? AND st.status='active' AND rs.status='active' AND cr.status='active' AND date('now') BETWEEN cr.starts_on AND cr.ends_on AND cy.status='active')
 ) LIMIT 1`).bind(courseSlug,email,email,email,email,clientNumber).first<{id:string}>();
 if(!course)return null;
 const lesson=await db.prepare("SELECT id FROM school_lessons WHERE course_id=? AND slug=? AND status='published'").bind(course.id,lessonSlug).first<{id:string}>();
 return lesson?{courseId:course.id,lessonId:lesson.id}:null;
}
