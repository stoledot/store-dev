import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled,getCustomerEmail } from '../../../../../../../features/auth/customer';
import { ensureCustomerAccount } from '../../../../../../../features/auth/customerIdentity';
import { domanLessonAccess } from '../../../../../../../features/school/domanStudentAccess';
import { githubContentRequest } from '../../../../../../../features/school/domanGithub';
import { privateDomanAudioResponse } from '../../../../../../../features/school/domanR2';
export const prerender=false;
export const GET:APIRoute=async({cookies,params})=>{
 if(!(await accountsEnabled()))return new Response('Inicia sesión para acceder.',{status:401});const email=await getCustomerEmail(cookies);if(!email)return new Response('Inicia sesión para acceder.',{status:401});
 const client=await ensureCustomerAccount(env.DB,email),course=decodeURIComponent(params.curso??''),lesson=decodeURIComponent(params.slug??'');const access=await domanLessonAccess(env.DB,email,client,course,lesson);if(!access)return new Response('No tienes acceso a esta lección.',{status:403});
 const id=params.id??'';const audio=await env.DB.prepare("SELECT object_key,github_path,mime_type FROM school_doman_audio_assets WHERE id=? AND status='active'").bind(id).first<{object_key:string|null;github_path:string;mime_type:string}>();if(!audio)return new Response('Audio no encontrado.',{status:404});
 try{if(audio.object_key){if(!env.FILES)return new Response('El bucket R2 FILES no está configurado.',{status:503});return privateDomanAudioResponse(env.FILES,audio.object_key,audio.mime_type);}const response=await githubContentRequest(audio.github_path);if(!response.ok)return new Response('No se pudo obtener el audio legado.',{status:502});return new Response(response.body,{headers:{'content-type':audio.mime_type,'cache-control':'private, no-store','x-content-type-options':'nosniff','accept-ranges':'none'}});}catch{return new Response('No se pudo obtener el audio.',{status:502});}
};
