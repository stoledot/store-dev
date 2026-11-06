/** Validates the supported course-TeX subset before it is persisted or rendered. */
export interface TexIssue { line: number; column: number; message: string; suggestion: string }

// Content blocks become stable course units; presentation-only environments (math and lists) stay nestable.
const requiredIdEnvs = new Set(['activity', 'lesson', 'exercise', 'task', 'assignment', 'deliverable','definition','theorem','lemma','proposition','corollary','proof','example','remark','note','warning','solution','axiom','conjecture','problem','table','htmlblock']);
const allowedAttrs = new Set(['id', 'type', 'weight', 'due', 'required', 'title', 'header']);
const allowedTypes = new Set(['short', 'long', 'choice', 'upload']);
const knownEnvs = new Set(['activity','lesson','exercise','task','assignment','deliverable','definition','theorem','lemma','proposition','corollary','proof','example','remark','note','warning','solution','axiom','conjecture','problem','itemize','enumerate','equation','equation*','align','align*','gather','gather*','multline','multline*','table','htmlblock']);

/** Return editor-friendly source locations for structural and activity metadata errors. */
export function validateCourseTex(source: string): TexIssue[] {
  const issues: TexIssue[] = [];
  const lineAt = (offset: number) => {
    const before = source.slice(0, offset); const line = before.split('\n');
    return { line: line.length, column: line[line.length - 1].length + 1 };
  };
  const add = (offset: number, message: string, suggestion: string) => issues.push({ ...lineAt(offset), message, suggestion });
  // Ignore comments when checking delimiters and commands, while preserving all line offsets.
  const clean = source.replace(/%[^\n]*/g, (m, offset) => m.replace(/./g, ' '));
  const braces: Array<{at:number; literal:boolean}> = [];
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '\\') {
      if (clean[i + 1] === '{') braces.push({at:i,literal:true});
      else if (clean[i + 1] === '}' && braces.at(-1)?.literal) braces.pop();
      i++; continue;
    }
    if (clean[i] === '{') braces.push({at:i,literal:false});
    else if (clean[i] === '}') { if (!braces.length) add(i, 'Hay una llave de cierre “}” sin pareja.', 'Agrega la llave de apertura “{” que falta o elimina esta llave.'); else braces.pop(); }
  }
  for (const brace of braces) add(brace.at, 'Falta cerrar una llave “{”.', `Agrega “${brace.literal ? '\\}' : '}'}” para cerrar el argumento.`);

  // Check math delimiters before fragments are sent to the LaTeX.js renderer.
  for (const [open, close] of [['\\(', '\\)'], ['\\[', '\\]']] as const) {
    let openAt = -1;
    for (let i = 0; i < clean.length - 1; i++) {
      if (clean.slice(i, i + 2) === open) { if (openAt >= 0) add(i, `El delimitador “${open}” aparece antes de cerrar el anterior.`, `Cierra la expresión actual con “${close}”.`); else openAt = i; i++; }
      else if (clean.slice(i, i + 2) === close) { if (openAt < 0) add(i, `El delimitador “${close}” no tiene apertura.`, `Agrega “${open}” antes de la expresión.`); else openAt = -1; i++; }
    }
    if (openAt >= 0) add(openAt, `Falta cerrar el delimitador matemático “${open}”.`, `Agrega “${close}” al final de la expresión.`);
  }
  const dollarMath = [...clean.matchAll(/(?<!\\)\$\$?|(?<!\\)\$\$?/g)];
  let dollarOpen: RegExpMatchArray | null = null;
  for (const token of dollarMath) {
    const value = token[0];
    if (!dollarOpen) dollarOpen = token;
    else if (dollarOpen[0] === value) dollarOpen = null;
    else add(token.index ?? 0, 'Se mezclaron delimitadores $ y $$ sin cerrar el anterior.', `Cierra el delimitador “${dollarOpen[0]}” antes de iniciar otro.`);
  }
  if (dollarOpen) add(dollarOpen.index ?? 0, `Falta cerrar el delimitador matemático “${dollarOpen[0]}”.`, `Agrega “${dollarOpen[0]}” al final de la expresión.`);

  const envStack: Array<{name:string; at:number}> = [];
  const ids = new Map<string, number>();
  const envRe = /\\(begin|end)\s*\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = envRe.exec(clean))) {
    const action = match[1], name = match[2].trim(), at = match.index;
    if (!knownEnvs.has(name) && !['document'].includes(name)) { add(at, `Entorno desconocido “${name}”.`, 'Usa un entorno compatible o corrige el nombre.'); continue; }
    if (action === 'end') {
      const open = envStack.pop();
      if (!open) add(at, `“\\end{${name}}” no tiene un entorno abierto.`, `Agrega “\\begin{${name}}” antes o corrige el cierre.`);
      else if (open.name !== name) { add(at, `Se cerró “${name}”, pero el entorno abierto es “${open.name}”.`, `Cierra “${open.name}” aquí y revisa el orden de los entornos.`); envStack.push(open); }
      continue;
    }
    envStack.push({name, at});
    if (!requiredIdEnvs.has(name)) continue;
    const tail = clean.slice(envRe.lastIndex);
    const attrMatch = tail.match(/^\s*\[([^\]]*)\]/);
    if (!attrMatch) { add(at, `El entorno “${name}” necesita atributos entre corchetes e id.`, 'Escribe, por ejemplo, [id=actividad-1,type=short].'); continue; }
    const attrStart = envRe.lastIndex + tail.search(/\S/);
    const raw = attrMatch[1]; const attrs: Record<string,string> = {};
    let offset = 0;
    for (const part of raw.split(',')) {
      const eq = part.indexOf('='); const key = (eq < 0 ? part : part.slice(0,eq)).trim().toLowerCase(); const value = eq < 0 ? '' : part.slice(eq+1).trim();
      const partAt = attrStart + 1 + offset; offset += part.length + 1;
      if (!key || eq < 1) { add(partAt, `Atributo inválido “${part.trim()}”.`, 'Usa el formato nombre=valor, por ejemplo type=choice.'); continue; }
      if (!allowedAttrs.has(key)) { add(partAt, `Atributo “${key}” no admitido en “${name}”.`, 'Revisa los nombres permitidos: id, type, weight, due, required, title y header.'); continue; }
      if (key in attrs) add(partAt, `El atributo “${key}” está repetido.`, 'Conserva una sola asignación para este atributo.');
      attrs[key] = value.replace(/^\{(.*)\}$/s, '$1');
    }
    const id = attrs.id ?? '';
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id)) add(attrStart, 'Falta un id válido para este entorno.', 'Agrega id único, iniciado con letra y usando letras, números, guion o guion bajo.');
    else if (ids.has(id)) add(attrStart, `El id “${id}” también aparece en la línea ${lineAt(ids.get(id)!).line}.`, 'Asigna un id único y estable a cada lectura o actividad.');
    else ids.set(id, attrStart);
    if (attrs.type && !allowedTypes.has(attrs.type)) add(attrStart, `Tipo de actividad “${attrs.type}” no válido.`, 'Usa type=short, type=long, type=choice o type=upload.');
    if (attrs.weight !== undefined && (!/^\d+(?:\.\d+)?$/.test(attrs.weight) || Number(attrs.weight) > 20)) add(attrStart, 'El peso debe ser un número entre 0 y 20.', 'Corrige weight o elimina el atributo para usar el valor predeterminado.');
    if (attrs.due && !/^\d{4}-\d{2}-\d{2}$/.test(attrs.due)) add(attrStart, 'La fecha due debe usar el formato AAAA-MM-DD.', 'Ejemplo: due=2026-11-15.');
    if (attrs.required && !['true','false'].includes(attrs.required)) add(attrStart, 'El atributo required solo admite true o false.', 'Usa required=true o required=false.');
    envRe.lastIndex += attrMatch[0].length;
  }
  for (const open of envStack.reverse()) add(open.at, `Falta cerrar el entorno “${open.name}”.`, `Agrega “\\end{${open.name}}”.`);

  // Every choice activity needs unique options and exactly one correct key.
  const choiceRe = /\\begin\{(activity|exercise|task|assignment)\}\s*\[([^\]]*)\]([\s\S]*?)\\end\{\1\}/g;
  while ((match = choiceRe.exec(clean))) {
    const attrs = Object.fromEntries(match[2].split(',').map((p) => { const i=p.indexOf('='); return i>0 ? [p.slice(0,i).trim(),p.slice(i+1).trim()] : ['', '']; }));
    const options = [...match[3].matchAll(/\\option\s*\{([^{}]*)\}\s*\{/g)].map((m)=>m[1].trim());
    const correct = [...match[3].matchAll(/\\correct\s*\{([^{}]*)\}/g)].map((m)=>m[1].trim());
    if (attrs.type === 'choice' || options.length || correct.length) {
      if (options.length < 2) add(match.index, 'La opción múltiple requiere al menos dos opciones.', 'Agrega dos o más comandos \\option{clave}{texto}.');
      if (new Set(options).size !== options.length) add(match.index, 'Hay claves de opción repetidas.', 'Asigna una clave distinta a cada opción.');
      if (correct.length !== 1) add(match.index, 'La opción múltiple requiere exactamente un comando \\correct{clave}.', 'Marca una sola respuesta correcta.');
      else if (!options.includes(correct[0])) add(match.index, `La clave correcta “${correct[0]}” no coincide con ninguna opción.`, 'Copia en \\correct{} una clave usada en \\option{}.');
    }
  }
  return issues;
}
