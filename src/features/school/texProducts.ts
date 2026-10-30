import type { D1Database } from '@cloudflare/workers-types';

/** Link one existing store product to a school course or mathematical reading. */
export async function setSchoolContentForProduct(db: D1Database, productId: number, contentId: string | null): Promise<void> {
  if (contentId) {
    const content = await db.prepare("SELECT id,product_id FROM school_courses WHERE id=? AND content_kind IN ('course','reading') AND status<>'archived'")
      .bind(contentId).first<{id:string;product_id:number|null}>();
    if (!content) throw new Error('El curso o lectura seleccionado no existe o está archivado.');
    if (content.product_id !== null && content.product_id !== productId) throw new Error('Este curso o lectura ya está vinculado a otro producto.');
    await db.prepare('UPDATE school_courses SET product_id=NULL,updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE product_id=? AND id<>?')
      .bind(productId, contentId).run();
    await db.prepare('UPDATE school_courses SET product_id=?,updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=?')
      .bind(productId, contentId).run();
    await db.prepare('UPDATE order_items SET school_course_id=? WHERE product_id=? AND school_course_id IS NULL')
      .bind(contentId, productId).run();
  } else {
    await db.prepare('UPDATE school_courses SET product_id=NULL,updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE product_id=?')
      .bind(productId).run();
  }
}
