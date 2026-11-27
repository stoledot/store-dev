-- Elimina el índice anterior si ya existe en tu base de datos:
DROP INDEX IF EXISTS idx_temas_planes_estudio_plan;

-- Crea el índice único (sirve para búsqueda por plan y evita temas repetidos en el mismo plan):
CREATE UNIQUE INDEX IF NOT EXISTS uq_temas_plan_tema 
ON temas_planes_estudio_customers_lecturas(planes_estudio_customer_lectura_id, id_html_tema_lectura);
