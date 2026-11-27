CREATE TABLE IF NOT EXISTS planes_estudio_customers_lecturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  customer_id INTEGER NOT NULL,
  school_lectura_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (school_lectura_id) REFERENCES school_lecturas(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS temas_planes_estudio_customers_lecturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planes_estudio_customer_lectura_id INTEGER NOT NULL,
  id_html_tema_lectura TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (planes_estudio_customer_lectura_id) REFERENCES planes_estudio_customers_lecturas(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_planes_estudio_customer_lectura ON planes_estudio_customers_lecturas(customer_id, school_lectura_id);
CREATE INDEX IF NOT EXISTS idx_temas_planes_estudio_plan ON temas_planes_estudio_customers_lecturas(planes_estudio_customer_lectura_id);

