import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { listDiagnosticQuestions, listDiagnosticSections, saveDiagnosticQuestion, saveDiagnosticSection, removeDiagnosticSection, submitSubprogramDiagnostic } from '../../src/features/school/subprogramDiagnostics.ts';
import { reconcileEnrollmentPolicies, reconcileSubprogramSchedules, reviewSubprogramDiagnostic } from '../../src/features/school/subprogramBilling.ts';
import { claimSchoolCheckout } from '../../src/features/school/schoolCheckout.ts';
import { subprogramCourseAccessSql } from '../../src/features/school/subprogramAccess.ts';
import { settleSubprogramObligation } from '../../src/features/school/subprogramSettlement.ts';
import { migrateLegacyPaymentPeriods } from '../../src/features/school/paymentPeriodMigration.ts';
import { reconcileOverdueSuspensions, reactivateOverdueEnrollment, withdrawEnrollment } from '../../src/features/school/withdrawals.ts';
import { claimPaymentBundle, linkPaymentBundle, releaseExpiredDemoBundles, releaseExpiredPaymentBundle, settlePaymentBundle } from '../../src/features/school/paymentBundles.ts';
import { getSchoolHomeSummary } from '../../src/features/school/homeSummary.ts';
import { listStudentSchoolGroups, saveSchoolGroupAction } from '../../src/features/school/groups.ts';
import { saveManualAccess } from '../../src/features/school/manualAccess.ts';
import { courseAccessSql } from '../../src/features/school/courseAccess.ts';
import { blockedOrderItemIds } from '../../src/features/orders/courseRestrictions.ts';
import { magazineAccessMode } from '../../src/features/magazines/access.ts';
import { assignManualPayment, cancelManualPayment } from '../../src/features/school/manualPayments.ts';
import { scholarshipAmount, setScholarship } from '../../src/features/school/scholarships.ts';
import { getUserConferences, getUserConferencesSessions } from '../../src/features/conferences/db.ts';
import { listConferenceAccessForOrder } from '../../src/features/conferences/access.ts';

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
    "CREATE TABLE school_payment_obligations (id TEXT PRIMARY KEY, payment_product_id TEXT, student_email TEXT NOT NULL, title_snapshot TEXT NOT NULL, description_snapshot TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, fee_type TEXT NOT NULL, validity_months INTEGER NOT NULL, due_at TEXT NOT NULL, available_at TEXT, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', paid_at TEXT, order_id INTEGER, checkout_lock_token TEXT, checkout_locked_at TEXT, checkout_session_id TEXT, updated_at TEXT)",
    "CREATE TABLE pending_payments (id TEXT PRIMARY KEY, payment_hash TEXT, backend TEXT, status TEXT, expires_at TEXT)",
    "CREATE TABLE school_courses (id TEXT PRIMARY KEY, slug TEXT, title TEXT, status TEXT, content_kind TEXT, area_id TEXT, level_code TEXT)",
    "CREATE TABLE school_subprogram_courses (subprogram_id TEXT, course_id TEXT)",
    "CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, refunded_cents INTEGER, amount_total_cents INTEGER, email TEXT)",
    "CREATE TABLE school_notifications (id TEXT PRIMARY KEY, student_email TEXT, title TEXT, body TEXT, message TEXT, href TEXT)",
    "CREATE TABLE media (id INTEGER PRIMARY KEY,image_key TEXT UNIQUE,original_name TEXT,mime_type TEXT)",
    "CREATE TABLE school_lessons (id TEXT PRIMARY KEY, course_id TEXT, slug TEXT, title TEXT, status TEXT, sequence_no INTEGER)",
    "CREATE TABLE school_lesson_progress (lesson_id TEXT, student_email TEXT, status TEXT)",
    "CREATE TABLE school_course_progress (course_id TEXT, student_email TEXT, status TEXT)",
    "CREATE TABLE school_course_access_overrides (course_id TEXT, student_email TEXT, expires_at TEXT)",
    "CREATE TABLE order_items (id INTEGER PRIMARY KEY, school_course_id TEXT, order_id INTEGER)",
    "CREATE TABLE content_subscription_courses (course_id TEXT, subscription_id TEXT)",
    "CREATE TABLE school_subscriptions (content_subscription_id TEXT, student_email TEXT, status TEXT, current_period_end TEXT)",
    "CREATE TABLE content_subscriptions (id TEXT PRIMARY KEY,magazine_id TEXT,magazine_access TEXT,status TEXT)",
    "CREATE TABLE math_magazines (id TEXT PRIMARY KEY,title TEXT,status TEXT)",
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
    "INSERT INTO math_magazines VALUES ('mag1','Revista','published')",
    "INSERT INTO content_subscriptions VALUES ('plan1','mag1','latest','active')",
    "INSERT INTO school_subscriptions VALUES ('plan1','bundle@example.test','active',NULL)",
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
  const periodsMigration = await readFile(new URL('../../migrations/0079_school_payment_periods.sql', import.meta.url), 'utf8');
  for (const sql of periodsMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const withdrawalsMigration = await readFile(new URL('../../migrations/0080_school_withdrawals.sql', import.meta.url), 'utf8');
  for (const sql of withdrawalsMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const bundlesMigration = await readFile(new URL('../../migrations/0081_school_payment_bundles.sql', import.meta.url), 'utf8');
  for (const sql of bundlesMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const sectionsMigration = await readFile(new URL('../../migrations/0082_school_groups_diagnostic_sections.sql', import.meta.url), 'utf8');
  for (const sql of sectionsMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const manualAccessMigration = await readFile(new URL('../../migrations/0083_school_manual_access.sql', import.meta.url), 'utf8');
  for (const sql of manualAccessMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const manualAccessPaymentMigration = await readFile(new URL('../../migrations/0084_school_manual_access_payment.sql', import.meta.url), 'utf8');
  for (const sql of manualAccessPaymentMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const scholarshipMigration = await readFile(new URL('../../migrations/0085_school_scholarships.sql', import.meta.url), 'utf8');
  for (const sql of scholarshipMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const groupPaymentScopeMigration = await readFile(new URL('../../migrations/0086_school_group_payment_scope.sql', import.meta.url), 'utf8');
  for (const sql of groupPaymentScopeMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const extendedAccessMigration = await readFile(new URL('../../migrations/0087_school_extended_manual_access.sql', import.meta.url), 'utf8');
  for (const sql of extendedAccessMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  await db.prepare("UPDATE school_payment_modalities SET period_start_on='2026-01-31',period_end_on=CASE id WHEN 'm1' THEN '2026-02-27' ELSE '2027-01-30' END").run();
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
  assert.equal((await db.prepare("SELECT modality_valid_until FROM school_payment_obligations WHERE id=?").bind(enrollmentCharge.id).first()).modality_valid_until, enrollmentCharge.modality_valid_until);
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
  await db.prepare("UPDATE school_payment_obligations SET modality_valid_from=datetime('now','+1 day') WHERE id=?").bind(classes.id).run();
  assert.equal(await canAccess('0000000001', 'c1'), null);
  assert.equal((await getSchoolHomeSummary(db, 'test@example.test')).diagnostics[0].modality_valid, 0);
  await db.prepare("UPDATE school_payment_obligations SET modality_valid_from=datetime('now','-1 day') WHERE id=?").bind(classes.id).run();
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
  await db.prepare("UPDATE school_payment_obligations SET status='pending',due_at=date('now','-1 day'),overdue_from=datetime('now','-1 day') WHERE id=?").bind(futureCharge.id).run();
  assert.equal(await canAccess('0000000001', 'c1'), null);
  assert.equal((await getUserConferences(db, 'test@example.test')).length, 0);
  assert.equal((await db.prepare('SELECT group_id FROM school_subprogram_group_members WHERE enrollment_id=?').bind(studentEnrollment.id).first()).group_id, group.id);
  await db.prepare("UPDATE school_payment_obligations SET status='cancelled',due_at=?,overdue_from=? WHERE id=?").bind(futureCharge.due_at, futureCharge.overdue_from, futureCharge.id).run();
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
    const sql = match[1].replace('${courseAccessSql}', courseAccessSql);
    const result = await db.prepare(sql).bind('test@example.test', 'test@example.test', 'test@example.test', 'test@example.test', '0000000001', '0000000001').all();
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
  await db.prepare("UPDATE school_payment_modalities SET frequency_unit='week',period_end_on='2026-02-06' WHERE id='m1'").run();
  await db.prepare("UPDATE school_subprogram_payment_schedules SET next_check_at='2026-02-01T12:00:00.000Z' WHERE modality_id='m1'").run();
  await reconcileSubprogramSchedules(db, new Date('2026-02-01T12:00:00Z'));
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE due_at='2026-02-28' AND modality_payment_type='classes' AND schedule_revision=1").first()).status, 'cancelled');
  assert.ok((await db.prepare("SELECT id FROM school_payment_obligations WHERE due_at='2026-02-07' AND schedule_revision=2").first()));
  await reconcileSubprogramSchedules(db, new Date('2026-02-02T12:00:00Z'));
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM school_notifications WHERE id=?").bind(`subprogram-due-${classes.id}`).first()).n, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM school_payment_obligations WHERE due_at='2026-02-07' AND schedule_revision=2").first()).n, 1);
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
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM school_payment_obligations WHERE modality_payment_type='enrollment' AND due_at='2026-01-31' AND status<>'cancelled'").first()).n, 1);

  await db.prepare("UPDATE school_subprograms SET enrollment_modality_id=NULL WHERE id='s1'").run();
  await db.prepare("UPDATE school_payment_products SET amount_cents=3100 WHERE id='p1'").run();
  await db.prepare(`INSERT INTO school_payment_modalities
    (id,subprogram_id,payment_product_id,payment_type,frequency_unit,frequency_count,requires_current_enrollment,status,
     period_start_on,period_end_on,advance_days,proration_method)
    VALUES ('m3','s1','p1','classes','month',1,0,'active','2026-01-01','2026-01-31',5,'days')`).run();
  for (const [email, number, diagnosticId] of [
    ['current@example.test', '0000000002', 'd-current'],
    ['next@example.test', '0000000003', 'd-next'],
    ['classes@example.test', '0000000004', 'd-classes'],
    ['empty@example.test', '0000000005', 'd-empty'],
  ]) {
    await db.prepare('INSERT INTO customer_accounts(email,client_number) VALUES (?,?)').bind(email, number).run();
    await db.prepare("INSERT INTO school_subprogram_diagnostics(id,subprogram_id,client_number,answers_json) VALUES (?,'s1',?,'[]')").bind(diagnosticId, number).run();
  }
  const approvalDate = new Date('2026-01-20T12:00:00Z');
  await reviewSubprogramDiagnostic(db, 'd-current', 'approved', 'm3', '', approvalDate, 'current');
  await reviewSubprogramDiagnostic(db, 'd-next', 'approved', 'm3', '', approvalDate, 'next');
  const firstCurrent = await db.prepare("SELECT * FROM school_payment_obligations WHERE student_email='current@example.test' ORDER BY due_at LIMIT 1").first();
  const firstNext = await db.prepare("SELECT * FROM school_payment_obligations WHERE student_email='next@example.test' ORDER BY due_at LIMIT 1").first();
  assert.equal((await db.prepare("SELECT starts_on FROM school_subprogram_enrollments WHERE client_number='0000000003'").first()).starts_on, '2026-02-01');
  assert.equal(firstCurrent.amount_cents, 1200);
  assert.equal(firstCurrent.period_start_on, '2026-01-01');
  assert.equal(firstCurrent.period_end_on, '2026-01-31');
  assert.equal(firstCurrent.modality_valid_until, '2026-02-01T06:00:00.000Z');
  assert.equal(firstNext.amount_cents, 3100);
  assert.equal(firstNext.due_at, '2026-02-01');
  assert.equal(firstNext.available_at, '2026-01-27');
  await db.prepare("UPDATE school_payment_obligations SET status='cancelled' WHERE student_email='next@example.test' AND id<>?").bind(firstNext.id).run();
  await db.prepare(`UPDATE school_payment_obligations SET available_from=datetime('now','+1 minute'),
    modality_valid_from=datetime('now','+5 days'),modality_valid_until=datetime('now','+35 days') WHERE id=?`).bind(firstNext.id).run();
  assert.equal(await claimSchoolCheckout(db, firstNext.id, 'next@example.test', 'early-lock'), null);
  await db.prepare("UPDATE school_payment_obligations SET available_from=datetime('now','-1 minute') WHERE id=?").bind(firstNext.id).run();
  assert.ok(await claimSchoolCheckout(db, firstNext.id, 'next@example.test', 'early-lock'));
  await db.prepare("UPDATE school_payment_obligations SET checkout_session_id='early-session' WHERE id=?").bind(firstNext.id).run();
  await db.prepare("INSERT INTO orders VALUES (3,'paid',0,3100,'next@example.test')").run();
  const nextEnrollment = await db.prepare("SELECT id FROM school_subprogram_enrollments WHERE client_number='0000000003'").first();
  await db.prepare("INSERT INTO school_subprogram_group_members(enrollment_id,group_id) VALUES (?,?)").bind(nextEnrollment.id, group.id).run();
  await settleSubprogramObligation(db, { schoolPaymentObligationId: firstNext.id, email: 'next@example.test',
    amountTotalCents: 3100, currency: 'mxn', providerSessionId: 'early-session' }, 3, 'demo',
    { modality_validity_count: null, modality_validity_unit: null });
  assert.equal(await canAccess('0000000003', 'c1'), null);
  await db.prepare("UPDATE school_payment_obligations SET modality_valid_from=datetime('now','-1 minute') WHERE id=?").bind(firstNext.id).run();
  assert.ok(await canAccess('0000000003', 'c1'));
  await db.prepare(`UPDATE school_payment_modalities SET proration_method='classes',class_weekdays='[1]',
    class_dates_added='["2026-01-20"]',class_dates_excluded='["2026-01-19"]' WHERE id='m3'`).run();
  await reviewSubprogramDiagnostic(db, 'd-classes', 'approved', 'm3', '', approvalDate, 'current');
  const firstClasses = await db.prepare("SELECT amount_cents FROM school_payment_obligations WHERE student_email='classes@example.test' ORDER BY due_at LIMIT 1").first();
  assert.equal(firstClasses.amount_cents, 1550);
  await assert.rejects(() => reviewSubprogramDiagnostic(db, 'd-empty', 'approved', 'm3', '', new Date('2026-01-31T12:00:00Z'), 'current'), /No quedan clases/);
  assert.equal((await db.prepare("SELECT status FROM school_subprogram_diagnostics WHERE id='d-empty'").first()).status, 'pending');
  await db.prepare(`UPDATE school_payment_modalities SET class_weekdays='[]',
    class_dates_added='["2026-01-20"]',class_dates_excluded='[]' WHERE id='m3'`).run();
  await assert.rejects(() => reviewSubprogramDiagnostic(db, 'd-empty', 'approved', 'm3', '', approvalDate, 'next'), /No quedan clases/);
  await reviewSubprogramDiagnostic(db, 'd-empty', 'approved', 'm3', '', approvalDate, 'current');
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM school_payment_obligations WHERE student_email='empty@example.test'").first()).n, 1);

  await db.prepare(`INSERT INTO school_payment_modalities
    (id,subprogram_id,payment_product_id,payment_type,frequency_unit,frequency_count,requires_current_enrollment,status)
    VALUES ('old','s1','p1','other','once',1,0,'active')`).run();
  await db.prepare(`INSERT INTO school_subprogram_payment_schedules
    (id,enrollment_id,modality_id,anchor_on,frequency_unit,frequency_count,next_check_at)
    VALUES ('old-schedule',?,'old','2026-01-01','once',1,'')`).bind(studentEnrollment.id).run();
  await db.prepare(`INSERT INTO school_payment_obligations
    (id,payment_product_id,student_email,title_snapshot,description_snapshot,amount_cents,currency,fee_type,validity_months,
     due_at,available_at,status,checkout_session_id,subprogram_schedule_id,schedule_revision)
    VALUES ('old-future','p1','test@example.test','Prueba','',1000,'mxn','other',0,'2026-03-01','2026-03-01','pending','open-session','old-schedule',1),
           ('old-paid','p1','test@example.test','Prueba','',1000,'mxn','other',0,'2026-03-02','2026-03-02','paid',NULL,'old-schedule',1),
           ('old-unlocked','p1','test@example.test','Prueba','',1000,'mxn','other',0,'2026-03-03','2026-03-03','pending',NULL,'old-schedule',1)`).run();
  await migrateLegacyPaymentPeriods(db, new Date('2026-02-02T12:00:00Z'));
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE id='old-future'").first()).status, 'pending');
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE id='old-unlocked'").first()).status, 'cancelled');
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE id='old-paid'").first()).status, 'paid');
  const migrated = await db.prepare("SELECT frequency_unit,frequency_count,period_start_on,period_end_on FROM school_payment_modalities WHERE id='old'").first();
  assert.deepEqual(migrated, { frequency_unit: 'month', frequency_count: 1, period_start_on: '2026-02-01', period_end_on: '2026-02-28' });

  const currentEnrollment = await db.prepare("SELECT id FROM school_subprogram_enrollments WHERE client_number='0000000002'").first();
  await db.prepare("INSERT INTO school_subprogram_group_members(enrollment_id,group_id) VALUES (?,?)").bind(currentEnrollment.id, group.id).run();
  await db.prepare("UPDATE school_subprograms SET suspension_after_days=3 WHERE id='s1'").run();
  await reconcileOverdueSuspensions(db, new Date('2026-01-03T12:00:00Z'));
  assert.equal((await db.prepare("SELECT status FROM school_subprogram_enrollments WHERE id=?").bind(currentEnrollment.id).first()).status, 'active');
  await reconcileOverdueSuspensions(db, new Date('2026-01-04T12:00:00Z'));
  assert.equal((await db.prepare("SELECT status FROM school_subprogram_enrollments WHERE id=?").bind(currentEnrollment.id).first()).status, 'suspended');
  assert.ok(await db.prepare("SELECT group_id FROM school_subprogram_group_members WHERE enrollment_id=?").bind(currentEnrollment.id).first());
  await db.prepare("UPDATE school_payment_modalities SET proration_method='days' WHERE id='m3'").run();
  await reconcileSubprogramSchedules(db, new Date('2026-02-20T12:00:00Z'));
  assert.ok(await db.prepare("SELECT id FROM school_payment_obligations WHERE student_email='current@example.test' AND due_at='2027-02-01' AND status='pending'").first());
  await db.prepare("UPDATE school_payment_obligations SET status='paid' WHERE id=?").bind(firstCurrent.id).run();
  await reactivateOverdueEnrollment(db, currentEnrollment.id, new Date('2026-01-04T12:00:00Z'));
  assert.equal((await db.prepare("SELECT status FROM school_subprogram_enrollments WHERE id=?").bind(currentEnrollment.id).first()).status, 'active');
  await db.prepare("UPDATE school_payment_obligations SET status='pending',checkout_session_id='cs-open',checkout_lock_token='lock' WHERE id=?").bind(firstCurrent.id).run();
  await reconcileOverdueSuspensions(db, new Date('2026-01-04T12:00:00Z'));
  await assert.rejects(() => withdrawEnrollment(db, currentEnrollment.id, new Date('2026-01-04T12:00:00Z')), /pagos en curso/);
  await db.prepare("UPDATE school_payment_obligations SET checkout_session_id=NULL,checkout_locked_at=NULL WHERE id=?").bind(firstCurrent.id).run();
  await assert.rejects(() => withdrawEnrollment(db, currentEnrollment.id, new Date('2026-01-04T12:00:00Z')), /pagos en curso/);
  await db.prepare("UPDATE school_payment_obligations SET checkout_session_id=NULL,checkout_lock_token=NULL WHERE id=?").bind(firstCurrent.id).run();
  await withdrawEnrollment(db, currentEnrollment.id, new Date('2026-01-04T12:00:00Z'));
  assert.equal((await db.prepare("SELECT status FROM school_subprogram_enrollments WHERE id=?").bind(currentEnrollment.id).first()).status, 'withdrawn');
  assert.equal(await db.prepare("SELECT group_id FROM school_subprogram_group_members WHERE enrollment_id=?").bind(currentEnrollment.id).first(), null);
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE id=?").bind(firstCurrent.id).first()).status, 'cancelled');
  assert.ok((await db.prepare("SELECT closed_at FROM school_subprogram_diagnostics WHERE id='d-current'").first()).closed_at);
  await submitSubprogramDiagnostic(db, '0000000002', 's1', form({ [`question_${text.id}`]: 'Reingreso', [`question_${choice.id}`]: 'Inicial' }));
  const reentryDiagnostic = await db.prepare("SELECT id FROM school_subprogram_diagnostics WHERE client_number='0000000002' AND status='pending'").first();
  await assert.rejects(() => reviewSubprogramDiagnostic(db, reentryDiagnostic.id, 'approved', 'm3', '', approvalDate, 'next'), /inscripción activa/);
  await db.prepare("UPDATE school_subprograms SET enrollment_modality_id='m2' WHERE id='s1'").run();
  await db.prepare("UPDATE school_payment_modalities SET proration_method='days',billing_revision=billing_revision+1 WHERE id='m3'").run();
  await reviewSubprogramDiagnostic(db, reentryDiagnostic.id, 'approved', 'm3', '', approvalDate, 'next');
  const reentry = await db.prepare("SELECT id,reenrollment_required FROM school_subprogram_enrollments WHERE client_number='0000000002' AND status='active'").first();
  assert.equal(reentry.reenrollment_required, 1);
  assert.notEqual(reentry.id, currentEnrollment.id);

  await db.prepare("INSERT INTO customer_accounts VALUES ('bundle@example.test','0000000009')").run();
  await db.prepare("INSERT INTO school_subprogram_diagnostics(id,subprogram_id,client_number,answers_json,status) VALUES ('d-bundle','s1','0000000009','[]','approved')").run();
  await db.prepare("INSERT INTO school_subprogram_enrollments(id,client_number,subprogram_id,diagnostic_id,modality_id,starts_on,status,suspension_reason,suspension_token) VALUES ('e-bundle','0000000009','s1','d-bundle','m3','2026-01-01','suspended','overdue','suspension-bundle')").run();
  await db.prepare("INSERT INTO school_subprogram_payment_schedules(id,enrollment_id,modality_id,anchor_on,frequency_unit,frequency_count,next_check_at) VALUES ('s-bundle','e-bundle','m3','2026-01-01','month',1,''),('s-bundle-enroll','e-bundle','m2','2026-01-01','once',1,'')").run();
  for (const [id, schedule, type, amount, currency, due] of [
    ['b-old-1','s-bundle','classes',100,'mxn','-40 days'],
    ['b-old-2','s-bundle','classes',200,'mxn','-10 days'],
    ['b-next','s-bundle','classes',300,'mxn','+1 day'],
    ['b-later','s-bundle','classes',400,'mxn','+10 days'],
    ['b-enrollment','s-bundle-enroll','enrollment',500,'mxn','+1 day'],
    ['b-usd','s-bundle','classes',700,'usd','+1 day'],
  ]) {
    await db.prepare(`INSERT INTO school_payment_obligations(id,student_email,title_snapshot,description_snapshot,amount_cents,currency,fee_type,validity_months,due_at,available_at,subprogram_schedule_id,modality_payment_type)
      VALUES (?, 'bundle@example.test',?,'',?,?,'other',0,date('now',?),date('now','-50 days'),?,?)`)
      .bind(id, id, amount, currency, due, schedule, type).run();
  }
  const [firstBundle, competing] = await Promise.all([
    claimPaymentBundle(db, 'b-old-1', 'bundle@example.test', 'bundle-lock-1'),
    claimPaymentBundle(db, 'b-old-1', 'bundle@example.test', 'bundle-lock-race'),
  ]);
  const claimed = firstBundle ?? competing;
  assert.ok(claimed);
  assert.equal(Number(Boolean(firstBundle)) + Number(Boolean(competing)), 1);
  assert.deepEqual(new Set(claimed.items.map(item => item.id)), new Set(['b-old-1','b-old-2','b-next','b-enrollment']));
  assert.equal(claimed.amount_cents, 1100);
  assert.equal(await claimSchoolCheckout(db, 'b-old-2', 'bundle@example.test', 'individual-race'), null);
  const firstToken = firstBundle ? 'bundle-lock-1' : 'bundle-lock-race';
  await linkPaymentBundle(db, firstToken, claimed.id, 'demo_bundle');
  await assert.rejects(() => withdrawEnrollment(db, 'e-bundle'), /pagos en curso/);
  await db.prepare("INSERT INTO pending_payments(id,payment_hash,backend,status,expires_at) VALUES ('pending-bundle','demo_bundle','demo','pending',datetime('now','-1 day'))").run();
  await releaseExpiredDemoBundles(db, 'bundle@example.test');
  assert.equal((await db.prepare("SELECT checkout_lock_token FROM school_payment_obligations WHERE id='b-old-2'").first()).checkout_lock_token, null);
  const secondBundle = await claimPaymentBundle(db, 'b-old-2', 'bundle@example.test', 'bundle-lock-2');
  assert.ok(secondBundle);
  await linkPaymentBundle(db, 'bundle-lock-2', secondBundle.id, 'cs_bundle');
  assert.equal(await releaseExpiredPaymentBundle(db, secondBundle.id, 'cs_wrong'), false);
  assert.equal(await releaseExpiredPaymentBundle(db, secondBundle.id, 'cs_bundle'), true);
  const thirdBundle = await claimPaymentBundle(db, 'b-old-1', 'bundle@example.test', 'bundle-lock-3');
  assert.ok(thirdBundle);
  await linkPaymentBundle(db, 'bundle-lock-3', thirdBundle.id, 'cs_final');
  await db.prepare("INSERT INTO orders VALUES (4,'paid',0,1100,'bundle@example.test')").run();
  const bundleOrder = { schoolPaymentObligationId: thirdBundle.id, providerSessionId: 'cs_final', email: 'bundle@example.test', amountTotalCents: 1100, currency: 'mxn' };
  await assert.rejects(() => settlePaymentBundle(db, { ...bundleOrder, amountTotalCents: 1099 }, 4, 'stripe'), /conciliación manual/);
  await assert.rejects(() => settlePaymentBundle(db, { ...bundleOrder, currency: 'usd' }, 4, 'stripe'), /conciliación manual/);
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE id='b-old-1'").first()).status, 'pending');
  assert.equal(await settlePaymentBundle(db, bundleOrder, 4, 'stripe'), true);
  assert.equal(await settlePaymentBundle(db, bundleOrder, 4, 'stripe'), true);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM school_payment_obligations WHERE bundle_order_id=4 AND status='paid'").first()).n, 4);
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE id='b-later'").first()).status, 'pending');
  assert.equal((await db.prepare("SELECT status FROM school_payment_obligations WHERE id='b-usd'").first()).status, 'pending');
  assert.equal((await db.prepare("SELECT status FROM school_subprogram_enrollments WHERE id='e-bundle'").first()).status, 'active');
  await db.prepare("INSERT INTO school_subprogram_group_members(enrollment_id,group_id) VALUES ('e-bundle',?)").bind(group.id).run();
  assert.ok(await canAccess('0000000009', 'c1'));
  await db.prepare("INSERT INTO media VALUES (1,'groups/test.png','test.png','image/png')").run();
  await saveSchoolGroupAction(db, form({ action:'details', group_id:group.id, title:'Grupo de prueba', image_key:'groups/test.png',
    description:'Descripción', schedule:'Lunes 10:00', rules:'Asistencia', evaluation_description:'Exámenes' }));
  const memberGroups = await listStudentSchoolGroups(db, '0000000009');
  assert.equal(memberGroups.length, 1);
  assert.equal(memberGroups[0].schedule, 'Lunes 10:00');
  assert.equal(memberGroups[0].image_key, 'groups/test.png');
  assert.equal((await listStudentSchoolGroups(db, '0000000000')).length, 0);
  await db.prepare("UPDATE orders SET refunded_cents=1100 WHERE id=4").run();
  assert.equal(await canAccess('0000000009', 'c1'), null);
  assert.equal((await listStudentSchoolGroups(db, '0000000009')).length, 0);
  const setAccess = (type,id,decision,expires_at='') => saveManualAccess(db, '0000000009', form({ resource_type:type,resource_id:id,decision,expires_at }));
  await setAccess('group',group.id,'allow');
  assert.ok(await canAccess('0000000009', 'c1'));
  assert.equal((await listStudentSchoolGroups(db, '0000000009')).length, 1);
  assert.ok((await getUserConferences(db, 'bundle@example.test')).some(conference => conference.id===1));
  await setAccess('subprogram','s1','deny');
  assert.equal(await canAccess('0000000009', 'c1'), null);
  assert.equal((await listStudentSchoolGroups(db, '0000000009')).length, 0);
  assert.equal((await getUserConferences(db, 'bundle@example.test')).some(conference => conference.id===1), false);
  await setAccess('subprogram','s1','clear');
  await setAccess('conference','2','allow');
  assert.ok((await getUserConferences(db, 'bundle@example.test')).some(conference => conference.id===2));
  await setAccess('conference','2','clear');
  assert.equal((await getUserConferences(db, 'bundle@example.test')).some(conference => conference.id===2), false);
  await setAccess('conference','1','deny');
  assert.equal((await getUserConferencesSessions(db, 'bundle@example.test')).some(session => session.conference_id===1), false);
  await setAccess('conference','1','clear');
  await db.prepare("ALTER TABLE conference_access ADD COLUMN order_item_id INTEGER").run();
  await db.prepare("ALTER TABLE conference_access ADD COLUMN seat_number INTEGER").run();
  await db.prepare("ALTER TABLE conferences ADD COLUMN description TEXT").run();
  const testConferenceAccess = (decision) => saveManualAccess(db, '0000000001', form({ resource_type:'conference',resource_id:'3',decision }));
  assert.ok((await listConferenceAccessForOrder(db, 2)).some(access => access.conference_id===3));
  await testConferenceAccess('deny');
  assert.equal((await listConferenceAccessForOrder(db, 2)).some(access => access.conference_id===3), false);
  assert.equal((await getUserConferences(db, 'test@example.test')).some(conference => conference.id===3), false);
  await saveManualAccess(db, '0000000001', form({ resource_type:'conference',resource_id:'3',decision:'deny',expires_at:'2000-01-01' }));
  assert.ok((await listConferenceAccessForOrder(db, 2)).some(access => access.conference_id===3));
  await testConferenceAccess('clear');
  assert.ok((await listConferenceAccessForOrder(db, 2)).some(access => access.conference_id===3));
  await db.prepare("INSERT INTO orders VALUES (5,'paid',0,1000,'bundle@example.test')").run();
  await db.prepare("INSERT INTO order_items(school_course_id,order_id) VALUES ('c1',5)").run();
  const courseVisible = () => db.prepare(`SELECT c.id FROM school_courses c WHERE c.id='c1' AND ${courseAccessSql}`)
    .bind('bundle@example.test','bundle@example.test','bundle@example.test','bundle@example.test','0000000009','0000000009').first();
  await setAccess('course','c1','deny');
  assert.equal(await courseVisible(), null);
  assert.equal((await blockedOrderItemIds(db,5,'bundle@example.test')).size, 1);
  await db.prepare("INSERT INTO customer_email_aliases VALUES ('previous@example.test','bundle@example.test')").run();
  assert.equal((await blockedOrderItemIds(db,5,'previous@example.test')).size, 1);
  await setAccess('course','c1','clear');
  assert.ok(await courseVisible());
  assert.equal((await blockedOrderItemIds(db,5,'bundle@example.test')).size, 0);
  await assert.rejects(() => setAccess('group','no-existe','allow'), /no existe/);
  assert.equal(await magazineAccessMode(db,'bundle@example.test','mag1'), 'latest');
  await setAccess('magazine','mag1','allow');
  assert.equal(await magazineAccessMode(db,'bundle@example.test','mag1'), 'all');
  await setAccess('magazine','mag1','deny');
  assert.equal(await magazineAccessMode(db,'bundle@example.test','mag1'), null);
  await setAccess('magazine','mag1','clear');
  assert.equal(await magazineAccessMode(db,'bundle@example.test','mag1'), 'latest');
  await assignManualPayment(db,'bundle@example.test',form({ product_id:'p1',amount:'5',due_at:'2030-01-15',notes:'Pago especial' }));
  const manualPayment = await db.prepare("SELECT id,amount_cents FROM school_payment_obligations WHERE notes='Pago especial'").first();
  assert.equal(manualPayment.amount_cents,500);
  await db.prepare("UPDATE school_payment_obligations SET checkout_lock_token='locked' WHERE id=?").bind(manualPayment.id).run();
  await assert.rejects(() => cancelManualPayment(db,'bundle@example.test',manualPayment.id), /checkout/);
  await db.prepare("UPDATE school_payment_obligations SET checkout_lock_token=NULL WHERE id=?").bind(manualPayment.id).run();
  await assert.rejects(() => cancelManualPayment(db,'other@example.test',manualPayment.id), /pendiente/);
  await cancelManualPayment(db,'bundle@example.test',manualPayment.id);
  assert.equal((await db.prepare('SELECT status FROM school_payment_obligations WHERE id=?').bind(manualPayment.id).first()).status,'cancelled');
  await assignManualPayment(db,'bundle@example.test',form({ product_id:'p1',amount:'7',due_at:'2030-01-15',notes:'Pago del grupo',group_id:group.id }), '0000000009');
  const groupPayment = await db.prepare("SELECT id FROM school_payment_obligations WHERE notes='Pago del grupo'").first();
  assert.equal((await db.prepare("SELECT group_access_only FROM school_payment_obligations WHERE id=?").bind(groupPayment.id).first()).group_access_only,1);
  assert.equal((await listStudentSchoolGroups(db, '0000000009')).length, 0);
  assert.equal(await canAccess('0000000009', 'c1'), null);
  await db.prepare("INSERT INTO orders VALUES (6,'paid',0,700,'bundle@example.test')").run();
  await db.prepare("UPDATE school_payment_obligations SET status='paid',order_id=6,paid_at=datetime('now') WHERE id=?").bind(groupPayment.id).run();
  assert.equal((await listStudentSchoolGroups(db, '0000000009')).length, 1);
  assert.ok(await canAccess('0000000009', 'c1'));
  await db.prepare("UPDATE orders SET refunded_cents=700 WHERE id=6").run();
  assert.equal((await listStudentSchoolGroups(db, '0000000009')).length, 0);
  assert.equal(await canAccess('0000000009', 'c1'), null);

  await saveDiagnosticSection(db, form({ subprogram_id:'s1',title:'Instrucciones $x$',description:'Lee todo.',position:'1' }));
  await saveDiagnosticSection(db, form({ subprogram_id:'s1',title:'Ejercicios',description:'Responde.',position:'2' }));
  const sections = await listDiagnosticSections(db, 's1');
  const exercises = sections.find(section => section.title==='Ejercicios');
  assert.equal(sections.length, 2);
  const instructions = sections.find(section => section.title==='Instrucciones $x$');
  await saveDiagnosticSection(db, form({ subprogram_id:'s1',section_id:instructions.id,title:'Instrucciones $x$',description:'Lee todo primero.',position:'1' }));
  assert.equal((await listDiagnosticSections(db, 's1')).find(section => section.id===instructions.id).description, 'Lee todo primero.');
  await db.prepare("INSERT INTO school_subprograms(id,program_slug,title,status) VALUES ('s-instructions','matematicas','Instrucciones','active')").run();
  await saveDiagnosticSection(db, form({ subprogram_id:'s-instructions',title:'Solo instrucciones',description:'Lee antes de enviar.' }));
  await db.prepare("INSERT INTO customer_accounts VALUES ('instructions@example.test','0000000012')").run();
  await submitSubprogramDiagnostic(db, '0000000012', 's-instructions', form({}));
  assert.deepEqual(JSON.parse((await db.prepare("SELECT answers_json FROM school_subprogram_diagnostics WHERE client_number='0000000012'").first()).answers_json), []);
  await assert.rejects(() => saveDiagnosticQuestion(db, form({ subprogram_id:'s-instructions',section_id:exercises.id,
    prompt:'Otra sección',answer_type:'text' })), /no existe/);
  await saveDiagnosticQuestion(db, form({ subprogram_id:'s1',section_id:exercises.id,prompt:'Una correcta',
    answer_type:'choice',options:'A\nB\nC',correct_options:'A\nB',choice_mode:'single',required:'1' }));
  await saveDiagnosticQuestion(db, form({ subprogram_id:'s1',section_id:exercises.id,prompt:'Todas correctas',
    answer_type:'choice',options:'A\nB\nC',correct_options:'A\nB',choice_mode:'multiple',required:'1' }));
  await saveDiagnosticQuestion(db, form({ subprogram_id:'s1',section_id:exercises.id,prompt:'Opcional',
    answer_type:'choice',options:'A\nB',correct_options:'A',choice_mode:'single' }));
  await assert.rejects(() => saveDiagnosticQuestion(db, form({ subprogram_id:'s1',section_id:exercises.id,prompt:'Inválida',
    answer_type:'choice',options:'A\nB',correct_options:'C',choice_mode:'single' })), /coincidir/);
  await assert.rejects(() => removeDiagnosticSection(db, 's1', exercises.id), /contiene preguntas/);
  const questionsNow = await listDiagnosticQuestions(db, 's1');
  const single = questionsNow.find(question => question.prompt==='Una correcta');
  const multiple = questionsNow.find(question => question.prompt==='Todas correctas');
  await db.prepare("INSERT INTO customer_accounts VALUES ('grade@example.test','0000000010'),('incorrect@example.test','0000000011')").run();
  const answerForm = (one, many) => {
    const data = form({ [`question_${text.id}`]:'Texto', [`question_${choice.id}`]:'Inicial', [`question_${single.id}`]:one });
    for (const value of many) data.append(`question_${multiple.id}`, value);
    return data;
  };
  await assert.rejects(() => submitSubprogramDiagnostic(db, '0000000010', 's1', answerForm('B', ['A','C','injected'])), /válidas/);
  await submitSubprogramDiagnostic(db, '0000000010', 's1', answerForm('B', ['B','A']));
  await submitSubprogramDiagnostic(db, '0000000011', 's1', answerForm('C', ['A']));
  const evaluated = JSON.parse((await db.prepare("SELECT answers_json FROM school_subprogram_diagnostics WHERE client_number='0000000010'").first()).answers_json);
  const incorrect = JSON.parse((await db.prepare("SELECT answers_json FROM school_subprogram_diagnostics WHERE client_number='0000000011'").first()).answers_json);
  assert.equal(evaluated.find(answer => answer.question==='Una correcta').correct, true);
  assert.equal(evaluated.find(answer => answer.question==='Todas correctas').correct, true);
  assert.equal(incorrect.find(answer => answer.question==='Una correcta').correct, false);
  assert.equal(incorrect.find(answer => answer.question==='Todas correctas').correct, false);
  assert.equal(evaluated.find(answer => answer.question==='Todas correctas').section, 'Ejercicios');
  assert.equal(evaluated.find(answer => answer.question==='Opcional').correct, null);
  await db.prepare("DELETE FROM school_subprogram_questions WHERE id=?").bind(single.id).run();
  assert.equal(JSON.parse((await db.prepare("SELECT answers_json FROM school_subprogram_diagnostics WHERE client_number='0000000010'").first()).answers_json)
    .find(answer => answer.question==='Una correcta').correct, true);

  assert.equal(scholarshipAmount(1000,25),750);
  assert.equal(scholarshipAmount(1000,100),0);
  await db.prepare("INSERT INTO customer_accounts VALUES ('scholar@example.test','0000000013')").run();
  await db.prepare("INSERT INTO school_subprogram_diagnostics(id,subprogram_id,client_number,answers_json,status) VALUES ('d-scholar','s1','0000000013','[]','approved')").run();
  await db.prepare("INSERT INTO school_subprogram_enrollments(id,client_number,subprogram_id,diagnostic_id,modality_id,starts_on) VALUES ('e-scholar','0000000013','s1','d-scholar','m3','2026-01-01')").run();
  await db.prepare("INSERT INTO school_subprogram_payment_schedules(id,enrollment_id,modality_id,anchor_on,frequency_unit,frequency_count,next_check_at) VALUES ('s-scholar','e-scholar','m3','2026-01-01','month',1,'')").run();
  await assert.rejects(() => setScholarship(db, '0000000009', 'e-scholar', 50), /inscripción/);
  await setScholarship(db,'0000000013','e-scholar',50);
  await db.prepare("UPDATE school_subprogram_payment_schedules SET next_check_at='' WHERE id='s-scholar'").run();
  await reconcileSubprogramSchedules(db,new Date('2026-03-15T12:00:00Z'));
  const discounted = await db.prepare("SELECT id,amount_cents FROM school_payment_obligations WHERE subprogram_schedule_id='s-scholar' AND scholarship_percent_snapshot=50 ORDER BY due_at LIMIT 1").first();
  assert.equal(discounted.amount_cents,1550);
  await setScholarship(db,'0000000013','e-scholar',100);
  await db.prepare("UPDATE school_subprogram_payment_schedules SET next_check_at='' WHERE id='s-scholar'").run();
  await reconcileSubprogramSchedules(db,new Date('2027-04-15T12:00:00Z'));
  assert.equal((await db.prepare('SELECT amount_cents FROM school_payment_obligations WHERE id=?').bind(discounted.id).first()).amount_cents,discounted.amount_cents);
  const scholarship = await db.prepare("SELECT schedule_id,period_start_on FROM school_subprogram_scholarship_periods WHERE schedule_id='s-scholar' AND status='active' LIMIT 1").first();
  assert.ok(scholarship);
  assert.equal(await db.prepare("SELECT id FROM school_payment_obligations WHERE subprogram_schedule_id='s-scholar' AND due_at=? AND status<>'cancelled'").bind(scholarship.period_start_on).first(),null);
  await db.prepare("UPDATE school_subprogram_scholarship_periods SET valid_from=datetime('now','-1 day'),valid_until=datetime('now','+1 day') WHERE schedule_id='s-scholar' AND period_start_on=?").bind(scholarship.period_start_on).run();
  await db.prepare("UPDATE school_payment_obligations SET status='cancelled' WHERE subprogram_schedule_id='s-scholar' AND status='pending'").run();
  await db.prepare("UPDATE school_subprograms SET enrollment_modality_id=NULL WHERE id='s1'").run();
  await db.prepare("UPDATE school_payment_modalities SET requires_current_enrollment=0 WHERE id='m3'").run();
  await db.prepare("INSERT INTO school_subprogram_group_members(enrollment_id,group_id) VALUES ('e-scholar',?)").bind(group.id).run();
  assert.ok(await canAccess('0000000013','c1'));
  await db.prepare("UPDATE school_subprogram_scholarship_periods SET status='cancelled' WHERE schedule_id='s-scholar'").run();
  assert.equal(await canAccess('0000000013','c1'),null);
  console.log('School subprogram diagnostics integration passed.');
} finally {
  await mf.dispose();
}
