import { describe, expect, it } from 'vitest';
import { renderMathText } from './render.ts';

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
