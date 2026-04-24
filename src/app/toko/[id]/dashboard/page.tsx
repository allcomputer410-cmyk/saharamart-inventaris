'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Package,
  AlertTriangle,
  TrendingUp,
  ShoppingCart,
  Loader2,
  ArrowRight,
  Bell,
} from 'lucide-react';
import { formatRupiah, formatQty } from '@/lib/utils';

interface DashboardStats {
  totalProducts: number;
  criticalStock: number;
  activeOrders: number;
  todaySales: number;
}

interface CriticalProduct {
  id: string;
  barcode: string;
  name: string;
  current_qty: number;
  min_qty: number;
  max_qty: number;
  supplier_name: string | null;
}

export default function DashboardTokoPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    criticalStock: 0,
    activeOrders: 0,
    todaySales: 0,
  });
  const [criticalProducts, setCriticalProducts] = useState<CriticalProduct[]>([]);
  const [recentNotifications, setRecentNotifications] = useState<
    { id: string; title: string; message: string; created_at: string; is_read: boolean }[]
  >([]);

  useEffect(() => {
    async function fetchDashboard() {
      setLoading(true);

      const [productsRes, ordersRes, salesRes, notifsRes] = await Promise.all([
        // Total products
        supabase
          .from('store_products')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .eq('is_deleted', false),

        // Active orders
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .in('status', ['draft', 'ordered', 'partial']),

        // Today's sales
        supabase
          .from('daily_sales')
          .select('total_revenue, total_transactions')
          .eq('store_id', storeId)
          .eq('sale_date', new Date().toISOString().split('T')[0])
          .single(),

        // Recent notifications
        supabase
          .from('notifications')
          .select('id, title, message, created_at, is_read')
          .eq('store_id', storeId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      // Critical stock — paginated agar tidak miss jika produk > 1000
      let criticalCount = 0;
      const criticalList: CriticalProduct[] = [];
      {
        const PAGE = 1000;
        let offset = 0;
        while (true) {
          const { data } = await supabase
            .from('stock')
            .select(`
              current_qty, min_qty, max_qty,
              store_product:store_products(id, barcode, name, supplier:suppliers(name))
            `)
            .eq('store_id', storeId)
            .gt('min_qty', 0)
            .order('current_qty', { ascending: true })
            .range(offset, offset + PAGE - 1);
          if (!data || data.length === 0) break;
          for (const row of data) {
            if (row.current_qty <= row.min_qty) {
              criticalCount++;
              const sp = Array.isArray(row.store_product) ? row.store_product[0] : row.store_product;
              if (sp) {
                const sup = Array.isArray(sp.supplier) ? sp.supplier[0] : sp.supplier;
                criticalList.push({
                  id: sp.id, barcode: sp.barcode, name: sp.name,
                  current_qty: row.current_qty, min_qty: row.min_qty, max_qty: row.max_qty,
                  supplier_name: sup?.name || null,
                });
              }
            }
          }
          if (data.length < PAGE) break;
          offset += PAGE;
        }
      }

      setStats({
        totalProducts: productsRes.count || 0,
        criticalStock: criticalCount,
        activeOrders: ordersRes.count || 0,
        todaySales: salesRes.data?.total_revenue || 0,
      });
      setCriticalProducts(criticalList.slice(0, 5));
      setRecentNotifications(notifsRes.data || []);
      setLoading(false);
    }

    fetchDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const statCards = [
    {
      label: 'Total Produk',
      value: stats.totalProducts.toLocaleString('id-ID'),
      icon: Package,
      color: 'bg-blue-100 text-blue-600',
      link: `/toko/${storeId}/master-produk`,
    },
    {
      label: 'Stok Kritis',
      value: stats.criticalStock.toLocaleString('id-ID'),
      icon: AlertTriangle,
      color: 'bg-red-100 text-red-600',
      link: `/toko/${storeId}/cek-stok`,
    },
    {
      label: 'Pesanan Aktif',
      value: stats.activeOrders.toLocaleString('id-ID'),
      icon: ShoppingCart,
      color: 'bg-amber-100 text-amber-600',
      link: `/toko/${storeId}/pesanan`,
    },
    {
      label: 'Penjualan Hari Ini',
      value: formatRupiah(stats.todaySales),
      icon: TrendingUp,
      color: 'bg-green-100 text-green-600',
      link: `/toko/${storeId}/penjualan`,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Dashboard Toko</h1>
        <p className="text-sm text-gray-500 mt-1">Ringkasan aktivitas toko</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              onClick={() => router.push(stat.link)}
              className="card text-left hover:border-blue-200 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">{stat.label}</p>
                  <p className="text-lg font-bold text-gray-800">{stat.value}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Critical Stock */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Produk Stok Kritis</h3>
            <button
              onClick={() => router.push(`/toko/${storeId}/cek-stok`)}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Lihat Semua <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {criticalProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">Tidak ada stok kritis</p>
            </div>
          ) : (
            <div className="space-y-2">
              {criticalProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.barcode}</p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-sm font-bold text-red-600">{formatQty(product.current_qty)}</p>
                    <p className="text-[10px] text-gray-400">min: {formatQty(product.min_qty)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Notifikasi Terbaru</h3>
          {recentNotifications.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Bell className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">Belum ada notifikasi</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`py-2 border-b border-gray-50 last:border-0 ${
                    !notif.is_read ? 'bg-blue-50/50 -mx-2 px-2 rounded' : ''
                  }`}
                >
                  <p className="text-sm font-medium">{notif.title}</p>
                  {notif.message && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
