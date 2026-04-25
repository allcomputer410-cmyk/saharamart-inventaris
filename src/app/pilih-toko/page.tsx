'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Store as StoreIcon, MapPin, Loader2, LogOut, Warehouse } from 'lucide-react';
import type { Store } from '@/types/database';

export default function PilihTokoPage() {
  const router = useRouter();
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAccount, setPendingAccount] = useState(false);

  useEffect(() => {
    async function fetchStores() {
      // Ambil profil user untuk cek status dan role
      const meRes = await fetch('/api/users/me');
      const meJson = await meRes.json();
      const profile = meJson.success ? meJson.data : null;

      if (profile?.status === 'pending') {
        setPendingAccount(true);
        setLoading(false);
        return;
      }

      const GLOBAL_ROLES = ['direktur', 'owner', 'gm'];
      const isGlobal = profile && GLOBAL_ROLES.includes(profile.role);

      let query = supabase.from('stores').select('*').eq('is_active', true).order('name');

      // Non-global: filter hanya toko miliknya
      if (!isGlobal && profile?.store_id) {
        query = query.eq('id', profile.store_id);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching stores:', error);
      } else {
        setStores(data || []);
      }
      setLoading(false);
    }

    fetchStores();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectStore = (storeId: string) => {
    router.push(`/toko/${storeId}/dashboard`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (pendingAccount) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Menunggu Persetujuan</h2>
          <p className="text-sm text-gray-600 mb-6">
            Akun kamu sedang dalam proses verifikasi oleh admin toko. Silakan coba login kembali setelah mendapat konfirmasi.
          </p>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }}
            className="text-sm text-red-500 hover:underline"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-4">
      <div className="max-w-lg mx-auto pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Pilih Toko</h1>
            <p className="text-sm text-gray-500 mt-1">Pilih toko untuk mulai bekerja</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-white/70 text-gray-500"
            title="Keluar"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Store List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : stores.length === 0 ? (
          <div className="card text-center py-12">
            <StoreIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Belum ada toko terdaftar</p>
            <p className="text-sm text-gray-400 mt-1">
              Hubungi administrator untuk menambahkan toko
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => handleSelectStore(store.id)}
                className="card w-full text-left hover:border-blue-300 hover:shadow-md transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    store.type === 'gudang'
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-blue-100 text-blue-600'
                  }`}>
                    {store.type === 'gudang' ? (
                      <Warehouse className="w-6 h-6" />
                    ) : (
                      <StoreIcon className="w-6 h-6" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-800 truncate">{store.name}</h3>
                    {store.address && (
                      <div className="flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                        <p className="text-sm text-gray-500 truncate">{store.address}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        store.type === 'gudang'
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-blue-50 text-blue-600'
                      }`}>
                        {store.type === 'gudang' ? 'Gudang' : 'Toko'}
                      </span>
                      {store.code && (
                        <span className="text-xs text-gray-400">{store.code}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Global Dashboard Link */}
        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Buka Dashboard Global
          </button>
        </div>
      </div>
    </div>
  );
}
