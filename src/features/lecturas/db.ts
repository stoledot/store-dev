import type {D1Database} from '@cloudflare/workers-types';
import type { Lectura } from './types';

export const createLectura = async (
  db: D1Database,
  lectura: Omit<Lectura, 'id' | 'created_at' | 'updated_at'>
): Promise<Lectura> => {
  const newLectura = await db
    .prepare(
      'INSERT INTO school_lecturas (title, id_from_xml, content_xml, content_html) VALUES (?, ?, ?, ?) RETURNING *'
    )
    .bind(lectura.title, lectura.id_from_xml, lectura.content_xml, lectura.content_html)
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
      'UPDATE school_lecturas SET title = ?, id_from_xml = ?, content_xml = ?, content_html = ?, updated_at = ? WHERE id = ? RETURNING *'
    )
    .bind(
      lectura.title ?? null,
      lectura.id_from_xml ?? null,
      lectura.content_xml ?? null,
      lectura.content_html ?? null,
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
      'SELECT l.* FROM school_lecturas l INNER JOIN school_lecturas_customers slc ON l.id = slc.school_lectura_id WHERE slc.customer_id = ?'
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
): Promise<{ l_title: string; school_lectura_id: number; customer_id: number }[]> => {
  const result = await db
    .prepare(
      'SELECT l.title as l_title, school_lectura_id, customer_id FROM school_lecturas_customers slc ' +
      'LEFT JOIN school_lecturas l ON slc.school_lectura_id = l.id ' +
      'WHERE slc.customer_id = ?'
    )
    .bind(customer_id)
    .all<{ l_title: string; school_lectura_id: number; customer_id: number }>();

  return result.results ?? [];
};