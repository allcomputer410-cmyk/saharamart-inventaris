'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Store as StoreIcon,
  Package,
  AlertTriangle,
  TrendingUp,
  Loader2,
  ShoppingCart,
  Lightbulb,
} from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface StoreStats {
  storeId: string;
  storeName: string;
  storeCode: string;
  totalProducts: number;
  criticalStock: number;
  activeOrders: number;
  todaySales: number;
  urgentPromos: number;
}

export default function GlobalDashboardPage() {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [loading, setLoading] = useState(true);
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);

  useEffect(() => {
    async function fetchData() {
      // Get all active stores
      const { data: stores } = await supabase
        .from('stores')
        .select('id, code, name')
        .eq('is_active', true)
        .order('name');

      if (!stores || stores.length === 0) {
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const stats: StoreStats[] = [];

      for (const store of stores) {
        // Parallel queries per store
        const [productsRes, ordersRes, salesRes, urgentPromosRes] = await Promise.all([
          supabase
            .from('store_products')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', store.id)
            .eq('is_deleted', false),
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', store.id)
            .in('status', ['draft', 'ordered', 'partial']),
          supabase
            .from('daily_sales')
            .select('total_revenue')
            .eq('store_id', store.id)
            .eq('sale_date', today)
            .single(),
          supabase
            .from('promo_recommendations')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', store.id)
            .eq('status', 'pending')
            .eq('priority', 'urgent'),
        ]);

        // Paginate critical stock to avoid 1000-row Supabase limit
        const STOCK_PAGE = 1000;
        let stockOffset = 0;
        let criticalCount = 0;
        while (true) {
          const { data: stockBatch } = await supabase
            .from('stock').select('current_qty, min_qty')
            .eq('store_id', store.id).gt('min_qty', 0)
            .range(stockOffset, stockOffset + STOCK_PAGE - 1);
          if (!stockBatch || stockBatch.length === 0) break;
          criticalCount += stockBatch.filter(s => s.current_qty <= s.min_qty).length;
          if (stockBatch.length < STOCK_PAGE) break;
          stockOffset += STOCK_PAGE;
        }

        stats.push({
          storeId: store.id,
          storeName: store.name,
          storeCode: store.code,
          totalProducts: productsRes.count || 0,
          criticalStock: criticalCount,
          activeOrders: ordersRes.count || 0,
          todaySales: salesRes.data?.total_revenue || 0,
          urgentPromos: urgentPromosRes.count || 0,
        });
      }

      setStoreStats(stats);
      setLoading(false);
    }

    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalProducts = storeStats.reduce((s, st) => s + st.totalProducts, 0);
  const totalCritical = storeStats.reduce((s, st) => s + st.criticalStock, 0);
  const _totalOrders = storeStats.reduce((s, st) => s + st.activeOrders, 0);
  const totalSales = storeStats.reduce((s, st) => s + st.todaySales, 0);

  const chartData = storeStats.map((st) => ({
    name: st.storeCode,
    Produk: st.totalProducts,
    'Stok Kritis': st.criticalStock,
    'Pesanan Aktif': st.activeOrders,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Dashboard Global</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ringkasan semua toko (Direktur only)
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600">
                  <StoreIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Toko</p>
                  <p className="text-lg font-bold text-gray-800">{storeStats.length}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-100 text-green-600">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Produk</p>
                  <p className="text-lg font-bold text-gray-800">{totalProducts.toLocaleString('id-ID')}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-100 text-red-600">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Stok Kritis</p>
                  <p className="text-lg font-bold text-red-600">{totalCritical.toLocaleString('id-ID')}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100 text-amber-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Omset Hari Ini</p>
                  <p className="text-lg font-bold text-gray-800">{formatRupiah(totalSales)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bar Chart: Store Comparison */}
          {storeStats.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-4">Perbandingan Toko</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Produk" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Stok Kritis" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Pesanan Aktif" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Promo Alert Section */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-purple-600" />
              Alert Rekomendasi Promo
            </h3>
            {storeStats.every((s) => s.urgentPromos === 0) ? (
              <p className="text-sm text-green-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Semua toko OK, tidak ada rekomendasi urgent
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {storeStats.map((store) => (
                  <div key={store.storeId} className="flex items-center justify-between py-2 gap-3">
                    <div className="flex items-center gap-2">
                      <StoreIcon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-700">{store.storeName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {store.urgentPromos > 0 ? (
                        <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          {store.urgentPromos} produk urgent
                        </span>
                      ) : (
                        <span className="text-xs text-green-600">OK</span>
                      )}
                      <a
                        href={`/toko/${store.storeId}/rekomendasi-promo`}
                        className="text-xs text-purple-600 hover:underline whitespace-nowrap"
                      >
                        Lihat →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-Store Cards */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">Detail per Toko</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {storeStats.map((store) => (
                <a
                  key={store.storeId}
                  href={`/toko/${store.storeId}/dashboard`}
                  className="card hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <StoreIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-gray-800 truncate">{store.storeName}</h4>
                      <p className="text-xs text-gray-400">{store.storeCode}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-gray-500">{store.totalProducts} produk</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-gray-500">{store.criticalStock} kritis</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShoppingCart className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-gray-500">{store.activeOrders} pesanan</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-gray-500">{formatRupiah(store.todaySales)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
