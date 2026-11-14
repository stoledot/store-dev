CREATE TABLE school_manual_access_payment (
  client_number TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type='group'),
  resource_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL REFERENCES school_payment_obligations(id) ON DELETE RESTRICT,
  PRIMARY KEY (client_number, resource_type, resource_id),
  FOREIGN KEY (client_number, resource_type, resource_id)
    REFERENCES school_manual_access(client_number, resource_type, resource_id) ON DELETE CASCADE
);
