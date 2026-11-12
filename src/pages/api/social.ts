export const prerender = false;
import { env } from 'cloudflare:workers';
import { getCustomerEmail } from '../../features/auth/customer';
import { isForbiddenFormOrigin } from '../../features/auth/formOrigin';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=(v:unknown,n:number)=>String(v??'').trim().slice(0,n);
export async function GET({cookies,url}:any){
 const email=await getCustomerEmail(cookies);if(!email)return json({error:'Inicia sesión'},401);
 const action=url.searchParams.get('action')||'feed';
 if(action==='groups'){
  const {results=[]}=await env.DB.prepare(`SELECT g.*,CASE WHEN m.email IS NULL THEN 0 ELSE 1 END AS joined,(SELECT COUNT(*) FROM social_group_members x WHERE x.group_id=g.id) AS members FROM social_groups g LEFT JOIN social_group_members m ON m.group_id=g.id AND m.email=? COLLATE NOCASE WHERE g.status='active' ORDER BY joined DESC,g.title COLLATE NOCASE`).bind(email).all();return json({groups:results});
 }
 if(action==='notifications'){
  const {results=[]}=await env.DB.prepare(`SELECT n.id,n.kind,n.created_at,g.title AS group_title,p.body AS post_body FROM social_notifications n LEFT JOIN social_groups g ON g.id=n.group_id LEFT JOIN social_posts p ON p.id=n.post_id WHERE n.to_email=? COLLATE NOCASE AND n.read_at IS NULL ORDER BY n.created_at DESC LIMIT 20`).bind(email).all();
  for(const item of results as Array<{id:string}>)await env.DB.prepare("UPDATE social_notifications SET read_at=datetime('now') WHERE id=? AND to_email=? COLLATE NOCASE AND read_at IS NULL").bind(item.id,email).run();return json({notifications:results});
 }
 if(action==='comments'){
  const postId=clean(url.searchParams.get('post'),80);const {results=[]}=await env.DB.prepare(`SELECT c.id,c.parent_id,c.author_email,c.body,c.created_at,COALESCE(pr.full_name,'') AS author_name,(SELECT COUNT(*) FROM social_comment_likes l WHERE l.comment_id=c.id) AS likes,EXISTS(SELECT 1 FROM social_comment_likes l WHERE l.comment_id=c.id AND l.email=? COLLATE NOCASE) AS liked FROM social_comments c LEFT JOIN customer_profiles pr ON pr.email=c.author_email COLLATE NOCASE WHERE c.post_id=? ORDER BY c.created_at`).bind(email,postId).all();return json({comments:results.map((r:any)=>({id:r.id,parent_id:r.parent_id,body:r.body,created_at:r.created_at,author_name:r.author_name||'Miembro',likes:r.likes,liked:r.liked}))});
 }
 const group=clean(url.searchParams.get('group'),100),offset=Math.max(0,Number(url.searchParams.get('offset'))||0),limit=Math.min(5,Math.max(1,Number(url.searchParams.get('limit'))||5)),sort=url.searchParams.get('sort')==='recent'?'recent':'relevance',saved=url.searchParams.get('saved')==='1',mine=url.searchParams.get('mine')==='1';
 const where=[saved?'EXISTS(SELECT 1 FROM social_saved_posts s WHERE s.post_id=p.id AND s.email=? COLLATE NOCASE)':mine?'p.author_email=? COLLATE NOCASE':"(?='' OR p.group_id=?)"];
 const order=sort==='recent'?'p.created_at DESC':'(SELECT COUNT(*) FROM social_post_likes l WHERE l.post_id=p.id)*2+(SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id) DESC,p.created_at DESC';
 const sql=`SELECT p.id,p.group_id,p.author_email,p.body,p.created_at,p.updated_at,g.title AS group_title,g.slug AS group_slug,g.image_url AS group_image,COALESCE(pr.full_name,'') AS author_name,pr.social_avatar_image_key AS avatar,(SELECT COUNT(*) FROM social_post_likes l WHERE l.post_id=p.id) AS likes,(SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id) AS comments,EXISTS(SELECT 1 FROM social_post_likes l WHERE l.post_id=p.id AND l.email=? COLLATE NOCASE) AS liked,EXISTS(SELECT 1 FROM social_saved_posts s WHERE s.post_id=p.id AND s.email=? COLLATE NOCASE) AS saved,(p.author_email=? COLLATE NOCASE) AS mine FROM social_posts p JOIN social_groups g ON g.id=p.group_id LEFT JOIN customer_profiles pr ON pr.email=p.author_email COLLATE NOCASE WHERE ${where[0]} ORDER BY ${order} LIMIT ? OFFSET ?`;
 const args=saved?[email,email,email,email,limit,offset]:mine?[email,email,email,email,limit,offset]:[email,email,email,group,group,limit,offset];
 const {results:posts=[]}=await env.DB.prepare(sql).bind(...args).all();const visiblePosts=posts.map((r:any)=>({id:r.id,group_id:r.group_id,body:r.body,created_at:r.created_at,updated_at:r.updated_at,group_title:r.group_title,group_slug:r.group_slug,group_image:r.group_image,author_name:r.author_name||'Miembro',avatar:r.avatar,likes:r.likes,comments:r.comments,liked:r.liked,saved:r.saved,mine:r.mine}));return json({posts:visiblePosts,hasMore:posts.length===limit});
}
export async function POST({cookies,request}:any){
 const email=await getCustomerEmail(cookies);if(!email)return json({error:'Inicia sesión'},401);
 if(isForbiddenFormOrigin(request,new URL(request.url)))return json({error:'Origen no permitido'},403);
 let b:any;try{b=await request.json()}catch{return json({error:'Solicitud inválida'},400)}
 const a=clean(b.action,30),id=clean(b.id,80),groupId=clean(b.groupId,80),body=clean(b.body,5000);const newId=()=>crypto.randomUUID();
 if(a==='join'||a==='leave'){
  const g=await env.DB.prepare("SELECT id FROM social_groups WHERE id=? AND status='active'").bind(groupId).first();if(!g)return json({error:'Grupo no encontrado'},404);
  if(a==='join')await env.DB.prepare('INSERT OR IGNORE INTO social_group_members(group_id,email) VALUES(?,?)').bind(groupId,email).run();else await env.DB.prepare('DELETE FROM social_group_members WHERE group_id=? AND email=? COLLATE NOCASE').bind(groupId,email).run();return json({ok:true});
 }
 if(a==='post'){
  if(body.length<1)return json({error:'Escribe una publicación'},400);
  const member=await env.DB.prepare('SELECT 1 FROM social_group_members WHERE group_id=? AND email=? COLLATE NOCASE').bind(groupId,email).first();if(!member)return json({error:'Únete al grupo para publicar'},403);
  const postId=newId();await env.DB.prepare('INSERT INTO social_posts(id,group_id,author_email,body) VALUES(?,?,?,?)').bind(postId,groupId,email,body).run();
  const members=await env.DB.prepare('SELECT email FROM social_group_members WHERE group_id=? AND email<>? COLLATE NOCASE').bind(groupId,email).all<{email:string}>();for(const m of members.results??[])await env.DB.prepare("INSERT INTO social_notifications(id,to_email,actor_email,kind,group_id,post_id) VALUES(?,?,?,'group_post',?,?)").bind(newId(),m.email,email,groupId,postId).run();return json({ok:true,id:postId},201);
 }
 const post=await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(id).first<any>();
 if(!post)return json({error:'Publicación no encontrada'},404);
 if(a==='like'||a==='save'){
  const table=a==='like'?'social_post_likes':'social_saved_posts',col=a==='like'?'liked':'saved';const old=await env.DB.prepare(`SELECT 1 FROM ${table} WHERE post_id=? AND email=? COLLATE NOCASE`).bind(id,email).first();if(old)await env.DB.prepare(`DELETE FROM ${table} WHERE post_id=? AND email=? COLLATE NOCASE`).bind(id,email).run();else await env.DB.prepare(`INSERT INTO ${table}(post_id,email) VALUES(?,?)`).bind(id,email).run();return json({[col]:!old});
 }
 if(a==='edit'||a==='delete'){
  if(post.author_email.toLowerCase()!==email.toLowerCase())return json({error:'No autorizado'},403);if(a==='delete')await env.DB.prepare('DELETE FROM social_posts WHERE id=?').bind(id).run();else if(!body)return json({error:'El texto no puede quedar vacío'},400);else await env.DB.prepare("UPDATE social_posts SET body=?,updated_at=datetime('now') WHERE id=?").bind(body,id).run();return json({ok:true});
 }
 if(a==='comment'){
  if(!body)return json({error:'Escribe un comentario'},400);const commentId=newId(),parent=clean(b.parentId,80)||null;if(parent){const validParent=await env.DB.prepare('SELECT id FROM social_comments WHERE id=? AND post_id=?').bind(parent,id).first();if(!validParent)return json({error:'No se encontró el comentario al que respondes'},404)}await env.DB.prepare('INSERT INTO social_comments(id,post_id,parent_id,author_email,body) VALUES(?,?,?,?,?)').bind(commentId,id,parent,email,body).run();
  const recipient=parent?await env.DB.prepare('SELECT author_email FROM social_comments WHERE id=?').bind(parent).first<any>():post;const to=recipient?.author_email;if(to&&to.toLowerCase()!==email.toLowerCase())await env.DB.prepare("INSERT INTO social_notifications(id,to_email,actor_email,kind,post_id,comment_id) VALUES(?,?,?,'comment',?,?)").bind(newId(),to,email,id,commentId).run();return json({ok:true,id:commentId},201);
 }
 if(a==='comment-like'){const c=await env.DB.prepare('SELECT id FROM social_comments WHERE id=? AND post_id=?').bind(clean(b.commentId,80),id).first();if(!c)return json({error:'Comentario no encontrado'},404);const old=await env.DB.prepare('SELECT 1 FROM social_comment_likes WHERE comment_id=? AND email=? COLLATE NOCASE').bind(b.commentId,email).first();if(old)await env.DB.prepare('DELETE FROM social_comment_likes WHERE comment_id=? AND email=? COLLATE NOCASE').bind(b.commentId,email).run();else await env.DB.prepare('INSERT INTO social_comment_likes(comment_id,email) VALUES(?,?)').bind(b.commentId,email).run();return json({liked:!old});}
 return json({error:'Acción desconocida'},400);
}
