'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Plus, Pencil, X, Loader2, ToggleLeft, ToggleRight, ShieldCheck } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRole = 'direktur' | 'gm' | 'supervisor' | 'admin_gudang';

interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  store_id: string | null;
  phone: string | null;
  is_active: boolean;
  feature_enabled: boolean;
  store?: { id: string; name: string; code: string };
}

interface StoreOption {
  id: string;
  name: string;
  code: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  direktur: 'Direktur',
  gm: 'General Manager',
  supervisor: 'Supervisor',
  admin_gudang: 'Admin Gudang',
};

const ROLE_COLORS: Record<UserRole, string> = {
  direktur: 'bg-purple-100 text-purple-700',
  gm: 'bg-blue-100 text-blue-700',
  supervisor: 'bg-teal-100 text-teal-700',
  admin_gudang: 'bg-orange-100 text-orange-700',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const supabase = createClient();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);

  // Form
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('supervisor');
  const [formStore, setFormStore] = useState('');
  const [formPhone, setFormPhone] = useState('');

  // ─── Auth check: hanya direktur boleh akses ─────────────────────────────────

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile) setCurrentUserRole((profile as { role: UserRole }).role);
    }
    checkAuth();
  }, [supabase]);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('user_profiles')
      .select('*, store:stores(id, name, code)')
      .order('name');
    setUsers((data as unknown as UserProfile[]) || []);
    setLoading(false);
  }, [supabase]);

  const fetchStores = useCallback(async () => {
    const { data } = await supabase.from('stores').select('id, name, code').eq('is_active', true).order('name');
    setStores((data as StoreOption[]) || []);
  }, [supabase]);

  useEffect(() => { fetchUsers(); fetchStores(); }, [fetchUsers, fetchStores]);

  // ─── Form Helpers ────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormName(''); setFormEmail(''); setFormRole('supervisor');
    setFormStore(''); setFormPhone(''); setEditUser(null);
  };

  const openEdit = (user: UserProfile) => {
    setEditUser(user);
    setFormName(user.name);
    setFormEmail(user.email || '');
    setFormRole(user.role);
    setFormStore(user.store_id || '');
    setFormPhone(user.phone || '');
    setShowModal(true);
  };

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const userData = {
        name: formName.trim(),
        email: formEmail || null,
        role: formRole,
        store_id: formRole === 'direktur' ? null : (formStore || null),
        phone: formPhone || null,
      };

      if (editUser) {
        await supabase.from('user_profiles').update(userData).eq('id', editUser.id);
      } else {
        // Buat user baru — dalam implementasi penuh ini akan invite via Supabase Auth
        // Untuk sekarang, insert langsung ke user_profiles dengan id sementara
        await supabase.from('user_profiles').insert([{
          ...userData,
          is_active: true,
          feature_enabled: false,
        }]);
      }

      setShowModal(false);
      resetForm();
      fetchUsers();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle Active ────────────────────────────────────────────────────────────

  const handleToggleActive = async (user: UserProfile) => {
    await supabase.from('user_profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    fetchUsers();
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  // Direktur-only check
  if (currentUserRole !== null && currentUserRole !== 'direktur') {
    return (
      <div className="card text-center py-16">
        <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Akses Ditolak</h3>
        <p className="text-sm text-gray-500">Hanya Direktur yang dapat mengakses halaman ini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Manajemen User</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola akun dan role pengguna</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Tambah User
        </button>
      </div>

      {/* User Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Belum ada user.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Nama</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Toko</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className={`hover:bg-gray-50 ${!user.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-800">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{user.email || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role as UserRole] || 'bg-gray-100 text-gray-600'}`}>
                        {ROLE_LABELS[user.role as UserRole] || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {user.store ? `${user.store.name} (${user.store.code})` : user.role === 'direktur' ? 'Semua Toko' : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleToggleActive(user)} className="text-gray-500 hover:text-blue-600 transition-colors">
                        {user.is_active ? <ToggleRight className="w-5 h-5 text-blue-600" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => openEdit(user)} className="text-gray-500 hover:text-blue-600 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700">
        <p className="font-medium mb-1">Catatan Undang User Baru</p>
        <p className="text-xs">Untuk mengundang user baru via email, gunakan Supabase Dashboard &rarr; Authentication &rarr; Invite User, lalu assign role di halaman ini.</p>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">{editUser ? 'Edit User' : 'Tambah User'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)} className="input-field">
                  {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {formRole !== 'direktur' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Toko</label>
                  <select value={formStore} onChange={(e) => setFormStore(e.target.value)} className="input-field">
                    <option value="">Pilih toko...</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. Telepon</label>
                <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="input-field" />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary" disabled={saving}>Batal</button>
              <button onClick={handleSave} disabled={saving || !formName.trim()} className="btn-primary flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editUser ? 'Simpan' : 'Tambah'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
