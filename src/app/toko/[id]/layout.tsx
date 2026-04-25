'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Loader2 } from 'lucide-react';
import type { Store } from '@/types/database';

// Urutan menu toko — dipakai untuk cari halaman pertama yang bisa diakses
const STORE_MENU_ORDER = [
  { segment: 'dashboard',       permKey: 'dashboard' },
  { segment: 'master-produk',   permKey: 'master_produk' },
  { segment: 'supplier',        permKey: 'supplier' },
  { segment: 'cek-stok',        permKey: 'cek_stok' },
  { segment: 'pesanan',         permKey: 'pesanan' },
  { segment: 'pembelian-masuk', permKey: 'pembelian' },
  { segment: 'rekap',           permKey: 'rekap_supplier' },
  { segment: 'history',         permKey: 'history' },
  { segment: 'trend',           permKey: 'trend' },
  { segment: 'penjualan',       permKey: 'penjualan' },
  { segment: 'rekap-kasir',     permKey: 'rekap_kasir' },
  { segment: 'analisis',        permKey: 'analisis_keuangan' },
  { segment: 'promo',           permKey: 'promo' },
  { segment: 'laporan',         permKey: 'laporan' },
];

function canAccess(permKey: string, permissions: string[] | null): boolean {
  if (permissions === null) return true; // akses penuh
  return permissions.includes(permKey);
}

// useSyncExternalStore: cara resmi React untuk bedakan server vs client rendering
const emptySubscribe = () => () => {};

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<string[] | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const [{ data: storeData }, { data: { user } }] = await Promise.all([
        supabase.from('stores').select('*').eq('id', storeId).single(),
        supabase.auth.getUser(),
      ]);

      if (storeData) setStore(storeData);

      if (user) {
        const res = await fetch('/api/users/me');
        const json = await res.json();
        if (json.success && json.data) {
          const profile = json.data;
          setUserRole(profile.role || '');
          setUserName(profile.name || '');
          const perms: string[] | null = profile.permissions ?? null;
          setUserPermissions(perms);

          // Cek akses halaman saat ini SEBELUM render konten
          if (perms !== null) {
            const currentSegment = window.location.pathname.split('/').pop() || '';
            const currentMenu = STORE_MENU_ORDER.find((m) => m.segment === currentSegment);
            if (currentMenu && !canAccess(currentMenu.permKey, perms)) {
              const firstAccessible = STORE_MENU_ORDER.find((m) => canAccess(m.permKey, perms));
              if (firstAccessible) {
                router.replace(`/toko/${storeId}/${firstAccessible.segment}`);
                return; // tetap loading sampai halaman baru terbuka
              }
            }
          }
        }
      }

      setProfileLoaded(true);
    }

    if (storeId) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Setelah profile loaded, cek apakah halaman saat ini bisa diakses
  // Kalau tidak, redirect ke menu pertama yang boleh diakses
  if (profileLoaded && userPermissions !== null) {
    const currentSegment = pathname.split('/').pop() || '';
    const currentMenu = STORE_MENU_ORDER.find((m) => m.segment === currentSegment);
    if (currentMenu && !canAccess(currentMenu.permKey, userPermissions)) {
      const firstAccessible = STORE_MENU_ORDER.find((m) => canAccess(m.permKey, userPermissions));
      const target = firstAccessible
        ? `/toko/${storeId}/${firstAccessible.segment}`
        : null;
      if (target && target !== pathname) {
        router.replace(target);
      }
    }
  }

  // Blokir render konten sampai profil & permission selesai dimuat
  if (!profileLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-gray-500">Memuat data akses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {isClient && (
        <Sidebar
          storeId={storeId}
          storeName={store?.name || 'Memuat...'}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userRole={userRole}
          userName={userName}
          featurePromo={store?.feature_promo ?? false}
          featureGudang={store?.feature_gudang ?? false}
          featureRoles={store?.feature_roles ?? false}
          userPermissions={userPermissions}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          userName={userName}
          userRole={userRole}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
