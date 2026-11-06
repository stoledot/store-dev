import { env } from 'cloudflare:workers';
import { getSetting, setSetting } from '../settings/db';
import { getSecret, setSecret, vaultReady } from '../secrets/store';

export interface DomanGithubConfig { owner:string; repo:string; branch:string; basePath:string }
const keys = {owner:'doman_github_owner',repo:'doman_github_repo',branch:'doman_github_branch',basePath:'doman_github_path'} as const;
export async function domanGithubConfig():Promise<DomanGithubConfig>{
  return {owner:(await getSetting(env.DB,keys.owner))??'',repo:(await getSetting(env.DB,keys.repo))??'',branch:(await getSetting(env.DB,keys.branch))||'main',basePath:(await getSetting(env.DB,keys.basePath))||'school-audio/doman'};
}
export async function saveDomanGithubConfig(config:DomanGithubConfig,token:string|null){
  await setSetting(env.DB,keys.owner,config.owner);await setSetting(env.DB,keys.repo,config.repo);await setSetting(env.DB,keys.branch,config.branch);await setSetting(env.DB,keys.basePath,config.basePath);
  if(token!==null)await setSecret(env.DB,'github_audio_token',token);
}
export const domanGithubToken=()=>getSecret(env.DB,'github_audio_token');
export const domanGithubReady=async()=>{const c=await domanGithubConfig();return Boolean(c.owner&&c.repo&&await domanGithubToken());};
export async function githubContentRequest(path:string,init:RequestInit={}){
  const c=await domanGithubConfig(),token=await domanGithubToken();if(!c.owner||!c.repo||!token)throw new Error('Configura GitHub y su token en el panel de audios Doman.');
  const encoded=path.split('/').map(encodeURIComponent).join('/');
  return fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${encoded}`,{...init,headers:{'authorization':`Bearer ${token}`,'accept':init.method==='PUT'?'application/vnd.github+json':'application/vnd.github.raw+json','x-github-api-version':'2022-11-28','user-agent':'Minshop-Doman-Audio',...(init.headers as Record<string,string>|undefined)}});
}
export async function putGithubAudio(path:string,contentBase64:string,message:string){const c=await domanGithubConfig();return githubContentRequest(path,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({message,content:contentBase64,branch:c.branch})});}
export async function deleteGithubAudio(path:string,sha:string,message:string){const c=await domanGithubConfig();return githubContentRequest(path,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({message,sha,branch:c.branch})});}
export async function verifyDomanGithubConfig(config:DomanGithubConfig,token:string){
  const response=await fetch(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,{headers:{authorization:`Bearer ${token}`,'accept':'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'Minshop-Doman-Audio'}});
  if(!response.ok)throw new Error(response.status===404?'GitHub no encontró el repositorio o el token no tiene acceso.':`GitHub respondió ${response.status} al verificar el repositorio.`);
  const repo=await response.json() as {permissions?:{push?:boolean}};if(repo.permissions?.push===false)throw new Error('El token puede leer el repositorio pero no tiene permiso para subir audios.');
}
export function base64FromBytes(bytes:Uint8Array){let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary);}
export { vaultReady };
