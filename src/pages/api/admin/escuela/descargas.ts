import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../features/school/adminApiAuth';

export const prerender = false;
const redirectBack = (url: URL, courseId: string, message?: string, ok?: string) => {
  const target = new URL('/admin/escuela/descargas', url.origin);
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
    if (!course) throw new Error('El curso XML seleccionado ya no existe.');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(ref)) throw new Error('La referencia debe usar letras, números, guion o guion bajo.');
    if (!env.FILES) throw new Error('El bucket privado FILES no está configurado.');

    if (action === 'upload') {
      const file = form.get('file');
      if (!(file instanceof File) || !file.size) throw new Error('Elige un archivo para cargar.');
      if (file.size > 25 * 1024 * 1024) throw new Error('El archivo no puede superar 25 MB.');
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const contentTypes: Record<string, string> = {
        pdf:'application/pdf',txt:'text/plain',zip:'application/zip',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',
        docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
      const contentType = contentTypes[extension];
      if (!contentType) throw new Error('Formato no permitido. Usa PDF, TXT, ZIP, PNG, JPG, WEBP, DOCX, XLSX o PPTX.');
      const fileName = file.name.normalize('NFC').replace(/[\\/\r\n"\x00-\x1f]/g, '_').replace(/\.\.+/g, '.').slice(-120) || 'archivo';
      const objectKey = `school-course-downloads/${courseId}/${crypto.randomUUID()}/${fileName}`;
      const previous = await env.DB.prepare('SELECT object_key FROM school_course_download_assets WHERE course_id=? AND asset_ref=?').bind(courseId, ref).first<{object_key:string}>();
      // El objeto privado se sube antes de apuntarlo desde D1; si la fila falla, se limpia el objeto nuevo.
      await env.FILES.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType } });
      const now = new Date().toISOString();
      try {
        await env.DB.prepare(`INSERT INTO school_course_download_assets(id,course_id,asset_ref,object_key,file_name,content_type,byte_size,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(course_id,asset_ref) DO UPDATE SET object_key=excluded.object_key,file_name=excluded.file_name,content_type=excluded.content_type,byte_size=excluded.byte_size,updated_at=excluded.updated_at`)
          .bind(crypto.randomUUID(), courseId, ref, objectKey, fileName, contentType, file.size, now, now).run();
      } catch (cause) { await env.FILES.delete(objectKey).catch(() => undefined); throw cause; }
      if (previous?.object_key && previous.object_key !== objectKey) await env.FILES.delete(previous.object_key).catch(() => undefined);
      return redirectBack(url, courseId, undefined, 'subido');
    }

    if (action === 'delete') {
      // No retirar un archivo mientras una lección publicada aún depende de su ref.
      const lessons = (await env.DB.prepare("SELECT assessment_json FROM school_lessons WHERE course_id=? AND status<>'archived'").bind(courseId).all<{assessment_json:string|null}>()).results ?? [];
      const stillUsed = lessons.some((row) => {
        try { const blocks = JSON.parse(row.assessment_json || '{}')?.blocks; return Array.isArray(blocks) && blocks.some((block: any) => block?.type === 'download' && block.ref === ref); }
        catch { return false; }
      });
      if (stillUsed) throw new Error('Una lección activa aún usa esta referencia. Quita el bloque <download> del XML y guarda el curso antes de retirar el archivo.');
      const asset = await env.DB.prepare('SELECT object_key FROM school_course_download_assets WHERE course_id=? AND asset_ref=?').bind(courseId, ref).first<{object_key:string}>();
      if (!asset) throw new Error('No se encontró esa referencia en el curso.');
      await env.DB.prepare('DELETE FROM school_course_download_assets WHERE course_id=? AND asset_ref=?').bind(courseId, ref).run();
      await env.FILES.delete(asset.object_key).catch(() => undefined);
      return redirectBack(url, courseId, undefined, 'retirado');
    }
    throw new Error('Acción desconocida.');
  } catch (cause) {
    return redirectBack(url, courseId || '', cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
  }
};
