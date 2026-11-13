ALTER TABLE school_programs
ADD COLUMN image_url TEXT NOT NULL DEFAULT '';

CREATE TABLE school_subprograms (
  id TEXT PRIMARY KEY,
  program_slug TEXT NOT NULL
    REFERENCES school_programs(slug) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  education_level TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT '',
  methodology TEXT NOT NULL DEFAULT '',
  terms_md TEXT NOT NULL DEFAULT '',
  policies_md TEXT NOT NULL DEFAULT '',
  duration_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (program_slug, slug)
);

-- Un curso puede pertenecer a varios subprogramas.
CREATE TABLE school_subprogram_courses (
  subprogram_id TEXT NOT NULL
    REFERENCES school_subprograms(id) ON DELETE RESTRICT,
  course_id TEXT NOT NULL
    REFERENCES school_courses(id) ON DELETE RESTRICT,
  PRIMARY KEY (subprogram_id, course_id)
);

CREATE TABLE school_payment_modalities (
  id TEXT PRIMARY KEY,
  subprogram_id TEXT NOT NULL
    REFERENCES school_subprograms(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,

  -- El producto privado existente aporta nombre, importe y moneda.
  payment_product_id TEXT NOT NULL
    REFERENCES school_payment_products(id) ON DELETE RESTRICT,

  payment_type TEXT NOT NULL
    CHECK (payment_type IN ('enrollment', 'classes', 'other')),

  -- Frecuencia con que corresponde generar el cobro.
  frequency_unit TEXT NOT NULL
    CHECK (frequency_unit IN ('once', 'week', 'month', 'year')),
  frequency_count INTEGER NOT NULL DEFAULT 1
    CHECK (frequency_count >= 1),

  -- NULL significa que no hay límite de clases.
  classes_per_payment INTEGER
    CHECK (classes_per_payment IS NULL OR classes_per_payment > 0),

  -- NULL cubre los cursos del subprograma; si se indica un curso,
  -- debe estar vinculado a ese subprograma.
  course_id TEXT,

  -- NULL/NULL significa vigencia sin fecha de caducidad.
  validity_count INTEGER,
  validity_unit TEXT,
  requires_current_enrollment INTEGER NOT NULL DEFAULT 0
    CHECK (requires_current_enrollment IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (subprogram_id, course_id)
    REFERENCES school_subprogram_courses(subprogram_id, course_id)
    ON DELETE RESTRICT,
  CHECK (frequency_unit <> 'once' OR frequency_count = 1),
  CHECK (
    (validity_count IS NULL AND validity_unit IS NULL)
    OR
    (validity_count IS NOT NULL AND validity_count > 0
      AND validity_unit IS NOT NULL
      AND validity_unit IN ('day', 'week', 'month', 'year'))
  ),
  CHECK (payment_type <> 'enrollment' OR requires_current_enrollment = 0)
);

CREATE INDEX idx_subprograms_program
  ON school_subprograms(program_slug, status);

CREATE INDEX idx_modalities_subprogram
  ON school_payment_modalities(subprogram_id, status);

CREATE INDEX idx_modalities_product
  ON school_payment_modalities(payment_product_id);