import type { D1Database } from '@cloudflare/workers-types';

export interface DiagnosticQuestion {
  id: string;
  subprogram_id: string;
  prompt: string;
  answer_type: 'text' | 'choice';
  options_json: string;
  required: number;
  position: number;
  section_id: string | null;
  correct_options_json: string;
  choice_mode: 'single' | 'multiple';
}

export interface DiagnosticSection {
  id: string;
  subprogram_id: string;
  title: string;
  description: string;
  position: number;
}

export interface DiagnosticAnswer {
  question: string;
  answer: string;
  section?: string;
  correct?: boolean | null;
  correctAnswers?: string[];
}

function parseOptions(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((option) => typeof option === 'string')) {
    throw new Error('Las opciones del diagnóstico no son válidas.');
  }
  return parsed;
}

export function questionOptions(question: DiagnosticQuestion): string[] {
  return parseOptions(question.options_json);
}

export async function listDiagnosticSections(db: D1Database, subprogramId: string): Promise<DiagnosticSection[]> {
  return (await db.prepare(`SELECT id,subprogram_id,title,description,position
    FROM school_subprogram_diagnostic_sections WHERE subprogram_id=? ORDER BY position,id`)
    .bind(subprogramId).all<DiagnosticSection>()).results;
}

export async function listDiagnosticQuestions(db: D1Database, subprogramId: string): Promise<DiagnosticQuestion[]> {
  const result = await db.prepare(`
    SELECT id, subprogram_id, prompt, answer_type, options_json, required, position,section_id,correct_options_json,choice_mode
      FROM school_subprogram_questions WHERE subprogram_id = ? ORDER BY position, id
  `).bind(subprogramId).all<DiagnosticQuestion>();
  return result.results;
}

export async function saveDiagnosticSection(db: D1Database, form: FormData): Promise<void> {
  const subprogramId = String(form.get('subprogram_id') ?? '').trim();
  const id = String(form.get('section_id') ?? '').trim();
  const title = String(form.get('title') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const position = Number(form.get('position') ?? 0);
  if (!subprogramId || !title || title.length > 200 || description.length > 10000
    || !Number.isSafeInteger(position) || position < 0 || position > 10000) {
    throw new Error('Revisa el título, descripción y orden de la sección.');
  }
  const result = id
    ? await db.prepare(`UPDATE school_subprogram_diagnostic_sections SET title=?,description=?,position=?
        WHERE id=? AND subprogram_id=?`).bind(title, description, position, id, subprogramId).run()
    : await db.prepare(`INSERT INTO school_subprogram_diagnostic_sections(id,subprogram_id,title,description,position)
        SELECT ?,id,?,?,? FROM school_subprograms WHERE id=?`)
      .bind(crypto.randomUUID(), title, description, position, subprogramId).run();
  if (!result.meta.changes) throw new Error('No se encontró la sección o el subprograma.');
}

export async function removeDiagnosticSection(db: D1Database, subprogramId: string, id: string): Promise<void> {
  const result = await db.prepare(`DELETE FROM school_subprogram_diagnostic_sections
    WHERE id=? AND subprogram_id=? AND NOT EXISTS (
      SELECT 1 FROM school_subprogram_questions WHERE section_id=school_subprogram_diagnostic_sections.id)`)
    .bind(id, subprogramId).run();
  if (!result.meta.changes) throw new Error('La sección no existe o aún contiene preguntas. Mueve o elimina sus preguntas primero.');
}

export async function saveDiagnosticQuestion(db: D1Database, form: FormData): Promise<void> {
  const subprogramId = String(form.get('subprogram_id') ?? '').trim();
  const questionId = String(form.get('question_id') ?? '').trim();
  const sectionId = String(form.get('section_id') ?? '').trim() || null;
  const prompt = String(form.get('prompt') ?? '').trim();
  const answerType = String(form.get('answer_type') ?? '');
  const options = String(form.get('options') ?? '').split(/\r?\n/).map((option) => option.trim()).filter(Boolean);
  const correct = String(form.get('correct_options') ?? '').split(/\r?\n/).map((option) => option.trim()).filter(Boolean);
  const choiceMode = String(form.get('choice_mode') ?? 'single');
  const position = Number(form.get('position') ?? 0);
  if (!subprogramId || !prompt || prompt.length > 1000 || !['text', 'choice'].includes(answerType)
    || !Number.isSafeInteger(position) || position < 0 || position > 10000) {
    throw new Error('Revisa la pregunta y su orden.');
  }
  if (answerType === 'choice' && (options.length < 2 || options.length > 30
    || options.some((option) => option.length > 200) || new Set(options).size !== options.length)) {
    throw new Error('Indica entre 2 y 30 opciones diferentes, una por línea.');
  }
  if (!['single','multiple'].includes(choiceMode) || new Set(correct).size !== correct.length
    || correct.some(option => !options.includes(option))) {
    throw new Error('Las respuestas correctas deben coincidir exactamente con las opciones y no repetirse.');
  }
  const optionsJson = JSON.stringify(answerType === 'choice' ? options : []);
  const correctJson = JSON.stringify(answerType === 'choice' ? correct : []);
  const required = form.has('required') ? 1 : 0;
  const result = questionId
    ? await db.prepare(`UPDATE school_subprogram_questions SET prompt=?,answer_type=?,options_json=?,required=?,position=?,
        section_id=?,correct_options_json=?,choice_mode=?
        WHERE id=? AND subprogram_id=? AND (? IS NULL OR EXISTS (
          SELECT 1 FROM school_subprogram_diagnostic_sections WHERE id=? AND subprogram_id=?))`)
      .bind(prompt, answerType, optionsJson, required, position, sectionId, correctJson, choiceMode,
        questionId, subprogramId, sectionId, sectionId, subprogramId).run()
    : await db.prepare(`INSERT INTO school_subprogram_questions
        (id,subprogram_id,prompt,answer_type,options_json,required,position,section_id,correct_options_json,choice_mode)
        SELECT ?,id,?,?,?,?,?,?,?,? FROM school_subprograms WHERE id=? AND (? IS NULL OR EXISTS (
          SELECT 1 FROM school_subprogram_diagnostic_sections WHERE id=? AND subprogram_id=?))`)
      .bind(crypto.randomUUID(), prompt, answerType, optionsJson, required, position, sectionId, correctJson,
        choiceMode, subprogramId, sectionId, sectionId, subprogramId).run();
  if (!result.meta.changes) throw new Error('La pregunta, sección o subprograma no existe.');
}

export async function submitSubprogramDiagnostic(
  db: D1Database,
  clientNumber: string,
  subprogramId: string,
  form: FormData,
): Promise<void> {
  const subprogram = await db.prepare(`
    SELECT s.id FROM school_subprograms s JOIN school_programs p ON p.slug=s.program_slug
     WHERE s.id=? AND s.status='active' AND p.status='active'
  `).bind(subprogramId).first<{ id: string }>();
  if (!subprogram) throw new Error('Este subprograma no está disponible.');
  const [questions, sections] = await Promise.all([
    listDiagnosticQuestions(db, subprogramId), listDiagnosticSections(db, subprogramId),
  ]);
  if (!questions.length && !sections.length) throw new Error('El diagnóstico todavía no está disponible.');
  const answers: DiagnosticAnswer[] = questions.map((question) => {
    const values = form.getAll(`question_${question.id}`).map(value => String(value).trim()).filter(Boolean);
    if (question.required && !values.length) throw new Error('Responde todas las preguntas obligatorias.');
    if (values.some(value => value.length > 5000)) throw new Error('Una respuesta es demasiado larga.');
    if (question.answer_type !== 'choice' || question.choice_mode === 'single') {
      if (values.length > 1) throw new Error('Selecciona una sola respuesta.');
    }
    const correctOptions = question.answer_type === 'choice' ? parseOptions(question.correct_options_json) : [];
    if (question.answer_type === 'choice'
      && (new Set(values).size !== values.length || values.some(value => !questionOptions(question).includes(value)))) {
      throw new Error('Selecciona opciones válidas sin repetirlas.');
    }
    const correct = !values.length || !correctOptions.length ? null : question.choice_mode === 'multiple'
      ? values.length === correctOptions.length && values.every(value => correctOptions.includes(value))
      : correctOptions.includes(values[0]);
    const section = sections.find(item => item.id === question.section_id)?.title;
    return {
      question: question.prompt,
      answer: values.join('\n'),
      ...(section ? { section } : {}),
      ...(question.answer_type === 'choice' && correctOptions.length ? { correct, correctAnswers: correctOptions } : {}),
    };
  });
  const existing = await db.prepare(`
    SELECT id FROM school_subprogram_diagnostics
    WHERE client_number=? AND subprogram_id=? AND status IN ('pending','approved') AND closed_at IS NULL
  `).bind(clientNumber, subprogramId).first<{ id: string }>();
  if (existing) throw new Error('Ya tienes un diagnóstico enviado o aprobado para este subprograma.');
  await db.prepare(`
    INSERT INTO school_subprogram_diagnostics(id,subprogram_id,client_number,answers_json)
    VALUES (?,?,?,?)
  `).bind(crypto.randomUUID(), subprogramId, clientNumber, JSON.stringify(answers)).run();
}
