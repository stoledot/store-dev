/** Safe, intentionally small TeX subset shared by the mathematical reader and the TeX-first academy.
 * Course files are source files, not LaTeX documents to be compiled. See docs/ACADEMY-TEX.md.
 */
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'contenido';
const cleanSource = (s: string) => s
  .replace(/\\(?:documentclass(?:\[[^\]]*\])?\{[^}]*\}|usepackage(?:\[[^\]]*\])?\{[^}]*\}|begin\{document\}|end\{document\}|maketitle|tableofcontents|newpage|clearpage)/g, '')
  .replace(/^\s*%[^\n]*$/gm, '');

export interface TeXSection { id: string; title: string; level: number; html: string }
export type AcademyNodeType = 'reading' | 'short' | 'long' | 'choice' | 'upload';
export interface AcademyOption { key: string; label: string }
export interface AcademyNode {
  id: string; explicitId: boolean; title: string; level: number; type: AcademyNodeType; kind: string;
  html: string; due: string | null; weight: number; required: boolean;
  options: AcademyOption[]; correct: string | null;
}

function takeBalanced(source: string, start: number, open = '{', close = '}'): { value: string; end: number } | null {
  if (source[start] !== open) return null;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === open && source[i - 1] !== '\\') depth++;
    else if (source[i] === close && source[i - 1] !== '\\') {
      depth--;
      if (depth === 0) return { value: source.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}
function commandArgs(source: string, command: string, from = 0): { args: string[]; end: number } | null {
  const at = source.indexOf(`\\${command}`, from);
  if (at < 0) return null;
  let pos = at + command.length + 1; const args: string[] = [];
  while (/\s/.test(source[pos] ?? '')) pos++;
  while (source[pos] === '{') {
    const item = takeBalanced(source, pos); if (!item) break;
    args.push(item.value); pos = item.end;
    while (/\s/.test(source[pos] ?? '')) pos++;
  }
  return args.length ? { args, end: pos } : null;
}
function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Attribute values may use {braces}, so only split commas at brace depth zero.
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < raw.length; i++) { if (raw[i] === '{') depth++; if (raw[i] === '}') depth--; if (raw[i] === ',' && depth === 0) { parts.push(raw.slice(start, i)); start = i + 1; } }
  parts.push(raw.slice(start));
  for (const part of parts) { const eq = part.indexOf('='); if (eq < 1) continue; let key = part.slice(0, eq).trim().toLowerCase(); let value = part.slice(eq + 1).trim(); if (value.startsWith('{') && value.endsWith('}')) value = value.slice(1, -1); if (/^[a-z][a-z0-9_-]{0,30}$/.test(key)) out[key] = value.slice(0, 500); }
  return out;
}
function safeUrl(value: string): string | null {
  const v = value.trim(); if (/^https:\/\//i.test(v) || /^\/(?!\/)/.test(v)) return v;
  return null;
}
function safeHtmlBlock(raw: string): string {
  // This deliberately allows presentation HTML only. Scripts, embeds, event handlers,
  // javascript: URLs, and arbitrary style properties are removed before returning HTML.
  let html = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/<\s*(script|style|iframe|object|embed|svg|math|form|input|button)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  const allowedTags = new Set(['div','span','p','strong','b','em','i','u','small','br','hr','ul','ol','li','table','thead','tbody','tr','th','td','caption','a','img','blockquote','code']);
  html = html.replace(/<\/?([a-zA-Z][\w-]*)([^>]*)>/g, (all, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase(); if (!allowedTags.has(tag)) return '';
    const closing = /^<\s*\//.test(all); if (closing) return `</${tag}>`;
    const attrs: string[] = [];
    const cls = rawAttrs.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1];
    if (cls && /^[a-zA-Z0-9 _-]{1,100}$/.test(cls)) attrs.push(`class="${escapeHtml(cls)}"`);
    const style = rawAttrs.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1];
    if (style) {
      const allowed: string[] = [];
      for (const declaration of style.split(';')) { const [k, ...rest] = declaration.split(':'); const key = k?.trim().toLowerCase(); const val = rest.join(':').trim();
        if (['color','background-color','border','border-color','border-radius','padding','margin','text-align','font-weight','font-style','width','max-width'].includes(key ?? '') && val.length < 100 && !/[<>]|url\s*\(|expression|javascript/i.test(val)) allowed.push(`${key}:${val}`); }
      if (allowed.length) attrs.push(`style="${escapeHtml(allowed.join(';'))}"`);
    }
    if (tag === 'a') { const href = rawAttrs.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1]; const safe = href ? safeUrl(href) : null; if (safe) attrs.push(`href="${escapeHtml(safe)}"`, 'rel="noopener noreferrer"'); }
    if (tag === 'img') { const src = rawAttrs.match(/\bsrc\s*=\s*["']([^"']*)["']/i)?.[1]; const alt = rawAttrs.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''; const safe = src ? safeUrl(src) : null; if (!safe) return ''; attrs.push(`src="${escapeHtml(safe)}"`,`alt="${escapeHtml(alt)}"`,'loading="lazy"','class="max-w-full rounded-xl"'); }
    return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${['br','hr','img'].includes(tag) ? ' /' : ''}>`;
  });
  return html;
}
function formatTable(raw: string, attrsRaw = ''): string {
  const color = parseAttrs(attrsRaw).header ?? 'blue';
  const palette: Record<string, string> = { blue: '#1d4ed8', teal: '#0f766e', purple: '#6d28d9', dark: '#334155', green: '#15803d', orange: '#c2410c' };
  const header = palette[color] ?? palette.blue;
  const rows: string[][] = [];
  const rowRe = /\\row\b/g; let m: RegExpExecArray | null;
  while ((m = rowRe.exec(raw))) { const vals: string[] = []; let p = rowRe.lastIndex; while (p < raw.length) { while (/\s/.test(raw[p] ?? '')) p++; if (raw[p] !== '{') break; const arg = takeBalanced(raw, p); if (!arg) break; vals.push(arg.value); p = arg.end; } if (vals.length) rows.push(vals); rowRe.lastIndex = Math.max(rowRe.lastIndex, p); }
  if (!rows.length) { const plain = raw.split(/\\\\/).map(x => x.trim()).filter(Boolean); for (const line of plain) rows.push(line.split('&').map(x => x.replace(/\\hline/g,'').trim())); }
  if (!rows.length) return '';
  return `<div class="tex-table-wrap"><table class="tex-table"><thead style="background:${header};color:#fff"><tr>${rows[0].map(c => `<th>${renderTexBody(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(c => `<td>${renderTexBody(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderMathProtected(source: string): { text: string; held: string[] } {
  const held: string[] = [];
  const hold = (html: string) => { const key = `ZZMATHHOLD${held.length}ZZ`; held.push(html); return key; };
  let text = source
    .replace(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?)\}([\s\S]*?)\\end\{\1\}/g, (_m, _kind, math) => hold(`<div class="math-display">\\[${escapeHtml(math)}\\]</div>`))
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, math) => hold(`<div class="math-display">\\[${escapeHtml(math)}\\]</div>`))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, math) => hold(`<span>\\(${escapeHtml(math)}\\)</span>`))
    .replace(/\$\$([\s\S]*?)\$\$/g, (_m, math) => hold(`<div class="math-display">\\[${escapeHtml(math)}\\]</div>`))
    .replace(/\$([^$\n]+)\$/g, (_m, math) => hold(`<span>\\(${escapeHtml(math)}\\)</span>`));
  return { text, held };
}
export function renderTexBody(input: string): string {
  let source = input.trim(); if (!source) return '';
  // Extract supported custom tables, HTML blocks and image macros before escaping text.
  const generated: string[] = []; const keep = (html: string) => { const k = `ZZGENERATED${generated.length}ZZ`; generated.push(html); return k; };
  source = source.replace(/\\begin\{htmlblock\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{htmlblock\}/g, (_m, _attrs, body) => keep(safeHtmlBlock(body)));
  source = source.replace(/\\begin\{table\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{table\}/g, (_m, attrs, body) => keep(formatTable(body, attrs ?? '')));
  source = source.replace(/\\image\s*\{([^{}]*)\}\s*\{([^{}]*)\}(?:\s*\{([^{}]*)\})?/g, (_m, url, alt, caption) => { const safe = safeUrl(url); return keep(safe ? `<figure class="tex-figure"><img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" loading="lazy" class="max-w-full rounded-xl"/>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>` : `<p>[Imagen no disponible: ${escapeHtml(alt)}]</p>`); });
  // Convert lists before escaping. Items are recursively formatted as ordinary TeX text.
  source = source.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g, (_m, kind, inner) => { const items = inner.split(/\\item\s*/).slice(1).map((x: string) => `<li>${renderTexBody(x.trim())}</li>`).join(''); return keep(`<${kind === 'itemize' ? 'ul' : 'ol'} class="tex-list">${items}</${kind === 'itemize' ? 'ul' : 'ol'}>`); });
  source = source.replace(/\\begin\{(definition|theorem|lemma|proposition|corollary|proof|example|remark|note|warning|solution|axiom|conjecture|problem)\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{\1\}/g, (_m, kind, title, body) => { const labels: Record<string,string> = {definition:'Definición',theorem:'Teorema',lemma:'Lema',proposition:'Proposición',corollary:'Corolario',proof:'Demostración',example:'Ejemplo',remark:'Observación',note:'Nota',warning:'Atención',solution:'Solución',axiom:'Axioma',conjecture:'Conjetura',problem:'Problema'}; const style = kind === 'warning' ? 'warning' : ['definition','theorem','lemma','proposition','corollary'].includes(kind) ? 'math' : 'example'; return keep(`<aside class="tex-callout tex-${style}"><h3>${labels[kind]}${title ? `: ${escapeHtml(title)}` : ''}</h3><div>${renderTexBody(body)}</div></aside>`); });
  // Preserve MathJax source while escaping all ordinary content.
  const math = renderMathProtected(source); let html = escapeHtml(math.text);
  html = html.replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>').replace(/\\textit\{([^{}]*)\}/g, '<em>$1</em>').replace(/\\emph\{([^{}]*)\}/g, '<em>$1</em>').replace(/\\underline\{([^{}]*)\}/g, '<u>$1</u>').replace(/\\texttt\{([^{}]*)\}/g, '<code>$1</code>');
  html = html.replace(/\\(?:par|newline|\\)\s*/g, '\n\n').replace(/\\item\s*/g, '• ').replace(/\\(?:label|ref|cite|index)\{[^{}]*\}/g, '').replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, '').replace(/[{}]/g, '');
  const blockMath = new Set<number>(); math.held.forEach((value,i) => { if (/^<(?:div|aside|ul|ol|figure|table)\b/i.test(value)) { blockMath.add(i); html = html.replace(`ZZMATHHOLD${i}ZZ`, `\n\nZZBLOCKMATH${i}ZZ\n\n`); } });
  const blockGenerated = new Set<number>(); generated.forEach((value,i) => { if (/^<(?:div|aside|ul|ol|figure|table)\b/i.test(value)) { blockGenerated.add(i); html = html.replace(`ZZGENERATED${i}ZZ`, `\n\nZZBLOCKGEN${i}ZZ\n\n`); } });
  html = html.split(/\n\s*\n/).map(p => { const trimmed = p.trim(); if (!trimmed) return ''; const bm = trimmed.match(/^ZZBLOCKMATH(\d+)ZZ$/); if (bm) return math.held[Number(bm[1])] ?? ''; const bg = trimmed.match(/^ZZBLOCKGEN(\d+)ZZ$/); if (bg) return generated[Number(bg[1])] ?? ''; return `<p>${trimmed.replace(/\n/g, ' ')}</p>`; }).join('\n');
  html = html.replace(/ZZMATHHOLD(\d+)ZZ/g, (_m, i) => math.held[Number(i)] ?? '').replace(/ZZGENERATED(\d+)ZZ/g, (_m, i) => generated[Number(i)] ?? '');
  return html;
}
function findEnvironmentEnd(source: string, env: string, from: number): number {
  const re = new RegExp(`\\\\(begin|end)\\{${env.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g'); re.lastIndex = from; let depth = 1; let m: RegExpExecArray | null;
  while ((m = re.exec(source))) { if (m[1] === 'begin') depth++; else depth--; if (depth === 0) return m.index; }
  return -1;
}
const BLOCK_ENVS = new Set(['activity','lesson','exercise','task','assignment','deliverable','definition','theorem','lemma','proposition','corollary','proof','example','remark','note','warning','solution','axiom','conjecture','problem','itemize','enumerate','equation','equation*','align','align*','gather','gather*','multline','multline*','table','htmlblock']);
function parseOptions(body: string): { body: string; options: AcademyOption[]; correct: string | null } {
  const options: AcademyOption[] = []; let correct: string | null = null;
  const optionRe = /\\option\b/g; const removals: Array<[number,number]> = []; let match: RegExpExecArray | null;
  while ((match = optionRe.exec(body))) {
    let pos = optionRe.lastIndex; while (/\s/.test(body[pos] ?? '')) pos++;
    const key = takeBalanced(body, pos); if (!key) continue; pos = key.end; while (/\s/.test(body[pos] ?? '')) pos++;
    const label = takeBalanced(body, pos); if (!label) continue;
    options.push({ key: key.value.trim().slice(0, 40), label: label.value.trim().slice(0, 500) });
    removals.push([match.index, label.end]); optionRe.lastIndex = label.end;
  }
  for (const [start,end] of removals.reverse()) body = body.slice(0,start) + body.slice(end);
  const correctRe = /\\correct\b/g; const correctMatches: Array<[number,number,string]> = [];
  while ((match = correctRe.exec(body))) { let pos = correctRe.lastIndex; while (/\s/.test(body[pos] ?? '')) pos++; const arg = takeBalanced(body,pos); if (!arg) continue; correctMatches.push([match.index,arg.end,arg.value]); correctRe.lastIndex=arg.end; }
  for (const [start,end,key] of correctMatches.reverse()) { correct = key.trim().slice(0,40); body = body.slice(0,start) + body.slice(end); }
  return { body, options, correct };
}
/** Parse structural headings and top-level environments into sequential, gateable nodes. */
export function renderCourseTex(raw: string): AcademyNode[] {
  const source = cleanSource(raw); const nodes: AcademyNode[] = []; let cursor = 0; let serial = 0; let pendingHasContent = false; let headingPath: string[] = [];
  const push = (title: string, body: string, level: number, kind: string, attrs: Record<string,string> = {}) => {
    const parsed = parseOptions(body); const requested = (attrs.type ?? '').toLowerCase();
    let type: AcademyNodeType = 'reading';
    if (['short','long','choice','upload'].includes(requested)) type = requested as AcademyNodeType;
    else if (kind === 'activity') type = 'short';
    else if (kind === 'exercise' || kind === 'problem' || kind === 'task' || kind === 'assignment' || kind === 'deliverable') type = kind === 'deliverable' || attrs.type === 'upload' ? 'upload' : kind === 'assignment' || kind === 'task' ? 'long' : 'short';
    if (parsed.options.length) type = 'choice';
    const defaultWeight = ['activity','lesson','exercise','problem','task','assignment','deliverable'].includes(kind) ? 1 : 0; const weightRaw = Number(attrs.weight ?? String(defaultWeight)); const weight = Number.isFinite(weightRaw) ? (weightRaw <= 0 ? 0 : Math.max(0.05, Math.min(20, weightRaw))) : defaultWeight;
    let cleanTitle = title.trim().replace(/[{}]/g, '').slice(0, 200) || `Contenido ${serial + 1}`;
    if (kind === 'lesson' && headingPath.length && cleanTitle === headingPath[headingPath.length - 1]) cleanTitle = headingPath.join(' / ').slice(0, 200);
    else if (kind !== 'reading' && headingPath.length && cleanTitle !== headingPath[headingPath.length - 1]) cleanTitle = `${headingPath.join(' / ')} — ${cleanTitle}`.slice(0, 200);
    const id = slug(attrs.id ?? `${serial + 1}-${cleanTitle}`);
    let renderSource = parsed.body;
    if (kind === 'table') renderSource = `\\begin{table}[header=${attrs.header ?? 'blue'}]${parsed.body}\\end{table}`;
    else if (kind === 'htmlblock') renderSource = `\\begin{htmlblock}${parsed.body}\\end{htmlblock}`;
    else if (kind === 'itemize' || kind === 'enumerate' || ['definition','theorem','lemma','proposition','corollary','proof','example','remark','note','warning','solution','axiom','conjecture','problem','equation','equation*','align','align*','gather','gather*','multline','multline*'].includes(kind)) renderSource = `\\begin{${kind}}${title ? `[${title}]` : ''}${parsed.body}\\end{${kind}}`;
    nodes.push({ id, explicitId: Boolean(attrs.id), title: cleanTitle, level, type, kind, html: renderTexBody(renderSource), due: /^\d{4}-\d{2}-\d{2}$/.test(attrs.due ?? '') ? attrs.due! : null, weight, required: attrs.required !== 'false', options: parsed.options, correct: parsed.correct }); serial++;
  };
  const tokenRe = /\\(chapter|section|subsection|subsubsection)\*?\s*\{([^{}]*)\}|\\begin\{([a-zA-Z*]+)\}/g;
  let m: RegExpExecArray | null; let sectionLevel = 1; let pendingTitle = 'Introducción'; let pendingLevel = 1; let hadHeading = false;
  while ((m = tokenRe.exec(source))) {
    const prior = source.slice(cursor, m.index).trim();
    if (prior) { push(pendingTitle, prior, pendingLevel, 'reading'); pendingHasContent = true; }
    if (m[1]) {
      pendingTitle = m[2].trim() || 'Sección'; pendingLevel = ({ chapter: 1, section: 2, subsection: 3, subsubsection: 4 } as Record<string,number>)[m[1]] ?? 2; headingPath = headingPath.slice(0,pendingLevel-1); headingPath[pendingLevel-1] = pendingTitle; sectionLevel = pendingLevel; hadHeading = true; pendingHasContent = false; cursor = tokenRe.lastIndex; continue;
    }
    const envName = m[3]; const beginEnd = tokenRe.lastIndex;
    if (!BLOCK_ENVS.has(envName)) { cursor = beginEnd; continue; }
    let bodyStart = beginEnd; let attrText = ''; let envTitle = '';
    const openingRest = source.slice(beginEnd);
    const attrMatch = openingRest.match(/^\s*\[([^\]]*)\]/);
    if (attrMatch) { attrText = attrMatch[1]; if (!attrText.includes('=')) envTitle = attrText.trim(); bodyStart += attrMatch[0].length; }
    const titleMatch = source.slice(bodyStart).match(/^\s*\{([^{}]*)\}/);
    if (titleMatch) { envTitle = titleMatch[1]; bodyStart += titleMatch[0].length; }
    const closeAt = findEnvironmentEnd(source, envName, bodyStart); if (closeAt < 0) { cursor = bodyStart; continue; }
    const closing = `\\end{${envName}}`; const rawBody = source.slice(bodyStart, closeAt); const after = closeAt + closing.length;
    const attrs = parseAttrs(attrText); const title = attrs.title ?? envTitle ?? '';
    const defaults: Record<string,string> = { activity: 'Actividad', lesson: pendingTitle, exercise: 'Ejercicio', task: 'Tarea', assignment: 'Tarea', deliverable: 'Entregable', definition: 'Definición', theorem: 'Teorema', lemma: 'Lema', proposition: 'Proposición', corollary: 'Corolario', proof: 'Demostración', example: 'Ejemplo', remark: 'Observación', note: 'Nota', warning: 'Atención', solution: 'Solución', axiom: 'Axioma', conjecture: 'Conjetura', problem: 'Problema', itemize: 'Lista', enumerate: 'Lista numerada', equation: 'Fórmula', 'equation*': 'Fórmula', align: 'Desarrollo matemático', 'align*': 'Desarrollo matemático', gather: 'Fórmulas', 'gather*': 'Fórmulas', multline: 'Fórmula', 'multline*': 'Fórmula', table: 'Tabla', htmlblock: 'Contenido personalizado' };
    push(title || defaults[envName] || pendingTitle, rawBody, sectionLevel, envName, attrs);
    pendingTitle = 'Continuación'; pendingLevel = sectionLevel; pendingHasContent = true;
    cursor = after; tokenRe.lastIndex = after;
  }
  const tail = source.slice(cursor).trim(); if (tail) push(pendingTitle, tail, pendingLevel, 'reading');
  if (!nodes.length) push('Lectura', source, 1, 'reading');
  // Stable IDs must be unique even when two headings share the same title.
  const used = new Map<string,number>(); for (const node of nodes) { const n = used.get(node.id) ?? 0; used.set(node.id,n+1); if (n) node.id = `${node.id}-${n+1}`; }
  return nodes;
}
export function renderMathText(source: string): TeXSection[] {
  return renderCourseTex(source).map((node, i) => {
    const options = node.options.length ? `<ol class=\"tex-options\">${node.options.map(o => `<li><strong>${escapeHtml(o.key)}.</strong> ${renderTexBody(o.label)}</li>`).join('')}</ol>` : '';
    const label = node.type !== 'reading' ? `<p class=\"tex-activity-label\">${node.type === 'short' ? 'Ejercicio' : node.type === 'long' ? 'Actividad de desarrollo' : node.type === 'choice' ? 'Opción múltiple' : 'Entregable'}</p>` : '';
    const content = node.html.trim() ? node.html : '<p class="tex-structure-note">Apartado del índice. El contenido continúa en los subtemas siguientes.</p>';
    return { id: `seccion-${i + 1}-${node.id}`, title: node.title, level: node.level, html: label + content + options };
  });
}
