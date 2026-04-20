'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Package,
  Truck,
  ClipboardCheck,
  ShoppingCart,
  FileText,
  History,
  TrendingUp,
  BarChart3,
  Tag,
  Settings,
  HelpCircle,
  X,
  Store,
  Users,
  RefreshCw,
  Shield,
  ChevronLeft,
  Lock,
  ShoppingBag,
  Receipt,
  LineChart,
  ArrowLeftRight,
  ClipboardList,
  RotateCcw,
  Lightbulb,
  Palette,
} from 'lucide-react';

// Role yang boleh akses menu bertanda restricted
const PENJUALAN_ROLES = ['owner', 'manajer', 'direktur', 'gm'];

// Label tampilan untuk setiap role
const ROLE_LABEL: Record<string, string> = {
  owner:        'Owner',
  manajer:      'Manajer',
  direktur:     'Direktur',
  gm:           'General Manager',
  supervisor:   'Supervisor',
  staff:        'Staff',
  kasir:        'Kasir',
  admin_gudang: 'Admin Gudang',
};

// Peta dari href-suffix ke permission key
const MENU_PERMISSION_MAP: Record<string, string> = {
  'dashboard':        'dashboard',
  'master-produk':    'master_produk',
  'supplier':         'supplier',
  'cek-stok':         'cek_stok',
  'pesanan':          'pesanan',
  'pembelian-masuk':  'pembelian',
  'rekap':            'rekap_supplier',
  'history':          'history',
  'trend':            'trend',
  'penjualan':        'penjualan',
  'rekap-kasir':      'rekap_kasir',
  'analisis':         'analisis_keuangan',
  'promo':                'promo',
  'rekomendasi-promo':    'promo',
  'desain-promo':         'promo',
};

const GLOBAL_PERMISSION_MAP: Record<string, string> = {
  '/dashboard':    'dashboard_global',
  '/sync':         'sync_monitor',
  '/audit':        'audit_log',
  '/admin/users':  'manajemen_user',
};

interface SidebarProps {
  storeId: string;
  storeName: string;
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
  userName?: string;
  featurePromo?: boolean;
  featureGudang?: boolean;
  featureRoles?: boolean;
  userPermissions?: string[] | null;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  disabled?: boolean;
  badge?: string;
  allowedRoles?: string[]; // jika diisi, hanya role ini yang bisa akses
}

export default function Sidebar({ storeId, storeName, isOpen, onClose, userRole = '', userName = '', featurePromo = false, featureGudang = false, featureRoles = false, userPermissions = null }: SidebarProps) {
  const pathname = usePathname();

  // Per-user permissions: null = akses penuh, string[] = hanya keys yang boleh
  const canAccessMenu = (href: string): boolean => {
    if (userPermissions === null) return true;
    // Cek global menus
    if (GLOBAL_PERMISSION_MAP[href] !== undefined) {
      return userPermissions.includes(GLOBAL_PERMISSION_MAP[href]);
    }
    // Cek store menus — ambil segmen terakhir dari href
    const segment = href.split('/').pop() || '';
    const key = MENU_PERMISSION_MAP[segment];
    if (key) return userPermissions.includes(key);
    return true; // tidak dikenal → tampilkan
  };

  // Role-based menu visibility (legacy — berlaku hanya jika tidak ada per-user permissions)
  const isHiddenByRole = (menuLabel: string): boolean => {
    if (userPermissions !== null) return false; // per-user override takes precedence
    if (!featureRoles) return false;
    if (userRole === 'supervisor') {
      return ['Analisis Keuangan', 'Rekap Kasir'].includes(menuLabel);
    }
    if (userRole === 'admin_gudang') {
      return ['Pesanan', 'Pembelian Masuk', 'Rekap Supplier', 'Analisis Keuangan', 'Rekap Kasir', 'Penjualan', 'Trend & Analisis'].includes(menuLabel);
    }
    return false;
  };

  const storeNavItems: NavItem[] = [
    { label: 'Dashboard', href: `/toko/${storeId}/dashboard`, icon: LayoutDashboard },
    { label: 'Master Produk', href: `/toko/${storeId}/master-produk`, icon: Package },
    { label: 'Daftar Supplier', href: `/toko/${storeId}/supplier`, icon: Truck },
    { label: 'Cek Stok', href: `/toko/${storeId}/cek-stok`, icon: ClipboardCheck },
    { label: 'Pesanan', href: `/toko/${storeId}/pesanan`, icon: ShoppingCart },
    { label: 'Pembelian Masuk', href: `/toko/${storeId}/pembelian-masuk`, icon: ShoppingBag },
    { label: 'Rekap Supplier', href: `/toko/${storeId}/rekap`, icon: FileText },
    { label: 'History', href: `/toko/${storeId}/history`, icon: History },
    { label: 'Trend & Analisis', href: `/toko/${storeId}/trend`, icon: TrendingUp },
    {
      label: 'Penjualan',
      href: `/toko/${storeId}/penjualan`,
      icon: BarChart3,
      allowedRoles: PENJUALAN_ROLES,
    },
    {
      label: 'Rekap Kasir',
      href: `/toko/${storeId}/rekap-kasir`,
      icon: Receipt,
      allowedRoles: PENJUALAN_ROLES,
    },
    {
      label: 'Analisis Keuangan',
      href: `/toko/${storeId}/analisis`,
      icon: LineChart,
      allowedRoles: PENJUALAN_ROLES,
    },
    featurePromo
      ? { label: 'Promo', href: `/toko/${storeId}/promo`, icon: Tag }
      : { label: 'Promo', href: `/toko/${storeId}/promo`, icon: Tag, disabled: true, badge: 'Nonaktif' },
    ...(featurePromo
      ? [
          { label: 'Rekomendasi Promo', href: `/toko/${storeId}/rekomendasi-promo`, icon: Lightbulb },
          { label: 'Desain Promo', href: `/toko/${storeId}/desain-promo`, icon: Palette },
        ]
      : []),
    { label: 'Pengaturan', href: `/toko/${storeId}/settings`, icon: Settings },
    { label: 'Panduan', href: `/toko/${storeId}/panduan`, icon: HelpCircle },
  ];

  const globalNavItems: NavItem[] = [
    { label: 'Dashboard Global', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Manajemen User', href: '/admin/users', icon: Users },
    { label: 'Sync Monitor', href: '/sync', icon: RefreshCw },
    { label: 'Audit Log', href: '/audit', icon: Shield },
  ];

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-72 bg-slate-800 text-slate-200 transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="border-b border-slate-700">
            {/* Toko */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Store className="w-6 h-6 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white truncate">Inventaris</h2>
                  <p className="text-xs text-slate-400 truncate">{storeName}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-slate-700 lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Info — hanya tampil setelah mount (hindari hydration mismatch) */}
            {userName && (
              <div className="flex items-center gap-2 px-4 pb-3">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-white">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">{userName}</p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {ROLE_LABEL[userRole] || userRole || 'Staff'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto no-scrollbar py-2">
            {/* Store Pages */}
            <div className="px-3 mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 py-2">
                Toko
              </p>
            </div>
            {storeNavItems.map((item) => {
              if (isHiddenByRole(item.label)) return null;
              if (!canAccessMenu(item.href)) return null;
              const isActive = pathname === item.href;
              const Icon = item.icon;
              // Cek apakah item punya pembatasan role
              const isRestricted = !!(item.allowedRoles && item.allowedRoles.length > 0);
              const isLocked = isRestricted && !item.allowedRoles!.includes(userRole);
              const isClickable = !item.disabled && !isLocked;

              return (
                <Link
                  key={item.href}
                  href={isClickable ? item.href : '#'}
                  onClick={() => {
                    if (isClickable) onClose();
                  }}
                  title={isLocked ? 'Hanya Owner / Manajer' : undefined}
                  className={cn(
                    'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    isActive && !isLocked
                      ? 'bg-blue-600 text-white font-medium'
                      : isLocked
                        ? 'text-slate-600 cursor-not-allowed'
                        : item.disabled
                          ? 'text-slate-500 cursor-not-allowed'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isLocked && (
                    <Lock className="ml-auto w-3.5 h-3.5 text-slate-600 shrink-0" />
                  )}
                  {!isLocked && item.badge && (
                    <span className="ml-auto text-[10px] bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Gudang Section — hanya tampil jika feature_gudang aktif */}
            {featureGudang && (
              <>
                <div className="mx-4 my-3 border-t border-slate-700" />
                <div className="px-3 mb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 py-2">
                    Gudang
                  </p>
                </div>
                {[
                  { label: 'Transfer Stok', href: `/toko/${storeId}/gudang/transfer`, icon: ArrowLeftRight },
                  { label: 'Stok Opname', href: `/toko/${storeId}/gudang/opname`, icon: ClipboardList },
                  { label: 'Retur Supplier', href: `/toko/${storeId}/gudang/retur`, icon: RotateCcw },
                ].map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-blue-600 text-white font-medium'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}

            {/* Divider */}
            <div className="mx-4 my-3 border-t border-slate-700" />

            {/* Global Pages */}
            <div className="px-3 mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 py-2">
                Global
              </p>
            </div>
            {globalNavItems.map((item) => {
              if (!canAccessMenu(item.href)) return null;
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.disabled ? '#' : item.href}
                  onClick={() => {
                    if (!item.disabled) onClose();
                  }}
                  className={cn(
                    'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white font-medium'
                      : item.disabled
                        ? 'text-slate-500 cursor-not-allowed'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto text-[10px] bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Footer: Switch Store */}
          <div className="border-t border-slate-700 p-3">
            <Link
              href="/pilih-toko"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Ganti Toko</span>
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
