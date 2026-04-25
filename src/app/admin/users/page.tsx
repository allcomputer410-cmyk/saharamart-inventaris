'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users, Plus, Pencil, X, Loader2, ToggleLeft, ToggleRight,
  ShieldCheck, Trash2, Mail, Shield, CheckSquare, Square,
  Clock, CheckCircle, XCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = 'direktur' | 'owner' | 'manajer' | 'gm' | 'supervisor' | 'admin_gudang';

interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  store_id: string | null;
  phone: string | null;
  is_active: boolean;
  feature_enabled: boolean;
  permissions: string[] | null;
  store?: { id: string; name: string; code: string };
}

interface StoreOption {
  id: string;
  name: string;
  code: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MANAGER_ROLES: UserRole[] = ['direktur', 'owner', 'manajer'];

const ROLE_LABELS: Record<UserRole, string> = {
  direktur: 'Direktur',
  owner: 'Owner',
  manajer: 'Manajer',
  gm: 'General Manager',
  supervisor: 'Supervisor',
  admin_gudang: 'Admin Gudang',
};

const ROLE_COLORS: Record<UserRole, string> = {
  direktur: 'bg-purple-100 text-purple-700',
  owner: 'bg-red-100 text-red-700',
  manajer: 'bg-indigo-100 text-indigo-700',
  gm: 'bg-blue-100 text-blue-700',
  supervisor: 'bg-teal-100 text-teal-700',
  admin_gudang: 'bg-orange-100 text-orange-700',
};

// Daftar fitur yang bisa di-toggle per akun
const FEATURE_GROUPS: { label: string; features: { key: string; label: string }[] }[] = [
  {
    label: 'Operasional Toko',
    features: [
      { key: 'dashboard', label: 'Dashboard Toko' },
      { key: 'master_produk', label: 'Master Produk' },
      { key: 'supplier', label: 'Daftar Supplier' },
      { key: 'cek_stok', label: 'Cek Stok' },
      { key: 'pesanan', label: 'Pesanan & Penerimaan' },
      { key: 'pembelian', label: 'Pembelian Masuk' },
      { key: 'rekap_supplier', label: 'Rekap Supplier' },
      { key: 'history', label: 'History' },
    ],
  },
  {
    label: 'Keuangan & Analitik',
    features: [
      { key: 'penjualan', label: 'Penjualan' },
      { key: 'rekap_kasir', label: 'Rekap Kasir' },
      { key: 'analisis_keuangan', label: 'Analisis Keuangan' },
      { key: 'trend', label: 'Trend & Analisis' },
      { key: 'promo', label: 'Promo' },
    ],
  },
  {
    label: 'Global',
    features: [
      { key: 'dashboard_global', label: 'Dashboard Global' },
      { key: 'sync_monitor', label: 'Sync Monitor' },
      { key: 'audit_log', label: 'Audit Log' },
    ],
  },
];

const ALL_FEATURE_KEYS = FEATURE_GROUPS.flatMap(g => g.features.map(f => f.key));

// ─── Component ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'pending'>('active');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveRole, setApproveRole] = useState<UserRole>('supervisor');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Form state ──────────────────────────────────────────────────────────────
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('supervisor');
  const [formStore, setFormStore] = useState('');
  const [formPhone, setFormPhone] = useState('');
  // null = akses penuh, string[] = fitur yang diizinkan
  const [formPermissions, setFormPermissions] = useState<string[] | null>(null);

  // ─── Auth check: direktur, owner, manajer boleh akses ────────────────────────

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
      setCurrentUserId(user.id);
    }
    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Fetch ────────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users/invite');
      const json = await res.json();
      setUsers((json.data as unknown as UserProfile[]) || []);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStores = useCallback(async () => {
    const { data } = await supabase.from('stores').select('id, name, code').eq('is_active', true).order('name');
    setStores((data as StoreOption[]) || []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchUsers(); fetchStores(); }, [fetchUsers, fetchStores]);

  // ─── Form Helpers ─────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormName(''); setFormEmail(''); setFormRole('supervisor');
    setFormStore(''); setFormPhone(''); setFormPermissions(null); setEditUser(null);
  };

  const openEdit = (user: UserProfile) => {
    setEditUser(user);
    setFormName(user.name);
    setFormEmail(user.email || '');
    setFormRole(user.role);
    setFormStore(user.store_id || '');
    setFormPhone(user.phone || '');
    setFormPermissions(user.permissions ?? null);
    setShowModal(true);
  };

  const toggleFeature = (key: string) => {
    setFormPermissions(prev => {
      if (prev === null) return ALL_FEATURE_KEYS.filter(k => k !== key);
      return prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
    });
  };

  // ─── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim()) return;
    if (!editUser && !formEmail.trim()) {
      showToast('Email wajib diisi untuk user baru', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        email: formEmail || null,
        role: formRole,
        store_id: ['direktur', 'owner'].includes(formRole) ? null : (formStore || null),
        phone: formPhone || null,
        permissions: formPermissions,
      };

      if (editUser) {
        const res = await fetch(`/api/users/invite?id=${editUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) { showToast('Gagal menyimpan: ' + data.error, 'error'); return; }
        showToast('User berhasil diupdate');
      } else {
        const res = await fetch('/api/users/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, email: formEmail.trim() }),
        });
        const data = await res.json();
        if (!data.success) { showToast('Gagal undang user: ' + data.error, 'error'); return; }
        showToast(`Undangan dikirim ke ${formEmail}`);
      }

      setShowModal(false);
      resetForm();
      fetchUsers();
    } catch (err) {
      showToast('Terjadi kesalahan: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Approve / Reject ────────────────────────────────────────────────────────

  const handleApproveReject = async (userId: string, action: 'approve' | 'reject', role?: UserRole) => {
    setApprovingId(userId);
    try {
      const res = await fetch(`/api/users/register?id=${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, role: role || 'supervisor' }),
      });
      const data = await res.json();
      if (!data.success) { showToast('Gagal: ' + data.error, 'error'); return; }
      showToast(action === 'approve' ? 'Akun berhasil disetujui' : 'Pendaftar ditolak');
      fetchUsers();
    } catch {
      showToast('Terjadi kesalahan', 'error');
    } finally {
      setApprovingId(null);
    }
  };

  // ─── Toggle Active ────────────────────────────────────────────────────────────

  const handleToggleActive = async (user: UserProfile) => {
    const res = await fetch(`/api/users/invite?id=${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    const data = await res.json();
    if (data.success) fetchUsers();
    else showToast('Gagal mengubah status', 'error');
  };

  // ─── Delete User ──────────────────────────────────────────────────────────────

  const handleDelete = async (user: UserProfile) => {
    if (!confirm(`Hapus user "${user.name}"? Akun ini tidak dapat dipulihkan.`)) return;
    setDeletingId(user.id);
    try {
      const res = await fetch(`/api/users/invite?id=${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) { showToast('Gagal hapus: ' + data.error, 'error'); return; }
      showToast(`User "${user.name}" berhasil dihapus`);
      fetchUsers();
    } catch (err) {
      showToast('Terjadi kesalahan: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (currentUserRole !== null && !MANAGER_ROLES.includes(currentUserRole)) {
    return (
      <div className="card text-center py-16">
        <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Akses Ditolak</h3>
        <p className="text-sm text-gray-500">Hanya Direktur, Owner, dan Manajer yang dapat mengakses halaman ini.</p>
      </div>
    );
  }

  const isRestrictedMode = formPermissions !== null;

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Manajemen User</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola akun, role, dan akses fitur per pengguna</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Tambah User
        </button>
      </div>

      {/* Tab */}
      {(() => {
        const pendingCount = users.filter((u) => (u as unknown as { status: string }).status === 'pending').length;
        return (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'active' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Pengguna Aktif
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'pending' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Clock className="w-3.5 h-3.5" />
              Menunggu Persetujuan
              {pendingCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </button>
          </div>
        );
      })()}

      {/* Tab: Pengguna Aktif */}
      {activeTab === 'active' && (
        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : users.filter((u) => (u as unknown as { status: string }).status !== 'pending').length === 0 ? (
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
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Akses Fitur</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600" colSpan={2}>Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.filter((u) => (u as unknown as { status: string }).status !== 'pending').map((user) => {
                    const perms = user.permissions;
                    return (
                      <tr key={user.id} className={`hover:bg-gray-50 ${!user.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-gray-800">{user.name}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{user.email || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role as UserRole] || 'bg-gray-100 text-gray-600'}`}>
                            {ROLE_LABELS[user.role as UserRole] || user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {user.store ? `${user.store.name} (${user.store.code})` : ['direktur', 'owner'].includes(user.role) ? 'Semua Toko' : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {perms === null || perms === undefined
                            ? <span className="text-xs text-green-600 font-medium">Akses Penuh</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                <Shield className="w-3 h-3" />{perms.length} fitur
                              </span>
                          }
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
                        <td className="px-4 py-3 text-center">
                          {user.id !== currentUserId && (
                            <button
                              onClick={() => handleDelete(user)}
                              disabled={deletingId === user.id}
                              className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                            >
                              {deletingId === user.id
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Trash2 className="w-4 h-4" />
                              }
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Menunggu Persetujuan */}
      {activeTab === 'pending' && (
        <div className="card overflow-hidden p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : users.filter((u) => (u as unknown as { status: string }).status === 'pending').length === 0 ? (
            <div className="text-center py-16">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Tidak ada pendaftar yang menunggu persetujuan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Nama</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Toko</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.filter((u) => (u as unknown as { status: string }).status === 'pending').map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{user.name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{user.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {user.store ? `${user.store.name} (${user.store.code})` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          defaultValue="supervisor"
                          onChange={(e) => setApproveRole(e.target.value as UserRole)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleApproveReject(user.id, 'approve', approveRole)}
                            disabled={approvingId === user.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {approvingId === user.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <CheckCircle className="w-3 h-3" />
                            }
                            Setujui
                          </button>
                          <button
                            onClick={() => handleApproveReject(user.id, 'reject')}
                            disabled={approvingId === user.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors border border-red-200"
                          >
                            <XCircle className="w-3 h-3" />
                            Tolak
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700 flex items-start gap-2">
        <Mail className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium mb-0.5">Cara Menambah User</p>
          <p className="text-xs">Klik &quot;Tambah User&quot;, isi email dan role, pilih fitur yang dapat diakses, lalu klik Kirim Undangan. User akan menerima email untuk mengatur password.</p>
        </div>
      </div>

      {/* ─── Modal ──────────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h2 className="text-lg font-bold text-gray-800">{editUser ? 'Edit User' : 'Tambah User'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Nama */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field" />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email {!editUser && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="input-field"
                  placeholder={!editUser ? 'Wajib — untuk login & undangan' : ''}
                  disabled={!!editUser}
                />
                {editUser && <p className="text-xs text-gray-400 mt-1">Email tidak dapat diubah setelah akun dibuat.</p>}
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)} className="input-field">
                  {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Toko */}
              {!['direktur', 'owner'].includes(formRole) && (
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

              {/* No. Telepon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. Telepon</label>
                <input type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="input-field" />
              </div>

              {/* ── Pengaturan Akses Fitur ──────────────────────────────────── */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Akses Fitur</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isRestrictedMode
                        ? `${formPermissions!.length} dari ${ALL_FEATURE_KEYS.length} fitur dipilih`
                        : 'User dapat mengakses semua fitur'}
                    </p>
                  </div>
                  {/* Toggle mode: Akses Penuh ↔ Pilih Manual */}
                  <button
                    type="button"
                    onClick={() => setFormPermissions(isRestrictedMode ? null : [...ALL_FEATURE_KEYS])}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      isRestrictedMode
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {isRestrictedMode ? 'Dibatasi — klik untuk Akses Penuh' : 'Akses Penuh — klik untuk Dibatasi'}
                  </button>
                </div>

                {isRestrictedMode && (
                  <div className="px-4 py-3 space-y-4">
                    {/* Tombol Pilih Semua / Hapus Semua */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFormPermissions([...ALL_FEATURE_KEYS])}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />Pilih Semua
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setFormPermissions([])}
                        className="text-xs text-gray-500 hover:underline flex items-center gap-1"
                      >
                        <Square className="w-3.5 h-3.5" />Hapus Semua
                      </button>
                    </div>

                    {/* Checkbox groups */}
                    {FEATURE_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{group.label}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {group.features.map((feature) => {
                            const checked = formPermissions!.includes(feature.key);
                            return (
                              <label
                                key={feature.key}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                                  checked
                                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleFeature(feature.key)}
                                  className="accent-blue-600 w-3.5 h-3.5 shrink-0"
                                />
                                <span className="truncate">{feature.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary" disabled={saving}>Batal</button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || (!editUser && !formEmail.trim())}
                className="btn-primary flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? (editUser ? 'Menyimpan...' : 'Mengundang...') : (editUser ? 'Simpan' : 'Kirim Undangan')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
