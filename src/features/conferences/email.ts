import type { D1Database } from '@cloudflare/workers-types';
import { getConfig } from '../../config';
import { getStoreSettings } from '../settings/db';
import { getEmailProvider } from '../email';
import { getConference, listSessions, type ConferenceParticipant } from './db';

const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);

export async function sendConferenceEmail(
  db: D1Database,
  conferenceId: number,
  participant: ConferenceParticipant,
  kind: 'invitation' | 'reminder' | 'update',
): Promise<void> {
  const [conference, sessions, settings] = await Promise.all([
    getConference(db, conferenceId), listSessions(db, conferenceId), getStoreSettings(db),
  ]);
  if (!conference) throw new Error('Conferencia no encontrada.');
  if (!sessions.length && kind !== 'update') throw new Error('Agrega al menos una sesión de Zoom antes de invitar participantes.');
  const provider = await getEmailProvider(settings);
  if (!provider) throw new Error('El correo no está habilitado en Ajustes.');

  const sessionText = sessions.map((session, index) => [
    `${index + 1}. ${session.title} — ${session.starts_at} (${session.time_zone})`,
    `Duración: ${session.duration_minutes} minutos`,
    `Enlace: ${session.join_url ?? 'Pendiente de crear en Zoom'}`,
    `Clave de Zoom: ${session.passcode ?? 'No disponible'}`,
  ].join('\n')).join('\n\n');
  const htmlSessions = sessions.map((session, index) => `<li style="margin-bottom:16px"><strong>Sesión ${index + 1}: ${esc(session.title)}</strong><br>Fecha y hora: ${esc(session.starts_at)} (${esc(session.time_zone)})<br>Duración: ${session.duration_minutes} minutos<br>Enlace: ${session.join_url ? `<a href="${esc(session.join_url)}">Entrar a Zoom</a>` : 'Pendiente'}<br>Clave de Zoom: <code>${esc(session.passcode ?? 'No disponible')}</code></li>`).join('');
  const greeting = kind === 'reminder' ? 'Te recordamos tu próxima conferencia.' : kind === 'update' ? 'La información de tu conferencia ha cambiado. Consulta el calendario actualizado a continuación.' : 'Tu inscripción está confirmada.';
  const subject = `${kind === 'reminder' ? 'Recordatorio' : kind === 'update' ? 'Actualización de horario' : 'Invitación'}: ${conference.title}`;
  const text = [
    `Hola ${participant.name || participant.email},`, '', greeting,
    `Conferencia: ${conference.title}`, `Clave personal de participante: ${participant.access_key}`,
    '', conference.description, '', sessionText, '', getConfig().storeName,
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#222"><h1>${esc(conference.title)}</h1><p>Hola ${esc(participant.name || participant.email)},</p><p>${esc(greeting)}</p><p>${esc(conference.description).replace(/\n/g, '<br>')}</p><p><strong>Tu clave personal de participante:</strong> <code>${esc(participant.access_key)}</code></p><h2>Sesiones programadas</h2><ol>${htmlSessions}</ol><p>${esc(getConfig().storeName)}</p></div>`;
  await provider.send({
    to: participant.email, subject, html, text,
    idempotencyKey: `conference-${kind}/${participant.public_id}/${crypto.randomUUID()}`,
  });
}
