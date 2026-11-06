import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../../../features/school/adminApiAuth';
export const prerender=false;
export const GET:APIRoute=async({params,url,cookies,locals})=>{
  if(!(await isSchoolAdminRequest(cookies.get('admin_session')?.value,locals.adminEmail)))return new Response('No autorizado',{status:401});
  const client=String(params.clientNumber??'');if(!/^\d{10}$/.test(client))return new Response('Número de cliente inválido',{status:400});const type=url.searchParams.get('tipo');if(type!=='applicant'&&type!=='guardian')return new Response('Tipo de documento inválido',{status:400});
  const column=type==='applicant'?'applicant_id_document_key':'guardian_id_document_key';const row=await env.DB.prepare(`SELECT ${column} AS object_key FROM school_enrollment_applications WHERE client_number=?`).bind(client).first<{object_key:string|null}>();if(!row?.object_key||!env.FILES)return new Response('Documento no disponible',{status:404});const object=await env.FILES.get(row.object_key);if(!object)return new Response('Documento no disponible',{status:404});
  const headers=new Headers({'content-type':object.httpMetadata?.contentType??'application/octet-stream','content-disposition':`attachment; filename="identificacion-${type}.bin"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'});

  
  return new Response(object.body as any,{headers});
};
