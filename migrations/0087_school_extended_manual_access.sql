CREATE TABLE school_extended_manual_access (
  client_number TEXT NOT NULL REFERENCES customer_accounts(client_number) ON DELETE RESTRICT,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('conference')),
  resource_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
  expires_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (client_number, resource_type, resource_id)
);
