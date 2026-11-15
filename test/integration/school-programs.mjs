import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { saveProgramAction } from '../../src/features/school/programs.ts';
import { listPaymentConcepts, savePaymentConcept, removePaymentConcept } from '../../src/features/school/paymentConcepts.ts';

const mf = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response("ok") } }',
  compatibilityDate: '2026-07-20',
  d1Databases: ['DB'],
});

function form(fields) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

try {
  const db = await mf.getD1Database('DB');
  for (const sql of [
    "CREATE TABLE school_programs (slug TEXT PRIMARY KEY CHECK (slug IN ('matematicas','lectura')), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    'CREATE TABLE school_courses (id TEXT PRIMARY KEY, title TEXT NOT NULL)',
    'CREATE TABLE school_payment_products (id TEXT PRIMARY KEY, title TEXT NOT NULL)',
    'CREATE TABLE school_subprogram_payment_schedules (modality_id TEXT, next_check_at TEXT)',
    'CREATE TABLE school_subprogram_enrollments (id TEXT PRIMARY KEY, modality_id TEXT)',
    'CREATE TABLE school_payment_obligations (id TEXT PRIMARY KEY, status TEXT, checkout_lock_token TEXT, checkout_session_id TEXT, checkout_bundle_id TEXT)',
    "INSERT INTO school_programs (slug, title) VALUES ('matematicas', 'Matemáticas'), ('lectura', 'Lectura')",
    "INSERT INTO school_courses VALUES ('c1','Curso 1'), ('c2','Curso 2')",
    "INSERT INTO school_payment_products VALUES ('p1','Pago')",
  ]) await db.prepare(sql).run();
  const migration = await readFile(new URL('../../migrations/0076_school_subprograms.sql', import.meta.url), 'utf8');
  for (const sql of migration.replace(/--[^\n]*/g, '').split(';').map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(sql).run();
  }
  await db.prepare('ALTER TABLE school_payment_modalities ADD COLUMN billing_revision INTEGER NOT NULL DEFAULT 1').run();
  await db.prepare('ALTER TABLE school_subprograms ADD COLUMN enrollment_modality_id TEXT').run();
  const periodsMigration = await readFile(new URL('../../migrations/0079_school_payment_periods.sql', import.meta.url), 'utf8');
  for (const sql of periodsMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const testSchemesMigration = await readFile(new URL('../../migrations/0089_school_test_payment_schemes.sql', import.meta.url), 'utf8');
  for (const sql of testSchemesMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const conceptsMigration = await readFile(new URL('../../migrations/0090_school_payment_concepts.sql', import.meta.url), 'utf8');
  for (const sql of conceptsMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const conceptAssignmentsMigration = await readFile(new URL('../../migrations/0091_school_concept_assignments.sql', import.meta.url), 'utf8');
  for (const sql of conceptAssignmentsMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const conceptCancellationMigration = await readFile(new URL('../../migrations/0092_school_concept_cancellation.sql', import.meta.url), 'utf8');
  for (const sql of conceptCancellationMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const conceptOccurrencesMigration = await readFile(new URL('../../migrations/0093_school_recurring_concept_charges.sql', import.meta.url), 'utf8');
  for (const sql of conceptOccurrencesMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const retiredOccurrencesMigration = await readFile(new URL('../../migrations/0094_school_retired_concept_occurrences.sql', import.meta.url), 'utf8');
  for (const sql of retiredOccurrencesMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  const conceptRetryMigration = await readFile(new URL('../../migrations/0095_school_concept_retry.sql', import.meta.url), 'utf8');
  for (const sql of conceptRetryMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();
  await db.prepare('ALTER TABLE school_subprograms ADD COLUMN suspension_after_days INTEGER').run();
  await db.prepare('CREATE TABLE school_subprogram_groups (id TEXT PRIMARY KEY)').run();
  await db.prepare('CREATE TABLE school_subprogram_questions (id TEXT PRIMARY KEY)').run();
  const sectionsMigration = await readFile(new URL('../../migrations/0082_school_groups_diagnostic_sections.sql', import.meta.url), 'utf8');
  for (const sql of sectionsMigration.split(';').map((part) => part.trim()).filter(Boolean)) await db.prepare(sql).run();

  await saveProgramAction(db, form({ action: 'save-program', program_slug: 'matematicas', title: 'Matemáticas nuevas', image_url: '/images/a', status: 'active' }));
  assert.equal((await db.prepare("SELECT image_url FROM school_programs WHERE slug='matematicas'").first()).image_url, '/images/a');
  const fields = { action: 'save-subprogram', program_slug: 'matematicas', slug: 'algebra', title: 'Álgebra', education_level: 'Media', objectives: 'Aprender', methodology: 'Práctica', terms_md: 'Términos', policies_md: 'Políticas', duration_description: 'Un año', status: 'draft' };
  await saveProgramAction(db, form(fields));
  const sub = await db.prepare('SELECT * FROM school_subprograms').first();
  assert.equal(sub.objectives, 'Aprender');
  await saveProgramAction(db, form({ ...fields, id: sub.id, title: 'Álgebra II', program_slug: 'lectura' }));
  assert.equal((await db.prepare('SELECT title FROM school_subprograms WHERE id=?').bind(sub.id).first()).title, 'Álgebra II');
  await saveProgramAction(db, form({ action:'save-subprogram-faq', subprogram_id:sub.id, question:'¿Cuándo?', answer:'Los lunes.', position:'2' }));
  const faq = await db.prepare('SELECT * FROM school_subprogram_faqs WHERE subprogram_id=?').bind(sub.id).first();
  await saveProgramAction(db, form({ action:'save-subprogram-faq', subprogram_id:sub.id, faq_id:faq.id, question:'¿Cuándo?', answer:'Los martes.', position:'1' }));
  assert.equal((await db.prepare('SELECT answer FROM school_subprogram_faqs WHERE id=?').bind(faq.id).first()).answer, 'Los martes.');
  await saveProgramAction(db, form({ action:'remove-subprogram-faq', subprogram_id:sub.id, faq_id:faq.id }));
  assert.equal(await db.prepare('SELECT id FROM school_subprogram_faqs WHERE id=?').bind(faq.id).first(), null);
  await saveProgramAction(db, form({ action: 'add-course', subprogram_id: sub.id, course_id: 'c1' }));
  const modality = { action: 'save-modality', subprogram_id: sub.id, title: 'Clases', payment_product_id: 'p1', payment_type: 'classes', frequency_unit: 'month', frequency_count: '1', course_id: 'c1', validity_count: '2', validity_unit: 'month', status: 'active', period_start_on: '2026-01-01', period_end_on: '2026-01-31', advance_days: '5', proration_method: 'days' };
  await saveProgramAction(db, form(modality));
  const saved = await db.prepare('SELECT * FROM school_payment_modalities').first();
  assert.equal(saved.course_id, 'c1');
  const concept = { title:'Inscripción', period_start_on:'2027-01-01', period_end_on:'2027-12-31',
    amount:'125.50', currency:'mxn', recurrence_unit:'once', grace_days:'3', group_name:'Primer pago', allow_after_start:'1', required_for_access:'1' };
  await savePaymentConcept(db, saved.id, form(concept));
  const [storedConcept] = await listPaymentConcepts(db, saved.id);
  assert.equal(storedConcept.amount_cents, 12550);
  await assert.rejects(() => savePaymentConcept(db, saved.id, form({ ...concept, currency:'usd', group_name:'primer pago' })), /moneda/);
  await savePaymentConcept(db, saved.id, form({ ...concept, concept_id:storedConcept.id, amount:'150' }));
  assert.equal((await listPaymentConcepts(db, saved.id))[0].amount_cents, 15000);
  await removePaymentConcept(db, saved.id, storedConcept.id);
  assert.deepEqual(await listPaymentConcepts(db, saved.id), []);
  await assert.rejects(() => saveProgramAction(db, form({ action: 'remove-course', subprogram_id: sub.id, course_id: 'c1' })));
  await assert.rejects(() => saveProgramAction(db, form({ ...modality, course_id: 'c2' })));
  await saveProgramAction(db, form({ ...modality, id: saved.id, course_id: '', validity_count: '', validity_unit: '' }));
  await saveProgramAction(db, form({ ...modality, id: saved.id, course_id: '', validity_count: '', validity_unit: '', test_mode: '1' }));
  assert.equal((await db.prepare('SELECT test_mode FROM school_payment_modalities WHERE id=?').bind(saved.id).first()).test_mode, 1);
  await db.prepare("INSERT INTO school_subprogram_payment_schedules(modality_id,next_check_at) VALUES (?, '')").bind(saved.id).run();
  await assert.rejects(() => saveProgramAction(db, form({ ...modality, id: saved.id, course_id: '', validity_count: '', validity_unit: '' })), /modo de prueba/);
  await saveProgramAction(db, form({ action: 'remove-course', subprogram_id: sub.id, course_id: 'c1' }));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM school_subprogram_courses').first()).n, 0);
  console.log('School programs integration passed.');
} finally {
  await mf.dispose();
}
