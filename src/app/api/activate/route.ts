import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/backend/db';
import { ApiError, apiError, checkOrigin, digest, rateLimit } from '@/lib/backend/auth';
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const {token,password}=await request.json();
    if (typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(400,'Tautan tidak valid');
    if (typeof password!=='string' || password.length<8 || Buffer.byteLength(password)>72) throw new ApiError(400,'Password harus 8–72 byte');
    await rateLimit(`activate:${token}`,10,900);
    const passwordHash=await hash(password,12);
    const result=await db().query(`WITH invitation AS (
      DELETE FROM app_private.invitations WHERE token_hash=$1 AND expires_at>now() RETURNING user_id
    ) UPDATE auth.users SET encrypted_password=$2,email_confirmed_at=now(),updated_at=now()
      WHERE id IN(SELECT user_id FROM invitation) AND deleted_at IS NULL RETURNING id`,[digest(token),passwordHash]);
    if (!result.rowCount) throw new ApiError(400,'Tautan sudah dipakai atau kedaluwarsa');
    return NextResponse.json({success:true});
  } catch(e) { return apiError(e); }
}
