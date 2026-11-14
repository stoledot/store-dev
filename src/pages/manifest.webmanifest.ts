import type { APIRoute } from 'astro';
import { getConfig } from '../config';

export const prerender = false;
export const GET: APIRoute = ({ locals }) => new Response(JSON.stringify({
  name: locals.settings?.storeName ?? getConfig().storeName,
  short_name: locals.settings?.storeName ?? getConfig().storeName,
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    { src: '/app-icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
}), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
