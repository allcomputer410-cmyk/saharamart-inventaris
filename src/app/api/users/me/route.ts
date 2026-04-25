import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/users/me — Ambil profil user yang sedang login (bypass RLS)
export async function GET() {
  try {
    const serverClient = createServerSupabaseClient();
    const { data: { user } } = await serverClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: profile, error } = await admin
      .from('user_profiles')
      .select('id, name, role, permissions, store_id, is_active')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      return NextResponse.json({ success: false, error: 'Profil tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
