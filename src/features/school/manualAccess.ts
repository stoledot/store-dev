import type { D1Database } from '@cloudflare/workers-types';

const resources = {
  course: 'school_courses',
  subprogram: 'school_subprograms',
  group: 'school_subprogram_groups',
  magazine: 'math_magazines',
  conference: 'conferences',
} as const;
type ResourceType = keyof typeof resources;

export async function saveManualAccess(db: D1Database, clientNumber: string, form: FormData): Promise<void> {
  const type = String(form.get('resource_type') ?? '');
  const id = String(form.get('resource_id') ?? '').trim();
  const decision = String(form.get('decision') ?? '');
  const expires = String(form.get('expires_at') ?? '').trim();
  if (!Object.hasOwn(resources, type) || !id || !['allow', 'deny', 'clear'].includes(decision)) throw new Error('Selecciona un recurso y una acción válidos.');
  if (type === 'conference' && !/^[1-9]\d*$/.test(id)) throw new Error('Selecciona una conferencia válida.');
  if (expires) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new Error('La fecha de vencimiento no es válida.');
    const date = new Date(`${expires}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== expires) throw new Error('La fecha de vencimiento no es válida.');
  }
  const accessTable = type === 'conference' ? 'school_extended_manual_access' : 'school_manual_access';
  if (decision === 'clear') {
    const result = await db.prepare(`DELETE FROM ${accessTable} WHERE client_number=? AND resource_type=? AND resource_id=?`)
      .bind(clientNumber, type, id).run();
    if (!result.meta.changes) throw new Error('No existe una excepción para este recurso.');
    return;
  }
  const table = resources[type as ResourceType];
  const statement = db.prepare(`INSERT INTO ${accessTable}(client_number,resource_type,resource_id,decision,expires_at)
    SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ${table} WHERE id=?)
      AND EXISTS (SELECT 1 FROM customer_accounts WHERE client_number=?)
    ON CONFLICT(client_number,resource_type,resource_id) DO UPDATE SET
      decision=excluded.decision,expires_at=excluded.expires_at,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(clientNumber, type, id, decision, expires || null, id, clientNumber);
  if (type === 'conference') {
    const result = await statement.run();
    if (!result.meta.changes) throw new Error('El cliente o el recurso ya no existe.');
    return;
  }
  const results = await db.batch([
    statement,
    db.prepare('DELETE FROM school_manual_access_payment WHERE client_number=? AND resource_type=? AND resource_id=?')
      .bind(clientNumber, type, id),
  ]);
  if (!results[0].meta.changes) throw new Error('El cliente o el recurso ya no existe.');
}
