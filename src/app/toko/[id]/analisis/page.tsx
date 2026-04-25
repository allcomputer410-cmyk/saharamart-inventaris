'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2,
  Lock,
  ChevronDown,
  ChevronUp,
  LineChart as LineChartIcon,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  DollarSign,
  BarChart3,
  Package,
  Wallet,
  RefreshCw,
} from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import type { OperationalCost, SaleItemDetail, MarginRendahRow } from '@/types/database';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────
const ALLOWED_ROLES = ['owner', 'manajer', 'direktur', 'gm'];

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface DailySalesRow {
  id: string;
  store_id: string;
  sale_date: string;
  total_transactions: number;
  total_revenue: number;
  total_items_sold: number;
  total_profit: number;
}

interface KategoriData {
  kode: string;
  nama: string;
  qty: number;
  omzet: number;
  hpp: number;
  laba: number;
  margin: number;
}

interface TopProduct {
  barcode: string;
  nama: string;
  qty: number;
  laba: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function firstOfMonth(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalisisKeuanganPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Access
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Date filter (default: bulan ini)
  const [dateFrom, setDateFrom] = useState(() => firstOfMonth(todayStr()));
  const [dateTo, setDateTo] = useState(() => todayStr());

  // Data
  const [dailySales, setDailySales] = useState<DailySalesRow[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItemDetail[]>([]);
  const [marginData, setMarginData] = useState<MarginRendahRow[]>([]);
  const [biayaOps, setBiayaOps] = useState<OperationalCost | null>(null);

  // UI
  const [showAllMargin, setShowAllMargin] = useState(false);
  const [showBiayaPanel, setShowBiayaPanel] = useState(false);
  const [savingBiaya, setSavingBiaya] = useState(false);
  const [biayaForm, setBiayaForm] = useState({
    gaji_karyawan: '',
    listrik: '',
    sewa_tempat: '',
    plastik_kemasan: '',
    transportasi: '',
    lain_lain: '',
    modal_investasi: '',
    catatan: '',
  });

  // ─── Access check ────────────────────────────────────────────────────────
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Fetch data ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (accessDenied) return;
    setLoading(true);

    const bulanKey = firstOfMonth(dateFrom);

    const [salesRes, marginRes, biayaRes] = await Promise.all([
      // 1) Daily sales untuk KPI
      supabase
        .from('daily_sales')
        .select('*')
        .eq('store_id', storeId)
        .gte('sale_date', dateFrom)
        .lte('sale_date', dateTo)
        .order('sale_date', { ascending: true }),

      // 2) v_margin_rendah untuk Traffic Light (tidak filter tanggal — master data)
      supabase
        .from('v_margin_rendah')
        .select('*')
        .eq('store_id', storeId)
        .order('margin_pct', { ascending: true }),

      // 3) Biaya operasional bulan ini
      supabase
        .from('operational_costs')
        .select('*')
        .eq('store_id', storeId)
        .eq('bulan', bulanKey)
        .maybeSingle(),
    ]);

    // Paginate v_sale_items_detail (tanpa batas hardcoded)
    const PAGE = 1000;
    let offset = 0;
    const allItems: SaleItemDetail[] = [];
    while (true) {
      const { data: itemsBatch } = await supabase
        .from('v_sale_items_detail')
        .select('*')
        .eq('store_id', storeId)
        .gte('sale_date', dateFrom)
        .lte('sale_date', dateTo)
        .range(offset, offset + PAGE - 1);
      if (!itemsBatch || itemsBatch.length === 0) break;
      allItems.push(...(itemsBatch as SaleItemDetail[]));
      if (itemsBatch.length < PAGE) break;
      offset += PAGE;
    }

    if (salesRes.data) setDailySales(salesRes.data);
    setSaleItems(allItems);
    if (marginRes.data) setMarginData(marginRes.data as MarginRendahRow[]);

    const biaya = biayaRes.data as OperationalCost | null;
    setBiayaOps(biaya);
    if (biaya) {
      setBiayaForm({
        gaji_karyawan:  String(biaya.gaji_karyawan || ''),
        listrik:        String(biaya.listrik || ''),
        sewa_tempat:    String(biaya.sewa_tempat || ''),
        plastik_kemasan: String(biaya.plastik_kemasan || ''),
        transportasi:   String(biaya.transportasi || ''),
        lain_lain:      String(biaya.lain_lain || ''),
        modal_investasi: String(biaya.modal_investasi || ''),
        catatan:        biaya.catatan || '',
      });
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, dateFrom, dateTo, accessDenied]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── KPI aggregate dari daily_sales ──────────────────────────────────────
  const kpiOmzet  = dailySales.reduce((s, d) => s + d.total_revenue, 0);
  const kpiLaba   = dailySales.reduce((s, d) => s + d.total_profit, 0);
  const kpiTrx    = dailySales.reduce((s, d) => s + d.total_transactions, 0);
  const kpiQty    = dailySales.reduce((s, d) => s + d.total_items_sold, 0);
  const kpiHpp    = kpiOmzet - kpiLaba;
  const kpiMargin = kpiOmzet > 0 ? ((kpiLaba / kpiOmzet) * 100) : 0;
  const totalBiaya = biayaOps?.total_biaya ?? 0;
  const labaBersih = kpiLaba - totalBiaya;
  const modalInv   = biayaOps?.modal_investasi ?? 0;
  const roi        = modalInv > 0 ? ((labaBersih / modalInv) * 100) : 0;

  // ─── Top 10 (dari saleItems) ──────────────────────────────────────────────
  const productMap = new Map<string, TopProduct>();
  for (const item of saleItems) {
    const key = item.barcode;
    if (!productMap.has(key)) {
      productMap.set(key, { barcode: key, nama: item.nama_produk, qty: 0, laba: 0 });
    }
    const p = productMap.get(key)!;
    p.qty  += item.qty_sold;
    p.laba += item.profit;
  }
  const allProducts = Array.from(productMap.values());
  const topByQty  = [...allProducts].sort((a, b) => b.qty  - a.qty ).slice(0, 10).reverse();
  const topByLaba = [...allProducts].sort((a, b) => b.laba - a.laba).slice(0, 10).reverse();

  // ─── Kategori aggregate ───────────────────────────────────────────────────
  const katMap = new Map<string, KategoriData>();
  for (const item of saleItems) {
    const key = item.kategori_kode;
    if (!katMap.has(key)) {
      katMap.set(key, { kode: key, nama: item.kategori_nama, qty: 0, omzet: 0, hpp: 0, laba: 0, margin: 0 });
    }
    const k = katMap.get(key)!;
    k.qty   += item.qty_sold;
    k.omzet += item.revenue;
    k.hpp   += item.hpp_total;
    k.laba  += item.profit;
  }
  const kategoriData: KategoriData[] = Array.from(katMap.values()).map(k => ({
    ...k,
    margin: k.omzet > 0 ? (k.laba / k.omzet) * 100 : 0,
  })).sort((a, b) => b.laba - a.laba);

  // ─── Margin traffic light summary ────────────────────────────────────────
  const marginKritis = marginData.filter(m => m.status_margin === 'KRITIS');
  const marginRendah = marginData.filter(m => m.status_margin === 'RENDAH');
  const marginSedang = marginData.filter(m => m.status_margin === 'SEDANG');
  const marginSehat  = marginData.filter(m => m.status_margin === 'SEHAT');
  const marginNoHpp  = marginData.filter(m => m.status_margin === 'NO_HPP');

  const displayedMargin = showAllMargin
    ? marginData
    : [...marginKritis, ...marginRendah];

  // ─── Biaya form helpers ───────────────────────────────────────────────────
  function biayaNum(field: keyof typeof biayaForm) {
    return parseFloat(biayaForm[field] || '0') || 0;
  }
  const totalBiayaForm = biayaNum('gaji_karyawan') + biayaNum('listrik') +
    biayaNum('sewa_tempat') + biayaNum('plastik_kemasan') +
    biayaNum('transportasi') + biayaNum('lain_lain');

  async function saveBiaya() {
    setSavingBiaya(true);
    const bulan = firstOfMonth(dateFrom);
    const payload = {
      store_id:        storeId,
      bulan,
      gaji_karyawan:   biayaNum('gaji_karyawan'),
      listrik:         biayaNum('listrik'),
      sewa_tempat:     biayaNum('sewa_tempat'),
      plastik_kemasan: biayaNum('plastik_kemasan'),
      transportasi:    biayaNum('transportasi'),
      lain_lain:       biayaNum('lain_lain'),
      modal_investasi: biayaNum('modal_investasi'),
      catatan:         biayaForm.catatan,
      updated_at:      new Date().toISOString(),
    };

    const { error } = await supabase
      .from('operational_costs')
      .upsert(payload, { onConflict: 'store_id,bulan' });

    if (!error) {
      // Refresh biaya ops
      const { data } = await supabase
        .from('operational_costs')
        .select('*')
        .eq('store_id', storeId)
        .eq('bulan', bulan)
        .maybeSingle();
      setBiayaOps(data as OperationalCost | null);
    }
    setSavingBiaya(false);
  }

  // ─── Shortcut buttons ────────────────────────────────────────────────────
  function setShortcut(label: string) {
    const today = todayStr();
    if (label === 'Hari Ini')   { setDateFrom(today);         setDateTo(today); }
    if (label === 'Kemarin')    { setDateFrom(yesterday());   setDateTo(yesterday()); }
    if (label === 'Minggu Ini') { setDateFrom(startOfWeek()); setDateTo(today); }
    if (label === 'Bulan Ini')  { setDateFrom(firstOfMonth(today)); setDateTo(today); }
  }

  // ─── Access denied UI ────────────────────────────────────────────────────
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
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <LineChartIcon className="w-5 h-5 text-blue-600" />
          Analisis Keuangan
        </h1>
        <p className="text-sm text-gray-500 mt-1">Omzet, laba, margin, dan biaya operasional toko</p>
      </div>

      {/* ── Date filter ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-wrap gap-2 mb-3">
          {(['Hari Ini', 'Kemarin', 'Minggu Ini', 'Bulan Ini'] as const).map(label => (
            <button
              key={label}
              onClick={() => setShortcut(label)}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="input-field w-auto text-sm"
          />
          <span className="text-gray-400 text-sm">s/d</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="input-field w-auto text-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* ══ SECTION A: KPI Cards ════════════════════════════════════════ */}
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
              A — Ringkasan Keuangan
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">

              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-blue-500" />
                  <p className="text-xs text-gray-500">Omzet</p>
                </div>
                <p className="text-lg font-bold text-gray-800">{formatRupiah(kpiOmzet)}</p>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-amber-500" />
                  <p className="text-xs text-gray-500">Qty Terjual</p>
                </div>
                <p className="text-lg font-bold text-gray-800">{kpiQty.toLocaleString('id-ID')}</p>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingBag className="w-4 h-4 text-indigo-500" />
                  <p className="text-xs text-gray-500">Transaksi</p>
                </div>
                <p className="text-lg font-bold text-gray-800">{kpiTrx.toLocaleString('id-ID')}</p>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-gray-400" />
                  <p className="text-xs text-gray-500">HPP</p>
                </div>
                <p className="text-lg font-bold text-gray-700">{formatRupiah(kpiHpp)}</p>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-gray-500">Laba Kotor</p>
                </div>
                <p className="text-lg font-bold text-green-600">{formatRupiah(kpiLaba)}</p>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-purple-500" />
                  <p className="text-xs text-gray-500">Margin</p>
                </div>
                <p className="text-lg font-bold text-purple-600">{kpiMargin.toFixed(1)}%</p>
              </div>

              {/* Kartu tambahan jika ada biaya operasional */}
              {biayaOps && (
                <>
                  <div className={`card col-span-1 ${labaBersih >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="w-4 h-4 text-teal-500" />
                      <p className="text-xs text-gray-500">Laba Bersih</p>
                    </div>
                    <p className={`text-lg font-bold ${labaBersih >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatRupiah(labaBersih)}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Biaya ops: {formatRupiah(totalBiaya)}
                    </p>
                  </div>

                  {modalInv > 0 && (
                    <div className="card border-blue-200 bg-blue-50">
                      <div className="flex items-center gap-2 mb-1">
                        <RefreshCw className="w-4 h-4 text-blue-500" />
                        <p className="text-xs text-gray-500">ROI</p>
                      </div>
                      <p className="text-lg font-bold text-blue-700">{roi.toFixed(1)}%</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Modal: {formatRupiah(modalInv)}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ══ SECTION B: Traffic Light Margin ════════════════════════════ */}
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
              B — Margin Produk
            </h2>

            {/* Summary counter */}
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                {marginKritis.length} KRITIS
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                {marginRendah.length} RENDAH
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                {marginSedang.length} SEDANG
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                {marginSehat.length} SEHAT
              </span>
              {marginNoHpp.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                  {marginNoHpp.length} BELUM ADA HPP
                </span>
              )}
            </div>

            {marginData.length === 0 ? (
              <div className="card text-center py-10 text-gray-400 text-sm">
                Belum ada data produk
              </div>
            ) : (
              <>
                <div className="card p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="table-header">
                          <th className="px-3 py-2">Produk</th>
                          <th className="px-3 py-2">Kategori</th>
                          <th className="px-3 py-2 text-right">HPP</th>
                          <th className="px-3 py-2 text-right">Harga Jual</th>
                          <th className="px-3 py-2 text-right">Margin</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedMargin.map(row => (
                          <tr
                            key={row.id}
                            className={
                              row.status_margin === 'KRITIS' ? 'bg-red-50 border-l-4 border-red-500' :
                              row.status_margin === 'RENDAH' ? 'bg-orange-50 border-l-4 border-orange-400' :
                              row.status_margin === 'SEDANG' ? 'bg-yellow-50' :
                              row.status_margin === 'NO_HPP' ? 'bg-gray-50 opacity-70' :
                              'hover:bg-gray-50'
                            }
                          >
                            <td className="table-cell font-medium text-sm">{row.nama_produk}</td>
                            <td className="table-cell text-xs text-gray-500">{row.kategori_kode}</td>
                            <td className="table-cell text-right text-sm">
                              {row.hpp > 0 ? formatRupiah(row.hpp) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="table-cell text-right text-sm">{formatRupiah(row.harga_jual)}</td>
                            <td className="table-cell text-right font-semibold text-sm">
                              {row.status_margin === 'NO_HPP' ? <span className="text-gray-300">—</span> : `${row.margin_pct}%`}
                            </td>
                            <td className="table-cell">
                              <span className={
                                row.status_margin === 'KRITIS' ? 'badge badge-danger' :
                                row.status_margin === 'RENDAH' ? 'badge bg-orange-100 text-orange-700' :
                                row.status_margin === 'SEDANG' ? 'badge bg-yellow-100 text-yellow-700' :
                                row.status_margin === 'NO_HPP' ? 'badge bg-gray-100 text-gray-400' :
                                'badge badge-success'
                              }>
                                {row.status_margin === 'NO_HPP' ? 'Belum Ada HPP' : row.status_margin}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <button
                  onClick={() => setShowAllMargin(!showAllMargin)}
                  className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                  {showAllMargin ? (
                    <><ChevronUp className="w-4 h-4" /> Tampilkan hanya KRITIS & RENDAH</>
                  ) : (
                    <><ChevronDown className="w-4 h-4" /> Tampilkan semua {marginData.length} produk (termasuk SEDANG, SEHAT, Belum Ada HPP)</>
                  )}
                </button>
              </>
            )}
          </div>

          {/* ══ SECTION C: Top 10 Charts ════════════════════════════════════ */}
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
              C — Top 10 Produk
            </h2>
            {saleItems.length === 0 ? (
              <div className="card text-center py-10">
                <p className="text-gray-500 font-medium text-sm">
                  {dailySales.length > 0
                    ? 'Data omzet tersedia, tapi detail per produk belum tersync'
                    : 'Belum ada data penjualan pada periode ini'}
                </p>
                {dailySales.length > 0 && (
                  <p className="text-xs text-gray-400 mt-2 max-w-sm mx-auto">
                    Jalankan ulang sync agent di PC kasir untuk mengisi data Top 10 Produk.
                    Pastikan versi sync agent terbaru (support produk yang sudah dihapus dari iPOS).
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Top 10 Qty */}
                  <div className="card">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Terlaris (Qty)</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={topByQty} layout="vertical" margin={{ left: 8, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="nama"
                          width={130}
                          tick={{ fontSize: 10 }}
                          tickFormatter={v => v.length > 18 ? v.slice(0, 18) + '…' : v}
                        />
                        <Tooltip
                          formatter={(value: number | undefined) => (value ?? 0).toLocaleString('id-ID')}
                        />
                        <Bar dataKey="qty" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Top 10 Laba */}
                  <div className="card">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Terlaba (Profit)</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={topByLaba} layout="vertical" margin={{ left: 8, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                        <YAxis
                          type="category"
                          dataKey="nama"
                          width={130}
                          tick={{ fontSize: 10 }}
                          tickFormatter={v => v.length > 18 ? v.slice(0, 18) + '…' : v}
                        />
                        <Tooltip
                          formatter={(value: number | undefined) => formatRupiah(value ?? 0)}
                        />
                        <Bar dataKey="laba" fill="#22c55e" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2 italic">
                  Produk terlaris belum tentu paling untung — lihat kolom laba untuk gambaran lengkap.
                </p>
              </>
            )}
          </div>

          {/* ══ SECTION D: Analisis per Kategori ════════════════════════════ */}
          <div>
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
              D — Analisis per Kategori
            </h2>
            {kategoriData.length === 0 ? (
              <div className="card text-center py-10">
                <p className="text-gray-500 font-medium text-sm">
                  {dailySales.length > 0
                    ? 'Data omzet tersedia, tapi detail per kategori belum tersync'
                    : 'Belum ada data penjualan pada periode ini'}
                </p>
                {dailySales.length > 0 && (
                  <p className="text-xs text-gray-400 mt-2 max-w-sm mx-auto">
                    Jalankan ulang sync agent di PC kasir untuk mengisi data Analisis Per Kategori.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Pie chart laba */}
                <div className="card flex flex-col items-center">
                  <p className="text-sm font-semibold text-gray-700 mb-3 self-start">Proporsi Laba</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={kategoriData}
                        dataKey="laba"
                        nameKey="nama"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        label={({ name, percent }) =>
                          (percent ?? 0) > 0.05 ? `${name} ${((percent ?? 0) * 100).toFixed(0)}%` : ''
                        }
                        labelLine={false}
                      >
                        {kategoriData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number | undefined) => formatRupiah(value ?? 0)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Tabel kategori */}
                <div className="card p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="table-header">
                          <th className="px-3 py-2">Kategori</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Omzet</th>
                          <th className="px-3 py-2 text-right">Laba</th>
                          <th className="px-3 py-2 text-right">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kategoriData.map((kat, idx) => {
                          const maxMargin = Math.max(...kategoriData.map(k => k.margin));
                          const minMargin = Math.min(...kategoriData.map(k => k.margin));
                          const isMax = kategoriData.length > 1 && kat.margin === maxMargin;
                          const isMin = kategoriData.length > 1 && kat.margin === minMargin;
                          return (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="table-cell">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                                  />
                                  <span className="text-sm font-medium">{kat.nama}</span>
                                </div>
                              </td>
                              <td className="table-cell text-right text-sm">{kat.qty.toLocaleString('id-ID')}</td>
                              <td className="table-cell text-right text-sm">{formatRupiah(kat.omzet)}</td>
                              <td className="table-cell text-right text-sm font-semibold text-green-600">
                                {formatRupiah(kat.laba)}
                              </td>
                              <td className="table-cell text-right">
                                <span className={
                                  isMax ? 'badge badge-success' :
                                  isMin ? 'badge badge-danger' :
                                  'text-sm text-gray-600'
                                }>
                                  {kat.margin.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ══ SECTION E: Biaya Operasional ════════════════════════════════ */}
          <div>
            <button
              onClick={() => setShowBiayaPanel(!showBiayaPanel)}
              className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-teal-500" />
                <span className="font-semibold text-gray-700">E — Input Biaya Operasional</span>
                {biayaOps && (
                  <span className="badge badge-success">Sudah diisi</span>
                )}
              </div>
              {showBiayaPanel ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showBiayaPanel && (
              <div className="card mt-2 space-y-4">
                <p className="text-xs text-gray-500">
                  Biaya untuk bulan <strong>{firstOfMonth(dateFrom)}</strong>.
                  Data ini dipakai menghitung Laba Bersih dan ROI di Section A.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    ['gaji_karyawan', 'Gaji Karyawan'],
                    ['listrik',        'Listrik'],
                    ['sewa_tempat',    'Sewa Tempat'],
                    ['plastik_kemasan','Plastik & Kemasan'],
                    ['transportasi',   'Transportasi'],
                    ['lain_lain',      'Lain-lain'],
                  ] as [keyof typeof biayaForm, string][]).map(([field, label]) => (
                    <div key={field}>
                      <label className="text-xs text-gray-500 font-medium mb-1 block">{label}</label>
                      <input
                        type="number"
                        min="0"
                        value={biayaForm[field]}
                        onChange={e => setBiayaForm(prev => ({ ...prev, [field]: e.target.value }))}
                        className="input-field"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Modal Investasi (untuk ROI)</label>
                    <input
                      type="number"
                      min="0"
                      value={biayaForm.modal_investasi}
                      onChange={e => setBiayaForm(prev => ({ ...prev, modal_investasi: e.target.value }))}
                      className="input-field"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Catatan</label>
                    <input
                      type="text"
                      value={biayaForm.catatan}
                      onChange={e => setBiayaForm(prev => ({ ...prev, catatan: e.target.value }))}
                      className="input-field"
                      placeholder="Opsional..."
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <p className="text-sm text-gray-600">
                    Total biaya: <strong>{formatRupiah(totalBiayaForm)}</strong>
                  </p>
                  <button
                    onClick={saveBiaya}
                    disabled={savingBiaya}
                    className="btn-primary flex items-center gap-2"
                  >
                    {savingBiaya ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                    ) : (
                      'Simpan Biaya'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

        </>
      )}
    </div>
  );
}
