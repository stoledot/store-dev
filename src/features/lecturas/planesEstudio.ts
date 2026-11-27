export interface TemaPlan { id: string; title: string; children: TemaPlan[] }
export interface PlanTemaRow { id_html_tema_lectura: string; is_completed: number }
export interface PlanRow { id: number; name: string; description: string | null; customer_id: number; school_lectura_id: number; temas: PlanTemaRow[] }

const PLANS = 'planes_estudio_customers_lecturas';
const TOPICS = 'temas_planes_estudio_customers_lecturas';

export function extraerTemas(nodo: any): TemaPlan[] {
  if (!nodo || nodo.tipo !== 'elemento') return (nodo?.hijos ?? []).flatMap(extraerTemas);
  const ownId = nodo.atributos?.id;
  const isTopic = ['sub-section', 'sub-sub-section', 'sub-sub-sub-section'].includes(nodo.etiqueta) && typeof ownId === 'string' && ownId.length > 0;
  const children = (nodo.hijos ?? []).flatMap(extraerTemas);
  if (!isTopic) return children;
  const title = nodo.atributos?.['data-title'] ?? nodo.atributos?.title ?? ownId;
  return [{ id: ownId, title, children }];
}

export function expandeTemasSeleccionados(tree: TemaPlan[], ids: string[]): string[] {
  const chosen = new Set(ids);
  const result = new Set<string>();
  const visit = (node: TemaPlan, inherited: boolean) => {
    const include = inherited || chosen.has(node.id);
    if (include) result.add(node.id);
    node.children.forEach(child => visit(child, include));
  };
  tree.forEach(node => visit(node, false));
  return [...result];
}

export function filtraArbol(nodo: any, permitidos: Set<string>): any | null {
  if (!nodo || nodo.tipo !== 'elemento') return nodo;
  const ownId = nodo.atributos?.id;
  const isTopic = ['sub-section', 'sub-sub-section', 'sub-sub-sub-section'].includes(nodo.etiqueta) && typeof ownId === 'string';
  const hijos = (nodo.hijos ?? []).map((h: any) => filtraArbol(h, permitidos)).filter((h: any) => h !== null);
  // Conserva el encabezado estructural de un ancestro para ubicar el tema incluido,
  // pero omite su contenido propio cuando el ancestro no forma parte del plan.
  if (isTopic && !permitidos.has(ownId)) {
    if (hijos.length === 0) return null;
    return { ...nodo, hijos: hijos.filter((h: any) => h?.tipo === 'elemento') };
  }
  return { ...nodo, hijos };
}

export async function listarPlanes(db: D1Database, customerId: number, readingId: number): Promise<PlanRow[]> {
  const rows = await db.prepare(`SELECT id, name, description, customer_id, school_lectura_id FROM ${PLANS} WHERE customer_id = ? AND school_lectura_id = ? ORDER BY updated_at DESC`).bind(customerId, readingId).all<Omit<PlanRow, 'temas'>>();
  const plans = rows.results ?? [];
  return Promise.all(plans.map(async plan => {
    const topics = await db.prepare(`SELECT id_html_tema_lectura, is_completed FROM ${TOPICS} WHERE planes_estudio_customer_lectura_id = ? ORDER BY id`).bind(plan.id).all<PlanTemaRow>();
    return { ...plan, temas: topics.results ?? [] };
  }));
}

export async function crearPlan(db: D1Database, input: { customerId: number; readingId: number; name: string; description?: string; topicIds: string[] }) {
  const result = await db.prepare(`INSERT INTO ${PLANS} (name, description, customer_id, school_lectura_id) VALUES (?, ?, ?, ?)`).bind(input.name, input.description || null, input.customerId, input.readingId).run();
  const planId = Number(result.meta.last_row_id);
  for (const topicId of input.topicIds) await db.prepare(`INSERT INTO ${TOPICS} (planes_estudio_customer_lectura_id, id_html_tema_lectura) VALUES (?, ?)`).bind(planId, topicId).run();
  return planId;
}

export async function reemplazarTemasPlan(db: D1Database, planId: number, topicIds: string[]) {
  await db.prepare(`DELETE FROM ${TOPICS} WHERE planes_estudio_customer_lectura_id = ?`).bind(planId).run();
  for (const topicId of topicIds) await db.prepare(`INSERT INTO ${TOPICS} (planes_estudio_customer_lectura_id, id_html_tema_lectura) VALUES (?, ?)`).bind(planId, topicId).run();
  await db.prepare(`UPDATE ${PLANS} SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(planId).run();
}

export async function obtenerPlan(db: D1Database, planId: number, customerId: number): Promise<PlanRow | null> {
  const plan = await db.prepare(`SELECT id, name, description, customer_id, school_lectura_id FROM ${PLANS} WHERE id = ? AND customer_id = ?`).bind(planId, customerId).first<Omit<PlanRow, 'temas'>>();
  if (!plan) return null;
  const topics = await db.prepare(`SELECT id_html_tema_lectura, is_completed FROM ${TOPICS} WHERE planes_estudio_customer_lectura_id = ? ORDER BY id`).bind(plan.id).all<PlanTemaRow>();
  return { ...plan, temas: topics.results ?? [] };
}

export async function marcarTemaCompletado(db: D1Database, planId: number, topicId: string, completed: boolean) {
  await db.prepare(`UPDATE ${TOPICS} SET is_completed = ?, updated_at = CURRENT_TIMESTAMP WHERE planes_estudio_customer_lectura_id = ? AND id_html_tema_lectura = ?`).bind(completed ? 1 : 0, planId, topicId).run();
  await db.prepare(`UPDATE ${PLANS} SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(planId).run();
}
