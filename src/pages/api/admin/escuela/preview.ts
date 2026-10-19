import type { APIRoute } from 'astro';
import { renderMarkdown } from '../../../../features/pages/markdown';

export const prerender = false;
const MAX_BODY = 100_000;

// /api/admin is protected by the existing MinShop admin gate in middleware.
// markdown-it is configured with html:false, so raw HTML is escaped.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const markdown = String(form.get('body_markdown') ?? '').slice(0, MAX_BODY);
  const html = renderMarkdown(markdown);
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  });
};
