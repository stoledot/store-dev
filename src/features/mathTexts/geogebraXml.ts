/** Validación estructural mínima del XML de construcción antes de guardarlo en R2. */
export function validateGeoGebraXml(source: string): string | null {
  if (!source.trim()) return 'El archivo XML de GeoGebra está vacío.';
  if (new TextEncoder().encode(source).byteLength > 2_000_000) return 'La construcción XML no puede superar 2 MB.';
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(source)) return 'No se permiten DOCTYPE ni entidades XML externas.';
  if (/&(?!#x[\da-f]+;|#\d+;|amp;|lt;|gt;|quot;|apos;)/i.test(source)) return 'El XML contiene una referencia de entidad incompleta o desconocida.';
  if (/<\s*(?:ggbscript|script)\b/i.test(source)) return 'Esta construcción incluye scripts GeoGebra. Por seguridad, elimina los bloques <ggbscript> antes de subirla.';
  if (/javascript\s*:|\son[a-z]+\s*=/i.test(source)) return 'El XML contiene un atributo de evento o una URL JavaScript no permitidos.';

  const stack: string[] = [];
  let root = '';
  let rootCount = 0;
  let pos = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const fail = (message: string) => message;

  while (pos < source.length) {
    if (source[pos] !== '<') {
      const next = source.indexOf('<', pos);
      const end = next < 0 ? source.length : next;
      if (!stack.length && source.slice(pos, end).trim()) return fail('Hay texto fuera del elemento raíz <geogebra>.');
      pos = end;
      continue;
    }
    if (source.startsWith('<!--', pos)) {
      const end = source.indexOf('-->', pos + 4);
      if (end < 0) return fail('Hay un comentario XML sin cerrar.');
      pos = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', pos)) {
      const end = source.indexOf(']]>', pos + 9);
      if (end < 0) return fail('Hay una sección CDATA sin cerrar.');
      pos = end + 3;
      continue;
    }
    if (source.startsWith('<?', pos)) {
      const end = source.indexOf('?>', pos + 2);
      if (end < 0) return fail('Hay una instrucción XML sin cerrar.');
      pos = end + 2;
      continue;
    }
    if (source.startsWith('<!', pos)) return fail('La declaración XML contiene una instrucción no permitida.');

    let end = pos + 1;
    let quote = '';
    for (; end < source.length; end++) {
      const char = source[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= source.length || quote) return fail('Hay una etiqueta XML sin cerrar o con comillas incompletas.');
    const raw = source.slice(pos + 1, end).trim();
    const closing = raw.startsWith('/');
    const selfClosing = /\/\s*$/.test(raw);
    const body = raw.replace(/^\//, '').replace(/\/\s*$/, '').trim();
    const name = body.match(/^([A-Za-z_][\w:.-]*)/);
    if (!name) return fail('Hay una etiqueta XML con nombre inválido.');
    const tagName = name[1];
    const remainder = body.slice(name[0].length);
    if (closing) {
      if (remainder.trim()) return fail(`La etiqueta de cierre </${tagName}> tiene texto sobrante.`);
      const opened = stack.pop();
      if (opened !== tagName) return fail(`El cierre </${tagName}> no coincide con <${opened ?? 'desconocido'}>.`);
    } else {
      // Requerir atributos con valor entre comillas evita aceptar etiquetas mal formadas.
      let cursor = 0;
      const attribute = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/y;
      while (cursor < remainder.length) {
        if (!remainder.slice(cursor).trim()) { cursor = remainder.length; break; }
        attribute.lastIndex = cursor;
        const match = attribute.exec(remainder);
        if (!match) return fail(`Los atributos de <${tagName}> no tienen el formato XML name="valor".`);
        cursor = attribute.lastIndex;
      }
      if (!stack.length) {
        root = tagName;
        rootCount++;
        if (rootCount > 1) return fail('El archivo tiene más de un elemento raíz.');
      }
      if (!selfClosing) stack.push(tagName);
    }
    pos = end + 1;
  }
  if (stack.length) return fail(`Falta cerrar <${stack.at(-1)}>.`);
  if (root !== 'geogebra') return fail('El elemento raíz debe ser <geogebra>, como en un XML de construcción exportado por GeoGebra.');
  return null;
}
