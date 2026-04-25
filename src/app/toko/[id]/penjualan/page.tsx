'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart3,
  Calendar,
  Loader2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Lock,
} from 'lucide-react';
import { formatRupiah, formatDateShort } from '@/lib/utils';

interface DailySalesRow {
  id: string;
  store_id: string;
  sale_date: string;
  total_transactions: number;
  total_revenue: number;
  total_items_sold: number;
  total_profit: number;
  synced_at: string | null;
}

interface SaleItemRow {
  id: string;
  store_product_id: string;
  qty_sold: number;
  revenue: number;
  hpp_total: number;
  profit: number;
  avg_sell_price: number;
  current_qty: number | null;
  store_product?: { name: string; barcode: string; unit: string }
    | { name: string; barcode: string; unit: string }[];
}

const ALLOWED_ROLES = ['owner', 'manajer', 'direktur', 'gm'];

export default function PenjualanPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [sales, setSales] = useState<DailySalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dayItems, setDayItems] = useState<SaleItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // Cek hak akses sebelum load data
  useEffect(() => {
    async function checkAccess() {
      const res = await fetch('/api/users/me');
      const json = await res.json();
      const profile = json.success ? json.data : null;
      if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
        setAccessDenied(true);
        setLoading(false);
      }
    }
    checkAccess();
  }, [supabase]);

  useEffect(() => {
    if (accessDenied) return;
    async function fetchSales() {
      setLoading(true);
      let query = supabase
        .from('daily_sales')
        .select('*')
        .eq('store_id', storeId)
        .order('sale_date', { ascending: false });

      if (dateFrom) query = query.gte('sale_date', dateFrom);
      if (dateTo) query = query.lte('sale_date', dateTo);

      const { data, error } = await query.limit(60);

      if (error) {
        console.error('Error fetching sales:', error);
      } else {
        setSales(data || []);
      }
      setLoading(false);
    }

    fetchSales();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, dateFrom, dateTo, accessDenied]);

  async function toggleDayDetail(dayId: string) {
    if (expandedDay === dayId) {
      setExpandedDay(null);
      setDayItems([]);
      return;
    }

    setExpandedDay(dayId);
    setLoadingItems(true);

    // Query 1: item penjualan + nama produk
    const { data: itemsData, error } = await supabase
      .from('daily_sale_items')
      .select(`
        *,
        store_product:store_products(name, barcode, unit)
      `)
      .eq('daily_sale_id', dayId)
      .order('revenue', { ascending: false });

    if (error) {
      console.error('Error fetching sale items:', error);
      setLoadingItems(false);
      return;
    }

    const items: SaleItemRow[] = (itemsData || []).map((i) => ({ ...i, current_qty: null }));

    // Query 2: stok terkini per produk
    const productIds = items.map((i) => i.store_product_id).filter(Boolean);
    if (productIds.length > 0) {
      const { data: stockData } = await supabase
        .from('stock')
        .select('store_product_id, current_qty')
        .eq('store_id', storeId)
        .in('store_product_id', productIds);

      if (stockData) {
        const stockMap: Record<string, number> = {};
        stockData.forEach((s) => { stockMap[s.store_product_id] = s.current_qty; });
        items.forEach((item) => {
          if (item.store_product_id in stockMap) {
            item.current_qty = stockMap[item.store_product_id];
          }
        });
      }
    }

    setDayItems(items);
    setLoadingItems(false);
  }

  // Summary
  const totalRevenue = sales.reduce((s, d) => s + d.total_revenue, 0);
  const totalProfit = sales.reduce((s, d) => s + d.total_profit, 0);
  const totalTrx = sales.reduce((s, d) => s + d.total_transactions, 0);
  const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <Lock className="w-8 h-8 text-red-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-800">Akses Dibatasi</h2>
          <p className="text-sm text-gray-500 mt-1">
            Halaman ini hanya bisa diakses oleh <strong>Owner</strong> atau <strong>Manajer</strong>.
          </p>
          <p className="text-xs text-gray-400 mt-1">Hubungi admin toko untuk mengubah hak akses.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Penjualan Harian</h1>
        <p className="text-sm text-gray-500 mt-1">Data penjualan dari sync iPOS</p>
      </div>

      {/* Date Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-gray-400" />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="input-field w-auto text-sm"
        />
        <span className="text-gray-400 text-sm">s/d</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="input-field w-auto text-sm"
        />
      </div>

      {/* Summary Cards */}
      {sales.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-blue-500" />
              <p className="text-xs text-gray-500">Total Omset</p>
            </div>
            <p className="text-lg font-bold text-gray-800">{formatRupiah(totalRevenue)}</p>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <p className="text-xs text-gray-500">Total Profit</p>
            </div>
            <p className="text-lg font-bold text-green-600">{formatRupiah(totalProfit)}</p>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="w-4 h-4 text-amber-500" />
              <p className="text-xs text-gray-500">Total Transaksi</p>
            </div>
            <p className="text-lg font-bold text-gray-800">{totalTrx.toLocaleString('id-ID')}</p>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-purple-500" />
              <p className="text-xs text-gray-500">Avg Margin</p>
            </div>
            <p className="text-lg font-bold text-purple-600">{avgMargin}%</p>
          </div>
        </div>
      )}

      {/* Sales Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : sales.length === 0 ? (
        <div className="card text-center py-16">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Belum ada data penjualan</p>
          <p className="text-sm text-gray-400 mt-1">
            Data akan tersedia setelah sync dari iPOS
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sales.map((day) => {
            const margin =
              day.total_revenue > 0
                ? ((day.total_profit / day.total_revenue) * 100).toFixed(1)
                : '0';
            const isExpanded = expandedDay === day.id;

            return (
              <div key={day.id} className="card p-0 overflow-hidden">
                <button
                  onClick={() => toggleDayDetail(day.id)}
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {formatDateShort(day.sale_date)}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{day.total_transactions} trx</span>
                        <span>{day.total_items_sold.toLocaleString('id-ID')} item</span>
                        <span className="text-green-600">margin {margin}%</span>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <p className="font-bold text-gray-800">{formatRupiah(day.total_revenue)}</p>
                        <p className="text-xs text-green-600">{formatRupiah(day.total_profit)}</p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {loadingItems ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      </div>
                    ) : dayItems.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        Tidak ada detail item
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="table-header">
                              <th className="px-3 py-2">#</th>
                              <th className="px-3 py-2">Produk</th>
                              <th className="px-3 py-2">Barcode</th>
                              <th className="px-3 py-2 text-right" title="Estimasi: stok saat ini + terjual (bukan data historis)">Stok Awal*</th>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2 text-right">Stok Saat Ini</th>
                              <th className="px-3 py-2 text-right">Revenue</th>
                              <th className="px-3 py-2 text-right">HPP</th>
                              <th className="px-3 py-2 text-right">Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dayItems.map((item, idx) => {
                              const sp = Array.isArray(item.store_product)
                                ? item.store_product[0]
                                : item.store_product;
                              const stokAkhir = item.current_qty;
                              const stokAwal = stokAkhir !== null ? stokAkhir + item.qty_sold : null;
                              const stokAkhirColor =
                                stokAkhir === null ? 'text-gray-400' :
                                stokAkhir === 0 ? 'text-red-600 font-bold' :
                                stokAkhir < 5 ? 'text-orange-500 font-semibold' :
                                'text-gray-700';
                              return (
                                <tr key={item.id} className="hover:bg-gray-50">
                                  <td className="table-cell text-gray-400 text-sm">{idx + 1}</td>
                                  <td className="table-cell font-medium text-sm">
                                    {sp?.name || '-'}
                                  </td>
                                  <td className="table-cell font-mono text-xs text-gray-500">
                                    {sp?.barcode || '-'}
                                  </td>
                                  <td className="table-cell text-right text-sm text-gray-700">
                                    {stokAwal !== null ? stokAwal : '-'}
                                  </td>
                                  <td className="table-cell text-right">
                                    {item.qty_sold} {sp?.unit || ''}
                                  </td>
                                  <td className={`table-cell text-right text-sm ${stokAkhirColor}`}>
                                    {stokAkhir !== null ? stokAkhir : '-'}
                                  </td>
                                  <td className="table-cell text-right font-medium">
                                    {formatRupiah(item.revenue)}
                                  </td>
                                  <td className="table-cell text-right text-sm text-gray-500">
                                    {formatRupiah(item.hpp_total)}
                                  </td>
                                  <td className="table-cell text-right font-medium text-green-600">
                                    {formatRupiah(item.profit)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {(() => {
                          const expandedDayData = sales.find((d) => d.id === expandedDay);
                          const today = new Date().toISOString().slice(0, 10);
                          if (expandedDayData && expandedDayData.sale_date !== today) {
                            return (
                              <p className="px-4 py-2 text-xs text-amber-600 bg-amber-50 border-t border-amber-100">
                                ⚠ Data stok awal/akhir adalah perkiraan untuk tanggal lampau (berdasarkan stok terkini)
                              </p>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
