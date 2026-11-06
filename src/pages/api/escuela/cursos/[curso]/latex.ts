import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { accountsEnabled,getCustomerEmail } from '../../../../../features/auth/customer';
import { ensureCustomerAccount } from '../../../../../features/auth/customerIdentity';

export const prerender=false;
const json=(message:string,status:number)=>new Response(JSON.stringify({error:message}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const escapeTex=(value:string)=>value.replace(/\s+/g,' ').replace(/[\\{}$&#_%~^]/g,(char)=>({"\\":'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','_':'\\_','%':'\\%','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[char]??char));

/** Download only the signed-in student's saved editor text for a course they can access. */
export const GET:APIRoute=async({cookies,params})=>{
  if(!(await accountsEnabled()))return json('Las cuentas no están habilitadas.',403);
  const email=await getCustomerEmail(cookies);if(!email)return json('Inicia sesión para descargar tus respuestas.',401);
  const client=await ensureCustomerAccount(env.DB,email),courseSlug=params.curso??'';
  // Reuse the same paid, assigned, and active-classroom access paths as the lesson reader.
  const access=await env.DB.prepare(`SELECT c.id,c.title,c.slug FROM school_courses c WHERE c.slug=? AND c.status='published' AND c.content_kind IN ('course','reading') AND (
    EXISTS(SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.school_course_id=c.id AND lower(trim(o.email))=lower(trim(?)) AND o.status='paid' AND COALESCE(o.refunded_cents,0)<o.amount_total_cents)
    OR EXISTS(SELECT 1 FROM school_course_assignments x WHERE x.course_id=c.id AND x.student_email=? COLLATE NOCASE AND x.status='active' AND EXISTS(SELECT 1 FROM school_area_diagnostics d WHERE d.student_email=x.student_email COLLATE NOCASE AND d.area_id=c.area_id AND d.status='approved' AND d.approved_level=c.level_code AND d.attempt_no=(SELECT MAX(d2.attempt_no) FROM school_area_diagnostics d2 WHERE d2.student_email=d.student_email COLLATE NOCASE AND d2.area_id=d.area_id)) AND EXISTS(SELECT 1 FROM school_fee_payments p WHERE p.student_email=x.student_email COLLATE NOCASE AND p.fee_type='enrollment' AND p.valid_until>=date('now')) AND EXISTS(SELECT 1 FROM school_fee_payments p WHERE p.student_email=x.student_email COLLATE NOCASE AND p.fee_type='monthly' AND p.valid_until>=date('now')))
    OR EXISTS(SELECT 1 FROM school_classroom_students rs JOIN school_students st ON st.student_number=rs.student_number JOIN school_classrooms cr ON cr.id=rs.classroom_id JOIN school_academic_cycles cy ON cy.id=cr.cycle_id WHERE cr.course_id=c.id AND st.client_number=? AND st.status IN ('active','graduated') AND rs.status IN ('active','completed') AND cr.status IN ('active','closed') AND cy.status IN ('active','closed'))
  ) LIMIT 1`).bind(courseSlug,email,email,client).first<{id:string;title:string;slug:string}>();
  if(!access)return json('No tienes acceso vigente a este curso.',403);
  const drafts=(await env.DB.prepare(`SELECT d.xml_lesson_id,d.source,
    COALESCE((SELECT l.xml_section_title FROM school_lessons l WHERE l.course_id=d.course_id AND l.xml_lesson_id=d.xml_lesson_id ORDER BY l.sequence_no LIMIT 1),'') AS section_title,
    COALESCE((SELECT l.xml_lesson_title FROM school_lessons l WHERE l.course_id=d.course_id AND l.xml_lesson_id=d.xml_lesson_id ORDER BY l.sequence_no LIMIT 1),d.xml_lesson_id) AS lesson_title,
    COALESCE((SELECT MIN(l.sequence_no) FROM school_lessons l WHERE l.course_id=d.course_id AND l.xml_lesson_id=d.xml_lesson_id),2147483647) AS sequence_no
    FROM school_latex_drafts d WHERE d.student_email=? COLLATE NOCASE AND d.course_id=? AND length(trim(d.source))>0 ORDER BY sequence_no,d.xml_lesson_id`).bind(email,access.id).all<{xml_lesson_id:string;source:string;section_title:string;lesson_title:string;sequence_no:number}>()).results??[];
  const collected=drafts.length?drafts.map((draft)=>`% Lección: ${draft.xml_lesson_id}\n\\subsection*{${escapeTex(draft.section_title?`${draft.section_title} — ${draft.lesson_title}`:draft.lesson_title)}}\n${draft.source.trim()}\n`).join('\n'):'% Aún no hay respuestas guardadas en las prácticas de este curso.\n';
  const document=`% Código reunido desde las prácticas de ${access.title}\n% Las respuestas son fragmentos LaTeX; revisa si necesitan macros o paquetes adicionales.\n\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage{amsmath,amssymb,mathtools}\n\\begin{document}\n\\section*{${escapeTex(access.title)}}\n\n${collected}\\end{document}\n`;
  if(new TextEncoder().encode(document).length>1_000_000)return json('El archivo supera 1 MB. Descarga menos respuestas o divide el curso antes de exportar.',413);
  const filename=`latex-${access.slug.replace(/[^a-z0-9_-]/gi,'-')}.tex`;
  return new Response(document,{headers:{'content-type':'application/x-tex; charset=utf-8','content-disposition':`attachment; filename="${filename}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
};
