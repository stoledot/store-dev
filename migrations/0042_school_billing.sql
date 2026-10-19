-- MinShop Escuela Virtual: vínculo con Stripe y deduplicación de webhooks
-- IMPORTANTE: plantilla propuesta. Renombra al siguiente número libre de MinShop
-- y aplícala DESPUÉS de school_catalog.sql y school_progress.sql.
-- MinShop actualmente tiene checkout para pedidos; esta tabla NO implementa por sí
-- sola suscripciones recurrentes. Se necesita código de checkout Subscription + webhooks.

CREATE TABLE IF NOT EXISTS school_subscriptions (
  id TEXT PRIMARY KEY,
  student_email TEXT NOT NULL COLLATE NOCASE,
  provider TEXT NOT NULL DEFAULT 'stripe' CHECK (provider = 'stripe'),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'mxn' CHECK (length(currency) = 3),
  unit_amount_minor INTEGER NOT NULL CHECK (unit_amount_minor >= 0),
  interval_unit TEXT NOT NULL DEFAULT 'month'
    CHECK (interval_unit IN ('month', 'year')),
  interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count >= 1),
  status TEXT NOT NULL
    CHECK (status IN (
      'incomplete', 'trialing', 'active', 'past_due',
      'unpaid', 'canceled', 'incomplete_expired', 'paused'
    )),
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0
    CHECK (cancel_at_period_end IN (0, 1)),
  canceled_at TEXT,
  ended_at TEXT,
  last_invoice_id TEXT,
  last_payment_status TEXT,
  last_event_created INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_school_subscriptions_student_status
  ON school_subscriptions(student_email, status);

CREATE INDEX IF NOT EXISTS idx_school_subscriptions_period_end
  ON school_subscriptions(status, current_period_end);

CREATE INDEX IF NOT EXISTS idx_school_subscriptions_customer
  ON school_subscriptions(stripe_customer_id);

CREATE TABLE IF NOT EXISTS school_stripe_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_created INTEGER,
  stripe_object_id TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'failed', 'ignored')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_school_stripe_events_status_received
  ON school_stripe_events(processing_status, received_at);

-- La autorización debe definirse en servidor: dar acceso solo si la suscripción
-- está vigente según la política de negocio. No confíes en una redirección de
-- checkout ni en el estado enviado por el navegador. Verifica la firma de Stripe,
-- procesa eventos idempotentemente y contempla eventos duplicados/fuera de orden.
