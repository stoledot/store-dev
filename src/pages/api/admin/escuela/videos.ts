import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../features/school/adminApiAuth';

export const prerender = false;
const redirectBack=(url:URL,courseId:string,message?:string,ok?:string)=>{const target=new URL('/admin/escuela/videos',url.origin);if(courseId)target.searchParams.set('course',courseId);if(message)target.searchParams.set('error',message.slice(0,600));if(ok)target.searchParams.set('ok',ok);return Response.redirect(target,303);};

export const POST:APIRoute=async({request,url,cookies,locals})=>{
  if(!(await isSchoolAdminRequest(cookies.get('admin_session')?.value,locals.adminEmail)))return new Response('Se requiere una sesión administrativa.',{status:401});
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return new Response('Origen no válido.',{status:403});
  const form=await request.formData(),courseId=String(form.get('course_id')??'').trim(),ref=String(form.get('ref')??'').trim(),action=String(form.get('action')??'');
  try{
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(courseId))throw new Error('Selecciona un curso válido.');
    const course=await env.DB.prepare("SELECT id FROM school_courses WHERE id=? AND source_format='xml'").bind(courseId).first();if(!course)throw new Error('El curso XML seleccionado no existe.');
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(ref))throw new Error('La referencia usa letras, números, guion o guion bajo.');
    if(!env.FILES)throw new Error('El bucket privado FILES no está configurado.');
    if(action==='upload'){
      const file=form.get('file'),title=String(form.get('title')??'').trim().slice(0,160),description=String(form.get('description')??'').trim().slice(0,500);
      if(!(file instanceof File)||!file.size)throw new Error('Selecciona un video.');if(!title)throw new Error('Escribe un título para administrar el video.');if(file.size>100*1024*1024)throw new Error('El video no puede superar 100 MB.');
      const ext=file.name.split('.').pop()?.toLowerCase()??'',types:Record<string,string>={mp4:'video/mp4',webm:'video/webm',ogv:'video/ogg',ogg:'video/ogg'},contentType=types[ext];
      if(!contentType)throw new Error('Formato no permitido. Usa MP4, WebM u Ogg.');if(file.type&&file.type!==contentType)throw new Error('El tipo del video no coincide con su extensión.');
      const fileName=file.name.normalize('NFC').replace(/[\\/\r\n"\x00-\x1f]/g,'_').replace(/\.\.+/g,'.').slice(-120)||`video.${ext}`;
      const objectKey=`school-course-videos/${courseId}/${crypto.randomUUID()}/${fileName}`;
      const previous=await env.DB.prepare('SELECT object_key FROM school_course_video_assets WHERE course_id=? AND asset_ref=?').bind(courseId,ref).first<{object_key:string}>();
      await env.FILES.put(objectKey,await file.arrayBuffer(),{httpMetadata:{contentType,cacheControl:'private, no-store'}});const now=new Date().toISOString();
      try{await env.DB.prepare(`INSERT INTO school_course_video_assets(id,course_id,asset_ref,object_key,file_name,asset_title,description,content_type,byte_size,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(course_id,asset_ref) DO UPDATE SET object_key=excluded.object_key,file_name=excluded.file_name,asset_title=excluded.asset_title,description=excluded.description,content_type=excluded.content_type,byte_size=excluded.byte_size,updated_at=excluded.updated_at`).bind(crypto.randomUUID(),courseId,ref,objectKey,fileName,title,description,contentType,file.size,now,now).run();}
      catch(error){await env.FILES.delete(objectKey).catch(()=>undefined);throw error;}
      if(previous?.object_key)await env.FILES.delete(previous.object_key).catch(()=>undefined);
      return redirectBack(url,courseId,undefined,'subido');
    }
    if(action==='delete'){
      const rows=(await env.DB.prepare("SELECT assessment_json FROM school_lessons WHERE course_id=? AND status<>'archived'").bind(courseId).all<{assessment_json:string|null}>()).results??[];
      const inUse=rows.some((row)=>{try{return JSON.parse(row.assessment_json||'{}')?.blocks?.some((block:unknown)=>typeof block==='object'&&block!==null&&(block as {type?:unknown}).type==='video'&&(block as {ref?:unknown}).ref===ref)??false;}catch{return false;}});
      if(inUse)throw new Error('Una lección activa usa esta referencia. Retira <video> del XML y guarda el curso antes de eliminar el archivo.');
      const asset=await env.DB.prepare('SELECT object_key FROM school_course_video_assets WHERE course_id=? AND asset_ref=?').bind(courseId,ref).first<{object_key:string}>();if(!asset)throw new Error('No se encontró ese video.');
      await env.DB.prepare('DELETE FROM school_course_video_assets WHERE course_id=? AND asset_ref=?').bind(courseId,ref).run();await env.FILES.delete(asset.object_key).catch(()=>undefined);return redirectBack(url,courseId,undefined,'retirado');
    }
    throw new Error('Acción desconocida.');
  }catch(error){return redirectBack(url,courseId,error instanceof Error?error.message:'No se pudo administrar el video.');}
};
