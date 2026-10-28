import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { deleteMathText, getMathText, propagateMathTextToPurchasedOrders, saveMathText } from '../../../features/mathTexts/db';
export const prerender = false;
const back = (params?: Record<string, string | number>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) query.set(key, String(value));
  const suffix = query.toString();
  return `/admin/textos-matematicos${suffix ? `?${suffix}` : ''}`;
};
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'save');
  const id = Number(form.get('id') ?? 0);
  if (action === 'propagate') {
    if (!Number.isSafeInteger(id) || id <= 0) return redirect(back({ error: 'Identificador inválido.' }), 303);
    const current = await getMathText(env.DB, id);
    if (!current) return redirect(back({ error: 'El texto ya no existe.' }), 303);
    const updated = await propagateMathTextToPurchasedOrders(env.DB, id);
    return redirect(back({ edit: id, updated }), 303);
  }
  if (action === 'delete') {
    if (!Number.isSafeInteger(id) || id <= 0) return redirect(back({ error: 'Identificador inválido.' }), 303);
    await deleteMathText(env.DB, id);
    return redirect(back(), 303);
  }
  const title = String(form.get('title') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  if (!title || title.length > 180) return redirect(back({ error: 'Escribe un título de hasta 180 caracteres.' }), 303);
  const upload = form.get('source');
  const typedSource = String(form.get('source_text') ?? '').trim();
  let source = typedSource;
  let fileName = 'texto.tex';
  if (id) {
    const current = await getMathText(env.DB, id);
    if (!current) return redirect(back({ error: 'El texto ya no existe.' }), 303);
    source ||= current.source_tex;
    fileName = current.file_name;
  }
  if (upload instanceof File && upload.size > 0) {
    if (!upload.name.toLowerCase().endsWith('.tex')) return redirect(back({ error: 'El archivo debe tener extensión .tex.' }), 303);
    if (upload.size > 512 * 1024) return redirect(back({ error: 'El archivo no puede superar 500 KB.' }), 303);
    source = await upload.text();
    fileName = upload.name.slice(0, 180);
  }
  if (!source || source.length > 512 * 1024) return redirect(back({ error: 'Selecciona un archivo .tex o pega su contenido (máximo 500 KB).' }), 303);
  const savedId = await saveMathText(env.DB, { id: id || undefined, title, description, source, fileName });
  return redirect(back({ edit: savedId, saved: 1 }), 303);
};
