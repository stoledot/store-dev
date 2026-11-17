CREATE TABLE IF NOT EXISTS products_lecturas (
  product_id INT NOT NULL,
  lectura_id INT NOT NULL,
  PRIMARY KEY (product_id, lectura_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (lectura_id) REFERENCES school_lecturas(id) ON DELETE CASCADE
);


