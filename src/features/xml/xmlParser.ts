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