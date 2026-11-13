import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { listDiagnosticQuestions, saveDiagnosticQuestion, submitSubprogramDiagnostic } from '../../src/features/school/subprogramDiagnostics.ts';
import { reconcileEnrollmentPolicies, reconcileSubprogramSchedules, reviewSubprogramDiagnostic } from '../../src/features/school/subprogramBilling.ts';
import { claimSchoolCheckout } from '../../src/features/school/schoolCheckout.ts';
import { subprogramCourseAccessSql } from '../../src/features/school/subprogramAccess.ts';
import { settleSubprogramObligation } from '../../src/features/school/subprogramSettlement.ts';
import { getSchoolHomeSummary } from '../../src/features/school/homeSummary.ts';
import { saveSchoolGroupAction } from '../../src/features/school/groups.ts';
import { getUserConferences, getUserConferencesSessions } from '../../src/features/conferences/db.ts';

const mf = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response("ok") } }',
  compatibilityDate: '2026-07-20',
  d1Databases: ['DB'],
});
const form = (fields) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

try {
  const db = await mf.getD1Database('DB');
  for (const sql of [
    "CREATE TABLE school_programs (slug TEXT PRIMARY KEY, status TEXT NOT NULL)",
    "CREATE TABLE school_subprograms (id TEXT PRIMARY KEY, program_slug TEXT, title TEXT, status TEXT)",
    "CREATE TABLE school_payment_products (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, fee_type TEXT NOT NULL, validity_months INTEGER NOT NULL, active INTEGER NOT NULL)",
    "CREATE TABLE school_payment_modalities (id TEXT PRIMARY KEY, subprogram_id TEXT NOT NULL, payment_product_id TEXT NOT NULL, payment_type TEXT NOT NULL, frequency_unit TEXT NOT NULL, frequency_count INTEGER NOT NULL, validity_count INTEGER, validity_unit TEXT, requires_current_enrollment INTEGER NOT NULL, status TEXT NOT NULL, course_id TEXT)",
    "CREATE TABLE customer_accounts (email TEXT PRIMARY KEY, client_number TEXT UNIQUE)",
    "CREATE TABLE customer_email_aliases (old_email TEXT PRIMARY KEY, current_email TEXT NOT NULL)",
    "CREATE TABLE school_payment_obligations (id TEXT PRIMARY KEY, payment_product_id TEXT, student_email TEXT NOT NULL, title_snapshot TEXT NOT NULL, description_snapshot TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, fee_type TEXT NOT NULL, validity_months INTEGER NOT NULL, due_at TEXT NOT NULL, available_at TEXT, status TEXT NOT NULL DEFAULT 'pending', paid_at TEXT, order_id INTEGER, checkout_lock_token TEXT, checkout_locked_at TEXT, checkout_session_id TEXT, updated_at TEXT)",
    "CREATE TABLE pending_payments (id TEXT PRIMARY KEY, payment_hash TEXT, backend TEXT, status TEXT, expires_at TEXT)",
    "CREATE TABLE school_courses (id TEXT PRIMARY KEY, slug TEXT, title TEXT, status TEXT, content_kind TEXT, area_id TEXT, level_code TEXT)",
    "CREATE TABLE school_subprogram_courses (subprogram_id TEXT, course_id TEXT)",
    "CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, refunded_cents INTEGER, amount_total_cents INTEGER, email TEXT)",
    "CREATE TABLE school_notifications (id TEXT PRIMARY KEY, student_email TEXT, title TEXT, body TEXT, message TEXT, href TEXT)",
    "CREATE TABLE school_lessons (id TEXT PRIMARY KEY, course_id TEXT, slug TEXT, title TEXT, status TEXT, sequence_no INTEGER)",
    "CREATE TABLE school_lesson_progress (lesson_id TEXT, student_email TEXT, status TEXT)",
    "CREATE TABLE school_course_progress (course_id TEXT, student_email TEXT, status TEXT)",
    "CREATE TABLE school_course_access_overrides (course_id TEXT, student_email TEXT, expires_at TEXT)",
    "CREATE TABLE order_items (school_course_id TEXT, order_id INTEGER)",
    "CREATE TABLE content_subscription_courses (course_id TEXT, subscription_id TEXT)",
    "CREATE TABLE school_subscriptions (content_subscription_id TEXT, student_email TEXT, status TEXT, current_period_end TEXT)",
    "CREATE TABLE school_course_assignments (course_id TEXT, student_email TEXT, status TEXT)",
    "CREATE TABLE school_area_diagnostics (student_email TEXT, area_id TEXT, status TEXT, approved_level TEXT, attempt_no INTEGER)",
    "CREATE TABLE school_fee_payments (student_email TEXT, fee_type TEXT, valid_until TEXT)",
    "CREATE TABLE school_classroom_students (student_number TEXT, classroom_id TEXT, status TEXT)",
    "CREATE TABLE school_students (student_number TEXT, client_number TEXT, status TEXT)",
    "CREATE TABLE school_classrooms (id TEXT, cycle_id TEXT, course_id TEXT, status TEXT, starts_on TEXT, ends_on TEXT)",
    "CREATE TABLE school_academic_cycles (id TEXT, status TEXT)",
    "CREATE TABLE school_areas (id TEXT, title TEXT, program_slug TEXT)",
    "CREATE TABLE conferences (id INTEGER PRIMARY KEY, title TEXT, status TEXT)",
    "CREATE TABLE conference_sessions (id INTEGER PRIMARY KEY, conference_id INTEGER, title TEXT, starts_at TEXT, duration_minutes INTEGER, time_zone TEXT, zoom_meeting_id TEXT, join_url TEXT, passcode TEXT)",
    "CREATE TABLE conference_participants (id INTEGER PRIMARY KEY, conference_id INTEGER, email TEXT, source_order_id INTEGER)",
    "CREATE TABLE conference_access (id INTEGER PRIMARY KEY, conference_id INTEGER, order_id INTEGER)",
    "INSERT INTO school_programs VALUES ('matematicas','active')",
    "INSERT INTO school_subprograms VALUES ('s1','matematicas','Álgebra','active')",
    "INSERT INTO customer_accounts VALUES ('test@example.test','0000000001')",
    "INSERT INTO school_payment_products VALUES ('p1','Clases','',1000,'mxn','monthly',1,1),('p2','Inscripción','',2000,'mxn','enrollment',6,1)",
    "INSERT INTO school_payment_modalities VALUES ('m1','s1','p1','classes','month',1,1,'month',1,'active',NULL),('m2','s1','p2','enrollment','once',1,6,'month',0,'active',NULL)",
    "INSERT INTO school_courses VALUES ('c1','algebra','Álgebra','published','course',NULL,NULL),('c2','otro','Otro','published','course',NULL,NULL)",
    "INSERT INTO school_lessons VALUES ('l1','c1','primera','Primera','published',1),('l2','c1','segunda','Segunda','published',2)",
    "INSERT INTO school_lesson_progress VALUES ('l1','test@example.test','completed')",
    "INSERT INTO school_course_progress VALUES ('c1','test@example.test','in_progress')",
    "INSERT INTO school_subprogram_courses VALUES ('s1','c1')",
    "INSERT INTO orders VALUES (1,'paid',0,2000,'old@example.test'),(2,'paid',0,1000,'test@example.test')",
    "INSERT INTO conferences VALUES (1,'Clases en vivo','published'),(2,'Invitación','published'),(3,'Compra','published')",
    "INSERT INTO conference_sessions VALUES (1,1,'Sesión 1','2030-01-01 10:00',60,'UTC',NULL,NULL,NULL),(2,1,'Sesión 2','2030-01-08 10:00',60,'UTC',NULL,NULL,NULL)",
  ]) await db.prepare(sql).run();
  const migration = await readFile(new URL('../../migrations/0077_school_subprogram_journey.sql', import.meta.url), 'utf8');
  for (const sql of migration.replace(/--[^\n]*/g, '').split(';').map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(sql).run();
  }
  const groupsMigration = await readFile(new URL('../../migrations/0078_school_groups.sql', import.meta.url), 'utf8');
  for (const sql of groupsMigration.replace(/--[^\n]*/g, '').split(';').map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(sql).run();
  }
  await db.prepare('ALTER TABLE school_notifications ADD COLUMN read_at TEXT').run();
  await db.prepare("ALTER TABLE school_notifications ADD COLUMN created_at TEXT NOT NULL DEFAULT ''").run();
  await db.prepare("ALTER TABLE school_programs ADD COLUMN title TEXT NOT NULL DEFAULT ''").run();
  await db.prepare("ALTER TABLE school_courses ADD COLUMN summary TEXT NOT NULL DEFAULT ''").run();
  await db.prepare('ALTER TABLE school_courses ADD COLUMN omitted_activities_allowed INTEGER NOT NULL DEFAULT 0').run();
  await saveDiagnosticQuestion(db, form({ subprogram_id: 's1', prompt: 'Objetivo', answer_type: 'text', required: '1' }));
  await saveDiagnosticQuestion(db, form({ subprogram_id: 's1', prompt: 'Nivel', answer_type: 'choice', options: 'Inicial\nAvanzado', required: '1' }));
  const questions = await listDiagnosticQuestions(db, 's1');
  const text = questions.find((q) => q.answer_type === 'text');
  const choice = questions.find((q) => q.answer_type === 'choice');
  await assert.rejects(() => submitSubprogramDiagnostic(db, '0000000001', 's1', form({ [`question_${text.id}`]: 'Aprender', [`question_${choice.id}`]: 'No existe' })));
  await submitSubprogramDiagnostic(db, '0000000001', 's1', form({ [`question_${text.id}`]: 'Aprender', [`question_${choice.id}`]: 'Inicial' }));
  const diagnostic = await db.prepare('SELECT * FROM school_subprogram_diagnostics').first();
  assert.deepEqual(JSON.parse(diagnostic.answers_json).find((a) => a.question === 'Nivel'), { question: 'Nivel', answer: 'Inicial' });
  await assert.rejects(() => submitSubprogramDiagnostic(db, '0000000001', 's1', form({ [`question_${text.id}`]: 'Aprender', [`question_${choice.id}`]: 'Inicial' })));
  await db.prepare("UPDATE school_subprogram_diagnostics SET status='rejected' WHERE id=?").bind(diagnostic.id).run();
  await submitSubprogramDiagnostic(db, '0000000001', 's1', form({ [`question_${text.id}`]: 'De nuevo', [`question_${choice.id}`]: 'Avanzado' }));
  await db.prepare("UPDATE school_subprograms SET enrollment_modality_id='m2' WHERE id='s1'").run();
  const pending = await db.prepare("SELECT id FROM school_subprogram_diagnostics WHERE status='pending'").first();
  await reviewSubprogramDiagnostic(db, pending.id, 'approved', 'm1', '', new Date('2026-01-31T12:00:00Z'));
  const initial = (await db.prepare("SELECT * FROM school_payment_obligations ORDER BY due_at").all()).results;
  assert.equal(initial.length, 13);
  assert.equal(initial.filter((row) => row.modality_payment_type === 'enrollment').length, 1);
  assert.ok(initial.some((row) => row.due_at === '2026-02-28' && row.available_at === row.due_at));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM school_subprogram_approval_emails').first()).n, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM school_notifications WHERE title='Diagnóstico aprobado'").first()).n, 1);
  const classes = initial.find((row) => row.modality_payment_type === 'classes');
  const enrollmentCharge = initial.find((row) => row.modality_payment_type === 'enrollment');
  await db.prepare("UPDATE school_payment_obligations SET status='cancelled' WHERE id NOT IN (?,?)").bind(classes.id, enrollmentCharge.id).run();
  const studentEnrollment = await db.prepare('SELECT id FROM school_subprogram_enrollments').first();
  await saveSchoolGroupAction(db, form({ action: 'create', subprogram_id: 's1', title: 'Grupo A' }));
  const group = await db.prepare('SELECT id FROM school_subprogram_groups').first();
  await saveSchoolGroupAction(db, form({ action: 'add-course', group_id: group.id, course_id: 'c1' }));
  await assert.rejects(() => saveSchoolGroupAction(db, form({ action: 'add-course', group_id: group.id, course_id: 'c2' })));
  await saveSchoolGroupAction(db, form({ action: 'conference', group_id: group.id, conference_id: '1' }));
  await assert.rejects(() => saveSchoolGroupAction(db, form({ action: 'assign', group_id: group.id, enrollment_id: studentEnrollment.id })));
  await db.prepare("UPDATE school_payment_obligations SET available_at=date('now') WHERE id IN (?,?)").bind(classes.id, enrollmentCharge.id).run();
  const beforePayment = await getSchoolHomeSummary(db, 'test@example.test');
  assert.equal(beforePayment.diagnostics[0].enrollment_due_count, 1);
  assert.ok(beforePayment.diagnostics[0].due_count >= 2);
  assert.equal(await claimSchoolCheckout(db, classes.id, 'test@example.test', 'lock-1'), null);
  assert.ok(await claimSchoolCheckout(db, enrollmentCharge.id, 'test@example.test', 'lock-enrollment'));
  await db.prepare("UPDATE school_payment_obligations SET checkout_session_id='demo_enrollment' WHERE id=?").bind(enrollmentCharge.id).run();
  await db.prepare("INSERT INTO customer_email_aliases VALUES ('old@example.test','test@example.test')").run();
  const demoOrder = { schoolPaymentObligationId: enrollmentCharge.id, email: 'old@example.test', amountTotalCents: 2000, currency: 'mxn', providerSessionId: 'demo_enrollment' };
  const validity = { modality_validity_count: 6, modality_validity_unit: 'month' };
  await assert.rejects(() => settleSubprogramObligation(db, { ...demoOrder, amountTotalCents: 1 }, 1, 'demo', validity));
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE id=?").bind(enrollmentCharge.id).first()).status, 'pending');
  await settleSubprogramObligation(db, demoOrder, 1, 'demo', validity);
  await settleSubprogramObligation(db, demoOrder, 1, 'demo', validity);
  assert.equal((await db.prepare("SELECT email FROM orders WHERE id=1").first()).email, 'test@example.test');
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM school_notifications WHERE id=?").bind(`subprogram-payment-${enrollmentCharge.id}`).first()).n, 1);
  assert.match((await db.prepare("SELECT body FROM school_notifications WHERE id=?").bind(`subprogram-payment-${enrollmentCharge.id}`).first()).body, /demo/);
  assert.equal(await claimSchoolCheckout(db, classes.id, 'other@example.test', 'lock-2'), null);
  assert.ok(await claimSchoolCheckout(db, classes.id, 'test@example.test', 'lock-3'));
  await db.prepare("UPDATE school_payment_obligations SET checkout_lock_token=NULL,checkout_locked_at=NULL WHERE id=?").bind(classes.id).run();
  await db.prepare("UPDATE school_payment_obligations SET modality_valid_until=datetime('now','-1 day') WHERE id=?").bind(enrollmentCharge.id).run();
  assert.equal(await claimSchoolCheckout(db, classes.id, 'test@example.test', 'lock-4'), null);
  const canAccess = (client, course) => db.prepare(`SELECT id FROM school_courses c WHERE c.id=? AND ${subprogramCourseAccessSql}`).bind(course, client).first();
  await db.prepare("UPDATE school_payment_obligations SET status='paid',order_id=2,paid_at=datetime('now'),modality_valid_until=datetime('now','+1 day') WHERE id=?").bind(classes.id).run();
  assert.equal(await canAccess('0000000001', 'c1'), null);
  await db.prepare("UPDATE school_payment_obligations SET modality_valid_until=datetime('now','+1 day') WHERE id=?").bind(enrollmentCharge.id).run();
  assert.equal(await canAccess('0000000001', 'c1'), null);
  await saveSchoolGroupAction(db, form({ action: 'assign', group_id: group.id, enrollment_id: studentEnrollment.id }));
  assert.ok(await canAccess('0000000001', 'c1'));
  assert.deepEqual((await getUserConferences(db, 'test@example.test')).map(c => c.id), [1]);
  assert.equal((await getUserConferencesSessions(db, 'test@example.test')).length, 2);
  await saveSchoolGroupAction(db, form({ action: 'create', subprogram_id: 's1', title: 'Grupo B' }));
  const groupB = await db.prepare("SELECT id FROM school_subprogram_groups WHERE title='Grupo B'").first();
  await saveSchoolGroupAction(db, form({ action: 'assign', group_id: groupB.id, enrollment_id: studentEnrollment.id }));
  assert.equal(await canAccess('0000000001', 'c1'), null);
  assert.equal((await getUserConferences(db, 'test@example.test')).length, 0);
  await saveSchoolGroupAction(db, form({ action: 'assign', group_id: group.id, enrollment_id: studentEnrollment.id }));
  const futureCharge = initial.find(row => row.id !== classes.id && row.id !== enrollmentCharge.id);
  await db.prepare("UPDATE school_payment_obligations SET status='pending',due_at=date('now','-1 day') WHERE id=?").bind(futureCharge.id).run();
  assert.equal(await canAccess('0000000001', 'c1'), null);
  assert.equal((await getUserConferences(db, 'test@example.test')).length, 0);
  assert.equal((await db.prepare('SELECT group_id FROM school_subprogram_group_members WHERE enrollment_id=?').bind(studentEnrollment.id).first()).group_id, group.id);
  await db.prepare("UPDATE school_payment_obligations SET status='cancelled',due_at=? WHERE id=?").bind(futureCharge.due_at, futureCharge.id).run();
  assert.ok(await canAccess('0000000001', 'c1'));
  await db.prepare("UPDATE school_subprograms SET enrollment_modality_id=NULL WHERE id='s1'").run();
  await db.prepare("UPDATE school_payment_modalities SET requires_current_enrollment=0 WHERE id='m1'").run();
  await db.prepare("UPDATE orders SET refunded_cents=2000 WHERE id=1").run();
  assert.ok(await canAccess('0000000001', 'c1'));
  await db.prepare("UPDATE orders SET refunded_cents=0 WHERE id=1").run();
  await db.prepare("UPDATE school_payment_modalities SET requires_current_enrollment=1 WHERE id='m1'").run();
  await db.prepare("UPDATE school_subprograms SET enrollment_modality_id='m2' WHERE id='s1'").run();
  await db.prepare("UPDATE school_payment_obligations SET status='pending' WHERE id=?").bind(classes.id).run();
  assert.equal(await canAccess('0000000001', 'c1'), null);
  assert.equal((await getUserConferences(db, 'test@example.test')).length, 0);
  await db.prepare("UPDATE school_payment_obligations SET status='paid' WHERE id=?").bind(classes.id).run();
  assert.equal(await canAccess('0000000001', 'c2'), null);
  assert.equal(await canAccess('0000000002', 'c1'), null);
  for (const page of ['index.astro', 'calificaciones.astro']) {
    const source = await readFile(new URL(`../../src/pages/escuela/mi-escuela/${page}`, import.meta.url), 'utf8');
    const match = source.match(/env\.DB\.prepare\(`(SELECT c\.id,c\.[\s\S]*?)`\)/);
    assert.ok(match, `Course query not found in ${page}`);
    const sql = match[1].replace('${subprogramCourseAccessSql}', subprogramCourseAccessSql);
    const result = await db.prepare(sql).bind('test@example.test', 'test@example.test', '0000000001').all();
    assert.deepEqual(result.results.map((course) => course.id), ['c1']);
  }
  const summary = await getSchoolHomeSummary(db, 'test@example.test');
  assert.equal(summary.courseCount, 1);
  assert.equal(summary.courses[0].lesson_slug, 'segunda');
  assert.equal(summary.diagnostics[0].status, 'approved');
  assert.equal(summary.diagnostics[0].enrollment_valid, 1);
  assert.ok(summary.unreadCount > 0);
  const otherSummary = await getSchoolHomeSummary(db, 'other@example.test');
  assert.equal(otherSummary.courseCount, 0);
  assert.equal(otherSummary.diagnostics.length, 0);
  assert.equal(otherSummary.unreadCount, 0);
  await db.prepare("INSERT INTO school_course_access_overrides VALUES ('c1','test@example.test',date('now','-1 day'))").run();
  assert.equal((await getSchoolHomeSummary(db, 'test@example.test')).courseCount, 0);
  await db.prepare("DELETE FROM school_course_access_overrides WHERE course_id='c1'").run();
  await db.prepare("UPDATE orders SET refunded_cents=2000 WHERE id=1").run();
  assert.equal(await canAccess('0000000001', 'c1'), null);
  assert.equal((await getUserConferences(db, 'test@example.test')).length, 0);
  await db.prepare("INSERT INTO conference_participants(id,conference_id,email,source_order_id,manual_invitation) VALUES (1,2,'test@example.test',NULL,1)").run();
  await db.prepare("INSERT INTO conference_access VALUES (1,3,2)").run();
  assert.deepEqual((await getUserConferences(db, 'TEST@example.test')).map(c => c.id).sort(), [2,3]);
  await db.prepare("INSERT INTO conference_access VALUES (2,1,2)").run();
  assert.deepEqual((await getUserConferences(db, 'test@example.test')).map(c => c.id).sort(), [1,2,3]);
  assert.equal((await getUserConferencesSessions(db, 'test@example.test')).length, 2);
  await db.prepare("UPDATE orders SET refunded_cents=1000 WHERE id=2").run();
  assert.deepEqual((await getUserConferences(db, 'test@example.test')).map(c => c.id).sort(), [2]);
  await db.prepare("UPDATE orders SET refunded_cents=0 WHERE id=2").run();
  await db.prepare("UPDATE orders SET refunded_cents=0 WHERE id=1").run();
  assert.deepEqual((await getUserConferences(db, 'test@example.test')).map(c => c.id).sort(), [1,2,3]);
  assert.equal((await getUserConferencesSessions(db, 'test@example.test')).length, 2);
  await db.prepare("UPDATE school_payment_obligations SET status='pending' WHERE id NOT IN (?,?)").bind(classes.id, enrollmentCharge.id).run();
  await db.prepare("UPDATE school_payment_obligations SET status='pending',order_id=NULL,paid_at=NULL WHERE id=?").bind(classes.id).run();
  await db.prepare("UPDATE school_payment_obligations SET available_at=due_at WHERE id=?").bind(classes.id).run();
  const pendingSummary = await getSchoolHomeSummary(db, 'test@example.test');
  assert.ok(pendingSummary.diagnostics[0].due_count > 0);
  assert.equal(pendingSummary.diagnostics[0].modality_valid, 0);
  await assert.rejects(() => reviewSubprogramDiagnostic(db, pending.id, 'approved', 'm1', '', new Date('2026-01-31T12:00:00Z')));
  await db.prepare("UPDATE school_payment_products SET amount_cents=1500 WHERE id='p1'").run();
  await reconcileSubprogramSchedules(db, new Date('2026-02-01T12:00:00Z'));
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM school_notifications WHERE id=?").bind(`subprogram-due-${classes.id}`).first()).n, 1);
  assert.equal((await db.prepare("SELECT amount_cents FROM school_payment_obligations WHERE due_at='2026-01-31' AND modality_payment_type='classes'").first()).amount_cents, 1000);
  assert.equal((await db.prepare("SELECT amount_cents FROM school_payment_obligations WHERE due_at='2026-02-28' AND modality_payment_type='classes'").first()).amount_cents, 1500);
  await db.prepare("UPDATE school_payment_modalities SET frequency_unit='week' WHERE id='m1'").run();
  await db.prepare("UPDATE school_subprogram_payment_schedules SET next_check_at='2026-02-01T12:00:00.000Z' WHERE modality_id='m1'").run();
  await reconcileSubprogramSchedules(db, new Date('2026-02-01T12:00:00Z'));
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE due_at='2026-02-28' AND modality_payment_type='classes' AND schedule_revision=1").first()).status, 'cancelled');
  assert.ok((await db.prepare("SELECT id FROM school_payment_obligations WHERE due_at='2026-02-08' AND schedule_revision=2").first()));
  await reconcileSubprogramSchedules(db, new Date('2026-02-02T12:00:00Z'));
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM school_notifications WHERE id=?").bind(`subprogram-due-${classes.id}`).first()).n, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM school_payment_obligations WHERE due_at='2026-02-08' AND schedule_revision=2").first()).n, 1);
  await db.prepare("UPDATE school_subprograms SET enrollment_modality_id=NULL WHERE id='s1'").run();
  await reconcileEnrollmentPolicies(db, new Date('2026-02-02T12:00:00Z'));
  assert.equal((await db.prepare("SELECT status FROM school_subprogram_payment_schedules WHERE modality_id='m2'").first()).status, 'inactive');
  assert.equal(await claimSchoolCheckout(db, enrollmentCharge.id, 'test@example.test', 'inactive'), null);
  await db.prepare("UPDATE school_payment_modalities SET requires_current_enrollment=0,billing_revision=billing_revision+1 WHERE id='m1'").run();
  await db.prepare("UPDATE school_payment_obligations SET available_at=date('now'),checkout_lock_token=NULL,checkout_locked_at=NULL,checkout_session_id=NULL WHERE id=?").bind(classes.id).run();
  assert.ok(await claimSchoolCheckout(db, classes.id, 'test@example.test', 'optional'));
  await db.prepare("UPDATE school_payment_obligations SET checkout_session_id='cs_live',checkout_locked_at=datetime('now','-26 hours') WHERE id=?").bind(classes.id).run();
  assert.equal(await claimSchoolCheckout(db, classes.id, 'test@example.test', 'no-second-checkout'), null);
  await db.prepare("INSERT INTO pending_payments(id,payment_hash,backend,status,expires_at) VALUES ('demo1','demo_1','demo','pending',datetime('now','-1 hour'))").run();
  await db.prepare("UPDATE school_payment_obligations SET checkout_session_id='demo_1' WHERE id=?").bind(classes.id).run();
  assert.ok(await claimSchoolCheckout(db, classes.id, 'test@example.test', 'expired-demo'));
  assert.equal(await claimSchoolCheckout(db, classes.id, 'test@example.test', 'duplicate-demo'), null);
  await db.prepare("UPDATE school_payment_obligations SET checkout_lock_token=NULL,checkout_locked_at=NULL,checkout_session_id=NULL WHERE id=?").bind(classes.id).run();
  await db.prepare("UPDATE school_subprograms SET enrollment_modality_id='m2' WHERE id='s1'").run();
  await reconcileEnrollmentPolicies(db, new Date('2026-02-02T12:00:00Z'));
  await reconcileSubprogramSchedules(db, new Date('2026-02-02T12:00:00Z'));
  assert.equal((await db.prepare("SELECT status,revision FROM school_subprogram_payment_schedules WHERE modality_id='m2'").first()).revision, 2);
  assert.ok((await db.prepare("SELECT id FROM school_payment_obligations WHERE modality_payment_type='enrollment' AND due_at='2026-02-02' AND schedule_revision=2").first()));
  console.log('School subprogram diagnostics integration passed.');
} finally {
  await mf.dispose();
}
