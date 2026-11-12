import type { D1Database } from '@cloudflare/workers-types';

export interface LessonLimitPolicy {
  maxLessonsPerDay?: number;
  maxLessonsPerWeek?: number;
  maxLessonsPerMonth?: number;
  maxLessonsPerTime?: string;
}
interface LessonPolicyRecord extends LessonLimitPolicy {
  sectionPolicy?: LessonLimitPolicy;
  excludeFromNumberMaxLessons?: boolean;
}
interface LessonStartRow { id:string; xml_section_id:string|null; xml_policy_json:string|null; started_at:string|null; }
const parseObject=(value:string|null):LessonPolicyRecord=>{try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'?parsed as LessonPolicyRecord:{};}catch{return {};}};
const dateParts=(instant:Date,timeZone:string)=>{try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);return {year:Number(parts.find(p=>p.type==='year')?.value),month:Number(parts.find(p=>p.type==='month')?.value),day:Number(parts.find(p=>p.type==='day')?.value)};}catch{return {year:instant.getUTCFullYear(),month:instant.getUTCMonth()+1,day:instant.getUTCDate()};}};
function utcAtLocalMidnight(year:number,month:number,day:number,timeZone:string){const target=Date.UTC(year,month-1,day);let guess=target;for(let i=0;i<4;i++){const p=dateParts(new Date(guess),timeZone);const seen=Date.UTC(p.year,p.month-1,p.day);const delta=target-seen;if(!delta)break;guess+=delta;}return guess;}
function periodStart(period:'day'|'week'|'month',now:Date,timeZone:string){const p=dateParts(now,timeZone);if(period==='month')return utcAtLocalMidnight(p.year,p.month,1,timeZone);let day=p.day;if(period==='week'){const weekday=new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay();day-=((weekday+6)%7);}return utcAtLocalMidnight(p.year,p.month,day,timeZone);}
function rollingMillis(value:string){const slash=value.indexOf('/');if(slash<1)return null;const raw=value.slice(slash+1).trim(),token=/([0-9]+(?:\.[0-9]+)?)(month|w|d|h|min|s)/g,matches=[...raw.matchAll(token)];if(!matches.length||raw.replace(token,'').trim())return null;const units:Record<string,number>={month:30*86400000,w:7*86400000,d:86400000,h:3600000,min:60000,s:1000};const total=matches.reduce((sum,m)=>sum+Number(m[1])*units[m[2]],0);return Number.isFinite(total)&&total>0?{count:Number(value.slice(0,slash)),milliseconds:total}:null;}
const num=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:undefined;
/** Checks both course-wide and section-wide XML caps before a learner first starts a lesson. */
export async function checkXmlLessonStart(db:D1Database,email:string,courseId:string,lessonId:string,timeZone='UTC',now=new Date()):Promise<{allowed:boolean;message?:string}>{
 const lesson=await db.prepare(`SELECT l.id,l.xml_section_id,l.xml_policy_json,lp.started_at,c.xml_policy_json AS course_policy_json FROM school_lessons l JOIN school_courses c ON c.id=l.course_id LEFT JOIN school_lesson_progress lp ON lp.lesson_id=l.id AND lp.student_email=? COLLATE NOCASE WHERE l.id=? AND l.course_id=? AND l.status='published' LIMIT 1`).bind(email,lessonId,courseId).first<{id:string;xml_section_id:string|null;xml_policy_json:string|null;started_at:string|null;course_policy_json:string|null}>();
 if(!lesson)return {allowed:false,message:'No se encontró la lección.'};
 const lessonPolicy=parseObject(lesson.xml_policy_json);if(lessonPolicy.excludeFromNumberMaxLessons===true||lesson.started_at)return {allowed:true};
 const coursePolicy=parseObject(lesson.course_policy_json),sectionPolicy=lessonPolicy.sectionPolicy??{};
 const courseRules:{name:string;limit:number;since:number;scope:'course'|'section'}[]=[];const instant=now.getTime();
 for(const [policy,scope] of [[coursePolicy,'course'],[sectionPolicy,'section']] as const){for(const [field,period] of [['maxLessonsPerDay','day'],['maxLessonsPerWeek','week'],['maxLessonsPerMonth','month']] as const){const limit=num(policy[field]);if(limit)courseRules.push({name:field,limit,since:periodStart(period,now,timeZone),scope});}if(typeof policy.maxLessonsPerTime==='string'){const rolling=rollingMillis(policy.maxLessonsPerTime);if(rolling)courseRules.push({name:'maxLessonsPerTime',limit:rolling.count,since:instant-rolling.milliseconds,scope});}}
 if(!courseRules.length)return {allowed:true};
 const rows=(await db.prepare(`SELECT l.id,l.xml_section_id,l.xml_policy_json,p.started_at FROM school_lessons l LEFT JOIN school_lesson_progress p ON p.lesson_id=l.id AND p.student_email=? COLLATE NOCASE WHERE l.course_id=? AND l.status='published' AND p.started_at IS NOT NULL`).bind(email,courseId).all<LessonStartRow>()).results??[];
 const sectionStarted=lesson.xml_section_id?rows.filter(row=>row.xml_section_id===lesson.xml_section_id):[];
 for(const rule of courseRules){const candidates=rule.scope==='course'?rows:sectionStarted;const count=candidates.filter(row=>{const policy=parseObject(row.xml_policy_json);const started=Date.parse(row.started_at??'');return policy.excludeFromNumberMaxLessons!==true&&Number.isFinite(started)&&started>=rule.since;}).length;if(count>=rule.limit){const labels:Record<string,string>={maxLessonsPerDay:'hoy',maxLessonsPerWeek:'esta semana',maxLessonsPerMonth:'este mes',maxLessonsPerTime:'en el periodo configurado'};const scope=rule.scope==='section'?'esta sección':'este curso';return {allowed:false,message:`Ya alcanzaste el máximo de ${rule.limit} lecciones permitido para ${scope} ${labels[rule.name]??'en este periodo'}.`};}}
 return {allowed:true};
}
/** Records the first visit once so reloads do not consume another lesson slot. */
export async function recordXmlLessonStart(db:D1Database,email:string,lessonId:string,contentVersion:number,now=new Date().toISOString()){
 await db.prepare(`INSERT INTO school_lesson_progress(id,student_email,lesson_id,status,started_at,content_version,last_activity_at,updated_at) VALUES(?,?,?,'in_progress',?,?,?,?) ON CONFLICT(student_email,lesson_id) DO UPDATE SET status=CASE WHEN school_lesson_progress.status='completed' THEN 'completed' ELSE 'in_progress' END,started_at=COALESCE(school_lesson_progress.started_at,excluded.started_at),content_version=excluded.content_version,last_activity_at=excluded.last_activity_at,updated_at=excluded.updated_at`).bind(crypto.randomUUID(),email,lessonId,now,contentVersion,now,now).run();
}
