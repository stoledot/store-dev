import type { D1Database } from '@cloudflare/workers-types';
import { enrollmentPaymentValidSql } from './enrollmentEligibility.ts';

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

export async function saveSchoolGroupAction(db: D1Database, form: FormData): Promise<void> {
  const action = value(form, 'action');
  const groupId = value(form, 'group_id');
  if (action === 'create') {
    const subprogramId = value(form, 'subprogram_id');
    const title = value(form, 'title');
    if (!subprogramId || !title || title.length > 160) throw new Error('Indica un subprograma y nombre de grupo válidos.');
    const result = await db.prepare(`
      INSERT INTO school_subprogram_groups(id,subprogram_id,title)
      SELECT ?,id,? FROM school_subprograms WHERE id=? AND status='active'
    `).bind(crypto.randomUUID(), title, subprogramId).run();
    if (!result.meta.changes) throw new Error('El subprograma no está activo.');
    return;
  }
  if (!groupId) throw new Error('Selecciona un grupo.');
  if (action === 'conference') {
    const raw = value(form, 'conference_id');
    const conferenceId = raw ? Number(raw) : null;
    if (conferenceId !== null && (!Number.isSafeInteger(conferenceId) || conferenceId < 1)) throw new Error('Conferencia inválida.');
    const result = await db.prepare(`
      UPDATE school_subprogram_groups SET conference_id=?
      WHERE id=? AND (? IS NULL OR EXISTS (SELECT 1 FROM conferences WHERE id=? AND status IN ('draft','published')))
    `).bind(conferenceId, groupId, conferenceId, conferenceId).run();
    if (!result.meta.changes) throw new Error('Grupo o conferencia no disponibles.');
    return;
  }
  if (action === 'status') {
    const status = value(form, 'status');
    if (status !== 'active' && status !== 'archived') throw new Error('Estado de grupo inválido.');
    const result = await db.prepare('UPDATE school_subprogram_groups SET status=? WHERE id=?').bind(status, groupId).run();
    if (!result.meta.changes) throw new Error('Grupo no encontrado.');
    return;
  }
  if (action === 'add-course') {
    const courseId = value(form, 'course_id');
    const result = await db.prepare(`
      INSERT INTO school_subprogram_group_courses(group_id,course_id)
      SELECT g.id,sc.course_id FROM school_subprogram_groups g
      JOIN school_subprogram_courses sc ON sc.subprogram_id=g.subprogram_id
      WHERE g.id=? AND g.status='active' AND sc.course_id=?
      ON CONFLICT(group_id,course_id) DO NOTHING
    `).bind(groupId, courseId).run();
    if (!result.meta.changes) throw new Error('El curso ya está asignado o no pertenece al subprograma.');
    return;
  }
  if (action === 'remove-course') {
    const result = await db.prepare('DELETE FROM school_subprogram_group_courses WHERE group_id=? AND course_id=?')
      .bind(groupId, value(form, 'course_id')).run();
    if (!result.meta.changes) throw new Error('El curso no está asignado al grupo.');
    return;
  }
  if (action === 'assign') {
    const enrollmentId = value(form, 'enrollment_id');
    const result = await db.prepare(`
      INSERT INTO school_subprogram_group_members(enrollment_id,group_id,assigned_at)
      SELECT e.id,g.id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
        FROM school_subprogram_enrollments e JOIN school_subprogram_groups g ON g.subprogram_id=e.subprogram_id
       WHERE e.id=? AND g.id=? AND g.status='active' AND ${enrollmentPaymentValidSql}
      ON CONFLICT(enrollment_id) DO UPDATE SET group_id=excluded.group_id,assigned_at=excluded.assigned_at
    `).bind(enrollmentId, groupId).run();
    if (!result.meta.changes) throw new Error('El alumno necesita pagos vigentes y un grupo activo de su subprograma.');
    return;
  }
  if (action === 'remove-member') {
    const result = await db.prepare('DELETE FROM school_subprogram_group_members WHERE enrollment_id=? AND group_id=?')
      .bind(value(form, 'enrollment_id'), groupId).run();
    if (!result.meta.changes) throw new Error('La asignación ya no existe.');
    return;
  }
  throw new Error('Acción no reconocida.');
}
