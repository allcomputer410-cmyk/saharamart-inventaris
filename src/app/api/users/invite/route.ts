import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// POST /api/users/invite — Kirim undangan email & buat user_profiles
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, role, store_id, phone } = body;

    if (!email || !name || !role) {
      return NextResponse.json({ success: false, error: 'email, name, dan role wajib diisi' }, { status: 400 });
    }

    const supabase = getAdminClient();

    // Invite via Supabase Auth — kirim email undangan ke user
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ''}/login`,
    });

    if (inviteError) {
      return NextResponse.json({ success: false, error: inviteError.message }, { status: 400 });
    }

    const userId = inviteData.user.id;

    // Buat / update user_profiles
    const { error: profileError } = await supabase.from('user_profiles').upsert([{
      id: userId,
      email,
      name: name.trim(),
      role,
      store_id: role === 'direktur' ? null : (store_id || null),
      phone: phone || null,
      is_active: true,
      feature_enabled: false,
    }], { onConflict: 'id' });

    if (profileError) {
      return NextResponse.json({ success: false, error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user_id: userId });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/invite?id=xxx — Hapus user dari Auth + user_profiles
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'id wajib diisi' }, { status: 400 });
    }

    const supabase = getAdminClient();

    // Hapus dari user_profiles dulu
    await supabase.from('user_profiles').delete().eq('id', userId);

    // Hapus dari Supabase Auth
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
