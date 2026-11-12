import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled,getCustomerEmail } from '../../../../../../features/auth/customer';
import { magazineCanReadIssue } from '../../../../../../features/magazines/access';
import { parseReadingXml } from '../../../../../../features/mathTexts/xmlReading';
export const prerender=false;
export const GET:APIRoute=async({params,cookies})=>{
 if(!(await accountsEnabled()))return new Response('No disponible.',{status:404});const email=await getCustomerEmail(cookies);if(!email)return new Response('Inicia sesión para ver esta construcción.',{status:401});if(!env.FILES)return new Response('Almacenamiento no configurado.',{status:503});
 const ref=params.ref??'';if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(ref))return new Response('Construcción no encontrada.',{status:404});
 const issue=await env.DB.prepare("SELECT i.id,i.xml_source_key,m.id AS magazine_id FROM math_magazine_issues i JOIN math_magazines m ON m.id=i.magazine_id WHERE m.slug=? AND i.slug=? AND i.status='published' AND m.status='published'").bind(params.revista??'',params.edicion??'').first<{id:string;xml_source_key:string;magazine_id:string}>();if(!issue||!(await magazineCanReadIssue(env.DB,email,issue.magazine_id,issue.id)))return new Response('Construcción no encontrada.',{status:404});
 const source=await env.FILES.get(issue.xml_source_key);if(!source||source.size>1_000_000)return new Response('Edición no disponible.',{status:404});const xml=parseReadingXml(await source.text());if(!xml.cards.some(card=>card.html.includes(`data-reading-geogebra=\"${ref}\"`)))return new Response('Construcción no encontrada.',{status:404});
 const asset=await env.DB.prepare('SELECT object_key,app_name FROM school_course_geogebra_assets WHERE asset_ref=? ORDER BY updated_at DESC LIMIT 1').bind(ref).first<{object_key:string;app_name:'graphing'|'3d'}>();if(!asset)return new Response('La construcción aún no está disponible.',{status:404});const object=await env.FILES.get(asset.object_key);if(!object||object.size>2_000_000)return new Response('La construcción aún no está disponible.',{status:404});return Response.json({xml:await object.text(),appName:asset.app_name},{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'}});
};
