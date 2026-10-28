/** Small, deliberately safe renderer for the structural LaTeX subset used in learning notes. */
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const stripCommand = (s: string) => s.replace(/\\(?:documentclass(?:\[[^\]]*\])?\{[^}]*\}|usepackage(?:\[[^\]]*\])?\{[^}]*\}|begin\{document\}|end\{document\}|maketitle|tableofcontents|newpage|clearpage)/g, '');
export interface TeXSection { id: string; title: string; level: number; html: string }
export function renderMathText(source: string): TeXSection[] {
  const cleaned = stripCommand(source).replace(/%[^\n]*/g, '').replace(/\\(?:title|author|date)\s*\{([^}]*)\}/g, '$1');
  const re = /\\(chapter|section|subsection|subsubsection)\*?\s*\{([^}]*)\}/g;
  const matches = [...cleaned.matchAll(re)];
  const sections: TeXSection[] = [];
  const levelMap: Record<string, number> = { chapter: 1, section: 2, subsection: 3, subsubsection: 4 };
  if (!matches.length) {
    matches.push(Object.assign(
      ['', 'section', 'Lectura'],
      { index: 0, input: cleaned }
    ) as RegExpExecArray);
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]; const start = m.index ?? 0;
    const bodyStart = m[0] ? start + m[0].length : 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? cleaned.length) : cleaned.length;
    let body = cleaned.slice(bodyStart, end).trim();
    body = escapeHtml(body);
    const math: string[] = [];
    const holdMath = (raw: string) => {
      const marker = `MATHPLACEHOLDER${math.length}TOKEN`;
      math.push(raw);
      return marker;
    };
    body = body.replace(/\\\[([\s\S]*?)\\\]/g, (_m, x) => holdMath(`<div class="math-display">\\[${x}\\]</div>`))
      .replace(/\\\(([\s\S]*?)\\\)/g, (_m, x) => holdMath(`<span>\\(${x}\\)</span>`))
      .replace(/\$\$([\s\S]*?)\$\$/g, (_m, x) => holdMath(`<div class="math-display">\\[${x}\\]</div>`))
      .replace(/\$([^$\n]+)\$/g, (_m, x) => holdMath(`<span>\\(${x}\\)</span>`));
    body = body.replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>')
      .replace(/\\textit\{([^{}]*)\}/g, '<em>$1</em>')
      .replace(/\\emph\{([^{}]*)\}/g, '<em>$1</em>')
      .replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g, (_all, kind: string, inner: string) => {
        const items = inner.split(/\\item\s*/).filter((x: string) => x.trim()).map((x: string) => `<li>${x.trim()}</li>`).join('');
        return `<${kind === 'itemize' ? 'ul' : 'ol'}>${items}</${kind === 'itemize' ? 'ul' : 'ol'}>`;
      })
      .replace(/\\item\s*/g, '• ')
      .replace(/\\(?:par|newline|\\)\s*/g, '\n\n')
      .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, '')
      .replace(/[{}]/g, '')
      .split(/\n\s*\n/).map(p => p.trim() ? (p.startsWith('<ul>') || p.startsWith('<ol>') || p.startsWith('<div') ? p : `<p>${p.replace(/\n/g, ' ')}</p>`) : '').join('\n');
    body = body.replace(/<p>(MATHPLACEHOLDER(\d+)TOKEN)<\/p>/g, (_m, _marker, i) => math[Number(i)]?.startsWith('<div') ? math[Number(i)] : `<p>${math[Number(i)] ?? ''}</p>`);
    body = body.replace(/MATHPLACEHOLDER(\d+)TOKEN/g, (_m, i) => math[Number(i)] ?? '');
    const title = m[2] || 'Lectura';
    sections.push({ id: `seccion-${i + 1}`, title, level: levelMap[m[1]] ?? 2, html: body });
  }
  return sections;
}
