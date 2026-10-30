import type { D1Database } from '@cloudflare/workers-types';

export interface CustomerProfile {
  email: string; full_name: string; age: number | null; education_level: string; institution: string;
  academic_interests: string; academic_goals: string; profile_locked: number; payment_status: string;
  next_payment_at: string | null; payment_notes: string; admin_notes: string;
  created_at: string; updated_at: string;
}
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const cleanText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export async function getProfile(db: D1Database, email: string): Promise<CustomerProfile | null> {
  return db.prepare('SELECT * FROM customer_profiles WHERE email = ? COLLATE NOCASE').bind(normalizeEmail(email)).first<CustomerProfile>();
}
export async function ensureProfile(db: D1Database, email: string): Promise<void> {
  await db.prepare('INSERT INTO customer_profiles(email) VALUES (?) ON CONFLICT(email) DO NOTHING').bind(normalizeEmail(email)).run();
}
export async function listCustomerProfiles(db: D1Database, query = '') {
  const q = `%${query.trim().slice(0,100)}%`;
  const { results } = await db.prepare(`
    SELECT e.email, COALESCE(p.full_name,'') AS full_name, COALESCE(p.payment_status,'unknown') AS payment_status,
           p.next_payment_at, COALESCE(p.profile_locked,0) AS profile_locked,
           COUNT(o.id) AS orders, COALESCE(SUM(o.amount_total_cents-o.refunded_cents),0) AS lifetime_cents,
           MAX(o.created_at) AS last_order
      FROM (SELECT email FROM orders WHERE email IS NOT NULL AND email != ''
            UNION SELECT email FROM customer_profiles) e
      LEFT JOIN customer_profiles p ON p.email=e.email COLLATE NOCASE
      LEFT JOIN orders o ON o.email=e.email COLLATE NOCASE
     WHERE (?='' OR e.email LIKE ? OR p.full_name LIKE ?)
     GROUP BY e.email,p.full_name,p.payment_status,p.next_payment_at,p.profile_locked
     ORDER BY COALESCE(p.full_name,e.email) COLLATE NOCASE LIMIT 200
  `).bind(query.trim(), q, q).all();
  return results ?? [];
}
export async function emailAlreadyUsed(db: D1Database, email: string, exceptEmail = ''): Promise<boolean> {
  const target = normalizeEmail(email), except = normalizeEmail(exceptEmail);
  const row = await db.prepare(`
    SELECT 1 AS found FROM customer_profiles WHERE email=? COLLATE NOCASE AND email<>? COLLATE NOCASE
    UNION ALL SELECT 1 FROM customer_email_aliases WHERE old_email=? COLLATE NOCASE OR current_email=? COLLATE NOCASE
    UNION ALL SELECT 1 FROM orders WHERE email=? COLLATE NOCASE AND email<>? COLLATE NOCASE
    UNION ALL SELECT 1 FROM school_course_progress WHERE student_email=? COLLATE NOCASE
    UNION ALL SELECT 1 FROM school_student_intake WHERE student_email=? COLLATE NOCASE
    UNION ALL SELECT 1 FROM school_course_assignments WHERE student_email=? COLLATE NOCASE
    UNION ALL SELECT 1 FROM school_fee_payments WHERE student_email=? COLLATE NOCASE
    UNION ALL SELECT 1 FROM school_subscriptions WHERE student_email=? COLLATE NOCASE
    LIMIT 1
  `).bind(target, except, target, target, target, except, target, target, target, target, target).first<{found:number}>();
  return !!row;
}
