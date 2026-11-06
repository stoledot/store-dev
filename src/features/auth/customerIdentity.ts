import type { D1Database } from '@cloudflare/workers-types';
import { hashPassword, verifyPassword } from './password';

const normalizeEmail=(email:string)=>email.trim().toLowerCase();
export const isValidClientNumber=(value:string)=>/^\d{10}$/.test(value.trim());

function nextClientNumber():string {
  const bytes=crypto.getRandomValues(new Uint32Array(2));
  const random=(BigInt(bytes[0])<<32n)|BigInt(bytes[1]);
  return String(1_000_000_000n+(random%9_000_000_000n));
}

/** Assign the permanent 10-digit account number after email ownership is verified. */
export async function ensureCustomerAccount(db:D1Database,email:string):Promise<string>{
  const normalized=normalizeEmail(email);
  const existing=await db.prepare('SELECT client_number FROM customer_accounts WHERE email=? COLLATE NOCASE').bind(normalized).first<{client_number:string}>();
  if(existing)return existing.client_number;
  for(let attempt=0;attempt<8;attempt++){
    const number=nextClientNumber();
    await db.prepare('INSERT OR IGNORE INTO customer_accounts(email,client_number) VALUES(?,?)').bind(normalized,number).run();
    const created=await db.prepare('SELECT client_number FROM customer_accounts WHERE email=? COLLATE NOCASE').bind(normalized).first<{client_number:string}>();
    if(created)return created.client_number;
  }
  throw new Error('No se pudo asignar un número de cliente. Inténtalo de nuevo.');
}

export async function getClientNumber(db:D1Database,email:string):Promise<string|null>{
  const row=await db.prepare('SELECT client_number FROM customer_accounts WHERE email=? COLLATE NOCASE').bind(normalizeEmail(email)).first<{client_number:string}>();
  return row?.client_number??null;
}

export async function setCustomerPassword(db:D1Database,email:string,password:string):Promise<void>{
  if(password.length<12||password.length>200)throw new Error('La contraseña debe tener entre 12 y 200 caracteres.');
  await ensureCustomerAccount(db,email);
  const hash=await hashPassword(password);
  await db.prepare("UPDATE customer_accounts SET password_hash=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email=? COLLATE NOCASE").bind(hash,normalizeEmail(email)).run();
}

export async function verifyClientPassword(db:D1Database,clientNumber:string,password:string):Promise<string|null>{
  if(!isValidClientNumber(clientNumber)||!password||password.length>200)return null;
  const row=await db.prepare('SELECT email,password_hash FROM customer_accounts WHERE client_number=?').bind(clientNumber).first<{email:string;password_hash:string|null}>();
  if(!row?.password_hash)return null;
  return await verifyPassword(password,row.password_hash)?row.email:null;
}

export async function hasCustomerPassword(db:D1Database,email:string):Promise<boolean>{
  const row=await db.prepare('SELECT password_hash FROM customer_accounts WHERE email=? COLLATE NOCASE').bind(normalizeEmail(email)).first<{password_hash:string|null}>();
  return Boolean(row?.password_hash);
}
