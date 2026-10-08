import { cookies } from 'next/headers';
import { createHash, randomBytes, createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';

export const COOKIE = 'inventory_session';
export const ROLES = ['direktur', 'owner', 'manajer', 'gm', 'supervisor', 'admin_gudang'];
export type User = { id: string; email: string; name: string; role: string; store_id: string | null; permissions: string[] | null };
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function currentUser(): Promise<User | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const result = await db().query(`SELECT p.id, u.email, p.name, p.role, p.store_id, p.permissions
    FROM app_private.sessions s JOIN auth.users u ON u.id=s.user_id
    JOIN public.user_profiles p ON p.id=u.id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND p.is_active=true AND p.status='active'
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<now())`, [digest(token)]);
  return result.rows[0] || null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, 'Silakan login terlebih dahulu');
  return user;
}
export async function requireManager() {
  const user = await requireUser();
  if (!['direktur', 'owner', 'manajer'].includes(user.role)) throw new ApiError(403, 'Akses ditolak');
  return user;
}
export function canManageStore(user: User, storeId: string | null) {
  return ['direktur', 'owner'].includes(user.role) || (!!storeId && storeId === user.store_id);
}
export function checkOrigin(request: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  const allowed = process.env.APP_ORIGIN || request.nextUrl.origin;
  if ((origin && origin !== allowed) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError(403, 'Asal permintaan tidak diizinkan');
  }
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  await db().query('INSERT INTO app_private.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'12 hours\')', [digest(token), userId]);
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: (process.env.APP_ORIGIN || '').startsWith('https://'), path: '/' });
}
export async function revokeSession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) await db().query('DELETE FROM app_private.sessions WHERE token_hash=$1', [digest(token)]);
  cookies().delete(COOKIE);
}
export function internalJwt(claims: Record<string, unknown>) {
  const secret = process.env.POSTGREST_JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('POSTGREST_JWT_SECRET belum dikonfigurasi');
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ ...claims, exp: Math.floor(Date.now()/1000)+60 })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export async function rateLimit(key: string, max: number, seconds: number) {
  const result = await db().query(`INSERT INTO app_private.rate_limits(key,hits,expires_at)
    VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET
    hits=CASE WHEN app_private.rate_limits.expires_at<now() THEN 1 ELSE app_private.rate_limits.hits+1 END,
    expires_at=CASE WHEN app_private.rate_limits.expires_at<now() THEN excluded.expires_at ELSE app_private.rate_limits.expires_at END
    RETURNING hits`, [digest(key), seconds]);
  if (result.rows[0].hits > max) throw new ApiError(429, 'Terlalu banyak percobaan. Coba lagi nanti.');
}
export function apiError(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ success: false, error: error.message, message: error.message }, { status: error.status });
  // Never send SQL, connection strings, or password hashes to the browser.
  console.error('Backend request failed', error instanceof Error ? error.name : 'Error');
  return NextResponse.json({ success: false, error: 'Layanan database belum siap atau permintaan gagal', message: 'Layanan database belum siap atau permintaan gagal' }, { status: 500 });
}
