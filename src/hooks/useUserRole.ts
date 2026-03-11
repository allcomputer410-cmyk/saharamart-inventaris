import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Permission Matrix ────────────────────────────────────────────────────────

export type UserRole = 'direktur' | 'gm' | 'supervisor' | 'admin_gudang';

export type Permission =
  | 'view_hpp'
  | 'view_profit'
  | 'manage_settings'
  | 'view_all_stores'
  | 'manage_orders'
  | 'warehouse_ops';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  direktur: [
    'view_hpp', 'view_profit', 'manage_settings',
    'view_all_stores', 'manage_orders', 'warehouse_ops',
  ],
  gm: [
    'view_hpp', 'view_profit',
    'view_all_stores', 'manage_orders', 'warehouse_ops',
  ],
  supervisor: [
    'manage_orders', 'warehouse_ops',
  ],
  admin_gudang: [
    'warehouse_ops',
  ],
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseUserRoleResult {
  role: UserRole | null;
  storeId: string | null;
  loading: boolean;
  canAccess: (permission: Permission) => boolean;
}

export function useUserRole(): UseUserRoleResult {
  const supabase = createClient();
  const [role, setRole] = useState<UserRole | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role, store_id')
          .eq('id', user.id)
          .single();

        if (profile) {
          setRole((profile as { role: UserRole; store_id: string | null }).role);
          setStoreId((profile as { role: UserRole; store_id: string | null }).store_id);
        }
      } catch {
        // no-op
      } finally {
        setLoading(false);
      }
    }
    fetchRole();
  }, [supabase]);

  const canAccess = (permission: Permission): boolean => {
    if (!role) return false;
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
  };

  return { role, storeId, loading, canAccess };
}
