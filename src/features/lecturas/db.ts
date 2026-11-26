//src/features/lecturas/db.ts - Database access functions for lecturas and related entities
import type {D1Database} from '@cloudflare/workers-types';
import type { Lectura } from './types';

export const createLectura = async (
  db: D1Database,
  lectura: Omit<Lectura, 'id' | 'created_at' | 'updated_at'>
): Promise<Lectura> => {
  const newLectura = await db
    .prepare(
      'INSERT INTO school_lecturas (title, id_from_xml, content_xml, content_html, image_url, type, description) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
    )
    .bind(lectura.title, lectura.id_from_xml, lectura.content_xml, lectura.content_html, lectura.image_url, lectura.type, lectura.description)
    .first<Lectura>();

  if (!newLectura) {
    throw new Error('No se pudo crear la lectura');
  }

  return newLectura;
};

export const updateLectura = async (
  db: D1Database,
  id: number,
  lectura: Partial<Omit<Lectura, 'id' | 'created_at' | 'updated_at'>>
): Promise<Lectura | null> => {
  const updatedLectura = await db
    .prepare(
      'UPDATE school_lecturas SET title = ?, id_from_xml = ?, content_xml = ?, content_html = ?, image_url = ?, type = ?, description = ?, updated_at = ? WHERE id = ? RETURNING *'
    )
    .bind(
      lectura.title ?? null,
      lectura.id_from_xml ?? null,
      lectura.content_xml ?? null,
      lectura.content_html ?? null,
      lectura.image_url ?? null,
      lectura.type ?? null,
      lectura.description ?? null,
      new Date().toISOString(),
      id
    )
    .first<Lectura>();

  return updatedLectura ?? null;
};

export const getLecturaByIdFromXml = async (
  db: D1Database,
  id_from_xml: string
): Promise<Lectura | null> => {
  const lectura = await db
    .prepare('SELECT * FROM school_lecturas WHERE id_from_xml = ?')
    .bind(id_from_xml)
    .first<Lectura>();

  return lectura ?? null;
};

export const getLecturaById = async (
  db: D1Database,
  id: number
): Promise<Lectura | null> => {
  const lectura = await db
    .prepare('SELECT * FROM school_lecturas WHERE id = ?')
    .bind(id)
    .first<Lectura>();

  return lectura ?? null;
};

export const getAllLecturas = async (
  db: D1Database
): Promise<Lectura[]> => {
  const lecturas = await db
    .prepare('SELECT * FROM school_lecturas')
    .all<Lectura>();

  return lecturas.results ?? [];
};

export const deleteLecturaById = async (
  db: D1Database,
  id: number
): Promise<boolean> => {
  const result = await db
    .prepare('DELETE FROM school_lecturas WHERE id = ?')
    .bind(id)
    .run();

  return result.success ?? false;
};

export const getLecturasByCustomerId = async (
  db: D1Database,
  customer_id: number
): Promise<Lectura[]> => {
  const lecturas = await db
    .prepare(
      'SELECT l.* FROM school_lecturas l ' +
      'INNER JOIN school_lecturas_customers slc ' +
      'ON l.id = slc.school_lectura_id WHERE slc.customer_id = ?'
    )
    .bind(customer_id)
    .all<Lectura>();

  return lecturas.results ?? [];
};

export const getLecturasBySchoolLecturaId = async (
  db: D1Database,
  school_lectura_id: number
): Promise<Lectura[]> => {
  const lecturas = await db
    .prepare(
      'SELECT l.* FROM school_lecturas l INNER JOIN school_lecturas_customers slc ON l.id = slc.school_lectura_id WHERE slc.school_lectura_id = ?'
    )
    .bind(school_lectura_id)
    .all<Lectura>();

  return lecturas.results ?? [];
};

export const getLecturasByCustomerIdAndSchoolLecturaId = async (
  db: D1Database,
  customer_id: number,
  school_lectura_id: number
): Promise<Lectura[]> => {
  const lecturas = await db
    .prepare(
      'SELECT l.* FROM school_lecturas l INNER JOIN school_lecturas_customers slc ON l.id = slc.school_lectura_id WHERE slc.customer_id = ? AND slc.school_lectura_id = ?'
    )
    .bind(customer_id, school_lectura_id)
    .all<Lectura>();

  return lecturas.results ?? [];
};

export const insertLecturaCustomer = async (
  db: D1Database,
  school_lectura_id: number,
  customer_id: number
): Promise<boolean> => {
  const result = await db
    .prepare(
      'INSERT INTO school_lecturas_customers (school_lectura_id, customer_id, created_at, updated_at) VALUES (?, ?, ?, ?)'
    )
    .bind(school_lectura_id, customer_id, new Date().toISOString(), new Date().toISOString())
    .run();

  return result.success ?? false;
};

export const deleteLecturaCustomer = async (
  db: D1Database,
  school_lectura_id: number,
  customer_id: number
): Promise<boolean> => {
  const result = await db
    .prepare(
      'DELETE FROM school_lecturas_customers WHERE school_lectura_id = ? AND customer_id = ?'
    )
    .bind(school_lectura_id, customer_id)
    .run();

  return result.success ?? false;
};


export const insertProductLectura = async (
  db: D1Database,
  product_id: number,
  lectura_id: number
): Promise<boolean> => {
  const result = await db
    .prepare(
      'INSERT INTO products_lecturas (product_id, lectura_id) VALUES (?, ?)'
    )
    .bind(product_id, lectura_id)
    .run();

  return result.success ?? false;
};

export const deleteProductLectura = async (
  db: D1Database,
  product_id: number,
  lectura_id: number
): Promise<boolean> => {
  const result = await db
    .prepare(
      'DELETE FROM products_lecturas WHERE product_id = ? AND lectura_id = ?'
    )
    .bind(product_id, lectura_id)
    .run();

  return result.success ?? false;
};

export const getAllProductLecturas = async (
  db: D1Database
): Promise<{ p_name: string; l_title: string; product_id: number; lectura_id: number }[]> => {
  const result = await db
    .prepare(
      'SELECT p.name AS p_name, l.title AS l_title, pl.product_id, pl.lectura_id FROM products_lecturas pl ' +
      'LEFT JOIN school_lecturas l ON pl.lectura_id = l.id ' +
      'LEFT JOIN products p ON pl.product_id = p.id '
    )
    .all<{ p_name: string; l_title: string; product_id: number; lectura_id: number }>();

  return result.results ?? [];
};

export const getProductLecturasByProductId = async (
  db: D1Database,
  product_id: number
): Promise<{ p_name: string; l_title: string; product_id: number; lectura_id: number }[]> => {
  const result = await db
    .prepare(
      'SELECT p.name AS p_name, l.title AS l_title, pl.product_id, pl.lectura_id FROM products_lecturas pl ' +
      'LEFT JOIN school_lecturas l ON pl.lectura_id = l.id ' +
      'LEFT JOIN products p ON pl.product_id = p.id ' +
      'WHERE pl.product_id = ?'
    )
    .bind(product_id)
    .all<{ p_name: string; l_title: string; product_id: number; lectura_id: number }>();

  return result.results ?? [];
};

export const getProductLecturasByProductIds = async (
  db: D1Database,
  product_ids: number[]
): Promise<{ p_name: string; l_title: string; product_id: number; lectura_id: number }[]> => {
  if (product_ids.length === 0) return [];
  const placeholders = product_ids.map(() => '?').join(',');
  const result = await db
    .prepare(
      'SELECT p.name AS p_name, l.title AS l_title, pl.product_id, pl.lectura_id FROM products_lecturas pl ' +
      'LEFT JOIN school_lecturas l ON pl.lectura_id = l.id ' +
      'LEFT JOIN products p ON pl.product_id = p.id ' +
      `WHERE pl.product_id IN (${placeholders})`
    )
    .bind(...product_ids)
    .all<{ p_name: string; l_title: string; product_id: number; lectura_id: number }>();

  return result.results ?? [];
};


export const setLecturasCustomerByLecturaIdsCustomerId = async (
  db: D1Database,
  lectura_ids: number[],
  customer_id: number
): Promise<boolean> => {
  if (lectura_ids.length === 0) return false;

  const result = await db.prepare(
    "INSERT INTO school_lecturas_customers (school_lectura_id, customer_id) VALUES " +
    lectura_ids.map(() => "(?, ?)").join(", ")
  )
  .bind(...lectura_ids.flatMap(id => [id, customer_id]))
  .run();
  if (!result.success) return false;
  return true;
};

export const getLecturasCustomerByCustomerId = async (
  db: D1Database,
  customer_id: number
): Promise<{ l_title: string; l_image_url: string; l_type: string; l_description: string; school_lectura_id: number; customer_id: number }[]> => {
  const result = await db
    .prepare(
      'SELECT l.title as l_title, l.image_url as l_image_url, l.type as l_type, l.description as l_description, school_lectura_id, customer_id FROM school_lecturas_customers slc ' +
      'LEFT JOIN school_lecturas l ON slc.school_lectura_id = l.id ' +
      'WHERE slc.customer_id = ?'
    )
    .bind(customer_id)
    .all<{ l_title: string; l_image_url: string; l_type: string; l_description: string; school_lectura_id: number; customer_id: number }>();

  return result.results ?? [];
};

//src/features/lecturas/db.ts - Database access functions for lecturas and related entities

/**
 * MIGRACIÓN CORRESPONDIENTE A LAS TABLAS planes_estudio_customers_lecturas Y temas_planes_estudio_customers_lecturas
 * 
 * CREATE TABLE IF NOT EXISTS planes_estudio_customers_lecturas (
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
 * 
 */

export const createPlanesEstudioCustomersLecturas = async (
  db: D1Database,
  name: string,
  description: string,
  customer_id: number,
  school_lectura_id: number
): Promise<boolean> => {
  const result = await db.prepare(
    "INSERT INTO planes_estudio_customers_lecturas (name, description, customer_id, school_lectura_id) VALUES (?, ?, ?, ?)"
  )
  .bind(name, description, customer_id, school_lectura_id)
  .run();
  if (!result.success) return false;
  return true;
};

export const setTemasPlanesEstudioCustomersLecturas = async (
  db: D1Database,
  planes_estudio_customer_lectura_id: number,
  id_html_tema_lectura: string,
  is_completed: boolean = false
): Promise<boolean> => {
  const result = await db.prepare(
    "INSERT INTO temas_planes_estudio_customers_lecturas (planes_estudio_customer_lectura_id, id_html_tema_lectura, is_completed) VALUES (?, ?, ?)"
  )
  .bind(planes_estudio_customer_lectura_id, id_html_tema_lectura, is_completed ? 1 : 0)
  .run();
  if (!result.success) return false;
  return true;
};

export const getPlanesEstudioCustomersLecturasByCustomerId = async (
  db: D1Database,
  customer_id: number
): Promise<Array<{ id: number; name: string; description: string; customer_id: number; school_lectura_id: number }>> => {
  const result = await db.prepare(
    "SELECT id, name, description, customer_id, school_lectura_id FROM planes_estudio_customers_lecturas WHERE customer_id = ?"
  )
  .bind(customer_id)
  .all<{ id: number; name: string; description: string; customer_id: number; school_lectura_id: number }>();
  return result.results ?? [];
};

export const getPlanesEstudioConTemasLecturasByCustomerId = async (
  db: D1Database,
  customer_id: number
): Promise<Array<{ id: number; name: string; description: string; customer_id: number; school_lectura_id: number; created: string; updated: string; temas: Array<{ id_html_tema_lectura: string; is_completed: boolean }> }>> => {
  const result = await db.prepare(
    `SELECT p.id, p.name, p.description, p.customer_id, p.school_lectura_id, p.created_at, p.updated_at, t.id_html_tema_lectura, t.is_completed
     FROM planes_estudio_customers_lecturas p
     LEFT JOIN temas_planes_estudio_customers_lecturas t ON p.id = t.planes_estudio_customer_lectura_id
     WHERE p.customer_id = ?`
  )
  .bind(customer_id)
  .all<{ id: number; name: string; description: string; customer_id: number; school_lectura_id: number; created_at: string; updated_at: string; id_html_tema_lectura: string; is_completed: boolean }>();

  const planesMap: Record<number, { id: number; name: string; description: string; customer_id: number; school_lectura_id: number; created: string; updated: string; temas: Array<{ id_html_tema_lectura: string; is_completed: boolean }> }> = {};
  for (const row of result.results ?? []) {
    if (!planesMap[row.id]) {
      planesMap[row.id] = { id: row.id, name: row.name, description: row.description, customer_id: row.customer_id, school_lectura_id: row.school_lectura_id, created: row.created_at, updated: row.updated_at, temas: [] };
    }
    if (row.id_html_tema_lectura) {
      planesMap[row.id].temas.push({ id_html_tema_lectura: row.id_html_tema_lectura, is_completed: row.is_completed });
    }
  }
  return Object.values(planesMap);
};

export const getPlanEstudioConTemasLecturasByPlanId = async (
  db: D1Database,
  plan_id: number
): Promise < { id: number; name: string; description: string; customer_id: number; school_lectura_id: number; created: string; updated: string; temas: Array<{ id_html_tema_lectura: string; is_completed: boolean }> } > => {
  const result = await db.prepare(
    `SELECT p.id, p.name, p.description, p.customer_id, p.school_lectura_id, p.created_at, p.updated_at, t.id_html_tema_lectura, t.is_completed
     FROM planes_estudio_customers_lecturas p
     LEFT JOIN temas_planes_estudio_customers_lecturas t ON p.id = t.planes_estudio_customer_lectura_id
     WHERE p.id = ?`
  )
  .bind(plan_id)
  .all<{ id: number; name: string; description: string; customer_id: number; school_lectura_id: number; created_at: string; updated_at: string; id_html_tema_lectura: string; is_completed: boolean }>();

  const planesMap: Record<number, { id: number; name: string; description: string; customer_id: number; school_lectura_id: number; created: string; updated: string; temas: Array<{ id_html_tema_lectura: string; is_completed: boolean }> }> = {};
  for (const row of result.results ?? []) {
    if (!planesMap[row.id]) {
      planesMap[row.id] = { id: row.id, name: row.name, description: row.description, customer_id: row.customer_id, school_lectura_id: row.school_lectura_id, created: row.created_at, updated: row.updated_at, temas: [] };
    }
    if (row.id_html_tema_lectura) {
      planesMap[row.id].temas.push({ id_html_tema_lectura: row.id_html_tema_lectura, is_completed: row.is_completed });
    }
  }
  return Object.values(planesMap)[0];
};


export const setTemasPlanesEstudioCustomersLecturasCompletion = async (
  db: D1Database,
  planes_estudio_customer_lectura_id: number,
  id_html_tema_lectura: string,
  is_completed: boolean
): Promise<boolean> => {
  const result = await db.prepare(
    "UPDATE temas_planes_estudio_customers_lecturas SET is_completed = ? WHERE planes_estudio_customer_lectura_id = ? AND id_html_tema_lectura = ?"
  )
  .bind(is_completed ? 1 : 0, planes_estudio_customer_lectura_id, id_html_tema_lectura)
  .run();
  if (!result.success) return false;
  return true;
};

export const createTemasPlanesEstudioCustomersLecturas = async (
  db: D1Database,
  planes_estudio_customer_lectura_id: number,
  id_html_tema_lectura: string,
  is_completed: boolean = false
): Promise<boolean> => {
  const result = await db.prepare(
    "INSERT INTO temas_planes_estudio_customers_lecturas (planes_estudio_customer_lectura_id, id_html_tema_lectura, is_completed) VALUES (?, ?, ?)"
  )
  .bind(planes_estudio_customer_lectura_id, id_html_tema_lectura, is_completed ? 1 : 0)
  .run();
  if (!result.success) return false;
  return true;
};

/**
 * 
 * formCrear?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!btnCrear) return;

    const formData = new FormData(formCrear);
    const name = String(formData.get('name') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const temasSeleccionados = Array.from(
      formCrear.querySelectorAll<HTMLInputElement>('input[name="nuevos_temas"]:checked')
    ).map(cb => cb.value);

    if (!name) return;

    const textoOriginal = btnCrear.textContent;
    btnCrear.disabled = true;
    btnCrear.textContent = 'Creando...';
    if (feedbackCrear) feedbackCrear.textContent = '';

    try {
      // --- AQUÍ VA TU ENDPOINT REAL PARA CREAR ---
      const response = await fetch('/api/planes/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: Number(customerId),
          lecturaId: Number(lecturaId),
          name,
          description,
          temas: temasSeleccionados
        })
      });

 */

export const crearTemasPlanesEstudioCustomersLecturasByListTemas = async (
  db: D1Database,
  planes_estudio_customer_lectura_id: number,
  temas: string[]
): Promise<boolean> => {
  if (temas.length === 0) return true;

  const stmt = db.prepare(
    "INSERT INTO temas_planes_estudio_customers_lecturas (planes_estudio_customer_lectura_id, id_html_tema_lectura) VALUES (?, ?)"
  );

  // Prepara todas las inserciones sin ejecutarlas aún
  const batchStatements = temas.map((tema) =>
    stmt.bind(planes_estudio_customer_lectura_id, tema)
  );

  // Ejecuta todo el lote en una sola llamada a la base de datos
  const results = await db.batch(batchStatements);

  // Verifica que todas hayan sido exitosas
  return results.every((res) => res.success);
};


export const createPlanConTemas = async (
  db: D1Database,
  customerId: number,
  lecturaId: number,
  name: string,
  description: string,
  temas: string[]
): Promise<boolean> => {
  const result = await db.prepare(
    "INSERT INTO planes_estudio_customers_lecturas (customer_id, school_lectura_id, name, description) VALUES (?, ?, ?, ?)"
  )
  .bind(customerId, lecturaId, name, description)
  .run();

  if (!result.success) return false;

  const nuevoId = result.meta.last_row_id; // <-- Aquí tienes el ID (number)

  if(temas.length === 0) return true;

  const resultTemas = await crearTemasPlanesEstudioCustomersLecturasByListTemas(db, nuevoId, temas);
  if (!resultTemas) return false;

  return true;
};

export const getPorcentajeAvanceTemasPlanesEstudioCustomersLecturas = async (
  db: D1Database,
  planes_estudio_customer_lectura_id: number
): Promise<number> => {
  const result = await db.prepare(
    "SELECT COUNT(*) as total, SUM(is_completed) as completed FROM temas_planes_estudio_customers_lecturas WHERE planes_estudio_customer_lectura_id = ?"
  )
  .bind(planes_estudio_customer_lectura_id)
  .all<{ total: number; completed: number }>();
  const row = result.results?.[0];
  if (!row || row.total === 0) return 0;
  return (row.completed / row.total) * 100;
};


export const updatePlanConTemas = async (
  db: D1Database,
  planId: number,
  customerId: number,
  lecturaId: number,
  name: string,
  description: string,
  temas: string[]
): Promise<boolean> => {
  const result = await db.prepare(
    "UPDATE planes_estudio_customers_lecturas SET customer_id = ?, school_lectura_id = ?, name = ?, description = ? WHERE id = ?"
  )
  .bind(customerId, lecturaId, name, description, planId)
  .run();

  if (!result.success) return false;

  // Primero elimina los temas existentes
  const deleteResult = await db.prepare(
    "DELETE FROM temas_planes_estudio_customers_lecturas WHERE planes_estudio_customer_lectura_id = ?"
  )
  .bind(planId)
  .run();

  if (!deleteResult.success) return false;

  // Luego inserta los nuevos temas
  const resultTemas = await crearTemasPlanesEstudioCustomersLecturasByListTemas(db, planId, temas);
  if (!resultTemas) return false;

  return true;
};

export const marcarTemaComoLeido = async (
  db: D1Database,
  planId: number,
  idHtml: string, 
  isRead: boolean
): Promise<boolean> => {
  const result = await db.prepare(
    "UPDATE temas_planes_estudio_customers_lecturas SET is_completed = ? WHERE planes_estudio_customer_lectura_id = ? AND id_html_tema_lectura = ?"
  )
  .bind(isRead ? 1 : 0, planId, idHtml)
  .run();
  return result.success;
};


