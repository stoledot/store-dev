import { DOMParser } from "linkedom";

export type NodoXML =
  | { tipo: "texto"; valor: string }
  | {
      tipo: "elemento";
      etiqueta: string;
      atributos: Record<string, string>;
      hijos: NodoXML[];
    };

export function parsearXML(xmlString: string): NodoXML {
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");

  if (doc.querySelector("parsererror")) {
    throw new Error("XML inválido o mal formado");
  }

  return convertirElemento(doc.documentElement as unknown as Element);
}

/**
 * 
 * @param nodo El nodo XML del cual se desea extraer elementos específicos.
 * @param etiquetas Un arreglo de etiquetas que se desean conservar en el árbol resultante.
 * @returns Un nuevo nodo XML que contiene únicamente los elementos con las etiquetas especificadas y sus hijos correspondientes, o null si no hay coincidencias.
 */
export function extractOnly(nodo: NodoXML, etiquetas: string[]): NodoXML | null {
  if (nodo.tipo === "texto") {
    return null;
  }

  if (etiquetas.includes(nodo.etiqueta)) {
    return {
      ...nodo,
      hijos: nodo.hijos
        .map((hijo) => extractOnly(hijo, etiquetas))
        .filter((hijo): hijo is NodoXML => hijo !== null),
    };
  }

  const hijosFiltrados = nodo.hijos
    .map((hijo) => extractOnly(hijo, etiquetas))
    .filter((hijo): hijo is NodoXML => hijo !== null);

  if (hijosFiltrados.length > 0) {
    return {
      ...nodo,
      hijos: hijosFiltrados,
    };
  }

  return null;
}

/*
function extractOnlySections(nodo: NodoXML): NodoXML {
  let nodoNew : NodoXML{tipo: "elemento"; }
  if(nodo.tipo == "elemento")
  {
    if(nodo.etiqueta=="section" || nodo.etiqueta=="sub-sub-section" || nodo.etiqueta=="sub-section")
    {
        
    }
  }
}*/



function convertirElemento(el: Element): NodoXML {
  // 1. Extraer atributos en un diccionario { clave: valor }
  const atributos: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    atributos[attr.name] = attr.value;
  }

  // 2. Recorrer hijos (texto y sub-elementos) recursivamente
  const hijos: NodoXML[] = [];
  for (const nodo of Array.from(el.childNodes)) {
    if (nodo.nodeType === 3) { // Node.TEXT_NODE === 3
      const texto = nodo.textContent?.trim();
      if (texto) {
        hijos.push({ tipo: "texto", valor: texto });
      }
    } else if (nodo.nodeType === 1) { // Node.ELEMENT_NODE === 1
      hijos.push(convertirElemento(nodo as Element));
    }
  }

  return {
    tipo: "elemento",
    etiqueta: el.tagName,
    atributos,
    hijos,
  };
}


/**
 * Convierte un elemento XML en un nodo de tipo NodoXML.
 *
 * @param el - El elemento XML a convertir.
 * @returns Un objeto NodoXML que representa la estructura, atributos y contenido textual del elemento.
 */


export interface OpcionesConversionXML {
  /** Prefijo para clases CSS generadas (por defecto: 'libro') */
  prefijoClase?: string;
  /** Renderizar el atributo data-title como encabezado visual dentro de bloques matemáticos */
  mostrarTitulosBloques?: boolean;
}

const ETIQUETAS_ESTRUCTURALES: Record<string, { tagHtml: string; nivel: string }> = {
  chapter: { tagHtml: "section", nivel: "chapter" },
  section: { tagHtml: "section", nivel: "section" },
  "sub-section": { tagHtml: "section", nivel: "sub-section" },
  "sub-sub-section": { tagHtml: "section", nivel: "sub-sub-section" },
  "sub-sub-sub-section": { tagHtml: "section", nivel: "sub-sub-sub-section" },
};

const ENCABEZADOS_POR_NIVEL: Record<string, string> = {
  chapter: "h1",
  section: "h2",
  "sub-section": "h3",
  "sub-sub-section": "h4",
  "sub-sub-sub-section": "h5",
};

const ETIQUETAS_MATEMATICAS: Record<string, { tagHtml: string; rol: string; etiquetaPorDefecto: string }> = {
  "math-figure": { tagHtml: "figure", rol: "figure", etiquetaPorDefecto: "Figura" },
  "math-definition": { tagHtml: "aside", rol: "definition", etiquetaPorDefecto: "Definición" },
  "math-excersices": { tagHtml: "section", rol: "exercises-group", etiquetaPorDefecto: "Ejercicios" },
  "math-excersice": { tagHtml: "article", rol: "exercise", etiquetaPorDefecto: "Ejercicio" },
  "math-examples": { tagHtml: "section", rol: "examples-group", etiquetaPorDefecto: "Ejemplos" },
  "math-example": { tagHtml: "article", rol: "example", etiquetaPorDefecto: "Ejemplo" },
};

// Etiquetas SVG comunes que deben preservarse intactas con sus atributos
const ETIQUETAS_SVG = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "marker",
  "use",
  "clippath",
  "lineargradient",
  "radialgradient",
  "stop",
  "foreignobject",
]);

function escaparTexto(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escaparAtributo(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function construirAtributosHtml(atributos: Record<string, string>): string {
  const entradas = Object.entries(atributos).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entradas.length === 0) return "";
  return " " + entradas.map(([k, v]) => `${k}="${escaparAtributo(v)}"`).join(" ");
}

/**
 * Convierte un árbol o arreglo de `NodoXML` editorial/matemático en una cadena HTML semántica
 * lista para inyectar en el visor de libro.
 */
export function convertirNodoXMLaHTML(
  entrada: NodoXML | NodoXML[],
  opciones: OpcionesConversionXML = {}
): string {
  const prefijo = opciones.prefijoClase ?? "libro";
  const mostrarTitulosBloques = opciones.mostrarTitulosBloques ?? true;

  function procesarNodo(nodo: NodoXML, dentroDeSvg = false): string {
    if (nodo.tipo === "texto") {
      return escaparTexto(nodo.valor);
    }

    const etiquetaOriginal = nodo.etiqueta;
    const etiquetaLower = etiquetaOriginal.toLowerCase();
    const attrs = nodo.atributos || {};
    const idAttr = attrs.id ? { id: attrs.id } : {};
    const dataTitle = attrs["data-title"]?.trim() || "";
    const dataTitleAttr = dataTitle ? { "data-title": dataTitle } : {};

    // 1. Manejo de <svg> y sus hijos internos (preserva case-sensitivity de SVG como viewBox, clipPath, etc.)
    if (etiquetaLower === "svg" || dentroDeSvg || ETIQUETAS_SVG.has(etiquetaLower)) {
      const esSvgRaiz = etiquetaLower === "svg";
      const attrsSvg: Record<string, string> = { ...attrs };

      if (esSvgRaiz) {
        const claseExistente = attrsSvg.class ? `${attrsSvg.class} ` : "";
        attrsSvg.class = `${claseExistente}${prefijo}-svg`.trim();
      }

      const hijosSvg = (nodo.hijos || []).map((h) => procesarNodo(h, true)).join("");
      return `<${etiquetaOriginal}${construirAtributosHtml(attrsSvg)}>${hijosSvg}</${etiquetaOriginal}>`;
    }

    // 2. Secciones jerárquicas: <chapter>, <section>, <sub-section>, etc.
    if (etiquetaLower in ETIQUETAS_ESTRUCTURALES) {
      const { tagHtml, nivel } = ETIQUETAS_ESTRUCTURALES[etiquetaLower];
      const tagEncabezado = ENCABEZADOS_POR_NIVEL[nivel];
      const claseExistente = attrs.class ? `${attrs.class} ` : "";

      const attrsFinales: Record<string, string> = {
        ...attrs,
        class: `${claseExistente}${prefijo}-bloque ${prefijo}-${nivel}`.trim(),
      };
      Object.assign(attrsFinales, idAttr, dataTitleAttr);

      const encabezadoHtml = dataTitle
        ? `<${tagEncabezado} class="${prefijo}-titulo-${nivel}">${escaparTexto(dataTitle)}</${tagEncabezado}>`
        : "";

      const hijosHtml = (nodo.hijos || []).map((h) => procesarNodo(h, false)).join("");
      return `<${tagHtml}${construirAtributosHtml(attrsFinales)}>${encabezadoHtml}${hijosHtml}</${tagHtml}>`;
    }

    // 3. Bloques matemáticos: <math-figure>, <math-definition>, <math-excersices>, <math-excersice>, <math-examples>, <math-example>
    if (etiquetaLower in ETIQUETAS_MATEMATICAS) {
      const { tagHtml, rol, etiquetaPorDefecto } = ETIQUETAS_MATEMATICAS[etiquetaLower];
      const claseExistente = attrs.class ? `${attrs.class} ` : "";

      const attrsFinales: Record<string, string> = {
        ...attrs,
        class: `${claseExistente}${prefijo}-math ${prefijo}-math-${rol}`.trim(),
      };
      Object.assign(attrsFinales, idAttr, dataTitleAttr);

      const hijosHtml = (nodo.hijos || []).map((h) => procesarNodo(h, false)).join("");

      // Caso especial: <math-figure> usa <figcaption> para el data-title debajo o encima del <svg>
      if (etiquetaLower === "math-figure") {
        const captionHtml =
          mostrarTitulosBloques && dataTitle
            ? `<figcaption class="${prefijo}-math-caption">${escaparTexto(dataTitle)}</figcaption>`
            : "";
        return `<figure${construirAtributosHtml(attrsFinales)}>${hijosHtml}${captionHtml}</figure>`;
      }

      // Encabezado para definiciones, ejemplos y ejercicios
      let headerBloque = "";
      if (mostrarTitulosBloques && (dataTitle || rol === "definition" || rol === "example" || rol === "exercise")) {
        const textoTitulo = dataTitle || etiquetaPorDefecto;
        headerBloque = `<div class="${prefijo}-math-header"><span class="${prefijo}-math-badge">${escaparTexto(textoTitulo)}</span></div>`;
      }

      return `<${tagHtml}${construirAtributosHtml(attrsFinales)}>${headerBloque}<div class="${prefijo}-math-body">${hijosHtml}</div></${tagHtml}>`;
    }

    // 4. Cualquier otra etiqueta HTML/XML estándar (<p>, <span>, <strong>, <div>, MathML, etc.)
    const hijosHtml = (nodo.hijos || []).map((h) => procesarNodo(h, false)).join("");
    return `<${etiquetaOriginal}${construirAtributosHtml(attrs)}>${hijosHtml}</${etiquetaOriginal}>`;
  }

  if (Array.isArray(entrada)) {
    return entrada.map((n) => procesarNodo(n, false)).join("\n");
  }

  return procesarNodo(entrada, false);
}
