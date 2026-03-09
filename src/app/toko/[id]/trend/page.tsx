'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  Loader2,
  Package,
  Download,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { formatRupiah, formatQty } from '@/lib/utils';

type TabType = 'fast' | 'slow' | 'dead' | 'prediction';

interface ProductTrend {
  id: string;
  name: string;
  barcode: string;
  unit: string;
  currentQty: number;
  totalSold: number;
  totalRevenue: number;
  avgDailySold: number;
  daysOfStock: number | null;
  categoryName: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TrendPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>('fast');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductTrend[]>([]);
  const [daysRange, setDaysRange] = useState(30);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    async function fetchTrend() {
      setLoading(true);

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysRange);
      const sinceDateStr = sinceDate.toISOString().split('T')[0];

      const { data: storeProducts } = await supabase
        .from('store_products')
        .select(`
          id, barcode, name, unit, category_id,
          category:categories(name),
          stock:stock(current_qty)
        `)
        .eq('store_id', storeId)
        .eq('is_deleted', false)
        .eq('is_active', true);

      const { data: dailySales } = await supabase
        .from('daily_sales')
        .select('id')
        .eq('store_id', storeId)
        .gte('sale_date', sinceDateStr);

      const dailySaleIds = (dailySales || []).map(d => d.id);

      const saleItemsMap = new Map<string, { totalSold: number; totalRevenue: number }>();
      if (dailySaleIds.length > 0) {
        const { data: saleItems } = await supabase
          .from('daily_sale_items')
          .select('store_product_id, qty_sold, revenue')
          .in('daily_sale_id', dailySaleIds);

        for (const item of saleItems || []) {
          const existing = saleItemsMap.get(item.store_product_id) || { totalSold: 0, totalRevenue: 0 };
          existing.totalSold += item.qty_sold || 0;
          existing.totalRevenue += item.revenue || 0;
          saleItemsMap.set(item.store_product_id, existing);
        }
      }

      const trends: ProductTrend[] = (storeProducts || []).map((sp) => {
        const stockArr = Array.isArray(sp.stock) ? sp.stock : sp.stock ? [sp.stock] : [];
        const currentQty = stockArr[0]?.current_qty || 0;
        const cat = Array.isArray(sp.category) ? sp.category[0] : sp.category;
        const sales = saleItemsMap.get(sp.id) || { totalSold: 0, totalRevenue: 0 };
        const avgDaily = daysRange > 0 ? sales.totalSold / daysRange : 0;
        const daysOfStock = avgDaily > 0 ? currentQty / avgDaily : null;

        return {
          id: sp.id,
          name: sp.name,
          barcode: sp.barcode,
          unit: sp.unit || 'PCS',
          currentQty,
          totalSold: sales.totalSold,
          totalRevenue: sales.totalRevenue,
          avgDailySold: avgDaily,
          daysOfStock,
          categoryName: cat?.name || '-',
        };
      });

      setProducts(trends);
      setLoading(false);
    }

    fetchTrend();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, daysRange]);

  // Filter by tab
  const getFilteredProducts = () => {
    switch (activeTab) {
      case 'fast':
        return [...products].filter(p => p.totalSold > 0).sort((a, b) => b.totalSold - a.totalSold);
      case 'slow':
        return [...products].filter(p => p.totalSold > 0 && p.avgDailySold < 1).sort((a, b) => a.totalSold - b.totalSold);
      case 'dead':
        return products.filter(p => p.totalSold === 0 && p.currentQty > 0);
      case 'prediction':
        return [...products]
          .filter(p => p.daysOfStock !== null && p.daysOfStock < 30)
          .sort((a, b) => (a.daysOfStock || 0) - (b.daysOfStock || 0));
      default:
        return products;
    }
  };

  const filtered = getFilteredProducts();

  const tabLabels: Record<TabType, string> = {
    fast: 'Fast Moving',
    slow: 'Slow Moving',
    dead: 'Dead Stock',
    prediction: 'Prediksi Reorder',
  };

  // ─── Export Excel ──────────────────────────────────────────────────────────
  async function exportExcel() {
    setExporting('excel');
    setShowExportMenu(false);
    try {
      const XLSX = await import('xlsx');
      const rows = filtered.map((p, idx) => ({
        'No': idx + 1,
        'Barcode': p.barcode,
        'Nama Produk': p.name,
        'Kategori': p.categoryName,
        'Satuan': p.unit,
        'Stok Saat Ini': p.currentQty,
        'Total Terjual': p.totalSold,
        'Avg/Hari': parseFloat(p.avgDailySold.toFixed(2)),
        'Revenue (Rp)': p.totalRevenue,
        'Sisa Hari': p.daysOfStock !== null ? Math.round(p.daysOfStock) : '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 4 }, { wch: 14 }, { wch: 35 }, { wch: 14 },
        { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 16 }, { wch: 10 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tabLabels[activeTab]);
      XLSX.writeFile(wb, `trend-${activeTab}-${daysRange}hari.xlsx`);
    } finally {
      setExporting(null);
    }
  }

  // ─── Export PDF ────────────────────────────────────────────────────────────
  async function exportPDF() {
    setExporting('pdf');
    setShowExportMenu(false);
    try {
      const { pdf, Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer');

      const s = StyleSheet.create({
        page:        { padding: 24, fontSize: 8, fontFamily: 'Helvetica' },
        title:       { fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
        subtitle:    { fontSize: 9, color: '#6b7280', marginBottom: 12 },
        tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottom: '1pt solid #e5e7eb', paddingVertical: 5, paddingHorizontal: 4 },
        tableRow:    { flexDirection: 'row', borderBottom: '0.5pt solid #f3f4f6', paddingVertical: 4, paddingHorizontal: 4 },
        col0: { width: '4%',  textAlign: 'right' },
        col1: { width: '30%' },
        col2: { width: '15%' },
        col3: { width: '12%', textAlign: 'right' },
        col4: { width: '12%', textAlign: 'right' },
        col5: { width: '12%', textAlign: 'right' },
        col6: { width: '15%', textAlign: 'right' },
        bold:   { fontWeight: 'bold', fontSize: 8 },
        footer: { marginTop: 16, fontSize: 7, color: '#9ca3af', textAlign: 'right' },
      });

      const tabLabel  = tabLabels[activeTab];
      const showSales = tabLabel !== 'Dead Stock';
      const showDays  = tabLabel === 'Prediksi Reorder';
      const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      const rupiah = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

      const doc = (
        <Document>
          <Page size="A4" orientation="landscape" style={s.page}>
            <Text style={s.title}>Trend & Analisis — {tabLabel}</Text>
            <Text style={s.subtitle}>Periode {daysRange} hari · Dicetak {now} · {filtered.length} produk</Text>

            <View style={s.tableHeader}>
              <Text style={[s.col0, s.bold]}>#</Text>
              <Text style={[s.col1, s.bold]}>Produk</Text>
              <Text style={[s.col2, s.bold]}>Kategori</Text>
              <Text style={[s.col3, s.bold]}>Stok</Text>
              {showSales && <><Text style={[s.col4, s.bold]}>Terjual</Text><Text style={[s.col5, s.bold]}>Avg/Hr</Text><Text style={[s.col6, s.bold]}>Revenue</Text></>}
              {showDays  && <Text style={[s.col6, s.bold]}>Sisa Hari</Text>}
            </View>

            {filtered.map((p, idx) => (
              <View key={p.id} style={[s.tableRow, { backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }]}>
                <Text style={s.col0}>{idx + 1}</Text>
                <View style={s.col1}>
                  <Text>{p.name.slice(0, 38)}</Text>
                  <Text style={{ fontSize: 6, color: '#9ca3af' }}>{p.barcode}</Text>
                </View>
                <Text style={s.col2}>{p.categoryName}</Text>
                <Text style={s.col3}>{p.currentQty.toFixed(0)} {p.unit}</Text>
                {showSales && (
                  <>
                    <Text style={s.col4}>{p.totalSold.toFixed(0)}</Text>
                    <Text style={s.col5}>{p.avgDailySold.toFixed(1)}</Text>
                    <Text style={s.col6}>{rupiah(p.totalRevenue)}</Text>
                  </>
                )}
                {showDays && (
                  <Text style={[s.col6, { color: (p.daysOfStock || 0) <= 7 ? '#dc2626' : (p.daysOfStock || 0) <= 14 ? '#d97706' : '#16a34a' }]}>
                    {p.daysOfStock !== null ? Math.round(p.daysOfStock) + ' hari' : '-'}
                  </Text>
                )}
              </View>
            ))}

            <Text style={s.footer}>SAHARAMART — Sistem Manajemen Inventaris</Text>
          </Page>
        </Document>
      );

      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trend-${activeTab}-${daysRange}hari.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  // Category breakdown for current tab
  const categoryBreakdown = new Map<string, { count: number; totalSold: number; totalRevenue: number }>();
  for (const p of filtered) {
    const cat = p.categoryName;
    const existing = categoryBreakdown.get(cat) || { count: 0, totalSold: 0, totalRevenue: 0 };
    existing.count++;
    existing.totalSold += p.totalSold;
    existing.totalRevenue += p.totalRevenue;
    categoryBreakdown.set(cat, existing);
  }

  const tabs: { key: TabType; label: string; icon: React.ElementType; count: number }[] = [
    { key: 'fast', label: 'Fast Moving', icon: TrendingUp, count: products.filter(p => p.totalSold > 0).length },
    { key: 'slow', label: 'Slow Moving', icon: TrendingDown, count: products.filter(p => p.totalSold > 0 && p.avgDailySold < 1).length },
    { key: 'dead', label: 'Dead Stock', icon: AlertTriangle, count: products.filter(p => p.totalSold === 0 && p.currentQty > 0).length },
    { key: 'prediction', label: 'Prediksi', icon: BarChart3, count: products.filter(p => p.daysOfStock !== null && p.daysOfStock < 30).length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Trend & Analisis</h1>
          <p className="text-sm text-gray-500 mt-1">
            Analisis pergerakan stok dan prediksi kebutuhan
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export Button */}
          {!loading && filtered.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                {exporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Export
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-9 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[140px]">
                  <button
                    onClick={exportExcel}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-green-600" />
                    Excel (.xlsx)
                  </button>
                  <button
                    onClick={exportPDF}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg border-t border-gray-100"
                  >
                    <FileText className="w-4 h-4 text-red-500" />
                    PDF
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Days Range */}
          <select
            value={daysRange}
            onChange={(e) => setDaysRange(parseInt(e.target.value))}
            className="input-field w-auto text-sm"
          >
            <option value={7}>7 hari</option>
            <option value={14}>14 hari</option>
            <option value={30}>30 hari</option>
            <option value={60}>60 hari</option>
            <option value={90}>90 hari</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full ml-1">
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Category Breakdown */}
          {categoryBreakdown.size > 0 && (
            <div className="flex gap-2 flex-wrap">
              {Array.from(categoryBreakdown.entries())
                .sort((a, b) => b[1].totalSold - a[1].totalSold)
                .slice(0, 8)
                .map(([cat, data]) => (
                  <div key={cat} className="card py-2 px-3">
                    <p className="text-[10px] text-gray-400 uppercase">{cat}</p>
                    <p className="text-sm font-bold text-gray-800">{data.count} produk</p>
                    {data.totalSold > 0 && (
                      <p className="text-[10px] text-gray-500">{formatQty(data.totalSold)} terjual</p>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Product Table */}
          {filtered.length === 0 ? (
            <div className="card text-center py-16">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {activeTab === 'dead' ? 'Tidak ada dead stock' :
                 activeTab === 'prediction' ? 'Semua stok aman (>30 hari)' :
                 'Belum ada data penjualan'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Data muncul setelah sync penjualan dari iPOS
              </p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Produk</th>
                      <th className="px-3 py-2">Kategori</th>
                      <th className="px-3 py-2 text-right">Stok</th>
                      {activeTab !== 'dead' && (
                        <>
                          <th className="px-3 py-2 text-right">Total Terjual</th>
                          <th className="px-3 py-2 text-right">Avg/Hari</th>
                          <th className="px-3 py-2 text-right">Revenue</th>
                        </>
                      )}
                      {activeTab === 'prediction' && (
                        <th className="px-3 py-2 text-right">Sisa Hari</th>
                      )}
                      {activeTab === 'dead' && (
                        <th className="px-3 py-2 text-right">Nilai Stok</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 50).map((product, idx) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="table-cell text-gray-400 text-sm">{idx + 1}</td>
                        <td className="table-cell">
                          <p className="font-medium text-sm">{product.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{product.barcode}</p>
                        </td>
                        <td className="table-cell text-sm text-gray-500">{product.categoryName}</td>
                        <td className="table-cell text-right">
                          <span className={product.currentQty <= 0 ? 'text-red-600 font-bold' : ''}>
                            {formatQty(product.currentQty)} {product.unit}
                          </span>
                        </td>
                        {activeTab !== 'dead' && (
                          <>
                            <td className="table-cell text-right font-medium">
                              {formatQty(product.totalSold)}
                            </td>
                            <td className="table-cell text-right text-sm text-gray-500">
                              {product.avgDailySold.toFixed(1)}/hari
                            </td>
                            <td className="table-cell text-right text-sm">
                              {formatRupiah(product.totalRevenue)}
                            </td>
                          </>
                        )}
                        {activeTab === 'prediction' && (
                          <td className="table-cell text-right">
                            {product.daysOfStock !== null ? (
                              <span className={`font-bold ${
                                product.daysOfStock <= 7 ? 'text-red-600' :
                                product.daysOfStock <= 14 ? 'text-amber-600' :
                                'text-green-600'
                              }`}>
                                {Math.round(product.daysOfStock)} hari
                              </span>
                            ) : '-'}
                          </td>
                        )}
                        {activeTab === 'dead' && (
                          <td className="table-cell text-right text-sm text-gray-500">
                            {formatQty(product.currentQty)} {product.unit}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > 50 && (
                <div className="text-center py-2 text-xs text-gray-400 bg-gray-50">
                  Menampilkan 50 dari {filtered.length} produk · Export untuk melihat semua
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
