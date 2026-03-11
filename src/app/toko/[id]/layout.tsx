'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import type { Store } from '@/types/database';

// useSyncExternalStore: cara resmi React untuk bedakan server vs client rendering
// getServerSnapshot() dipanggil saat SSR DAN saat hydration → garantiikan tidak ada mismatch
const emptySubscribe = () => () => {};

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const storeId = params.id as string;
  const supabase = createClient();
  // isClient = false saat SSR & hydration, true setelah hydration selesai
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    async function fetchData() {
      const [{ data: storeData }, { data: { user } }] = await Promise.all([
        supabase.from('stores').select('*').eq('id', storeId).single(),
        supabase.auth.getUser(),
      ]);

      if (storeData) setStore(storeData);

      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('name, role')
          .eq('id', user.id)
          .single();
        if (profile?.role) setUserRole(profile.role);
        if (profile?.name) setUserName(profile.name);
      }
    }

    if (storeId) fetchData();
  }, [storeId, supabase]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar hanya di-render setelah client mount — server selalu render null di sini */}
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
