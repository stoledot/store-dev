
import type { D1Database } from '@cloudflare/workers-types';
import type { Order } from '../orders/db';

export interface CustomerSummary {
  email: string;
  orders: number;
  lifetime_cents: number;
  last_order: string | null;
  full_name?: string;
  payment_status?: string;
  next_payment_at?: string | null;
  profile_locked?: number;
}

interface EmailRow {
  email: string;
}

interface ProfileRow {
  email: string;
  full_name: string;
  payment_status: string;
  next_payment_at: string | null;
  profile_locked: number;
}

interface OrderSummaryRow {
  email: string;
  orders: number;
  lifetime_cents: number;
  last_order: string | null;
}

const EMAIL_QUERIES = [
  `SELECT lower(email) AS email
   FROM orders
   WHERE email IS NOT NULL AND trim(email) != ''`,

  `SELECT lower(email) AS email
   FROM customer_profiles
   WHERE email IS NOT NULL AND trim(email) != ''`,

  `SELECT lower(student_email) AS email
   FROM school_student_intake
   WHERE student_email IS NOT NULL AND trim(student_email) != ''`,

  `SELECT lower(student_email) AS email
   FROM school_course_progress
   WHERE student_email IS NOT NULL AND trim(student_email) != ''`,

  `SELECT lower(student_email) AS email
   FROM school_course_assignments
   WHERE student_email IS NOT NULL AND trim(student_email) != ''`,

  `SELECT lower(student_email) AS email
   FROM school_fee_payments
   WHERE student_email IS NOT NULL AND trim(student_email) != ''`,

  `SELECT lower(student_email) AS email
   FROM school_subscriptions
   WHERE student_email IS NOT NULL AND trim(student_email) != ''`,
];

/**
 * Obtiene los correos de todas las fuentes sin utilizar UNION.
 * Los correos repetidos se eliminan en TypeScript.
 */
async function getCustomerEmails(
  db: D1Database,
): Promise<string[]> {
  const queryResults = await Promise.all(
    EMAIL_QUERIES.map((sql) =>
      db.prepare(sql).all<EmailRow>(),
    ),
  );

  const emails = new Set<string>();

  for (const result of queryResults) {
    for (const row of result.results ?? []) {
      const email = row.email?.trim().toLowerCase();

      if (email) {
        emails.add(email);
      }
    }
  }

  return [...emails];
}

/**
 * Cuenta los clientes únicos de todas las tablas.
 */
export async function countCustomers(
  db: D1Database,
): Promise<number> {
  const emails = await getCustomerEmails(db);

  return emails.length;
}

/**
 * Lista clientes, calcula sus pedidos y gastos,
 * ordena los resultados y aplica la paginación.
 */
export async function listCustomers(
  db: D1Database,
  orderBy = 'lifetime_cents DESC',
  limit = 50,
  offset = 0,
): Promise<CustomerSummary[]> {
  const [
    emails,
    profilesResult,
    ordersResult,
  ] = await Promise.all([
    getCustomerEmails(db),

    db.prepare(`
      SELECT
        lower(email) AS email,
        COALESCE(full_name, '') AS full_name,
        COALESCE(payment_status, 'unknown') AS payment_status,
        next_payment_at,
        COALESCE(profile_locked, 0) AS profile_locked
      FROM customer_profiles
      WHERE email IS NOT NULL AND trim(email) != ''
    `).all<ProfileRow>(),

    db.prepare(`
      SELECT
        lower(email) AS email,
        COUNT(id) AS orders,
        COALESCE(
          SUM(
            COALESCE(amount_total_cents, 0)
            - COALESCE(refunded_cents, 0)
          ),
          0
        ) AS lifetime_cents,
        MAX(created_at) AS last_order
      FROM orders
      WHERE email IS NOT NULL AND trim(email) != ''
      GROUP BY lower(email)
    `).all<OrderSummaryRow>(),
  ]);

  const profiles = new Map<string, ProfileRow>();
  const orderSummaries = new Map<string, OrderSummaryRow>();

  for (const profile of profilesResult.results ?? []) {
    profiles.set(profile.email.toLowerCase(), profile);
  }

  for (const summary of ordersResult.results ?? []) {
    orderSummaries.set(summary.email.toLowerCase(), summary);
  }

  const customers: CustomerSummary[] = emails.map((email) => {
    const profile = profiles.get(email);
    const orderSummary = orderSummaries.get(email);

    return {
      email,
      full_name: profile?.full_name ?? '',
      payment_status: profile?.payment_status ?? 'unknown',
      next_payment_at: profile?.next_payment_at ?? null,
      profile_locked: profile?.profile_locked ?? 0,
      orders: orderSummary?.orders ?? 0,
      lifetime_cents: orderSummary?.lifetime_cents ?? 0,
      last_order: orderSummary?.last_order ?? null,
    };
  });

  // Solo se admiten columnas conocidas para ordenar.
  const allowedColumns = new Set([
    'email',
    'orders',
    'lifetime_cents',
    'last_order',
  ]);

  const terms = orderBy
    .split(',')
    .map((term) => {
      const [column, direction] = term.trim().split(/\s+/);

      if (!allowedColumns.has(column)) {
        return null;
      }

      return {
        column,
        direction: direction?.toUpperCase() === 'ASC' ? 1 : -1,
      };
    })
    .filter(
      (
        term,
      ): term is {
        column: string;
        direction: number;
      } => term !== null,
    );

  if (terms.length === 0) {
    terms.push({
      column: 'lifetime_cents',
      direction: -1,
    });
  }

  customers.sort((a, b) => {
    for (const term of terms) {
      const left = a[term.column as keyof CustomerSummary];
      const right = b[term.column as keyof CustomerSummary];

      let comparison = 0;

      if (left == null && right != null) {
        comparison = -1;
      } else if (left != null && right == null) {
        comparison = 1;
      } else if (typeof left === 'number' && typeof right === 'number') {
        comparison = left - right;
      } else {
        comparison = String(left ?? '').localeCompare(
          String(right ?? ''),
          'es',
          { sensitivity: 'base' },
        );
      }

      if (comparison !== 0) {
        return comparison * term.direction;
      }
    }

    return a.email.localeCompare(b.email);
  });

  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(0, Math.floor(limit));

  return customers.slice(safeOffset, safeOffset + safeLimit);
}

/**
 * Obtiene el resumen individual de un cliente.
 */
export async function getCustomerSummary(
  db: D1Database,
  email: string,
): Promise<CustomerSummary | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const profile = await db.prepare(`
    SELECT
      lower(p.email) AS email,
      COALESCE(p.full_name, '') AS full_name,
      COALESCE(p.payment_status, 'unknown') AS payment_status,
      p.next_payment_at,
      COALESCE(p.profile_locked, 0) AS profile_locked,
      COUNT(o.id) AS orders,
      COALESCE(
        SUM(
          COALESCE(o.amount_total_cents, 0)
          - COALESCE(o.refunded_cents, 0)
        ),
        0
      ) AS lifetime_cents,
      MAX(o.created_at) AS last_order
    FROM customer_profiles p
    LEFT JOIN orders o
      ON lower(o.email) = lower(p.email)
    WHERE lower(p.email) = ?
    GROUP BY
      p.email,
      p.full_name,
      p.payment_status,
      p.next_payment_at,
      p.profile_locked
  `)
    .bind(normalizedEmail)
    .first<CustomerSummary>();

  if (profile) {
    return profile;
  }

  const orderSummary = await db.prepare(`
    SELECT
      lower(email) AS email,
      '' AS full_name,
      'unknown' AS payment_status,
      NULL AS next_payment_at,
      0 AS profile_locked,
      COUNT(id) AS orders,
      COALESCE(
        SUM(
          COALESCE(amount_total_cents, 0)
          - COALESCE(refunded_cents, 0)
        ),
        0
      ) AS lifetime_cents,
      MAX(created_at) AS last_order
    FROM orders
    WHERE lower(email) = ?
    GROUP BY lower(email)
  `)
    .bind(normalizedEmail)
    .first<CustomerSummary>();

  return orderSummary ?? null;
}

/**
 * Obtiene los pedidos de un cliente.
 */
export async function getCustomerOrders(
  db: D1Database,
  email: string,
  limit = 50,
  offset = 0,
): Promise<Order[]> {
  const { results } = await db.prepare(`
    SELECT *
    FROM orders
    WHERE lower(email) = lower(?)
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `)
    .bind(
      email,
      Math.max(0, Math.floor(limit)),
      Math.max(0, Math.floor(offset)),
    )
    .all<Order>();

  return results ?? [];
}
