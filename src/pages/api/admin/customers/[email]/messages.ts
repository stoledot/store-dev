export const prerender = false;
import { env } from 'cloudflare:workers';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
function getEmail(value:string|undefined){try{return decodeURIComponent(value??'').trim().toLowerCase()}catch{return ''}}
export async function GET({params,url}:any){
 const email=getEmail(params.email); if(!email||email.length>254)return json({error:'Correo inválido'},400);
 await env.DB.prepare("UPDATE customer_messages SET read_at=datetime('now') WHERE customer_email=? COLLATE NOCASE AND sender_role='customer' AND read_at IS NULL").bind(email).run();
 const before=url.searchParams.get('before'); const since=new Date(Date.now()-2*86400000).toISOString();
 const q=before?env.DB.prepare('SELECT id,sender_role,sender_label,body,created_at FROM customer_messages WHERE customer_email=? COLLATE NOCASE AND created_at < ? ORDER BY created_at DESC LIMIT 51').bind(email,before):env.DB.prepare('SELECT id,sender_role,sender_label,body,created_at FROM customer_messages WHERE customer_email=? COLLATE NOCASE AND created_at >= ? ORDER BY created_at DESC LIMIT 51').bind(email,since);
 const {results=[]}=await q.all<any>(); const messages=results.slice(0,50).reverse(); let hasMore=results.length>50; if(!hasMore){const anchor=messages[0]?.created_at??(before||since);const older=await env.DB.prepare('SELECT 1 AS yes FROM customer_messages WHERE customer_email=? COLLATE NOCASE AND created_at < ? LIMIT 1').bind(email,anchor).first();hasMore=!!older;} return json({messages,hasMore,cursor:messages[0]?.created_at??before??since});
}
export async function POST({params,request}:any){
 const email=getEmail(params.email); if(!email||email.length>254)return json({error:'Correo inválido'},400);
 let data:any;try{data=await request.json()}catch{return json({error:'Solicitud inválida'},400)}
 const body=String(data?.body??'').trim();if(!body||body.length>5000)return json({error:'El mensaje debe tener entre 1 y 5000 caracteres.'},400);
 const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO customer_messages(id,customer_email,sender_role,sender_label,body) VALUES (?,?,?,?,?)").bind(id,email,'admin','Administración',body).run();
 const message=await env.DB.prepare('SELECT id,sender_role,sender_label,body,created_at FROM customer_messages WHERE id=?').bind(id).first();return json({message},201);
}
