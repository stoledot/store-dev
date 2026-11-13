import type { D1Database } from '@cloudflare/workers-types';

export interface DiagnosticQuestion {
  id: string;
  subprogram_id: string;
  prompt: string;
  answer_type: 'text' | 'choice';
  options_json: string;
  required: number;
  position: number;
}

export interface DiagnosticAnswer {
  question: string;
  answer: string;
}

export function questionOptions(question: DiagnosticQuestion): string[] {
  const parsed: unknown = JSON.parse(question.options_json);
  if (!Array.isArray(parsed) || !parsed.every((option) => typeof option === 'string')) {
    throw new Error('Las opciones del diagnóstico no son válidas.');
  }
  return parsed;
}

export async function listDiagnosticQuestions(db: D1Database, subprogramId: string): Promise<DiagnosticQuestion[]> {
  const result = await db.prepare(`
    SELECT id, subprogram_id, prompt, answer_type, options_json, required, position
      FROM school_subprogram_questions WHERE subprogram_id = ? ORDER BY position, id
  `).bind(subprogramId).all<DiagnosticQuestion>();
  return result.results;
}

export async function saveDiagnosticQuestion(db: D1Database, form: FormData): Promise<void> {
  const subprogramId = String(form.get('subprogram_id') ?? '').trim();
  const prompt = String(form.get('prompt') ?? '').trim();
  const answerType = String(form.get('answer_type') ?? '');
  const options = String(form.get('options') ?? '').split(/\r?\n/).map((option) => option.trim()).filter(Boolean);
  const position = Number(form.get('position') ?? 0);
  if (!subprogramId || !prompt || prompt.length > 1000 || !['text', 'choice'].includes(answerType)
    || !Number.isSafeInteger(position) || position < 0 || position > 10000) {
    throw new Error('Revisa la pregunta y su orden.');
  }
  if (answerType === 'choice' && (options.length < 2 || options.length > 30
    || options.some((option) => option.length > 200) || new Set(options).size !== options.length)) {
    throw new Error('Indica entre 2 y 30 opciones diferentes, una por línea.');
  }
  await db.prepare(`
    INSERT INTO school_subprogram_questions (id,subprogram_id,prompt,answer_type,options_json,required,position)
    VALUES (?,?,?,?,?,?,?)
  `).bind(crypto.randomUUID(), subprogramId, prompt, answerType,
    JSON.stringify(answerType === 'choice' ? options : []), form.has('required') ? 1 : 0, position).run();
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
  const questions = await listDiagnosticQuestions(db, subprogramId);
  if (!questions.length) throw new Error('El diagnóstico todavía no está disponible.');
  const answers: DiagnosticAnswer[] = questions.map((question) => {
    const answer = String(form.get(`question_${question.id}`) ?? '').trim();
    if (question.required && !answer) throw new Error('Responde todas las preguntas obligatorias.');
    if (answer.length > 5000) throw new Error('Una respuesta es demasiado larga.');
    if (question.answer_type === 'choice' && answer && !questionOptions(question).includes(answer)) {
      throw new Error('Selecciona una opción válida.');
    }
    return { question: question.prompt, answer };
  });
  const existing = await db.prepare(`
    SELECT id FROM school_subprogram_diagnostics
    WHERE client_number=? AND subprogram_id=? AND status IN ('pending','approved')
  `).bind(clientNumber, subprogramId).first<{ id: string }>();
  if (existing) throw new Error('Ya tienes un diagnóstico enviado o aprobado para este subprograma.');
  await db.prepare(`
    INSERT INTO school_subprogram_diagnostics(id,subprogram_id,client_number,answers_json)
    VALUES (?,?,?,?)
  `).bind(crypto.randomUUID(), subprogramId, clientNumber, JSON.stringify(answers)).run();
}
