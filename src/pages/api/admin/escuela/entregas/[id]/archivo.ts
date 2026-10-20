import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../../../features/school/adminApiAuth';
export const prerender = false;
const safeName=(name:string)=>name.replace(/[\r\n"\\]/g,'_').slice(0,150)||'entrega';
export const GET: APIRoute = async ({params,cookies,locals}) => {
  if (!(await isSchoolAdminRequest(cookies.get('admin_session')?.value, locals.adminEmail))) return new Response('Se requiere una sesión administrativa.',{status:401});
  const row=await env.DB.prepare('SELECT submission_file_key,submission_file_name,submission_file_type FROM school_lesson_progress WHERE id=? AND submission_file_key IS NOT NULL').bind(params.id??'').first<{submission_file_key:string;submission_file_name:string|null;submission_file_type:string|null}>();
  if(!row) return new Response('Archivo no encontrado.',{status:404});
  if(!env.FILES) return new Response('Almacenamiento privado no configurado.',{status:503});
  const object=await env.FILES.get(row.submission_file_key);
  if(!object) return new Response('Archivo no encontrado.',{status:404});
  const body = await object.arrayBuffer();
  return new Response(body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType
        ?? 'application/octet-stream',
      'Content-Length': String(object.size),
      'Content-Disposition': 'attachment',
      'Cache-Control': 'private, no-store',
    },
  });
};
