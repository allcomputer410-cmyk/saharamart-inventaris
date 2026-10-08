import { NextRequest, NextResponse } from 'next/server';
import { compare, hash } from 'bcryptjs';
import { db } from '@/lib/backend/db';
import { ApiError, apiError, checkOrigin, currentUser, requireUser, rateLimit, createSession, revokeSession } from '@/lib/backend/auth';

export const dynamic = 'force-dynamic';
export async function GET(_request: NextRequest, { params }: { params: { action: string } }) {
  try {
    if (params.action !== 'user') throw new ApiError(404, 'Tidak ditemukan');
    return NextResponse.json({ data: { user: await currentUser() }, error: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest, { params }: { params: { action: string } }) {
  try {
    checkOrigin(request);
    if (params.action === 'logout') { await revokeSession(); return NextResponse.json({ error: null }); }
    const body = await request.json();
    if (params.action === 'login') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = body.password;
      if (!email || typeof password !== 'string' || password.length > 72) throw new ApiError(400, 'Email atau password tidak valid');
      await rateLimit(`login:${email}`, 10, 900);
      const result = await db().query(`SELECT u.id,u.encrypted_password,p.is_active,p.status FROM auth.users u
        LEFT JOIN public.user_profiles p ON p.id=u.id WHERE lower(u.email)=$1 AND u.deleted_at IS NULL
        AND (u.banned_until IS NULL OR u.banned_until<now())`, [email]);
      const user = result.rows[0];
      // Equal work for unknown emails; bcrypt hash is not a credential.
      const valid = await compare(password, user?.encrypted_password || '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
      if (!user || !valid) throw new ApiError(401, 'Email atau password salah');
      if (!user.is_active || user.status !== 'active') throw new ApiError(403, 'Akun belum disetujui atau dinonaktifkan');
      await revokeSession();
      await createSession(user.id);
      return NextResponse.json({ data: { user: await currentUser() }, error: null });
    }
    if (params.action === 'password') {
      const user = await requireUser();
      if (typeof body.password !== 'string' || body.password.length < 8 || Buffer.byteLength(body.password) > 72) throw new ApiError(400, 'Password harus 8–72 byte');
      await db().query('UPDATE auth.users SET encrypted_password=$1,updated_at=now() WHERE id=$2', [await hash(body.password, 12), user.id]);
      await db().query('DELETE FROM app_private.sessions WHERE user_id=$1', [user.id]);
      await createSession(user.id);
      return NextResponse.json({ data: { user }, error: null });
    }
    throw new ApiError(404, 'Tidak ditemukan');
  } catch (error) { return apiError(error); }
}
