'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import type { Store } from '@/types/database';

// useSyncExternalStore: cara resmi React untuk bedakan server vs client rendering
const emptySubscribe = () => () => {};

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  // isClient = false saat SSR & hydration, true setelah hydration selesai
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<string[] | null>(null);

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
          setUserRole(json.data.role || '');
          setUserName(json.data.name || '');
          setUserPermissions(json.data.permissions ?? null);
        }
      }
    }

    if (storeId) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

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
