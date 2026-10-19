CREATE TABLE customer_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id TEXT NOT NULL,
    subscription_key TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'cancelled', 'expired')),

    starts_at TEXT NOT NULL,
    expires_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_subscriptions_lookup
ON customer_subscriptions (
    customer_id,
    subscription_key,
    status
);