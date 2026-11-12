// One client-side LaTeX.js web component shared by every app layout.
const LATEX_BASE = 'https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'PRE', 'CODE', 'LATEX-JS', 'MATH']);
const TEX_PATTERN = /\\begin\s*\{[A-Za-z*]+\}|\\\[|\\\(|\$\$|\$(?!\s)(?:[^$\n]|\\\$)+?\$/;

// Load dynamically so a CDN or module error can be shown to the student instead of
// leaving the preview in an indefinite "loading" state.
let latexLibrary;
const loadLatexLibrary = () => latexLibrary ??= import('https://cdn.jsdelivr.net/npm/latex.js@0.12.6/dist/latex.mjs')
  .then((library) => {
    if (!customElements.get('latex-js')) {
      class SafeLaTeXComponent extends library.LaTeXJSComponent {
        constructor() {
          super();
        }

        async onContentReady() {
          try {
            await super.onContentReady();
            this.dispatchEvent(new CustomEvent('latex-rendered'));
          } catch (error) {
            this.showError(error);
          }
        }

        showError(error) {
          this.shadowRoot.replaceChildren();
          const message = document.createElement('p');
          message.setAttribute('role', 'alert');
          message.textContent = `LaTeX.js no pudo interpretar este fragmento: ${error instanceof Error ? error.message : 'error de sintaxis'}`;
          this.shadowRoot.append(message);
          this.dispatchEvent(new CustomEvent('latex-error', { detail: error }));
        }
      }
      customElements.define('latex-js', SafeLaTeXComponent);
    }
    return { ok: true };
  })
  .catch((error) => ({ ok: false, error }));

// La API de LaTeX.js accepts document fragments; practice input is wrapped in a
// minimal document so environments such as itemize and enumerate parse reliably.
function asDocument(source) {
  if (/\\begin\s*\{document\}/.test(source)) {
    return /\\end\s*\{document\}/.test(source) ? source : `${source}\n\\end{document}`;
  }
  if (/\\documentclass\b/.test(source)) {
    const lines = source.split('\n');
    let boundary = 0;
    while (boundary < lines.length && /^\s*(?:\\(?:documentclass|usepackage|newcommand|renewcommand|providecommand|newtheorem|title|author|date|setlength|setcounter)\b|%|$)/.test(lines[boundary])) boundary++;
    return `${lines.slice(0, boundary).join('\n')}\n\\begin{document}\n${lines.slice(boundary).join('\n')}\n\\end{document}`;
  }
  if (/\\(?:usepackage|newcommand|renewcommand|providecommand|newtheorem|title|author|date|setlength|setcounter)\b/.test(source)) {
    const lines = source.split('\n');
    let boundary = 0;
    while (boundary < lines.length && /^\s*(?:\\(?:usepackage|newcommand|renewcommand|providecommand|newtheorem|title|author|date|setlength|setcounter)\b|%|$)/.test(lines[boundary])) boundary++;
    return `\\documentclass{article}\n${lines.slice(0, boundary).join('\n')}\n\\begin{document}\n${lines.slice(boundary).join('\n')}\n\\end{document}`;
  }
  return `\\documentclass{article}\n\\begin{document}\n${source}\n\\end{document}`;
}

function hasLatex(source) {
  return TEX_PATTERN.test(source);
}

function makeComponent(source, display = false) {
  const component = document.createElement('latex-js');
  component.setAttribute('baseURL', LATEX_BASE);
  component.setAttribute('hyphenate', 'false');
  component.className = display ? 'latex-js-block' : 'latex-js-inline';
  component.style.display = display ? 'block' : 'inline-block';
  component.style.maxWidth = '100%';
  component.style.overflowX = 'auto';
  component.textContent = asDocument(source);
  return component;
}

/** Convert TeX-bearing text nodes within the supplied rendered content. */
async function renderLatexContent(root = document) {
  if (!window.MathJax?.typesetPromise) return { ok: false, pending: true };
  try { await window.MathJax.startup?.promise; window.MathJax.typesetClear?.([root]); await window.MathJax.typesetPromise([root]); return { ok: true }; }
  catch (error) { return { ok: false, error }; }
}

/** Compile a student's whole source in the live editor and resolve after parsing. */
async function renderLatexSource(source, target) {
  if (!target) return { ok: false, error: new Error('No se encontró el contenedor de vista previa.') };
  const ready = await loadLatexLibrary();
  if (!ready.ok) {
    target.textContent = 'No se pudo cargar LaTeX.js. Revisa la conexión a Internet y vuelve a intentarlo.';
    return ready;
  }
  const component = makeComponent(source || 'Escribe código LaTeX para ver la vista previa.', /\\begin\s*\{|\\\[|\$\$/.test(source));
  const result = new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve({ ok: false, error: new Error('La compilación tardó demasiado.') }), 12000);
    component.addEventListener('latex-rendered', () => { window.clearTimeout(timer); resolve({ ok: true }); }, { once: true });
    component.addEventListener('latex-error', (event) => { window.clearTimeout(timer); resolve({ ok: false, error: event.detail }); }, { once: true });
  });
  target.replaceChildren(component);
  return result;
}

window.renderLatexContent = renderLatexContent;
window.renderLatexSource = renderLatexSource;

async function renderAllMathContent() {
  if (window.MathJax?.typesetPromise) { await window.MathJax.startup?.promise; await renderLatexContent(document.body); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void renderAllMathContent(), { once: true });
else void renderAllMathContent();

// Re-run the same parser for content inserted by admin previews after page load.
new MutationObserver((records) => {
  const roots = records.flatMap((record) => [...record.addedNodes]).filter((node) => node instanceof Element && !node.matches('mjx-container') && !node.closest('mjx-container, latex-js'));
  if (roots.length) void Promise.resolve(window.MathJax?.startup?.promise).then(() => window.MathJax?.typesetPromise?.(roots));
}).observe(document.documentElement, { childList: true, subtree: true });
