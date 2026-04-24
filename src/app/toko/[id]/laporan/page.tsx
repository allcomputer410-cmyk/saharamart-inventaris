'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah } from '@/lib/utils';
import {
  FileText, Copy, MessageCircle, ChevronLeft, ChevronRight,
  Loader2, CheckCheck, RefreshCw, Edit3,
} from 'lucide-react';

type Tab = 'harian' | 'mingguan' | 'bulanan';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStr(d: Date) { return d.toISOString().split('T')[0]; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function getMonStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function getMonEnd(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function getWeekStart(d: Date) {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}
function roundTarget(n: number) { return Math.ceil(n / 50000) * 50000; }
function idDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function shortDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
function pctDiff(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? '+100%' : '0%';
  const p = ((curr - prev) / prev) * 100;
  return (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyData {
  revenue: number; transactions: number;
  topProduct: string;
  receivedQty: number; receivedFrom: string;
  criticalItems: string[];
  target: number;
}

interface WeeklyData {
  revenue: number; prevRevenue: number;
  top3: string[];
  doCount: number; supplierCount: number; receivedQty: number;
  slowMoving: string[];
  target: number;
}

interface MonthlyData {
  revenue: number; prevRevenue: number;
  totalPurchase: number; margin: number;
  newSKUs: number;
  activePromos: string[];
  target: number;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LaporanPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabase = createClient();
  const today = new Date();

  const [tab, setTab] = useState<Tab>('harian');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [gmName, setGmName] = useState('Alwin');

  const [dailyDate, setDailyDate] = useState(toStr(today));
  const [weekStart, setWeekStart] = useState(toStr(getWeekStart(today)));
  const [weekEnd, setWeekEnd] = useState(toStr(addDays(getWeekStart(today), 6)));
  const [monthStart, setMonthStart] = useState(toStr(getMonStart(today)));
  const [monthEnd, setMonthEnd] = useState(toStr(getMonEnd(today)));

  const [daily, setDaily] = useState<DailyData | null>(null);
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData | null>(null);

  // Editable freeform fields
  const [kondisi, setKondisi] = useState('Normal dan kondusif');
  const [masalah, setMasalah] = useState('Tidak ada masalah berarti');
  const [actionHarian, setActionHarian] = useState('');
  const [sosmedPost, setSosmedPost] = useState('0');
  const [sosmedBest, setSosmedBest] = useState('—');
  const [actionMingguan, setActionMingguan] = useState('');
  const [evalKaryawan, setEvalKaryawan] = useState('Berjalan normal');
  const [pelatihan, setPelatihan] = useState('—');
  const [opnameSelisih, setOpnameSelisih] = useState('0');
  const [deadStockDiatasi, setDeadStockDiatasi] = useState('—');
  const [actionBulanan, setActionBulanan] = useState('');

  // ── Fetch store info ──────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const { data: store } = await supabase.from('stores').select('name').eq('id', storeId).maybeSingle();
      if (store?.name) setStoreName(store.name);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('user_profiles').select('name').eq('id', user.id).maybeSingle();
        if (profile?.name) setGmName((profile.name as string).split(' ')[0]);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Fetch daily ───────────────────────────────────────────────────────────

  const loadDaily = useCallback(async (date: string) => {
    setLoading(true);
    try {
      // Sales
      const { data: ds } = await supabase
        .from('daily_sales')
        .select('id, total_revenue, total_transactions')
        .eq('store_id', storeId).eq('sale_date', date).maybeSingle();

      // Top product (skip produk yang di-exclude dari laporan)
      let topProduct = '—';
      if (ds?.id) {
        const { data: items } = await supabase
          .from('daily_sale_items')
          .select('qty_sold, store_products(name, exclude_from_report)')
          .eq('daily_sale_id', ds.id)
          .order('qty_sold', { ascending: false }).limit(20);
        if (items && items.length > 0) {
          // Cari produk pertama yang tidak di-exclude (fallback: ambil pertama jika semua null)
          const first = items.find((item) => {
            const sp = Array.isArray(item.store_products) ? item.store_products[0] : item.store_products;
            return !(sp as { exclude_from_report?: boolean } | null)?.exclude_from_report;
          }) || items[0];
          if (first) {
            const sp = Array.isArray(first.store_products) ? first.store_products[0] : first.store_products;
            topProduct = (sp as { name: string } | null)?.name || '—';
          }
        }
      }

      // Critical stock
      const { data: critStock } = await supabase
        .from('stock')
        .select('current_qty, min_qty, store_products(name)')
        .eq('store_id', storeId).lt('current_qty', 5).gt('min_qty', 0).limit(5);
      const criticalItems: string[] = ((critStock || []) as { current_qty: number; store_products: { name: string } | { name: string }[] | null }[])
        .map((c) => {
          const sp = Array.isArray(c.store_products) ? c.store_products[0] : c.store_products;
          return sp?.name ? `${sp.name} (${c.current_qty} pcs)` : '';
        }).filter(Boolean);

      // Barang diterima — dari tabel purchases (di-sync dari iPOS)
      const { data: recv } = await supabase
        .from('purchases')
        .select('total_item, supplier:suppliers(name)')
        .eq('store_id', storeId)
        .gte('tanggal', `${date}T00:00:00`)
        .lte('tanggal', `${date}T23:59:59`);
      const receivedQty = ((recv || []) as { total_item: number }[]).reduce((s, r) => s + (r.total_item || 0), 0);
      const supplierNames = ((recv || []) as { supplier: { name: string } | { name: string }[] | null }[])
        .map(r => { const s = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier; return s?.name; })
        .filter((n): n is string => !!n);
      const receivedFrom = Array.from(new Set(supplierNames)).slice(0, 2).join(', ') || '—';

      // 30d avg → target
      const d30ago = toStr(addDays(new Date(date), -30));
      const { data: ds30 } = await supabase
        .from('daily_sales').select('total_revenue')
        .eq('store_id', storeId).gte('sale_date', d30ago).lte('sale_date', date);
      const avg30d = ds30 && ds30.length > 0
        ? (ds30 as { total_revenue: number }[]).reduce((s, r) => s + r.total_revenue, 0) / ds30.length
        : 3000000;
      const target = roundTarget(avg30d * 1.1);

      const d: DailyData = {
        revenue: ds?.total_revenue || 0, transactions: ds?.total_transactions || 0,
        topProduct, receivedQty, receivedFrom, criticalItems, target,
      };
      setDaily(d);

      // Auto action items
      const actions: string[] = [];
      if (criticalItems.length > 0) actions.push(`Order ulang stok kritis: ${criticalItems.slice(0, 2).map(s => s.split(' (')[0]).join(', ')}`);
      if ((ds?.total_revenue || 0) < target * 0.7) actions.push('Aktifkan promo atau tawarkan bundling untuk kejar target');
      if (receivedQty === 0) actions.push('Konfirmasi jadwal pengiriman dengan supplier');
      actions.push('Pastikan display produk rapi dan stok tampil lengkap');
      setActionHarian(actions.join('\n• '));
    } catch { /* silent */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Fetch weekly ──────────────────────────────────────────────────────────

  const loadWeekly = useCallback(async (wStart: string, wEnd: string) => {
    setLoading(true);
    try {
      // Hitung periode sebelumnya dengan panjang yang sama
      const diffDays = Math.round((new Date(wEnd).getTime() - new Date(wStart).getTime()) / 86400000) + 1;
      const prevStart = toStr(addDays(new Date(wStart), -diffDays));
      const prevEnd = toStr(addDays(new Date(wStart), -1));

      const { data: thisWeek } = await supabase
        .from('daily_sales').select('id, total_revenue').eq('store_id', storeId)
        .gte('sale_date', wStart).lte('sale_date', wEnd);
      const revenue = ((thisWeek || []) as { id: string; total_revenue: number }[]).reduce((s, r) => s + r.total_revenue, 0);

      const { data: prevWeek } = await supabase
        .from('daily_sales').select('total_revenue').eq('store_id', storeId)
        .gte('sale_date', prevStart).lte('sale_date', prevEnd);
      const prevRevenue = ((prevWeek || []) as { total_revenue: number }[]).reduce((s, r) => s + r.total_revenue, 0);

      // Top 3 products
      const weekSaleIds = ((thisWeek || []) as { id: string }[]).map(d => d.id);
      let top3: string[] = [];
      if (weekSaleIds.length > 0) {
        const { data: wItems } = await supabase
          .from('daily_sale_items').select('store_product_id, qty_sold, store_products(name, exclude_from_report)')
          .in('daily_sale_id', weekSaleIds);
        const agg: Record<string, { name: string; qty: number }> = {};
        ((wItems || []) as { store_product_id: string; qty_sold: number; store_products: { name: string; exclude_from_report?: boolean } | { name: string; exclude_from_report?: boolean }[] | null }[]).forEach((item) => {
          const sp = Array.isArray(item.store_products) ? item.store_products[0] : item.store_products;
          if ((sp as { exclude_from_report?: boolean } | null)?.exclude_from_report) return;
          const name = (sp as { name: string } | null)?.name || item.store_product_id;
          if (!agg[item.store_product_id]) agg[item.store_product_id] = { name, qty: 0 };
          agg[item.store_product_id].qty += item.qty_sold || 0;
        });
        top3 = Object.values(agg).sort((a, b) => b.qty - a.qty).slice(0, 3).map(p => `${p.name} (${p.qty} pcs)`);
      }

      // Purchase orders
      const { data: pos } = await supabase
        .from('purchase_orders').select('id, supplier_id').eq('store_id', storeId).neq('status', 'draft')
        .gte('created_at', `${wStart}T00:00:00`).lte('created_at', `${wEnd}T23:59:59`);
      const doCount = (pos || []).length;
      const supplierCount = new Set(((pos || []) as { supplier_id: string }[]).map(p => p.supplier_id)).size;

      // Barang diterima
      const { data: recv } = await supabase
        .from('purchases').select('total_item').eq('store_id', storeId)
        .gte('tanggal', `${wStart}T00:00:00`).lte('tanggal', `${wEnd}T23:59:59`);
      const receivedQty = ((recv || []) as { total_item: number }[]).reduce((s, r) => s + (r.total_item || 0), 0);

      // Slow moving (30d sebelum wEnd)
      const d30ago = toStr(addDays(new Date(wEnd), -30));
      const { data: slowDs } = await supabase
        .from('daily_sales').select('id').eq('store_id', storeId)
        .gte('sale_date', d30ago).lte('sale_date', wEnd);
      const slowIds = ((slowDs || []) as { id: string }[]).map(d => d.id);
      let slowMoving: string[] = [];
      if (slowIds.length > 0) {
        const { data: slowItems } = await supabase
          .from('daily_sale_items').select('store_product_id, qty_sold, store_products(name)')
          .in('daily_sale_id', slowIds);
        const aggSlow: Record<string, { name: string; qty: number }> = {};
        ((slowItems || []) as { store_product_id: string; qty_sold: number; store_products: { name: string } | { name: string }[] | null }[]).forEach((item) => {
          const sp = Array.isArray(item.store_products) ? item.store_products[0] : item.store_products;
          const name = (sp as { name: string } | null)?.name || item.store_product_id;
          if (!aggSlow[item.store_product_id]) aggSlow[item.store_product_id] = { name, qty: 0 };
          aggSlow[item.store_product_id].qty += item.qty_sold || 0;
        });
        slowMoving = Object.values(aggSlow).filter(p => p.qty / 30 < 0.5).sort((a, b) => a.qty - b.qty).slice(0, 3).map(p => p.name);
      }

      const target = roundTarget(prevRevenue > 0 ? prevRevenue * 1.1 : 21000000);
      setWeekly({ revenue, prevRevenue, top3, doCount, supplierCount, receivedQty, slowMoving, target });

      const actions: string[] = [];
      if (slowMoving.length > 0) actions.push(`Buat promo untuk slow-moving: ${slowMoving.slice(0, 2).join(', ')}`);
      if (revenue < target * 0.7) actions.push('Review strategi penjualan — pertimbangkan promo flash sale');
      actions.push('Cek pengiriman DO yang belum diterima');
      actions.push('Update konten sosmed minimal 3 post periode depan');
      setActionMingguan(actions.join('\n• '));
    } catch { /* silent */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Fetch monthly ─────────────────────────────────────────────────────────

  const loadMonthly = useCallback(async (mStart: string, mEnd: string) => {
    setLoading(true);
    try {
      // Periode sebelumnya dengan panjang sama
      const diffDays = Math.round((new Date(mEnd).getTime() - new Date(mStart).getTime()) / 86400000) + 1;
      const prevStart = toStr(addDays(new Date(mStart), -diffDays));
      const prevEnd = toStr(addDays(new Date(mStart), -1));

      const { data: thisMonth } = await supabase
        .from('daily_sales').select('total_revenue').eq('store_id', storeId)
        .gte('sale_date', mStart).lte('sale_date', mEnd);
      const revenue = ((thisMonth || []) as { total_revenue: number }[]).reduce((s, r) => s + r.total_revenue, 0);

      const { data: prevMonth } = await supabase
        .from('daily_sales').select('total_revenue').eq('store_id', storeId)
        .gte('sale_date', prevStart).lte('sale_date', prevEnd);
      const prevRevenue = ((prevMonth || []) as { total_revenue: number }[]).reduce((s, r) => s + r.total_revenue, 0);

      // Total pembelian
      const { data: purchMon } = await supabase
        .from('purchases').select('total_akhir')
        .eq('store_id', storeId)
        .gte('tanggal', `${mStart}T00:00:00`).lte('tanggal', `${mEnd}T23:59:59`);
      const totalPurchase = ((purchMon || []) as { total_akhir: number }[]).reduce((s, r) => s + (r.total_akhir || 0), 0);
      const margin = revenue - totalPurchase;

      // New SKUs
      const { data: newProds } = await supabase
        .from('store_products').select('id').eq('store_id', storeId)
        .gte('created_at', `${mStart}T00:00:00`).lte('created_at', `${mEnd}T23:59:59`);
      const newSKUs = newProds?.length || 0;

      // Active promos
      const { data: promos } = await supabase
        .from('promotions').select('name').eq('store_id', storeId).eq('status', 'active');
      const activePromos = ((promos || []) as { name: string }[]).map(p => p.name).slice(0, 3);

      const target = roundTarget(prevRevenue > 0 ? prevRevenue * 1.1 : 90000000);
      setMonthly({ revenue, prevRevenue, totalPurchase, margin, newSKUs, activePromos, target });

      const actions: string[] = [];
      if (revenue < target * 0.8) actions.push('Evaluasi strategi penjualan dan tingkatkan intensitas promo');
      if (activePromos.length === 0) actions.push('Buat minimal 1 promo untuk periode depan');
      actions.push('Lakukan stock opname di awal periode depan');
      actions.push('Review supplier — bandingkan harga untuk renegosiasi HPP');
      setActionBulanan(actions.join('\n• '));
    } catch { /* silent */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => { if (tab === 'harian') loadDaily(dailyDate); }, [tab, dailyDate, loadDaily]);
  useEffect(() => { if (tab === 'mingguan') loadWeekly(weekStart, weekEnd); }, [tab, weekStart, weekEnd, loadWeekly]);
  useEffect(() => { if (tab === 'bulanan') loadMonthly(monthStart, monthEnd); }, [tab, monthStart, monthEnd, loadMonthly]);

  // ── Copy as text ──────────────────────────────────────────────────────────

  const buildDailyText = () => {
    if (!daily) return '';
    const sn = storeName.toUpperCase() || 'TOKO';
    return `📊 LAPORAN HARIAN ${sn}
📅 Tanggal       : ${idDate(dailyDate)}
👤 GM            : ${gmName}

💰 PENJUALAN
   • Total transaksi    : ${formatRupiah(daily.revenue)}
   • Jumlah nota        : ${daily.transactions} nota
   • Produk terlaris    : ${daily.topProduct}
   🎯 Target hari ini  : ${formatRupiah(daily.target)} | Realisasi: ${daily.target > 0 ? ((daily.revenue / daily.target) * 100).toFixed(0) : 0}%

📦 STOK & OPERASIONAL
   • Barang diterima    : ${daily.receivedQty > 0 ? `${daily.receivedQty} item (${daily.receivedFrom})` : 'Tidak ada penerimaan'}
   • Stok kritis        : ${daily.criticalItems.length > 0 ? daily.criticalItems.join(', ') : 'Aman'}
   • Kondisi toko       : ${kondisi}

⚠️  MASALAH HARI INI
   • ${masalah}

✅ ACTION ITEM BESOK
   • ${actionHarian || '—'}`;
  };

  const buildWeeklyText = () => {
    if (!weekly) return '';
    const sn = storeName.toUpperCase() || 'TOKO';
    return `📊 LAPORAN MINGGUAN ${sn}
📅 Periode  |  Tgl ${shortDate(weekStart)} s/d ${shortDate(weekEnd)}

💰 RINGKASAN PENJUALAN
   • Total minggu ini   : ${formatRupiah(weekly.revenue)}
   • vs minggu lalu     : ${pctDiff(weekly.revenue, weekly.prevRevenue)} (lalu: ${formatRupiah(weekly.prevRevenue)})
   • Top 3 produk       : ${weekly.top3.length > 0 ? weekly.top3.join(' · ') : '—'}
   🎯 Target minggu ini : ${formatRupiah(weekly.target)} | Realisasi: ${weekly.target > 0 ? ((weekly.revenue / weekly.target) * 100).toFixed(0) : 0}%

📦 STOK & PENGADAAN
   • DO dibuat          : ${weekly.doCount} ke ${weekly.supplierCount} supplier
   • Barang diterima    : ${weekly.receivedQty} item
   • Produk slow-moving : ${weekly.slowMoving.length > 0 ? weekly.slowMoving.join(', ') : '—'}

📱 SOSMED
   • Post tayang        : ${sosmedPost} konten
   • Engagement terbaik : ${sosmedBest}

🎯 TARGET MINGGU DEPAN
   • ${actionMingguan || '—'}`;
  };

  const buildMonthlyText = () => {
    if (!monthly) return '';
    const sn = storeName.toUpperCase() || 'TOKO';
    return `📊 LAPORAN BULANAN ${sn}
📅 Periode        : ${shortDate(monthStart)} s/d ${shortDate(monthEnd)}

💰 KEUANGAN
   • Total penjualan    : ${formatRupiah(monthly.revenue)}
   • vs bulan lalu      : ${pctDiff(monthly.revenue, monthly.prevRevenue)} (lalu: ${formatRupiah(monthly.prevRevenue)})
   • Total pembelian    : ${monthly.totalPurchase > 0 ? formatRupiah(monthly.totalPurchase) : 'Data belum lengkap'}
   • Estimasi margin    : ${monthly.totalPurchase > 0 ? formatRupiah(monthly.margin) : '—'}
   🎯 Target bulan ini  : ${formatRupiah(monthly.target)} | Realisasi: ${monthly.target > 0 ? ((monthly.revenue / monthly.target) * 100).toFixed(0) : 0}%

📦 INVENTARIS
   • Hasil opname       : selisih ${opnameSelisih} item
   • Produk baru masuk  : ${monthly.newSKUs} SKU
   • Dead-stock diatasi : ${deadStockDiatasi}

👥 TIM & SDM
   • Evaluasi karyawan  : ${evalKaryawan}
   • Pelatihan          : ${pelatihan}

📱 DIGITAL & PROMO
   • Total post sosmed  : ${sosmedPost} konten
   • Promo berjalan     : ${monthly.activePromos.length > 0 ? monthly.activePromos.join(', ') : 'Tidak ada'}

🎯 TARGET BULAN DEPAN
   • ${actionBulanan || '—'}`;
  };

  const handleCopy = async () => {
    const text = tab === 'harian' ? buildDailyText() : tab === 'mingguan' ? buildWeeklyText() : buildMonthlyText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsApp = () => {
    const text = tab === 'harian' ? buildDailyText() : tab === 'mingguan' ? buildWeeklyText() : buildMonthlyText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const noData = (tab === 'harian' && !daily) || (tab === 'mingguan' && !weekly) || (tab === 'bulanan' && !monthly);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Laporan Operasional</h1>
          <p className="text-sm text-gray-500 mt-1">Laporan harian · mingguan · bulanan</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['harian', 'mingguan', 'bulanan'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-2 flex-wrap">
        {tab === 'harian' && (
          <>
            <button onClick={() => setDailyDate(toStr(addDays(new Date(dailyDate), -1)))} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
            <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="input-field w-auto text-sm py-1.5" />
            <button onClick={() => setDailyDate(toStr(addDays(new Date(dailyDate), 1)))} disabled={dailyDate >= toStr(today)} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setDailyDate(toStr(today))} className="text-xs text-blue-600 hover:underline">Hari ini</button>
          </>
        )}
        {tab === 'mingguan' && (
          <>
            <span className="text-xs text-gray-500 font-medium">Dari</span>
            <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}
              className="input-field w-auto text-sm py-1.5" />
            <span className="text-xs text-gray-500 font-medium">s/d</span>
            <input type="date" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)}
              min={weekStart} className="input-field w-auto text-sm py-1.5" />
            <button onClick={() => { setWeekStart(toStr(getWeekStart(today))); setWeekEnd(toStr(addDays(getWeekStart(today), 6))); }}
              className="text-xs text-blue-600 hover:underline">Minggu ini</button>
          </>
        )}
        {tab === 'bulanan' && (
          <>
            <span className="text-xs text-gray-500 font-medium">Dari</span>
            <input type="date" value={monthStart} onChange={(e) => setMonthStart(e.target.value)}
              className="input-field w-auto text-sm py-1.5" />
            <span className="text-xs text-gray-500 font-medium">s/d</span>
            <input type="date" value={monthEnd} onChange={(e) => setMonthEnd(e.target.value)}
              min={monthStart} className="input-field w-auto text-sm py-1.5" />
            <button onClick={() => { setMonthStart(toStr(getMonStart(today))); setMonthEnd(toStr(getMonEnd(today))); }}
              className="text-xs text-blue-600 hover:underline">Bulan ini</button>
          </>
        )}
        <button onClick={() => { if (tab === 'harian') loadDaily(dailyDate); else if (tab === 'mingguan') loadWeekly(weekStart, weekEnd); else loadMonthly(monthStart, monthEnd); }}
          disabled={loading} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
      ) : noData ? (
        <div className="card text-center py-12">
          <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Memuat laporan...</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── HARIAN ── */}
          {tab === 'harian' && daily && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 card space-y-3">
                <ReportHeader icon="📊" title={`LAPORAN HARIAN ${storeName.toUpperCase()}`} />
                <div className="text-xs space-y-1">
                  <InfoRow label="📅 Tanggal" value={idDate(dailyDate)} />
                  <InfoRow label="👤 GM" value={gmName} />
                </div>
                <Divider label="💰 Penjualan" />
                <div className="text-xs space-y-1.5">
                  <InfoRow label="Total transaksi" value={<span className="font-bold text-green-700 text-sm">{formatRupiah(daily.revenue)}</span>} />
                  <InfoRow label="Jumlah nota" value={`${daily.transactions} nota`} />
                  <InfoRow label="Produk terlaris" value={daily.topProduct} />
                  <TargetBar current={daily.revenue} target={daily.target} />
                </div>
                <Divider label="📦 Stok & Operasional" />
                <div className="text-xs space-y-1.5">
                  <InfoRow label="Barang diterima"
                    value={daily.receivedQty > 0 ? `${daily.receivedQty} item (${daily.receivedFrom})` : 'Tidak ada penerimaan'} />
                  <InfoRow label="Stok kritis"
                    value={daily.criticalItems.length > 0
                      ? <span className="text-red-600">{daily.criticalItems.slice(0, 3).join(', ')}{daily.criticalItems.length > 3 ? ` +${daily.criticalItems.length - 3} lagi` : ''}</span>
                      : <span className="text-green-600 font-medium">✓ Aman</span>} />
                  <InfoRow label="Kondisi toko" value={kondisi} />
                </div>
                <Divider label="⚠️ Masalah" />
                <p className="text-xs text-gray-600 pl-2">• {masalah}</p>
                <Divider label="✅ Action Item" />
                {actionHarian.split('\n').map((a, i) => <p key={i} className="text-xs text-gray-600 pl-2">• {a.replace(/^•\s*/, '')}</p>)}
              </div>
              <div className="space-y-3">
                <EditField label="Kondisi Toko" value={kondisi} onChange={setKondisi} />
                <EditField label="⚠️ Masalah Hari Ini" value={masalah} onChange={setMasalah} multiline />
                <EditField label="✅ Action Item Besok" value={actionHarian} onChange={setActionHarian} multiline />
              </div>
            </div>
          )}

          {/* ── MINGGUAN ── */}
          {tab === 'mingguan' && weekly && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 card space-y-3">
                <ReportHeader icon="📊" title={`LAPORAN MINGGUAN ${storeName.toUpperCase()}`} />
                <p className="text-xs text-gray-500">
                  {shortDate(weekStart)} s/d {shortDate(weekEnd)}
                </p>
                <Divider label="💰 Ringkasan Penjualan" />
                <div className="text-xs space-y-1.5">
                  <InfoRow label="Total minggu ini" value={<span className="font-bold text-green-700 text-sm">{formatRupiah(weekly.revenue)}</span>} />
                  <InfoRow label="vs minggu lalu" value={
                    <span className={weekly.revenue >= weekly.prevRevenue ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {pctDiff(weekly.revenue, weekly.prevRevenue)}{weekly.prevRevenue > 0 ? ` (lalu: ${formatRupiah(weekly.prevRevenue)})` : ''}
                    </span>} />
                  <InfoRow label="Top 3 produk" value={weekly.top3.length > 0 ? weekly.top3.join(' · ') : '—'} />
                  <TargetBar current={weekly.revenue} target={weekly.target} />
                </div>
                <Divider label="📦 Stok & Pengadaan" />
                <div className="text-xs space-y-1.5">
                  <InfoRow label="DO dibuat" value={`${weekly.doCount} ke ${weekly.supplierCount} supplier`} />
                  <InfoRow label="Barang diterima" value={`${weekly.receivedQty} item`} />
                  <InfoRow label="Produk slow-moving"
                    value={weekly.slowMoving.length > 0
                      ? <span className="text-orange-600">{weekly.slowMoving.join(', ')}</span>
                      : '—'} />
                </div>
                <Divider label="📱 Sosmed" />
                <div className="text-xs space-y-1.5">
                  <InfoRow label="Post tayang" value={`${sosmedPost} konten`} />
                  <InfoRow label="Engagement terbaik" value={sosmedBest} />
                </div>
                <Divider label="🎯 Target Minggu Depan" />
                {actionMingguan.split('\n').map((a, i) => <p key={i} className="text-xs text-gray-600 pl-2">• {a.replace(/^•\s*/, '')}</p>)}
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Post Sosmed" value={sosmedPost} onChange={setSosmedPost} />
                  <EditField label="Engagement Terbaik" value={sosmedBest} onChange={setSosmedBest} />
                </div>
                <EditField label="🎯 Target Minggu Depan" value={actionMingguan} onChange={setActionMingguan} multiline />
              </div>
            </div>
          )}

          {/* ── BULANAN ── */}
          {tab === 'bulanan' && monthly && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 card space-y-3">
                <ReportHeader icon="📊" title={`LAPORAN BULANAN ${storeName.toUpperCase()}`} />
                <p className="text-xs text-gray-500">{shortDate(monthStart)} s/d {shortDate(monthEnd)}</p>
                <Divider label="💰 Keuangan" />
                <div className="text-xs space-y-1.5">
                  <InfoRow label="Total penjualan" value={<span className="font-bold text-green-700 text-sm">{formatRupiah(monthly.revenue)}</span>} />
                  <InfoRow label="vs bulan lalu" value={
                    <span className={monthly.revenue >= monthly.prevRevenue ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {pctDiff(monthly.revenue, monthly.prevRevenue)}{monthly.prevRevenue > 0 ? ` (lalu: ${formatRupiah(monthly.prevRevenue)})` : ''}
                    </span>} />
                  <InfoRow label="Total pembelian"
                    value={monthly.totalPurchase > 0 ? formatRupiah(monthly.totalPurchase) : <span className="text-gray-400 italic">estimasi belum tersedia</span>} />
                  <InfoRow label="Estimasi margin"
                    value={monthly.totalPurchase > 0
                      ? <span className={monthly.margin >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>{formatRupiah(monthly.margin)}</span>
                      : <span className="text-gray-400">—</span>} />
                  <TargetBar current={monthly.revenue} target={monthly.target} />
                </div>
                <Divider label="📦 Inventaris" />
                <div className="text-xs space-y-1.5">
                  <InfoRow label="Hasil opname" value={`Selisih ${opnameSelisih} item`} />
                  <InfoRow label="Produk baru masuk" value={`${monthly.newSKUs} SKU`} />
                  <InfoRow label="Dead-stock diatasi" value={deadStockDiatasi} />
                </div>
                <Divider label="📱 Digital & Promo" />
                <div className="text-xs space-y-1.5">
                  <InfoRow label="Total post sosmed" value={`${sosmedPost} konten`} />
                  <InfoRow label="Promo berjalan"
                    value={monthly.activePromos.length > 0 ? monthly.activePromos.join(', ') : 'Tidak ada'} />
                </div>
                <Divider label="👥 Tim & SDM" />
                <div className="text-xs space-y-1.5">
                  <InfoRow label="Evaluasi karyawan" value={evalKaryawan} />
                  <InfoRow label="Pelatihan" value={pelatihan} />
                </div>
                <Divider label="🎯 Target Bulan Depan" />
                {actionBulanan.split('\n').map((a, i) => <p key={i} className="text-xs text-gray-600 pl-2">• {a.replace(/^•\s*/, '')}</p>)}
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Post Sosmed" value={sosmedPost} onChange={setSosmedPost} />
                  <EditField label="Selisih Opname" value={opnameSelisih} onChange={setOpnameSelisih} />
                </div>
                <EditField label="Evaluasi Karyawan" value={evalKaryawan} onChange={setEvalKaryawan} multiline />
                <EditField label="Pelatihan" value={pelatihan} onChange={setPelatihan} />
                <EditField label="Dead-stock Diatasi" value={deadStockDiatasi} onChange={setDeadStockDiatasi} />
                <EditField label="🎯 Target Bulan Depan" value={actionBulanan} onChange={setActionBulanan} multiline />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
              {copied ? <><CheckCheck className="w-4 h-4" />Tersalin!</> : <><Copy className="w-4 h-4" />Salin Laporan</>}
            </button>
            <button onClick={handleWhatsApp}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors">
              <MessageCircle className="w-4 h-4" />Kirim WA
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReportHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-400 min-w-[120px] shrink-0">{label}</span>
      <span className="text-gray-700 flex-1">{value}</span>
    </div>
  );
}

function TargetBar({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const barColor = pct >= 90 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="mt-1 p-2.5 bg-blue-50 rounded-lg space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-blue-700 font-medium">🎯 Target: {formatRupiah(target)}</span>
        <span className={`font-bold ${pct >= 90 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-blue-200 rounded-full h-1.5">
        <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, multiline }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean;
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
        <Edit3 className="w-3 h-3" />{label}
      </label>
      {multiline
        ? <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-700 bg-gray-50" />
        : <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 bg-gray-50" />
      }
    </div>
  );
}
