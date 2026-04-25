import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// POST /api/users/register — Registrasi mandiri, status pending
export async function POST(request: NextRequest) {
  try {
    const { name, email, password, store_id, phone } = await request.json();

    if (!name || !email || !password || !store_id) {
      return NextResponse.json(
        { success: false, error: 'Nama, email, password, dan toko wajib diisi' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password minimal 6 karakter' },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    // Cek email sudah terdaftar
    const { data: existing } = await admin
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Email sudah terdaftar' },
        { status: 400 }
      );
    }

    // Buat akun di Supabase Auth
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json(
        { success: false, error: authError.message },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    // Buat profil dengan status pending dan role default supervisor
    const { error: profileError } = await admin.from('user_profiles').insert({
      id: userId,
      email,
      name: name.trim(),
      role: 'supervisor',
      store_id,
      phone: phone || null,
      is_active: false,
      feature_enabled: false,
      permissions: null,
      status: 'pending',
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { success: false, error: profileError.message },
        { status: 500 }
      );
    }

    // Kirim notifikasi ke owner/direktur toko ini
    await admin.from('notifications').insert({
      store_id,
      type: 'new_registration',
      title: 'Permintaan Akun Baru',
      message: `${name.trim()} (${email}) meminta akses ke toko ini. Setujui di Manajemen User.`,
      is_read: false,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PATCH /api/users/register?id=xxx — Approve atau reject pendaftar
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'id wajib diisi' }, { status: 400 });
    }

    const { action, role } = await request.json();
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: 'action harus approve atau reject' }, { status: 400 });
    }

    const admin = getAdminClient();

    if (action === 'approve') {
      const { error } = await admin
        .from('user_profiles')
        .update({ status: 'active', is_active: true, role: role || 'supervisor' })
        .eq('id', userId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    } else {
      // Reject: nonaktifkan akun
      const { error } = await admin
        .from('user_profiles')
        .update({ status: 'rejected', is_active: false })
        .eq('id', userId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
