import type { D1Database } from '@cloudflare/workers-types';
import { releaseExpiredDemoBundles, type BundleCandidate } from './paymentBundles.ts';

export interface ConceptBundleCandidate extends BundleCandidate {
  concept_id: string;
  group_name: string | null;
}

const availableSql = `((o.available_from IS NOT NULL AND datetime(o.available_from)<=datetime('now'))
  OR (o.available_from IS NULL AND (o.available_at IS NULL OR date(o.available_at)<=date('now'))))
  AND (cc.payment_cutoff IS NULL OR datetime(cc.payment_cutoff)>datetime('now'))`;

const groupKey = (row: ConceptBundleCandidate): string => row.group_name === null
  ? `charge:${row.id}`
  : `group:${row.group_name.replace(/[A-Z]/g, character => character.toLowerCase())}`;

export async function listConceptBundleCandidates(db: D1Database, email: string | null): Promise<ConceptBundleCandidate[]> {
  return (await db.prepare(`SELECT o.id,cc.enrollment_id,sub.title AS subprogram_title,o.student_email,
      o.title_snapshot,o.amount_cents,o.currency,o.due_at,o.modality_payment_type,m.test_mode,
      c.id AS concept_id,c.group_name,
      CASE WHEN o.overdue_from IS NOT NULL AND datetime(o.overdue_from)<=datetime('now') THEN 1 ELSE 0 END AS overdue
    FROM school_concept_occurrence_charges cc JOIN school_payment_obligations o ON o.id=cc.obligation_id
    JOIN school_payment_concepts c ON c.id=cc.concept_id AND c.active=1
    JOIN school_concept_assignments ca ON ca.enrollment_id=cc.enrollment_id
    JOIN school_subprogram_enrollments e ON e.id=cc.enrollment_id
    JOIN school_payment_modalities m ON m.id=e.modality_id AND m.concept_mode=1 AND m.concept_revision=ca.synced_revision
    JOIN school_subprograms sub ON sub.id=e.subprogram_id
    WHERE (? IS NULL OR o.student_email=? COLLATE NOCASE) AND cc.retired=0 AND o.status='pending' AND ${availableSql}
      AND (e.status='active' OR (e.status='suspended' AND e.suspension_reason='overdue'))
    ORDER BY o.due_at,o.id`).bind(email, email).all<ConceptBundleCandidate>()).results;
}

export function groupConceptBundleCandidates(rows: ConceptBundleCandidate[]): ConceptBundleCandidate[][] {
  const groups = new Map<string, ConceptBundleCandidate[]>();
  for (const row of rows) {
    const key = `${row.enrollment_id}\0${row.currency.toLowerCase()}\0${groupKey(row)}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export async function cancelExpiredConceptPayments(db: D1Database, email: string | null): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE school_concept_occurrence_charges SET auto_cancelled=1
      WHERE payment_cutoff IS NOT NULL AND datetime(payment_cutoff)<=datetime('now')
        AND EXISTS (SELECT 1 FROM school_payment_obligations o WHERE o.id=school_concept_occurrence_charges.obligation_id
          AND o.status='pending' AND (? IS NULL OR o.student_email=? COLLATE NOCASE)
          AND o.checkout_bundle_id IS NULL AND o.checkout_lock_token IS NULL AND o.checkout_session_id IS NULL)`)
      .bind(email, email),
    db.prepare(`UPDATE school_payment_obligations
      SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE status='pending' AND (? IS NULL OR student_email=? COLLATE NOCASE)
        AND checkout_bundle_id IS NULL AND checkout_lock_token IS NULL AND checkout_session_id IS NULL
        AND EXISTS (SELECT 1 FROM school_concept_occurrence_charges cc WHERE cc.obligation_id=school_payment_obligations.id
          AND cc.auto_cancelled=1 AND cc.payment_cutoff IS NOT NULL AND datetime(cc.payment_cutoff)<=datetime('now'))`)
      .bind(email, email),
  ]);
}

export async function claimConceptBundle(
  db: D1Database, anchorId: string, email: string, token: string, method: 'stripe' | 'demo',
): Promise<{ id: string; student_email: string; currency: string; amount_cents: number; items: ConceptBundleCandidate[] } | null> {
  await releaseExpiredDemoBundles(db, email);
  await cancelExpiredConceptPayments(db, email);
  const groups = groupConceptBundleCandidates(await listConceptBundleCandidates(db, email));
  const selected = groups.find(group => group.some(item => item.id === anchorId));
  if (!selected?.length || (selected[0].test_mode === 1 && method !== 'demo')) return null;
  const anchor = selected[0];
  const total = selected.reduce((sum, item) => sum + item.amount_cents, 0);
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('El total del grupo de conceptos no es válido.');
  const selectedJson = JSON.stringify(selected);
  const results = await db.batch([
    db.prepare(`INSERT INTO school_payment_bundles
      (id,leader_obligation_id,enrollment_id,student_email,currency,amount_cents,item_count,status,created_at)
      SELECT ?,?,?,?,?,?,?,'pending',strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE EXISTS (SELECT 1 FROM school_subprogram_enrollments e
        JOIN school_payment_modalities m ON m.id=e.modality_id
        JOIN school_concept_assignments ca ON ca.enrollment_id=e.id
        WHERE e.id=? AND (e.status='active' OR (e.status='suspended' AND e.suspension_reason='overdue'))
          AND m.concept_mode=1 AND m.concept_revision=ca.synced_revision AND (?='demo' OR m.test_mode=0))
      AND (SELECT count(*) FROM school_concept_occurrence_charges cc
        JOIN school_payment_concepts c ON c.id=cc.concept_id AND c.active=1
        JOIN school_payment_obligations o ON o.id=cc.obligation_id
        WHERE cc.enrollment_id=? AND cc.retired=0 AND o.student_email=? COLLATE NOCASE AND o.status='pending'
          AND lower(o.currency)=lower(?) AND ${availableSql}
          AND ((? IS NULL AND o.id=?) OR (? IS NOT NULL AND c.group_name=? COLLATE NOCASE)))=json_array_length(?)
      AND NOT EXISTS (SELECT 1 FROM json_each(?) j
        LEFT JOIN school_concept_occurrence_charges cc ON cc.obligation_id=json_extract(j.value,'$.id')
        LEFT JOIN school_payment_concepts c ON c.id=cc.concept_id
        LEFT JOIN school_payment_obligations o ON o.id=cc.obligation_id
        WHERE cc.enrollment_id IS NOT ? OR cc.retired IS NOT 0 OR c.active IS NOT 1 OR o.status IS NOT 'pending'
          OR o.student_email<>? COLLATE NOCASE OR lower(o.currency)<>lower(?)
          OR o.title_snapshot<>json_extract(j.value,'$.title_snapshot')
          OR o.amount_cents<>json_extract(j.value,'$.amount_cents') OR o.due_at<>json_extract(j.value,'$.due_at')
          OR NOT ${availableSql}
          OR NOT ((? IS NULL AND o.id=?) OR (? IS NOT NULL AND c.group_name=? COLLATE NOCASE))
          OR o.checkout_bundle_id IS NOT NULL OR o.checkout_lock_token IS NOT NULL OR o.checkout_session_id IS NOT NULL)`)
      .bind(token, anchor.id, anchor.enrollment_id, email, anchor.currency.toLowerCase(), total, selected.length,
        anchor.enrollment_id, method, anchor.enrollment_id, email, anchor.currency,
        anchor.group_name, anchor.id, anchor.group_name, anchor.group_name, selectedJson, selectedJson,
        anchor.enrollment_id, email, anchor.currency,
        anchor.group_name, anchor.id, anchor.group_name, anchor.group_name),
    db.prepare(`UPDATE school_payment_obligations SET checkout_bundle_id=?,checkout_lock_token=?,
      checkout_locked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),checkout_session_id=NULL,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?))
        AND EXISTS (SELECT 1 FROM school_payment_bundles WHERE id=? AND status='pending')`)
      .bind(token, token, selectedJson, token),
    db.prepare(`INSERT INTO school_payment_bundle_items(bundle_id,obligation_id,title_snapshot,amount_cents,currency,due_at)
      SELECT ?,o.id,o.title_snapshot,o.amount_cents,o.currency,o.due_at
      FROM school_payment_obligations o WHERE o.checkout_bundle_id=? AND o.checkout_lock_token=?`)
      .bind(token, token, token),
  ]);
  if (!results[0].meta.changes) return null;
  if (results[1].meta.changes !== selected.length || results[2].meta.changes !== selected.length) {
    throw new Error(`El grupo de conceptos ${token} no pudo bloquear todos sus cargos.`);
  }
  return { id: anchor.id, student_email: email, currency: anchor.currency, amount_cents: total, items: selected };
}
