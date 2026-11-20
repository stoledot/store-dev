CREATE TABLE IF NOT EXISTS school_lecturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(255) NOT NULL,
    id_from_xml VARCHAR(255) NOT NULL,
    content_xml TEXT NOT NULL,
    content_html TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_school_lecturas_id_from_xml ON school_lecturas (id_from_xml);

CREATE TABLE IF NOT EXISTS school_lecturas_customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_lectura_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CONSTRAINT fk_school_lectura FOREIGN KEY (school_lectura_id) REFERENCES school_lecturas(id),
    CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_school_lecturas_customers_school_lectura_id ON school_lecturas_customers (school_lectura_id);
CREATE INDEX IF NOT EXISTS idx_school_lecturas_customers_customer_id ON school_lecturas_customers (customer_id);


