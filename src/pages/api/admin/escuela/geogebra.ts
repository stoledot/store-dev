import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../features/school/adminApiAuth';
import { validateGeoGebraXml } from '../../../../features/mathTexts/geogebraXml';

export const prerender = false;
const redirectBack = (url: URL, courseId: string, message?: string, ok?: string) => {
  const target = new URL('/admin/escuela/geogebra', url.origin);
  target.searchParams.set('course', courseId);
  if (message) target.searchParams.set('error', message.slice(0, 600));
  if (ok) target.searchParams.set('ok', ok);
  return Response.redirect(target, 303);
};

export const POST: APIRoute = async ({ request, url, cookies, locals }) => {
  if (!(await isSchoolAdminRequest(cookies.get('admin_session')?.value, locals.adminEmail))) return new Response('Se requiere una sesión administrativa.', { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return new Response('Origen no válido.', { status: 403 });
  const form = await request.formData();
  const courseId = String(form.get('course_id') ?? '').trim();
  const ref = String(form.get('ref') ?? '').trim();
  const action = String(form.get('action') ?? '');
  try {
    if (!courseId || !/^[A-Za-z0-9_-]{1,100}$/.test(courseId)) throw new Error('Selecciona un curso válido.');
    const course = await env.DB.prepare("SELECT id FROM school_courses WHERE id=? AND source_format='xml'").bind(courseId).first();
    if (!course) throw new Error('El curso XML seleccionado no existe.');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(ref)) throw new Error('La referencia debe usar letras, números, guion o guion bajo.');
    if (!env.FILES) throw new Error('El bucket privado FILES no está configurado.');

    if (action === 'upload') {
      const file = form.get('file');
      if (!(file instanceof File) || !file.size) throw new Error('Selecciona un archivo XML de GeoGebra.');
      if (!file.name.toLowerCase().endsWith('.xml')) throw new Error('El archivo de construcción debe tener extensión .xml.');
      if (file.size > 2_000_000) throw new Error('La construcción XML no puede superar 2 MB.');
      const source = await file.text();
      const issue = validateGeoGebraXml(source);
      if (issue) throw new Error(issue);
      const appName = String(form.get('app_name') ?? '');
      if (appName !== 'graphing' && appName !== '3d') throw new Error('Selecciona la vista GeoGebra 2D o 3D.');
      const fileName = file.name.normalize('NFC').replace(/[\\/\r\n"\x00-\x1f]/g, '_').replace(/\.\.+/g, '.').slice(-120) || 'construccion.xml';
      const objectKey = `school-geogebra/${courseId}/${crypto.randomUUID()}/${fileName}`;
      const previous = await env.DB.prepare('SELECT object_key FROM school_course_geogebra_assets WHERE course_id=? AND asset_ref=?').bind(courseId, ref).first<{object_key:string}>();
      // Guardar el XML validado en R2 privado y registrar en D1 qué app debe abrirlo (2D o 3D).
      await env.FILES.put(objectKey, source, { httpMetadata: { contentType: 'application/xml; charset=utf-8' } });
      const now = new Date().toISOString();
      try {
        await env.DB.prepare(`INSERT INTO school_course_geogebra_assets(id,course_id,asset_ref,object_key,file_name,app_name,byte_size,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(course_id,asset_ref) DO UPDATE SET object_key=excluded.object_key,file_name=excluded.file_name,app_name=excluded.app_name,byte_size=excluded.byte_size,updated_at=excluded.updated_at`)
          .bind(crypto.randomUUID(), courseId, ref, objectKey, fileName, appName, new TextEncoder().encode(source).byteLength, now, now).run();
      } catch (cause) { await env.FILES.delete(objectKey).catch(() => undefined); throw cause; }
      if (previous?.object_key && previous.object_key !== objectKey) await env.FILES.delete(previous.object_key).catch(() => undefined);
      return redirectBack(url, courseId, undefined, 'subido');
    }

    if (action === 'delete') {
      // Conservar las referencias usadas por unidades activas para evitar que el alumno pierda una gráfica.
      const lessons = (await env.DB.prepare("SELECT assessment_json FROM school_lessons WHERE course_id=? AND status<>'archived'").bind(courseId).all<{assessment_json:string|null}>()).results ?? [];
      const inUse = lessons.some((row) => {
        try { const blocks = JSON.parse(row.assessment_json || '{}')?.blocks; return Array.isArray(blocks) && blocks.some((block: unknown) => typeof block === 'object' && block !== null && (block as {type?:unknown}).type === 'geogebragraphics' && (block as {ref?:unknown}).ref === ref); }
        catch { return false; }
      });
      if (inUse) throw new Error('Una lección activa aún usa esta referencia. Elimina <geogebragraphics> del XML y guarda el curso antes de retirar la construcción.');
      const asset = await env.DB.prepare('SELECT object_key FROM school_course_geogebra_assets WHERE course_id=? AND asset_ref=?').bind(courseId, ref).first<{object_key:string}>();
      if (!asset) throw new Error('No se encontró esa construcción en el curso.');
      await env.DB.prepare('DELETE FROM school_course_geogebra_assets WHERE course_id=? AND asset_ref=?').bind(courseId, ref).run();
      await env.FILES.delete(asset.object_key).catch(() => undefined);
      return redirectBack(url, courseId, undefined, 'retirado');
    }
    throw new Error('Acción desconocida.');
  } catch (cause) {
    return redirectBack(url, courseId || '', cause instanceof Error ? cause.message : 'No se pudo administrar la construcción.');
  }
};
