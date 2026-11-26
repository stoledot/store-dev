import type {NodoXML} from '../xml/xmlParser';


export type TemaLectura = {
    idhtml: string;
    titulo: string;
    tipo: string;
    nivel: number;
    isSelected: boolean;
    isCompleted?: boolean;
}


export type PlanLectura = {
    id: number;
    name: string;
    description: string;
    porcentaje: number;
    createdAt: Date;
    updatedAt: Date;
    temas: TemaLectura[];
}

const TEMAS_CLASSES = ['tema'];

const MAP_TAGS_TITULOS: Record<string, string> = {
    'tema': 'Tema',
    'chapter': 'Capítulo',
    'section': 'Sección',
    'sub-section': 'Subsección',
    'sub-sub-section': 'Subsubsección',
    '*': 'Tema'
};

export function NodoXMLToTemasLectura(
  nodo: NodoXML,
  nivel: number = 0,
  titulosPadre: string[] = []
): TemaLectura[] {
  let temas: TemaLectura[] = [];

  if (!nodo || nodo.tipo !== 'elemento') return temas;

  let titulosHijos = [...titulosPadre];

  // 1. Extraer título de CUALQUIER nodo (sea tema o no) para heredarlo a los hijos
  const tituloNodo = (
    nodo.atributos?.['data-title'] ??
    MAP_TAGS_TITULOS[nodo.etiqueta] ??
    ''
  ).trim();

  if (tituloNodo) {
    titulosHijos.push(tituloNodo);
  }

  // 2. Verificar si este nodo en específico debe guardarse como TemaLectura
  const clasesNodo = nodo.atributos?.class ? nodo.atributos.class.split(/\s+/) : [];
  const esTema = clasesNodo.some((clase) => TEMAS_CLASSES.includes(clase));

  if (nodo.atributos?.id && esTema) {
    // Si el tema no tenía data-title ni etiqueta mapeada, usamos el fallback '*'
    const rutaTitulos = tituloNodo
      ? titulosHijos
      : [...titulosHijos, MAP_TAGS_TITULOS['*']].filter(Boolean);

    const tipo = MAP_TAGS_TITULOS[nodo.etiqueta] ?? MAP_TAGS_TITULOS['*'];

    temas.push({
      idhtml: nodo.atributos.id,
      titulo: rutaTitulos.join(' -> '),
      tipo: tipo,
      nivel: nivel,
      isSelected: false,
    });
  }

  // 3. Pasar la ruta acumulada (titulosHijos) a todos los descendientes
  if (nodo.hijos && nodo.hijos.length > 0) {
    for (const hijo of nodo.hijos) {
      temas = temas.concat(NodoXMLToTemasLectura(hijo, nivel + 1, titulosHijos));
    }
  }

  return temas;
}
export function getMapTemasById(
  temas: TemaLectura[]
): Record<string, TemaLectura> {
  const mapa = Object.create(null) as Record<string, TemaLectura>;
  for (const tema of temas) {
    const id = tema.idhtml.trim();
    if (id) mapa[id] = tema;
  }
  return mapa;
}

export function filtrarNodoPorTemas(
  nodo: NodoXML,
  temas: TemaLectura[]
): NodoXML {
  const mapaTemas = getMapTemasById(temas);

  function filtrar(
    actual: NodoXML,
    dentroDeTemaSeleccionado: boolean
  ): NodoXML | null {
    // Texto solo se conserva dentro de un tema seleccionado.
    if (actual.tipo !== 'elemento') {
      return dentroDeTemaSeleccionado ? actual : null;
    }

    const id = actual.atributos.id?.trim();
    const tema = id ? mapaTemas[id] : undefined;

    // Si este nodo corresponde a un tema, su estado determina
    // si se conserva su contenido. Si no, hereda el estado del ancestro.
    const conservarContenido = tema ? tema.isSelected : dentroDeTemaSeleccionado;

    const hijos = actual.hijos
      .map((hijo) => filtrar(hijo, conservarContenido))
      .filter((hijo): hijo is NodoXML => hijo !== null);

    // Conserva el nodo si pertenece a un tema seleccionado
    // o si es un ancestro necesario de uno.
    if (conservarContenido || hijos.length > 0) {
      return { ...actual, hijos };
    }

    return null;
  }

  const resultado = filtrar(nodo, false);

  if (resultado) {
    return resultado;
  }

  // Si no hay temas coincidentes, devuelve una estructura vacía válida según el tipo del nodo raíz.
  return nodo.tipo === 'elemento'
    ? { ...nodo, hijos: [] }
    : { tipo: 'texto', valor: '' };
}
