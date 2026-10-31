import { describe, expect, it } from 'vitest';
import { renderCourseTex, renderMathText, renderTexBody } from './render.ts';

describe('renderMathText', () => {
  it('creates section navigation and keeps formula commands for MathJax', () => {
    const result = renderMathText('\\begin{document}\n\\section{Números}\nUn ejemplo es $\\frac{1}{2}$.\n\\subsection{Suma}\n\\[a+b=c\\]\n\\end{document}');
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Números');
    expect(result[0].html).toContain('\\frac{1}{2}');
    expect(result[1].title).toBe('Suma');
    expect(result[1].html).toContain('math-display');
  });

  it('escapes HTML from uploaded source', () => {
    const result = renderMathText('\\section{Seguro}\n<script>alert(1)</script>');
    expect(result[0].html).not.toContain('<script>');
    expect(result[0].html).toContain('&lt;script&gt;');
  });
});

describe('course TeX DSL', () => {
  it('parses sequential activities, weights, due dates and options', () => {
    const nodes = renderCourseTex(String.raw`\chapter{Álgebra}
Introducción al álgebra.
\begin{activity}[id=breve,type=short,title={Respuesta breve},due=2026-11-20,weight=0.5]
Explica el axioma.
\end{activity}
\begin{activity}[id=multi,type=choice,title={Elige},weight=2]
¿Qué operación es conmutativa?
\option{a}{Suma}
\option{b}{Resta}
\end{activity}`);
    expect(nodes.some(n => n.title === 'Álgebra')).toBe(true);
    expect(nodes.find(n => n.title === 'Álgebra')?.explicitId).toBe(false);
    const short = nodes.find(n => n.id === 'breve');
    expect(short?.type).toBe('short'); expect(short?.weight).toBe(0.5); expect(short?.due).toBe('2026-11-20');
    expect(short?.explicitId).toBe(true);
    const choice = nodes.find(n => n.id === 'multi');
    expect(choice?.type).toBe('choice'); expect(choice?.options).toHaveLength(2);
  });
  it('renders colored tables and strips unsafe custom HTML', () => {
    const table = renderTexBody(String.raw`\begin{table}[header=blue]\row{Nombre}{Valor}\row{Uno}{1}\end{table}`);
    expect(table).toContain('background:#1d4ed8'); expect(table).toContain('<th>');
    const html = renderTexBody(String.raw`\begin{htmlblock}<div style="background-color:#eff6ff;padding:12px"><script>alert(1)</script><strong>Hola</strong></div>\end{htmlblock}`);
    expect(html).not.toContain('<script>'); expect(html).toContain('<strong>Hola</strong>');
  });
});
