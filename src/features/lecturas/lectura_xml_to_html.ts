/**
 * Traductor y validador de XML de lecturas a HTML.
 * El contenido de títulos, metadatos y cuerpos puede incluir LaTeX
 * (se deja intacto para compilarlo después con latex.js).
 */
import { DOMParser } from "@xmldom/xmldom";
import type { Document } from "@xmldom/xmldom";
import {Node as XmlNode, XMLSerializer } from "@xmldom/xmldom";



export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const SECTION_TAGS = ["section", "subsection", "subsubsection"] as const;

const BLOCK_LABELS: Record<string, string> = {
  theorem: "Teorema",
  definition: "Definición",
  example: "Ejemplo",
  remark: "Observación",
  corollary: "Corolario",
  lemma: "Lema",
  proposition: "Proposición",
  conjecture: "Conjetura",
  axiom: "Axioma",
  exercise: "Ejercicio",
  solution: "Solución",
};

const META_TAGS = ["title", "author", "date", "summary"];
function parseXml(xml: string): { doc?: Document; error?: string } {
  let parseErrorMessage = "";

  const parser = new DOMParser({
    onError: (level, msg) => {
      if (level === "error" || level === "fatalError") {
        parseErrorMessage = msg;
      }
    },
  });

  const doc = parser.parseFromString(xml, "application/xml");

  if (parseErrorMessage) {
    return { error: `XML mal formado: ${parseErrorMessage.trim()}` };
  }

  return { doc };
}
function children(el: Element): Element[] {
  return Array.from(el.children);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/*
function serialize(n: Node): string {
  return new XMLSerializer().serializeToString(n).replace(/ xmlns="[^"]*"/g, "");
}*/



/** Valida la estructura del XML de una lectura. */
export function validateLecturaXml(xml: string): ValidationResult {
  
  const errors: string[] = [];
  const { doc, error } = parseXml(xml);

  if(doc === null ) return { valid: false, errors: [error!] };

  if (!doc) return { valid: false, errors: [error!] };

  /*
  
  const root = doc !== null ? doc.documentElement : null;
  if (!root || root.tagName !== "lectura") {
    return { valid: false, errors: [`La raíz debe ser <lectura>, no <${root?.tagName ?? "null"}>`] };
  }

  const ids = new Set<string>();

  const checkId = (el: Element, path: string) => {
    const id = el.getAttribute("id");
    if (!id) errors.push(`${path}: falta el atributo "id"`);
    else if (ids.has(id)) errors.push(`${path}: id duplicado "${id}"`);
    else ids.add(id);
  };

  const checkBlock = (el: Element, path: string) => {
    checkId(el, path);
    if (!el.getAttribute("title")) errors.push(`${path}: falta el atributo "title"`);
    if (el.tagName === "theorem") {
      const names = children(el).map((c) => c.tagName);
      if (!names.includes("statement")) errors.push(`${path}: falta <statement>`);
      if (!names.includes("proof")) errors.push(`${path}: falta <proof>`);
    }
  };

  const checkContainer = (el: Element, level: number, path: string) => {
    checkId(el, path);
    if (!el.getAttribute("title")) errors.push(`${path}: falta el atributo "title"`);
    const expectedChild = SECTION_TAGS[level + 1];
    for (const c of children(el)) {
      const p = `${path}/${c.tagName}[${c.getAttribute("id") ?? "?"}]`;
      if (c.tagName === expectedChild) checkContainer(c, level + 1, p);
      else if (c.tagName in BLOCK_LABELS) checkBlock(c, p);
      else if (c.tagName === "geogebragraphics") {
        if (!c.getAttribute("ref")) errors.push(`${p}: falta el atributo "ref"`);
      }
    }
  };

  const metas = children(root).filter((c) => c.tagName === "meta");
  if (metas.length !== 1) errors.push("Debe existir exactamente un <meta>");
  else {
    const present = children(metas[0]).map((c) => c.tagName);
    for (const t of META_TAGS) {
      if (!present.includes(t)) errors.push(`<meta>: falta <${t}>`);
    }
  }

  const sections = children(root).filter((c) => c.tagName === "section");
  if (sections.length === 0) errors.push("Debe existir al menos un <section>");
  for (const s of sections) checkContainer(s, 0, `section[${s.getAttribute("id") ?? "?"}]`);

  for (const c of children(root)) {
    if (c.tagName !== "meta" && c.tagName !== "section") {
      errors.push(`Elemento no permitido en <lectura>: <${c.tagName}>`);
    }
  }
  */
 
  return { valid: errors.length === 0, errors };
}

/*
function innerXml(el: Element): string {
  return Array.from(el.childNodes)
    .map((n) => (n.nodeType === 8 ? "" : serialize(n)))
    .join("")
    .trim();
}

/*
function renderNode(el: Element, level: number): string {
  const id = escapeHtml(el.getAttribute("id") ?? "");
  const title = el.getAttribute("title") ?? "";
  const tag = el.tagName;

  if ((SECTION_TAGS as readonly string[]).includes(tag)) {
    const h = Math.min(level + 2, 6);
    const next = SECTION_TAGS[level + 1];
    const body = Array.from(el.childNodes)
      .map((n) => {
        if (n.nodeType === 1) {
          const c = n as Element;
          if (c.tagName === next || c.tagName in BLOCK_LABELS || c.tagName === "geogebragraphics") {
            return renderNode(c, level + 1);
          }
          return serialize(c);
        }
        if (n.nodeType === 3 || n.nodeType === 4) return n.textContent ?? "";
        return "";
      })
      .join("");
    const wrapper = tag === "section" ? "section" : "div";
    return `<${wrapper} class="${tag}" id="${id}"><h${h} class="title">${title}</h${h}>${body}</${wrapper}>`;
  }

  if (tag === "geogebragraphics") {
    const ref = escapeHtml(el.getAttribute("ref") ?? "");
    return `<figure class="geogebra" data-ref="${ref}"><figcaption>${title}</figcaption><div class="geogebra-container" data-ref="${ref}"></div></figure>`;
  }

  if (tag in BLOCK_LABELS) {
    const label = BLOCK_LABELS[tag];
    let body: string;
    if (tag === "theorem") {
      const st = el.getElementsByTagName("statement")[0];
      const pr = el.getElementsByTagName("proof")[0];
      body =
        `<div class="statement">${st ? innerXml(st) : ""}</div>` +
        `<div class="proof"><em>Demostración.</em> ${pr ? innerXml(pr) : ""}</div>`;
    } else {
      body = `<div class="content">${innerXml(el)}</div>`;
    }
    return `<div class="env ${tag}" id="${id}"><div class="env-title"><strong>${label}</strong>${title ? ` (${title})` : ""}</div>${body}</div>`;
  }

  return "";
}
*/
/** Traduce el XML de una lectura a HTML. Lanza error si es inválido. */
export function lecturaXmlToHtml(xml: string): string {
  const { doc, error } = parseXml(xml);
  
  if (error || !doc || !doc.documentElement) {
    throw new Error(error ?? "XML mal formado o vacío");
  }

  // XMLSerializer acepta el Element de @xmldom/xmldom sin errores de tipo
  return new XMLSerializer().serializeToString(doc.documentElement);
}
