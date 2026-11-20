# Guía Completa: Parser XML Tipado en TypeScript y Renderizado Dinámico en Astro

Este documento consolida toda la arquitectura desarrollada para parsear archivos XML con anidación arbitraria en TypeScript y renderizarlos de forma parametrizada en Astro.

---

## 1. Conceptos Clave de Tipado en TypeScript

Para modelar árboles XML de profundidad desconocida o etiquetas mixtas se utiliza una **Unión Discriminada** combinada con **Recursividad de Tipos**:

- **`|` (Unión de tipos):** Permite que un nodo sea una cosa *o* la otra (por ejemplo, un nodo de texto o un nodo de elemento).
- **Discriminante (`tipo`):** Una propiedad literal exacta (`"texto"` o `"elemento"`) que permite a TypeScript inferir automáticamente las propiedades disponibles al hacer un `if` o `switch`.
- **Recursividad (`hijos: NodoXML[]`):** El tipo se referencia a sí mismo dentro de su propia definición, permitiendo anidación infinita.
- **`Record<string, string>`:** Tipo nativo que representa un diccionario clave-valor para almacenar atributos XML arbitrarios.

---

## 2. Parser XML Recursivo (`src/utils/xmlParser.ts`)

Si ejecutas este código en el servidor de Astro (Node.js durante *build* o SSR), instala `linkedom` o `@xmldom/xmldom` para contar con `DOMParser`:

```bash
npm install linkedom
```

### Código del parser

```ts
// En navegador puedes omitir esta importación y usar el DOMParser global
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

  return convertirElemento(doc.documentElement);
}

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
```

---

## 3. Configuración Parametrizada de Estilos y Envolturas (`src/config/xmlConfig.ts`)

Este archivo centraliza las reglas de transformación para cada etiqueta XML: cambio de etiqueta HTML, clases fijas o dinámicas según atributos, envolturas múltiples (`div`, `section`, etc.) o delegación a componentes `.astro` completos.

```ts
export interface Envoltura {
  tag: string;
  clases?: string;
}

export interface ReglaEtiqueta {
  tag?: string;
  clases?: string | ((atributos: Record<string, string>) => string);
  envolturas?: Envoltura[];
  componente?: any; // Para componentes .astro dedicados
  ignorarAtributosXML?: boolean; // Evita imprimir atributos XML custom en el HTML
}

export const reglasXML: Record<string, ReglaEtiqueta> = {
  // 1. Etiqueta simple con cambio de tag y clases fijas
  negrita: {
    tag: "strong",
    clases: "font-bold text-slate-900",
  },

  // 2. Etiqueta con clases dinámicas basadas en atributos del XML
  caja: {
    tag: "div",
    ignorarAtributosXML: true,
    clases: (attrs) => {
      const base = "p-4 rounded-lg border my-3";
      const colores: Record<string, string> = {
        rojo: "bg-red-50 border-red-300 text-red-900",
        azul: "bg-blue-50 border-blue-300 text-blue-900",
      };
      return `${base} ${colores[attrs.color] ?? "bg-gray-50 border-gray-300"}`;
    },
  },

  // 3. Etiqueta anidada automáticamente dentro de múltiples contenedores
  theorem: {
    tag: "div",
    clases: "prose text-gray-800",
    envolturas: [
      { tag: "section", clases: "my-6 p-1 bg-indigo-100 rounded-xl" },
      { tag: "div", clases: "p-4 bg-white rounded-lg border-l-4 border-indigo-600" },
    ],
  },
};
```

---

## 4. Componente Recursivo en Astro (`src/components/RenderXML.astro`)

Utiliza `Astro.self` para recorrer el árbol `NodoXML` de forma recursiva y aplicar automáticamente las reglas definidas en `xmlConfig.ts`.

```astro
---
import type { NodoXML } from "../utils/xmlParser";
import { reglasXML } from "../config/xmlConfig";

interface Props {
  nodo: NodoXML;
}

const { nodo } = Astro.props;
---

{
  nodo.tipo === "texto" ? (
    nodo.valor
  ) : (() => {
    const regla = reglasXML[nodo.etiqueta] ?? {};

    // 1. Si tiene un componente Astro dedicado, delega directamente
    if (regla.componente) {
      const Componente = regla.componente;
      return (
        <Componente atributos={nodo.atributos}>
          {nodo.hijos.map((hijo) => <Astro.self nodo={hijo} />)}
        </Componente>
      );
    }

    // 2. Resuelve etiqueta HTML, clases y atributos finales
    const Tag = (regla.tag ?? nodo.etiqueta) as any;
    const clasesCalculadas =
      typeof regla.clases === "function"
        ? regla.clases(nodo.atributos)
        : regla.clases;

    const attrsBase = regla.ignorarAtributosXML ? {} : nodo.atributos;
    const attrsFinales = {
      ...attrsBase,
      ...(clasesCalculadas
        ? { class: [attrsBase.class, clasesCalculadas].filter(Boolean).join(" ") }
        : {}),
    };

    // 3. Construye el elemento interno con sus hijos recursivos
    let contenido = (
      <Tag {...attrsFinales}>
        {nodo.hijos.map((hijo) => <Astro.self nodo={hijo} />)}
      </Tag>
    );

    // 4. Aplica las envolturas configuradas de adentro hacia afuera
    if (regla.envolturas?.length) {
      for (const env of [...regla.envolturas].reverse()) {
        const WrapperTag = env.tag as any;
        contenido = <WrapperTag class={env.clases}>{contenido}</WrapperTag>;
      }
    }

    return contenido;
  })()
}
```

---

## 5. Ejemplo de Uso en una Página de Astro (`src/pages/index.astro`)

```astro
---
import RenderXML from "../components/RenderXML.astro";
import { parsearXML } from "../utils/xmlParser";

const xmlEjemplo = `
<documento version="1.0">
  <caja color="azul">
    Introducción con texto en <negrita>negrita</negrita>.
  </caja>
  <theorem title="Teorema Fundamental">
    Contenido anidado dentro de múltiples contenedores estilizados.
  </theorem>
</documento>
`;

const arbolXML = parsearXML(xmlEjemplo);
---

<main class="max-w-3xl mx-auto p-6">
  <RenderXML nodo={arbolXML} />
</main>
```
