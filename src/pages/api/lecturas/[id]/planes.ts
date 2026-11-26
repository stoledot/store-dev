import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { accountsEnabled, getCustomerEmail } from '../../../../features/auth/customer';
import { getCustomerByEmail } from '../../../../features/customers_new/db';
import { getLecturasCustomerByCustomerId } from '../../../../features/lecturas/db';
import { crearPlan, expandeTemasSeleccionados, extraerTemas, listarPlanes, reemplazarTemasPlan } from '../../../../features/lecturas/planesEstudio';
import { getLecturaById } from '../../../../features/lecturas/db';
import { parsearXML } from '../../../../features/xml/xmlParser';

async function context(Astro: Parameters<APIRoute>[0]) {
  if (!(await accountsEnabled())) return { error: new Response(null, { status: 401 }) };
  const email = await getCustomerEmail(Astro.cookies);
  const customerId = email ? (await getCustomerByEmail(env.DB, email))?.id : undefined;
  const readingId = Number(Astro.params.id);
  if (!customerId || !Number.isInteger(readingId)) return { error: new Response(null, { status: 401 }) };
  const access = await getLecturasCustomerByCustomerId(env.DB, customerId);
  if (!access?.some(row => row.school_lectura_id === readingId)) return { error: new Response(null, { status: 403 }) };
  const xml = (await getLecturaById(env.DB, readingId))?.content_xml ?? '';
  return { customerId, readingId, temas: extraerTemas(parsearXML(xml)) };
}

export const GET: APIRoute = async (Astro) => {
  const ctx = await context(Astro); if ('error' in ctx) return ctx.error;
  return Response.json({ temas: ctx.temas, planes: await listarPlanes(env.DB, ctx.customerId, ctx.readingId) });
};

export const POST: APIRoute = async (Astro) => {
  const ctx = await context(Astro); if ('error' in ctx) return ctx.error;
  try {
    const body = await Astro.request.json() as { name?: string; description?: string; topicIds?: string[]; planId?: number };
    const name = body.name?.trim();
    if (!name || !Array.isArray(body.topicIds) || body.topicIds.length === 0) return Response.json({ error: 'Indica el nombre del plan y al menos un tema.' }, { status: 400 });
    const valid = new Set(ctx.temas.flatMap(function walk(t): string[] { return [t.id, ...t.children.flatMap(walk)]; }));
    if (body.topicIds.some(id => !valid.has(id))) return Response.json({ error: 'El plan contiene temas que no pertenecen a esta lectura.' }, { status: 400 });
    const topicIds = expandeTemasSeleccionados(ctx.temas, body.topicIds);
    if (body.planId) {
      const owned = await env.DB.prepare('SELECT id FROM planes_estudio_customers_lecturas WHERE id = ? AND customer_id = ? AND school_lectura_id = ?').bind(body.planId, ctx.customerId, ctx.readingId).first();
      if (!owned) return new Response(null, { status: 404 });
      await env.DB.prepare('UPDATE planes_estudio_customers_lecturas SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, body.description?.trim() || null, body.planId).run();
      await reemplazarTemasPlan(env.DB, body.planId, topicIds);
      return Response.json({ id: body.planId, updated: true });
    }
    const id = await crearPlan(env.DB, { customerId: ctx.customerId, readingId: ctx.readingId, name, description: body.description, topicIds });
    return Response.json({ id }, { status: 201 });
  } catch { return Response.json({ error: 'No se pudo guardar el plan.' }, { status: 500 }); }
};
