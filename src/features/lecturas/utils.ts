
import { type NodoXML } from "../xml/xmlParser";

export type MetaXml = {
  title?: string;
  author?: string;
  date?: string;
  description?: string;
  summary?: string;
  keywords?: string;
  language?: string;
};

/**
 * Encuentra el primer nodo <meta>, sin importar su profundidad.
 * Detiene la búsqueda al encontrarlo.
 */
export function extractMeta(nodo: NodoXML): NodoXML | null {
  if (nodo.tipo === "texto") return null;

  if (nodo.etiqueta.toLowerCase() === "meta") {
    return nodo;
  }

  for (const hijo of nodo.hijos) {
    const encontrado = extractMeta(hijo);

    if (encontrado) {
      return encontrado;
    }
  }

  return null;
}

/**
 * Extrae los datos exclusivamente del primer <meta> encontrado.
 */
export function extractMetaXml(nodo: NodoXML): MetaXml {
  const metaNodo = extractMeta(nodo);

  const meta: MetaXml = {};

  if (!metaNodo) return meta;

  const campos: (keyof MetaXml)[] = [
    "title",
    "author",
    "date",
    "description",
    "summary",
    "keywords",
    "language",
  ];

  function asignar(campo: string, valor: string): void {
    const clave = campo.toLowerCase() as keyof MetaXml;

    if (campos.includes(clave)) {
      const contenido = valor.trim();

      if (contenido) {
        meta[clave] = contenido;
      }
    }
  }

  function obtenerTexto(nodo: NodoXML): string {
    if (nodo.tipo === "texto") {
      return nodo.valor;
    }

    return nodo.hijos.map(obtenerTexto).join("").trim();
  }

  // Extraer datos del primer <meta>.
  if (metaNodo.tipo === "elemento") {
    for (const [clave, valor] of Object.entries(metaNodo.atributos ?? {})) {
      asignar(clave, valor);
    }

    for (const hijo of metaNodo.hijos) {
      if (hijo.tipo === "elemento") {
        asignar(hijo.etiqueta, obtenerTexto(hijo));
      }
    }
  }

  return meta;
}
