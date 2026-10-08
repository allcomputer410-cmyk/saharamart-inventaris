import { NextResponse } from 'next/server';
import { db } from '@/lib/backend/db';
import { apiError } from '@/lib/backend/auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { const { rows } = await db().query('SELECT id,name,code FROM public.stores WHERE is_active=true ORDER BY name');
    return NextResponse.json({ data: rows });
  } catch (error) { return apiError(error); }
}
