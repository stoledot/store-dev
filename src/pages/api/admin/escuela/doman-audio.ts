import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isSchoolAdminRequest } from '../../../../features/school/adminApiAuth';
import { privateDomanAudioResponse } from '../../../../features/school/domanR2';
import { deleteGithubAudio,domanGithubConfig,githubContentRequest,saveDomanGithubConfig,verifyDomanGithubConfig } from '../../../../features/school/domanGithub';
import { setSecret } from '../../../../features/secrets/store';

export const prerender=false;
const back=(url:URL,ok?:string,error?:string)=>{const target=new URL('/admin/escuela/audio-doman',url.origin);if(ok)target.searchParams.set('ok',ok);if(error)target.searchParams.set('error',error.slice(0,500));return Response.redirect(target,303);};
const clean=(v:FormDataEntryValue|null,max=100)=>String(v??'').trim().slice(0,max);
const validId=(v:string)=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(v);

/** Admin preview: audio files stay private in R2, with a temporary GitHub fallback for old rows. */
export const GET:APIRoute=async({url,cookies,locals})=>{
 if(!(await isSchoolAdminRequest(cookies.get('admin_session')?.value,locals.adminEmail)))return new Response('Se requiere sesión administrativa.',{status:401});
 const id=url.searchParams.get('id')??'';const row=await env.DB.prepare("SELECT object_key,github_path,mime_type FROM school_doman_audio_assets WHERE id=? AND status='active'").bind(id).first<{object_key:string|null;github_path:string;mime_type:string}>();if(!row)return new Response('Audio no encontrado.',{status:404});
 try{if(row.object_key){if(!env.FILES)return new Response('El bucket R2 FILES no está configurado.',{status:503});return privateDomanAudioResponse(env.FILES,row.object_key,row.mime_type);}const legacy=await githubContentRequest(row.github_path);if(!legacy.ok)return new Response('No se pudo leer el audio legado de GitHub.',{status:502});return new Response(legacy.body,{headers:{'content-type':row.mime_type,'cache-control':'private, no-store','x-content-type-options':'nosniff','accept-ranges':'none'}});}catch{return new Response('No se pudo leer el audio.',{status:502});}
};

export const POST:APIRoute=async({request,url,cookies,locals})=>{
 if(!(await isSchoolAdminRequest(cookies.get('admin_session')?.value,locals.adminEmail)))return new Response('Se requiere sesión administrativa.',{status:401});
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return new Response('Origen no válido.',{status:403});
 try{
  const requestLength=Number(request.headers.get('content-length')||0);if(requestLength>21_000_000)throw new Error('La solicitud supera el límite de 20 MB por audio.');
  const form=await request.formData(),action=clean(form.get('action'),30),now=new Date().toISOString();
  if(action==='config'){
   // GitHub credentials remain available only to import the audio library created by the old version.
   const owner=clean(form.get('owner'),100),repo=clean(form.get('repo'),100),branch=clean(form.get('branch'),100)||'main',basePath=clean(form.get('base_path'),200).replace(/^\/+|\/+$/g,'')||'school-audio/doman',token=clean(form.get('token'),500);
   if(!/^[A-Za-z0-9-]+$/.test(owner)||!/^[A-Za-z0-9_.-]+$/.test(repo)||! /^[A-Za-z0-9._/-]+$/.test(branch)||basePath.split('/').some(x=>!validId(x)))throw new Error('Revisa owner, repositorio, rama y ruta base.');
   if(token){await verifyDomanGithubConfig({owner,repo,branch,basePath},token);await saveDomanGithubConfig({owner,repo,branch,basePath},token);}
   else {const previous=await domanGithubConfig();if(owner!==previous.owner||repo!==previous.repo)throw new Error('Para cambiar de repositorio, vuelve a ingresar el token de GitHub.');await saveDomanGithubConfig({owner,repo,branch,basePath},null);}
   return back(url,'github-legado-conectado');
  }
  if(action==='disconnect-github'){
   const pending=await env.DB.prepare('SELECT COUNT(*) AS n FROM school_doman_audio_assets WHERE object_key IS NULL').first<{n:number}>();if((pending?.n??0)>0)throw new Error('Transfiere todos los audios pendientes antes de retirar la credencial de GitHub.');
   await setSecret(env.DB,'github_audio_token',null);await saveDomanGithubConfig({owner:'',repo:'',branch:'main',basePath:'school-audio/doman'},null);return back(url,'github-desconectado');
  }
  if(action==='taxonomy-add'){
   const kind=clean(form.get('kind'),20),value=clean(form.get('value'),80);if(!['category','type','level'].includes(kind)||! /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value))throw new Error('Tipo o valor de atributo no válido.');
   await env.DB.prepare('INSERT OR IGNORE INTO school_doman_audio_labels(id,label_kind,label_value,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),kind,value,now).run();return back(url,'atributo');
  }
  if(action==='taxonomy-delete'){
   const id=clean(form.get('id'),100);const row=await env.DB.prepare('SELECT label_kind,label_value FROM school_doman_audio_labels WHERE id=?').bind(id).first<{label_kind:string;label_value:string}>();if(!row)throw new Error('No se encontró el atributo.');
   const count=await env.DB.prepare(`SELECT COUNT(*) AS n FROM school_doman_audio_assets WHERE ${row.label_kind==='category'?'category':row.label_kind==='type'?'audio_type':'level'}=? AND status='active'`).bind(row.label_value).first<{n:number}>();if((count?.n??0)>0)throw new Error('No puedes retirar un atributo que todavía usan audios activos.');
   await env.DB.prepare('DELETE FROM school_doman_audio_labels WHERE id=?').bind(id).run();return back(url,'atributo');
  }
  if(action==='upload'){
   if(!env.FILES)throw new Error('El bucket privado FILES no está conectado a este Worker.');
   const text=clean(form.get('text_value'),300),category=clean(form.get('category'),80),audioType=clean(form.get('audio_type'),80),level=clean(form.get('level'),80),duration=Number(form.get('duration_seconds')??0),file=form.get('audio');
   if(!text||!category||!audioType||!level)throw new Error('Completa texto, categoría, tipo y nivel.');if(!(file instanceof File)||!file.size)throw new Error('Graba o selecciona un audio.');if(file.size>20_000_000)throw new Error('Cada audio puede pesar hasta 20 MB.');
   const mime=file.type.split(';')[0].toLowerCase();const exts:Record<string,string>={'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/x-wav':'wav'};if(!exts[mime])throw new Error('Formato no compatible. Usa WebM, OGG, MP4, MP3 o WAV.');
   const id=crypto.randomUUID(),objectKey=`school-doman-audio/${id}.${exts[mime]}`;
   // Subir el archivo privado primero; si falla D1, borrar el objeto huérfano.
   await env.FILES.put(objectKey,await file.arrayBuffer(),{httpMetadata:{contentType:mime,cacheControl:'private, no-store'}});
   try{
    await env.DB.prepare("INSERT INTO school_doman_audio_assets(id,text_value,category,audio_type,level,github_path,github_sha,mime_type,byte_size,duration_seconds,status,created_at,updated_at,object_key) VALUES(?,?,?,?,? ,?,?,?, ?,?,'active',?,?,?)").bind(id,text,category,audioType,level,`r2://${id}`,'',mime,file.size,Number.isFinite(duration)?Math.max(0,Math.min(duration,36000)):0,now,now,objectKey).run();
    for(const [kind,value] of [['category',category],['type',audioType],['level',level]])await env.DB.prepare('INSERT OR IGNORE INTO school_doman_audio_labels(id,label_kind,label_value,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),kind,value,now).run();
   }catch(e){await env.DB.prepare('DELETE FROM school_doman_audio_assets WHERE id=?').bind(id).run().catch(()=>undefined);await env.FILES.delete(objectKey).catch(()=>undefined);throw e;}
   return back(url,'subido-r2');
  }
  if(action==='migrate'){
   if(!env.FILES)throw new Error('El bucket privado FILES no está conectado a este Worker.');const id=clean(form.get('id'),100);
   const row=await env.DB.prepare("SELECT object_key,github_path,mime_type,byte_size FROM school_doman_audio_assets WHERE id=? AND status='active'").bind(id).first<{object_key:string|null;github_path:string;mime_type:string;byte_size:number}>();if(!row)throw new Error('No se encontró el audio.');if(row.object_key)return back(url,'ya-estaba-en-r2');
   if(!Number.isFinite(row.byte_size)||row.byte_size<1||row.byte_size>20_000_000)throw new Error('El tamaño registrado del audio legado no es válido o supera 20 MB.');
   const source=await githubContentRequest(row.github_path);if(!source.ok||!source.body)throw new Error(`No se pudo descargar el audio legado desde GitHub (HTTP ${source.status}).`);
   const announcedSize=Number(source.headers.get('content-length')||0);if(announcedSize>20_000_000){await source.body.cancel();throw new Error('El audio legado supera 20 MB; vuelve a cargar una versión más pequeña desde el panel.');}
   const reader=source.body.getReader(),chunks:Uint8Array[]=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>20_000_000){await reader.cancel();throw new Error('El audio legado supera 20 MB; vuelve a cargar una versión más pequeña desde el panel.');}chunks.push(value);}
   const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}if(total!==row.byte_size)throw new Error('El tamaño descargado no coincide con el registro. Verifica que la ruta de GitHub corresponda al audio.');
   const objectKey=`school-doman-audio/${id}.${row.mime_type==='audio/mpeg'?'mp3':row.mime_type==='audio/ogg'?'ogg':row.mime_type==='audio/mp4'?'m4a':row.mime_type==='audio/wav'||row.mime_type==='audio/x-wav'?'wav':'webm'}`;
   await env.FILES.put(objectKey,bytes,{httpMetadata:{contentType:row.mime_type,cacheControl:'private, no-store'}});
   try{await env.DB.prepare('UPDATE school_doman_audio_assets SET object_key=?,byte_size=?,updated_at=? WHERE id=? AND object_key IS NULL').bind(objectKey,bytes.byteLength,now,id).run();}catch(e){await env.FILES.delete(objectKey).catch(()=>undefined);throw e;}
   return back(url,'transferido-r2');
  }
  if(action==='delete-github-copy'){
   const id=clean(form.get('id'),100);const row=await env.DB.prepare("SELECT object_key,github_path,github_sha FROM school_doman_audio_assets WHERE id=? AND status='active'").bind(id).first<{object_key:string|null;github_path:string;github_sha:string}>();if(!row?.object_key)throw new Error('Primero transfiere este audio a R2.');if(row.github_path.startsWith('r2://'))throw new Error('Este audio ya no tiene una copia activa en GitHub.');
   const deleted=await deleteGithubAudio(row.github_path,row.github_sha,`Retirar audio Doman ${id} tras migrar a R2`);if(!deleted.ok&&deleted.status!==404)throw new Error(`GitHub no pudo retirar la copia (HTTP ${deleted.status}).`);
   await env.DB.prepare('UPDATE school_doman_audio_assets SET github_path=?,github_sha=\'\',updated_at=? WHERE id=?').bind(`r2://${id}`,now,id).run();return back(url,'copia-github-retirada');
  }
  if(action==='update'){
   const id=clean(form.get('id'),100),text=clean(form.get('text_value'),300),category=clean(form.get('category'),80),audioType=clean(form.get('audio_type'),80),level=clean(form.get('level'),80);if(!text||!category||!audioType||!level)throw new Error('Todos los metadatos son obligatorios.');
   await env.DB.prepare('UPDATE school_doman_audio_assets SET text_value=?,category=?,audio_type=?,level=?,updated_at=? WHERE id=?').bind(text,category,audioType,level,now,id).run();for(const [kind,value] of [['category',category],['type',audioType],['level',level]])await env.DB.prepare('INSERT OR IGNORE INTO school_doman_audio_labels(id,label_kind,label_value,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),kind,value,now).run();return back(url,'actualizado');
  }
  if(action==='delete'){
   const id=clean(form.get('id'),100),row=await env.DB.prepare('SELECT object_key,github_path,github_sha FROM school_doman_audio_assets WHERE id=?').bind(id).first<{object_key:string|null;github_path:string;github_sha:string}>();if(!row)throw new Error('No se encontró el audio.');
   if(row.object_key){await env.DB.prepare('DELETE FROM school_doman_audio_assets WHERE id=?').bind(id).run();await env.FILES?.delete(row.object_key);}
   else{const deleted=await deleteGithubAudio(row.github_path,row.github_sha,`Retirar audio Doman legado ${id}`);if(!deleted.ok&&deleted.status!==404)throw new Error(`GitHub no pudo retirar el audio (HTTP ${deleted.status}).`);await env.DB.prepare('DELETE FROM school_doman_audio_assets WHERE id=?').bind(id).run();}
   return back(url,'retirado');
  }
  throw new Error('Acción desconocida.');
 }catch(e){return back(url,undefined,e instanceof Error?e.message:'No se pudo completar la operación.');}
};
