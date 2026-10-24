import type { D1Database } from '@cloudflare/workers-types';
import { getSecret } from '../secrets/store';

async function token(db: D1Database): Promise<string> {
  const [accountId, clientId, clientSecret] = await Promise.all([
    getSecret(db,'zoom_account_id'), getSecret(db,'zoom_client_id'), getSecret(db,'zoom_client_secret'),
  ]);
  if (!accountId || !clientId || !clientSecret) throw new Error('Configura Account ID, Client ID y Client Secret de Zoom en Ajustes.');
  const auth = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`, {
    method:'POST', headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},
  });
  const data = await response.json() as {access_token?:string;error?:string;reason?:string};
  if (!response.ok || !data.access_token) throw new Error(`Zoom OAuth falló (${response.status}): ${data.reason ?? data.error ?? 'respuesta inválida'}`);
  return data.access_token;
}
export async function createZoomMeeting(db: D1Database, input: {title:string; startsAt:string; duration:number; timeZone:string}) {
  const accessToken = await token(db);
  const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method:'POST', headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({topic:input.title,type:2,start_time: input.startsAt.length === 16 ? `${input.startsAt}:00` : input.startsAt, duration: input.duration, timezone: input.timeZone,settings:{join_before_host:false,waiting_room:true,approval_type:2}}),
  });
  const data = await response.json() as {id?:number|string;join_url?:string;password?:string;message?:string};
  if (!response.ok || !data.id || !data.join_url) throw new Error(`Zoom no pudo crear la sesión (${response.status}): ${data.message ?? 'respuesta inválida'}`);
  return {meetingId:String(data.id),joinUrl:data.join_url,passcode:data.password ?? ''};
}


export async function updateZoomMeeting(db: D1Database, meetingId: string, input: { title: string; startsAt: string; duration: number; timeZone: string }): Promise<void> {
  const accessToken = await token(db);
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: input.title, start_time: input.startsAt.length === 16 ? `${input.startsAt}:00` : input.startsAt, duration: input.duration, timezone: input.timeZone }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(`Zoom no pudo actualizar la sesión (${response.status}): ${data.message ?? 'respuesta inválida'}`);
  }
}

export async function deleteZoomMeeting(db: D1Database, meetingId: string): Promise<void> {
  const accessToken = await token(db);
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(`Zoom no pudo eliminar la sesión (${response.status}): ${data.message ?? 'respuesta inválida'}`);
  }
}
