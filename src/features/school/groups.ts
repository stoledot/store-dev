import type { D1Database } from '@cloudflare/workers-types';
import { enrollmentPaymentValidSql } from './enrollmentEligibility.ts';
import { manualGroupPaymentValidSql } from './manualGroupPayment.ts';

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
  if (action === 'details') {
    const title = value(form, 'title');
    const imageKey = value(form, 'image_key') || null;
    const description = value(form, 'description');
    const schedule = value(form, 'schedule');
    const rules = value(form, 'rules');
    const evaluation = value(form, 'evaluation_description');
    if (!title || title.length > 160 || (imageKey && imageKey.length > 500)
      || [description, schedule, rules, evaluation].some(item => item.length > 10000)) {
      throw new Error('Revisa el nombre, la imagen y la información del grupo.');
    }
    const result = await db.prepare(`UPDATE school_subprogram_groups
      SET title=?,image_key=?,description=?,schedule=?,rules=?,evaluation_description=?
      WHERE id=? AND (? IS NULL OR EXISTS (SELECT 1 FROM media WHERE image_key=?))`)
      .bind(title, imageKey, description, schedule, rules, evaluation, groupId, imageKey, imageKey).run();
    if (!result.meta.changes) throw new Error('El grupo o la imagen ya no existe.');
    return;
  }
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

export async function listStudentSchoolGroups(db: D1Database, clientNumber: string) {
  return (await db.prepare(`SELECT g.id,g.title,g.image_key,g.description,g.schedule,g.rules,g.evaluation_description,
      s.title AS subprogram_title
    FROM school_subprogram_groups g
    JOIN school_subprograms s ON s.id=g.subprogram_id
    JOIN customer_accounts account ON account.client_number=?
    WHERE g.status='active' AND s.id=g.subprogram_id
      AND ${manualGroupPaymentValidSql('account.client_number', 'g.id')}
      AND NOT EXISTS (SELECT 1 FROM school_manual_access deny WHERE deny.client_number=account.client_number
        AND deny.decision='deny' AND ((deny.resource_type='group' AND deny.resource_id=g.id)
          OR (deny.resource_type='subprogram' AND deny.resource_id=g.subprogram_id))
        AND (deny.expires_at IS NULL OR date(deny.expires_at)>=date('now')))
      AND (EXISTS (SELECT 1 FROM school_manual_access allow_group WHERE allow_group.client_number=account.client_number
            AND allow_group.resource_type='group' AND allow_group.resource_id=g.id AND allow_group.decision='allow'
            AND (allow_group.expires_at IS NULL OR date(allow_group.expires_at)>=date('now')))
        OR EXISTS (SELECT 1 FROM school_subprogram_enrollments e
          JOIN school_subprogram_group_members member ON member.enrollment_id=e.id AND member.group_id=g.id
          WHERE e.client_number=account.client_number AND e.subprogram_id=g.subprogram_id AND ${enrollmentPaymentValidSql}))
    ORDER BY s.title,g.title`).bind(clientNumber).all<{
      id:string;title:string;image_key:string|null;description:string;schedule:string;rules:string;
      evaluation_description:string;subprogram_title:string;
    }>()).results;
}
