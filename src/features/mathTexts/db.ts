import type { D1Database } from '@cloudflare/workers-types';

export interface MathText { id: number; title: string; description: string | null; source_tex: string; file_name: string; created_at: string; updated_at: string }
export interface MathTextOption { id: number; title: string; file_name: string }
export async function listMathTexts(db: D1Database): Promise<MathTextOption[]> {
  const { results } = await db.prepare('SELECT id,title,file_name FROM math_texts ORDER BY title COLLATE NOCASE').all<MathTextOption>();
  return results ?? [];
}
export async function getMathText(db: D1Database, id: number): Promise<MathText | null> {
  return db.prepare('SELECT * FROM math_texts WHERE id = ?').bind(id).first<MathText>();
}
export async function saveMathText(db: D1Database, input: { id?: number; title: string; description: string; source: string; fileName: string }): Promise<number> {
  if (input.id) {
    await db.prepare("UPDATE math_texts SET title=?, description=?, source_tex=?, file_name=?, updated_at=datetime('now') WHERE id=?")
      .bind(input.title, input.description || null, input.source, input.fileName, input.id).run();
    return input.id;
  }
  const result = await db.prepare('INSERT INTO math_texts (title,description,source_tex,file_name) VALUES (?,?,?,?)')
    .bind(input.title, input.description || null, input.source, input.fileName).run();
  return Number(result.meta.last_row_id);
}
export async function deleteMathText(db: D1Database, id: number): Promise<void> {
  // Keep the source snapshots on order_items; only future product links are cleared.
  await db.prepare('UPDATE products SET math_text_id=NULL WHERE math_text_id=?').bind(id).run();
  await db.prepare('DELETE FROM math_texts WHERE id=?').bind(id).run();
}
export async function setProductMathText(db: D1Database, productId: number, textId: number | null): Promise<void> {
  await db.prepare('UPDATE products SET math_text_id=? WHERE id=?').bind(textId, productId).run();
}
export async function getMathTextForProduct(db: D1Database, productId: number): Promise<MathTextOption | null> {
  return db.prepare('SELECT t.id,t.title,t.file_name FROM math_texts t JOIN products p ON p.math_text_id=t.id WHERE p.id=?')
    .bind(productId).first<MathTextOption>();
}

/** Propagate a corrected library text to paid, non-fully-refunded purchases.
 * The explicit admin action makes errata updates intentional; ordinary saves
 * continue to leave previously purchased snapshots unchanged.
 */
export async function propagateMathTextToPurchasedOrders(
  db: D1Database,
  id: number,
): Promise<number> {
  const text = await getMathText(db, id);
  if (!text) throw new Error('El texto matemático ya no existe.');
  const result = await db.prepare(
    `UPDATE order_items
     SET math_text_id = ?, math_text_title = ?, math_text_source = ?
     WHERE (math_text_id = ? OR (math_text_id IS NULL AND product_id IN (
         SELECT id FROM products WHERE math_text_id = ?
       )))
       AND order_id IN (
         SELECT id FROM orders
         WHERE status = 'paid'
           AND COALESCE(refunded_cents, 0) < amount_total_cents
       )`,
  ).bind(id, text.title, text.source_tex, id, id).run();
  return Number(result.meta.changes ?? 0);
}
