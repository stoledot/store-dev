import type { D1Database } from '@cloudflare/workers-types';
import { getSetting, setSetting } from './db';

export const contactNetworks = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'x', label: 'X' },
] as const;

type ContactKey = 'whatsapp' | (typeof contactNetworks)[number]['key'];
export type ContactConfig = Record<ContactKey, string>;

const keys: ContactKey[] = ['whatsapp', ...contactNetworks.map(network => network.key)];

function validateLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > 2000) throw new Error('La dirección es demasiado larga.');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Escribe una dirección URL válida.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Las direcciones deben usar HTTPS y no contener credenciales.');
  return url.href;
}

export async function getContactConfig(db: D1Database): Promise<ContactConfig> {
  const raw = await getSetting(db, 'contact_config');
  const parsed: unknown = raw ? JSON.parse(raw) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('La configuración de contacto no es válida.');
  const record = parsed as Record<string, unknown>;
  return Object.fromEntries(keys.map(key => {
    const value = record[key];
    if (value !== undefined && typeof value !== 'string') throw new Error('La configuración de contacto no es válida.');
    return [key, validateLink(value ?? '')];
  })) as ContactConfig;
}

export async function saveContactConfig(db: D1Database, form: FormData): Promise<void> {
  const values = Object.fromEntries(keys.map(key => [key, validateLink(String(form.get(key) ?? ''))]));
  await setSetting(db, 'contact_config', JSON.stringify(values));
}
