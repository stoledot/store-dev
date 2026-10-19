import { env } from 'cloudflare:workers';
import { adminCredential } from '../auth/admin';
import { verifySession } from '../auth/session';

/** Defense in depth for school admin API routes. The normal /admin middleware
 * still applies; this also protects /api/admin routes if routing rules change. */
export async function isSchoolAdminRequest(
  sessionToken: string | null | undefined,
  accessAdminEmail?: string | null,
): Promise<boolean> {
  if (accessAdminEmail) return true; // set only by the verified Cloudflare Access middleware
  if (import.meta.env.DEV) return true; // local development only
  const credential = await adminCredential(env.DB);
  if (!credential.enabled) return false;
  const signingKey = env.AUTH_SECRET || credential.tagSource;
  return verifySession(sessionToken, signingKey, credential.tagSource, Date.now() / 1000);
}
