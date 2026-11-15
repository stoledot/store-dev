import type { D1Database } from '@cloudflare/workers-types';

export interface AssignedPaymentPlan {
  title: string;
  payment_type: string;
  frequency_unit: string;
  frequency_count: number;
  classes_per_payment: number | null;
  validity_count: number | null;
  validity_unit: string | null;
  amount_cents: number;
  currency: string;
  test_mode: number;
  concept_mode: number;
}

export async function listAssignedPaymentPlans(
  db: D1Database, subprogramId: string, clientNumber: string | null,
): Promise<AssignedPaymentPlan[]> {
  if (!clientNumber) return [];
  return (await db.prepare(`
    SELECT DISTINCT m.title,m.payment_type,m.frequency_unit,m.frequency_count,m.classes_per_payment,
           m.validity_count,m.validity_unit,p.amount_cents,p.currency,main.test_mode,main.concept_mode
      FROM school_subprogram_enrollments e
      JOIN school_payment_modalities main ON main.id=e.modality_id
      JOIN school_payment_modalities m ON m.subprogram_id=e.subprogram_id
      JOIN school_payment_products p ON p.id=m.payment_product_id
     WHERE e.subprogram_id=? AND e.client_number=? AND e.status IN ('active','suspended')
       AND ((main.concept_mode=1 AND m.id=main.id) OR EXISTS (
         SELECT 1 FROM school_subprogram_payment_schedules sched
         WHERE sched.enrollment_id=e.id AND sched.modality_id=m.id AND sched.status='active'))
     ORDER BY m.title COLLATE NOCASE
  `).bind(subprogramId, clientNumber).all<AssignedPaymentPlan>()).results;
}
