import type { D1Database } from '@cloudflare/workers-types';

export function scholarshipAmount(amount: number, percent: number): number {
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error('El importe o porcentaje de beca no es válido.');
  }
  return percent === 100 ? 0 : Math.max(1, Math.round(amount * (100 - percent) / 100));
}

export async function setScholarship(db: D1Database, clientNumber: string, enrollmentId: string, percent: number): Promise<void> {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error('La beca debe ser un porcentaje entero entre 0 y 100.');
  const results = await db.batch([
    db.prepare(`UPDATE school_subprogram_enrollments SET scholarship_percent=?
      WHERE id=? AND client_number=? AND status IN ('active','suspended')`).bind(percent, enrollmentId, clientNumber),
    db.prepare(`UPDATE school_subprogram_payment_schedules SET next_check_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE enrollment_id=? AND EXISTS (SELECT 1 FROM school_subprogram_enrollments
        WHERE id=? AND client_number=? AND status IN ('active','suspended') AND scholarship_percent=?)`)
      .bind(enrollmentId, enrollmentId, clientNumber, percent),
  ]);
  if (!results[0].meta.changes) throw new Error('La inscripción no está disponible para este alumno.');
}
