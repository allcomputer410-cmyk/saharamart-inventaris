'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah } from '@/lib/utils';
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Package,
  BarChart2,
  Search,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type PromoType = 'discount' | 'bundle' | 'bxgy' | 'min_purchase' | 'flash_sale';
type PromoStatus = 'draft' | 'active' | 'expired' | 'paused';

interface Promo {
  id: string;
  store_id: string;
  name: string;
  type: PromoType;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  active_days: Record<string, boolean>;
  status: PromoStatus;
  priority: number;
  max_usage: number | null;
  current_usage: number;
  created_at: string;
  promo_rules?: PromoRule[];
  promo_products?: PromoProduct[];
}

interface PromoRule {
  id?: string;
  promo_id?: string;
  discount_pct_1: number;
  discount_pct_2: number;
  discount_pct_3: number;
  discount_pct_4: number;
  discount_nom_1: number;
  discount_nom_2: number;
  discount_nom_3: number;
  discount_nom_4: number;
  min_qty: number;
  free_qty: number;
  min_purchase: number;
  bundle_price: number;
}

interface PromoProduct {
  id?: string;
  promo_id?: string;
  store_product_id: string;
  promo_price: number | null;
  is_bundle_item: boolean;
  store_product?: { id: string; barcode: string; name: string; hpp: number; sell_price: number };
}

interface StoreProductOption {
  id: string;
  barcode: string;
  name: string;
  hpp: number;
  sell_price: number;
}

interface IposDiscount {
  id: string;
  store_product_id: string | null;
  ipos_kodeitem: string;
  ipos_iddiskon: string;
  diskon1: number;
  disknom1: number;
  tgl_dari: string | null;
  tgl_sampai: string | null;
  jam_dari: string | null;
  jam_sampai: string | null;
  is_active: boolean;
  synced_at: string;
  store_products: { name: string; barcode: string; sell_price: number; hpp: number } | null;
}

interface DiscountPerf {
  discount: IposDiscount;
  beforeQty: number;
  beforeRev: number;
  duringQty: number;
  duringRev: number;
  loaded: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<PromoType, string> = {
  discount: 'Diskon %',
  bundle: 'Bundle',
  bxgy: 'Beli X Gratis Y',
  min_purchase: 'Min Belanja',
  flash_sale: 'Flash Sale',
};

const TYPE_COLORS: Record<PromoType, string> = {
  discount: 'bg-blue-100 text-blue-700',
  bundle: 'bg-purple-100 text-purple-700',
  bxgy: 'bg-orange-100 text-orange-700',
  min_purchase: 'bg-teal-100 text-teal-700',
  flash_sale: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<PromoStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-600',
  paused: 'bg-yellow-100 text-yellow-700',
};

const STATUS_LABELS: Record<PromoStatus, string> = {
  draft: 'Draft',
  active: 'Aktif',
  expired: 'Expired',
  paused: 'Dijeda',
};

const DAYS = [
  { key: 'mon', label: 'Sen' },
  { key: 'tue', label: 'Sel' },
  { key: 'wed', label: 'Rab' },
  { key: 'thu', label: 'Kam' },
  { key: 'fri', label: 'Jum' },
  { key: 'sat', label: 'Sab' },
  { key: 'sun', label: 'Min' },
];

const DEFAULT_RULE: PromoRule = {
  discount_pct_1: 0, discount_pct_2: 0, discount_pct_3: 0, discount_pct_4: 0,
  discount_nom_1: 0, discount_nom_2: 0, discount_nom_3: 0, discount_nom_4: 0,
  min_qty: 0, free_qty: 0, min_purchase: 0, bundle_price: 0,
};

const DEFAULT_DAYS = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true };

// ─── Margin Calculator ────────────────────────────────────────────────────────

function calcMarginDiscount(
  hpp: number, sellPrice: number,
  p1: number, p2: number, p3: number, p4: number
) {
  if (sellPrice <= 0) return { promoPrice: 0, marginNom: 0, marginPct: 0 };
  let promoPrice = sellPrice;
  if (p1 > 0) promoPrice *= (1 - p1 / 100);
  if (p2 > 0) promoPrice *= (1 - p2 / 100);
  if (p3 > 0) promoPrice *= (1 - p3 / 100);
  if (p4 > 0) promoPrice *= (1 - p4 / 100);
  const marginNom = promoPrice - hpp;
  const marginPct = promoPrice > 0 ? (marginNom / promoPrice) * 100 : 0;
  return { promoPrice, marginNom, marginPct };
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PromoPage() {
  const params = useParams();
  const storeId = params.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const prefillApplied = useRef(false);

  const [promos, setPromos] = useState<Promo[]>([]);
  const [productSearchResults, setProductSearchResults] = useState<StoreProductOption[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPromo, setEditPromo] = useState<Promo | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'daftar' | 'performa'>('daftar');
  const [recsWithPromo, setRecsWithPromo] = useState<Set<string>>(new Set());
  const [discounts, setDiscounts] = useState<IposDiscount[]>([]);
  const [discountPerf, setDiscountPerf] = useState<DiscountPerf[]>([]);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountSearch, setDiscountSearch] = useState('');
  const [discountFilter, setDiscountFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<PromoType>('discount');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formDays, setFormDays] = useState<Record<string, boolean>>(DEFAULT_DAYS);
  const [formPriority, setFormPriority] = useState(10);
  const [formMaxUsage, setFormMaxUsage] = useState('');
  const [formRule, setFormRule] = useState<PromoRule>(DEFAULT_RULE);
  const [formSelectedProducts, setFormSelectedProducts] = useState<PromoProduct[]>([]);
  const [formProductSearch, setFormProductSearch] = useState('');
  const [formProductFocused, setFormProductFocused] = useState(false);
  const productSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('promotions')
      .select(`*, promo_rules(*), promo_products(*, store_product:store_products(id, barcode, name, hpp, sell_price))`)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    setPromos((data as Promo[]) || []);

    const promoIds = ((data || []) as Promo[]).map((p) => p.id);
    if (promoIds.length > 0) {
      const { data: recs } = await supabase
        .from('promo_recommendations')
        .select('promotion_id')
        .in('promotion_id', promoIds);
      setRecsWithPromo(new Set(((recs || []) as { promotion_id: string }[]).map((r) => r.promotion_id)));
    } else {
      setRecsWithPromo(new Set());
    }
    setLoading(false);
  }, [storeId, supabase]);

  const searchProducts = useCallback(async (query: string) => {
    setProductSearchLoading(true);
    let req = supabase
      .from('store_products')
      .select('id, barcode, name, hpp, sell_price')
      .eq('store_id', storeId)
      .eq('is_deleted', false)
      .order('name')
      .limit(30);
    if (query.trim()) {
      req = req.or(`name.ilike.%${query.trim()}%,barcode.ilike.%${query.trim()}%`);
    }
    const { data } = await req;
    setProductSearchResults((data as StoreProductOption[]) || []);
    setProductSearchLoading(false);
  }, [storeId, supabase]);

  const handleProductSearchChange = (val: string) => {
    setFormProductSearch(val);
    if (productSearchTimer.current) clearTimeout(productSearchTimer.current);
    productSearchTimer.current = setTimeout(() => searchProducts(val), 300);
  };

  const fetchDiscounts = useCallback(async () => {
    setDiscountLoading(true);
    const { data } = await supabase
      .from('store_item_discounts')
      .select('*, store_products(name, barcode, sell_price, hpp)')
      .eq('store_id', storeId)
      .order('is_active', { ascending: false })
      .order('tgl_dari', { ascending: false });
    const list = (data as IposDiscount[]) || [];
    setDiscounts(list);
    setDiscountPerf(list.map((d) => ({
      discount: d,
      beforeQty: 0, beforeRev: 0,
      duringQty: 0, duringRev: 0,
      loaded: false,
    })));
    setDiscountLoading(false);
  }, [storeId, supabase]);

  const loadPerfData = useCallback(async (disc: IposDiscount, idx: number) => {
    if (!disc.store_product_id || !disc.tgl_dari) return;
    const tglDari = new Date(disc.tgl_dari);
    const before7 = new Date(tglDari);
    before7.setDate(before7.getDate() - 7);
    const today = new Date().toISOString().split('T')[0];

    const [{ data: bef }, { data: dur }] = await Promise.all([
      supabase
        .from('v_sale_items_detail')
        .select('qty_sold, revenue')
        .eq('store_product_id', disc.store_product_id)
        .gte('sale_date', before7.toISOString().split('T')[0])
        .lt('sale_date', tglDari.toISOString().split('T')[0]),
      supabase
        .from('v_sale_items_detail')
        .select('qty_sold, revenue')
        .eq('store_product_id', disc.store_product_id)
        .gte('sale_date', tglDari.toISOString().split('T')[0])
        .lte('sale_date', disc.tgl_sampai ? disc.tgl_sampai.split('T')[0] : today),
    ]);

    setDiscountPerf((prev) => prev.map((p, i) => i !== idx ? p : {
      ...p,
      beforeQty: (bef || []).reduce((s, r) => s + r.qty_sold, 0),
      beforeRev: (bef || []).reduce((s, r) => s + r.revenue, 0),
      duringQty: (dur || []).reduce((s, r) => s + r.qty_sold, 0),
      duringRev: (dur || []).reduce((s, r) => s + r.revenue, 0),
      loaded: true,
    }));
  }, [supabase]);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);
  useEffect(() => { if (activeTab === 'performa') fetchDiscounts(); }, [activeTab, fetchDiscounts]);

  // Pre-fill form dari URL query (dari tombol "Buat Promo Manual" di rekomendasi-promo)
  useEffect(() => {
    if (prefillApplied.current) return;
    const productId   = searchParams.get('product_id');
    const productName = searchParams.get('product_name');
    const productBarcode = searchParams.get('product_barcode') || '';
    const hpp         = parseFloat(searchParams.get('hpp') || '0');
    const sellPrice   = parseFloat(searchParams.get('sell_price') || '0');
    const promoType   = searchParams.get('promo_type') as PromoType | null;
    if (!productId || !productName) return;
    prefillApplied.current = true;
    setFormType(promoType || 'discount');
    setFormSelectedProducts([{
      store_product_id: productId,
      promo_price: null,
      is_bundle_item: false,
      store_product: {
        id: productId,
        barcode: productBarcode,
        name: productName,
        hpp,
        sell_price: sellPrice,
      },
    }]);
    setShowModal(true);
    // Bersihkan query dari URL agar tidak re-trigger
    router.replace(`/toko/${storeId}/promo`);
  }, [searchParams, storeId, router]);

  // ─── Form Helpers ────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormName(''); setFormType('discount');
    setFormStartDate(''); setFormEndDate('');
    setFormStartTime(''); setFormEndTime('');
    setFormDays(DEFAULT_DAYS); setFormPriority(10); setFormMaxUsage('');
    setFormRule(DEFAULT_RULE); setFormSelectedProducts([]); setFormProductSearch('');
    setEditPromo(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };

  const openEdit = (promo: Promo) => {
    setEditPromo(promo);
    setFormName(promo.name); setFormType(promo.type);
    setFormStartDate(promo.start_date || ''); setFormEndDate(promo.end_date || '');
    setFormStartTime(promo.start_time || ''); setFormEndTime(promo.end_time || '');
    setFormDays(promo.active_days || DEFAULT_DAYS);
    setFormPriority(promo.priority);
    setFormMaxUsage(promo.max_usage != null ? String(promo.max_usage) : '');
    const rule = promo.promo_rules?.[0];
    setFormRule(rule ? { ...DEFAULT_RULE, ...rule } : DEFAULT_RULE);
    setFormSelectedProducts(
      (promo.promo_products || []).map((pp) => ({
        store_product_id: pp.store_product_id,
        promo_price: pp.promo_price,
        is_bundle_item: pp.is_bundle_item,
        store_product: pp.store_product,
      }))
    );
    setShowModal(true);
  };

  const addProductToForm = (product: StoreProductOption) => {
    if (formSelectedProducts.some((p) => p.store_product_id === product.id)) return;
    setFormSelectedProducts((prev) => [
      ...prev,
      { store_product_id: product.id, promo_price: null, is_bundle_item: false, store_product: product },
    ]);
    setFormProductSearch('');
  };

  const removeProductFromForm = (productId: string) => {
    setFormSelectedProducts((prev) => prev.filter((p) => p.store_product_id !== productId));
  };

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const promoData = {
        store_id: storeId,
        name: formName.trim(),
        type: formType,
        start_date: formStartDate || null,
        end_date: formEndDate || null,
        start_time: formStartTime || null,
        end_time: formEndTime || null,
        active_days: formDays,
        status: 'draft',
        priority: formPriority,
        max_usage: formMaxUsage ? parseInt(formMaxUsage) : null,
        feature_enabled: true,
      };

      let promoId = editPromo?.id;

      if (editPromo) {
        await supabase.from('promotions').update(promoData).eq('id', editPromo.id);
        await supabase.from('promo_rules').delete().eq('promo_id', editPromo.id);
        await supabase.from('promo_products').delete().eq('promo_id', editPromo.id);
      } else {
        const { data } = await supabase.from('promotions').insert([promoData]).select('id').single();
        promoId = (data as { id: string } | null)?.id;
      }

      if (promoId) {
        await supabase.from('promo_rules').insert([{ promo_id: promoId, ...formRule }]);
        if (formSelectedProducts.length > 0) {
          await supabase.from('promo_products').insert(
            formSelectedProducts.map((p) => ({
              promo_id: promoId,
              store_product_id: p.store_product_id,
              promo_price: p.promo_price,
              is_bundle_item: p.is_bundle_item,
            }))
          );
        }
      }

      setShowModal(false);
      resetForm();
      fetchPromos();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const handleToggleStatus = async (promo: Promo) => {
    const newStatus: PromoStatus = promo.status === 'active' ? 'paused' : 'active';
    await supabase.from('promotions').update({ status: newStatus }).eq('id', promo.id);
    fetchPromos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus promo ini?')) return;
    await supabase
      .from('promo_recommendations')
      .update({ status: 'pending', approved_at: null, promotion_id: null })
      .eq('promotion_id', id);
    await supabase.from('promotions').delete().eq('id', id);
    fetchPromos();
  };

  const handleReturnToRec = async (id: string) => {
    if (!confirm('Kembalikan promo ini ke Rekomendasi Promo?\nPromo akan dihapus dan rekomendasi dikembalikan ke status pending.')) return;
    await supabase
      .from('promo_recommendations')
      .update({ status: 'pending', approved_at: null, promotion_id: null })
      .eq('promotion_id', id);
    await supabase.from('promotions').delete().eq('id', id);
    fetchPromos();
  };

  // ─── Filtered ────────────────────────────────────────────────────────────────

  const filteredPromos = promos.filter((p) => {
    if (filterType && p.type !== filterType) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    return true;
  });

  const filteredProductSearch = productSearchResults.filter(
    (p) => !formSelectedProducts.some((sp) => sp.store_product_id === p.id)
  );

  // ─── Margin Card ─────────────────────────────────────────────────────────────

  function MarginCard() {
    if (formType !== 'discount' || formSelectedProducts.length === 0) return null;
    const prod = formSelectedProducts[0]?.store_product;
    if (!prod) return null;
    const { promoPrice, marginNom, marginPct } = calcMarginDiscount(
      prod.hpp, prod.sell_price,
      formRule.discount_pct_1, formRule.discount_pct_2,
      formRule.discount_pct_3, formRule.discount_pct_4
    );
    const normalMarginNom = prod.sell_price - prod.hpp;
    const normalMarginPct = prod.hpp > 0 ? (normalMarginNom / prod.hpp) * 100 : 0;
    const isLow = marginPct < 10;
    const isLoss = marginNom < 0;
    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
        <p className="font-medium text-gray-700 mb-2 flex items-center gap-1">
          <TrendingUp className="w-4 h-4" /> Simulasi Margin
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-gray-500">Margin Normal</p>
            <p className="font-semibold text-gray-800">{formatRupiah(normalMarginNom)}</p>
            <p className="text-xs text-gray-500">{normalMarginPct.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Margin Promo</p>
            <p className={`font-semibold ${isLoss ? 'text-red-600' : isLow ? 'text-orange-500' : 'text-green-600'}`}>
              {formatRupiah(marginNom)}
            </p>
            <p className={`text-xs ${isLoss ? 'text-red-600' : isLow ? 'text-orange-500' : 'text-gray-500'}`}>
              {marginPct.toFixed(1)}% {isLoss ? '⚠ RUGI' : isLow ? '⚠ Rendah' : ''}
            </p>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-500">Harga Promo: <span className="font-medium text-gray-700">{formatRupiah(promoPrice)}</span></p>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  // ─── Filtered discounts ───────────────────────────────────────────────────────
  const filteredDiscountPerf = discountPerf.filter((dp) => {
    const d = dp.discount;
    if (discountFilter === 'active' && !d.is_active) return false;
    if (discountFilter === 'inactive' && d.is_active) return false;
    if (discountSearch) {
      const q = discountSearch.toLowerCase();
      const name = d.store_products?.name?.toLowerCase() || '';
      const barcode = d.store_products?.barcode?.toLowerCase() || '';
      const kode = d.ipos_kodeitem?.toLowerCase() || '';
      if (!name.includes(q) && !barcode.includes(q) && !kode.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Promo &amp; Diskon</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola promosi dan diskon produk</p>
        </div>
        {activeTab === 'daftar' && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Buat Promo Baru
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('daftar')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'daftar' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Daftar Promo
        </button>
        <button
          onClick={() => setActiveTab('performa')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'performa' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <BarChart2 className="w-4 h-4" />
          Performa Diskon iPOS
        </button>
      </div>

      {/* ── TAB: DAFTAR PROMO ─────────────────────────────────────────────────── */}
      {activeTab === 'daftar' && (<>
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field w-auto text-sm py-1.5">
          <option value="">Semua Tipe</option>
          {(Object.entries(TYPE_LABELS) as [PromoType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-auto text-sm py-1.5">
          <option value="">Semua Status</option>
          {(Object.entries(STATUS_LABELS) as [PromoStatus, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Promo Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : filteredPromos.length === 0 ? (
          <div className="text-center py-16">
            <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Belum ada promo. Klik &quot;Buat Promo Baru&quot; untuk mulai.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Nama Promo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Tipe</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Periode</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Penggunaan</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPromos.map((promo) => (
                  <tr key={promo.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{promo.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[promo.type]}`}>
                        {TYPE_LABELS[promo.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {promo.start_date && promo.end_date
                        ? `${promo.start_date} — ${promo.end_date}`
                        : promo.start_date || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[promo.status as PromoStatus] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[promo.status as PromoStatus] || promo.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 text-xs">
                      {promo.current_usage}{promo.max_usage != null ? ` / ${promo.max_usage}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleToggleStatus(promo)} title={promo.status === 'active' ? 'Jeda' : 'Aktifkan'} className="text-gray-500 hover:text-blue-600 transition-colors">
                          {promo.status === 'active' ? <ToggleRight className="w-5 h-5 text-blue-600" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <button onClick={() => openEdit(promo)} className="text-gray-500 hover:text-blue-600 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {recsWithPromo.has(promo.id) && (
                          <button
                            onClick={() => handleReturnToRec(promo.id)}
                            title="Kembalikan ke Rekomendasi Promo"
                            className="text-gray-500 hover:text-amber-600 transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(promo.id)} className="text-gray-500 hover:text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {/* ── TAB: PERFORMA DISKON IPOS ─────────────────────────────────────────── */}
      {activeTab === 'performa' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2 flex-1 min-w-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari produk..."
                  value={discountSearch}
                  onChange={(e) => setDiscountSearch(e.target.value)}
                  className="input-field pl-9 text-sm py-2 w-full"
                />
              </div>
              <div className="flex gap-1">
                {(['all', 'active', 'inactive'] as const).map((f) => (
                  <button key={f} onClick={() => setDiscountFilter(f)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${discountFilter === f ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                    {f === 'all' ? 'Semua' : f === 'active' ? 'Aktif' : 'Tidak Aktif'}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={fetchDiscounts} disabled={discountLoading}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${discountLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {discountLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : discounts.length === 0 ? (
            <div className="card text-center py-12">
              <Tag className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">Belum ada data diskon dari iPOS</p>
              <p className="text-gray-400 text-xs mt-1">Pastikan sync agent sudah berjalan dan tabel store_item_discounts sudah dibuat di Supabase.</p>
            </div>
          ) : filteredDiscountPerf.length === 0 ? (
            <div className="card text-center py-12">
              <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Tidak ada hasil untuk filter ini.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDiscountPerf.map((dp, idx) => {
                const d = dp.discount;
                const name = d.store_products?.name || d.ipos_kodeitem;
                const barcode = d.store_products?.barcode || '';
                const sellPrice = d.store_products?.sell_price || 0;
                const hpp = d.store_products?.hpp || 0;
                const diskonLabel = d.diskon1 > 0 ? `${d.diskon1}%` : d.disknom1 > 0 ? `-${formatRupiah(d.disknom1)}` : '—';
                const promoPrice = d.diskon1 > 0 ? sellPrice * (1 - d.diskon1 / 100) : d.disknom1 > 0 ? sellPrice - d.disknom1 : sellPrice;
                const marginPct = promoPrice > 0 && hpp > 0 ? (promoPrice - hpp) / promoPrice * 100 : null;
                const isExpanded = expandedId === d.id;

                const qtyChange = dp.beforeQty === 0 ? null : (dp.duringQty - dp.beforeQty) / dp.beforeQty * 100;
                const revChange = dp.beforeRev === 0 ? null : (dp.duringRev - dp.beforeRev) / dp.beforeRev * 100;

                return (
                  <div key={d.id} className={`card border ${d.is_active ? 'border-green-200' : 'border-gray-200'} space-y-2`}>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${d.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {d.is_active ? 'Aktif' : 'Tidak Aktif'}
                          </span>
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                            Diskon {diskonLabel}
                          </span>
                          {marginPct !== null && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${marginPct < 0 ? 'bg-red-100 text-red-700' : marginPct < 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                              Margin {marginPct.toFixed(1)}%{marginPct < 0 ? ' ⚠' : ''}
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-gray-800 mt-1 truncate">{name}</p>
                        {barcode && <p className="text-xs text-gray-400">{barcode}</p>}
                        {(d.tgl_dari || d.tgl_sampai) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {d.tgl_dari ? d.tgl_dari.split('T')[0] : '∞'} — {d.tgl_sampai ? d.tgl_sampai.split('T')[0] : '∞'}
                            {d.jam_dari && ` | ${d.jam_dari}–${d.jam_sampai || '...'}`}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (!isExpanded) {
                            setExpandedId(d.id);
                            if (!dp.loaded) loadPerfData(d, idx);
                          } else {
                            setExpandedId(null);
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Expanded: perbandingan penjualan */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-gray-100 space-y-2">
                        {!d.store_product_id ? (
                          <p className="text-xs text-gray-400">Produk ini belum tersinkron ke store_products — tidak bisa hitung perbandingan.</p>
                        ) : !d.tgl_dari ? (
                          <p className="text-xs text-gray-400">Diskon ini tidak memiliki tanggal mulai — tidak bisa hitung perbandingan.</p>
                        ) : !dp.loaded ? (
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Loader2 className="w-3 h-3 animate-spin" /> Memuat data penjualan...
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                              Perbandingan Penjualan (7 hari sebelum vs selama diskon)
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-gray-50 rounded-lg px-3 py-2">
                                <p className="text-gray-400">7 Hari Sebelum</p>
                                <p className="font-semibold text-gray-700 text-sm">{dp.beforeQty} pcs</p>
                                <p className="text-gray-500">{formatRupiah(dp.beforeRev)}</p>
                              </div>
                              <div className="bg-blue-50 rounded-lg px-3 py-2">
                                <p className="text-blue-500">Selama Diskon</p>
                                <p className="font-semibold text-blue-700 text-sm">
                                  {dp.duringQty} pcs
                                  {qtyChange !== null && (
                                    <span className={`ml-1 text-xs font-normal ${qtyChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                      ({qtyChange >= 0 ? '+' : ''}{qtyChange.toFixed(0)}%)
                                    </span>
                                  )}
                                </p>
                                <p className="text-blue-600">
                                  {formatRupiah(dp.duringRev)}
                                  {revChange !== null && (
                                    <span className={`ml-1 text-xs ${revChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                      ({revChange >= 0 ? '+' : ''}{revChange.toFixed(0)}%)
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            {dp.beforeQty === 0 && dp.duringQty === 0 && (
                              <p className="text-xs text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Belum ada data penjualan tersinkron untuk produk ini.
                              </p>
                            )}
                          </>
                        )}
                        {/* Info harga */}
                        {sellPrice > 0 && (
                          <div className="flex gap-3 text-xs text-gray-500 pt-1">
                            <span>Harga Normal: <b className="text-gray-700">{formatRupiah(sellPrice)}</b></span>
                            <span>Harga Diskon: <b className="text-gray-700">{formatRupiah(promoPrice)}</b></span>
                            {hpp > 0 && <span>HPP: <b className="text-gray-700">{formatRupiah(hpp)}</b></span>}
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
      )}

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">{editPromo ? 'Edit Promo' : 'Buat Promo Baru'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Nama & Tipe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Promo *</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="contoh: Diskon Lebaran 10%" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Promo *</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value as PromoType)} className="input-field">
                    {(Object.entries(TYPE_LABELS) as [PromoType, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Periode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Mulai</label>
                  <input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Selesai</label>
                  <input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} className="input-field" />
                </div>
              </div>

              {/* Jam — khusus Flash Sale */}
              {formType === 'flash_sale' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Jam Mulai</label>
                    <input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Jam Selesai</label>
                    <input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="input-field" />
                  </div>
                </div>
              )}

              {/* Hari Aktif */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hari Aktif</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(({ key, label }) => (
                    <button key={key} type="button" onClick={() => setFormDays((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${formDays[key] ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aturan Promo */}
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Aturan Promo — {TYPE_LABELS[formType]}</h4>

                {formType === 'discount' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([1, 2, 3, 4] as const).map((n) => (
                      <div key={n}>
                        <label className="block text-xs text-gray-500 mb-1">Pot {n} (%)</label>
                        <input type="number" min="0" max="100" step="0.1"
                          value={(formRule[`discount_pct_${n}` as keyof PromoRule] as number) || ''}
                          onChange={(e) => setFormRule((r) => ({ ...r, [`discount_pct_${n}`]: parseFloat(e.target.value) || 0 }))}
                          className="input-field text-sm py-1.5" />
                      </div>
                    ))}
                  </div>
                )}

                {formType === 'bundle' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Harga Bundle (Rp)</label>
                      <input type="number" min="0" value={formRule.bundle_price || ''}
                        onChange={(e) => setFormRule((r) => ({ ...r, bundle_price: parseFloat(e.target.value) || 0 }))}
                        className="input-field text-sm py-1.5" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Min Qty</label>
                      <input type="number" min="1" value={formRule.min_qty || ''}
                        onChange={(e) => setFormRule((r) => ({ ...r, min_qty: parseInt(e.target.value) || 0 }))}
                        className="input-field text-sm py-1.5" />
                    </div>
                  </div>
                )}

                {formType === 'bxgy' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Beli (X qty)</label>
                      <input type="number" min="1" value={formRule.min_qty || ''}
                        onChange={(e) => setFormRule((r) => ({ ...r, min_qty: parseInt(e.target.value) || 0 }))}
                        className="input-field text-sm py-1.5" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Gratis (Y qty)</label>
                      <input type="number" min="1" value={formRule.free_qty || ''}
                        onChange={(e) => setFormRule((r) => ({ ...r, free_qty: parseInt(e.target.value) || 0 }))}
                        className="input-field text-sm py-1.5" />
                    </div>
                  </div>
                )}

                {formType === 'min_purchase' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Min Belanja (Rp)</label>
                      <input type="number" min="0" value={formRule.min_purchase || ''}
                        onChange={(e) => setFormRule((r) => ({ ...r, min_purchase: parseFloat(e.target.value) || 0 }))}
                        className="input-field text-sm py-1.5" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Diskon Nominal (Rp)</label>
                      <input type="number" min="0" value={formRule.discount_nom_1 || ''}
                        onChange={(e) => setFormRule((r) => ({ ...r, discount_nom_1: parseFloat(e.target.value) || 0 }))}
                        className="input-field text-sm py-1.5" />
                    </div>
                  </div>
                )}

                {formType === 'flash_sale' && (
                  <div className="space-y-2">
                    {formSelectedProducts.length === 0
                      ? <p className="text-xs text-gray-400">Tambahkan produk dulu untuk set harga flash sale</p>
                      : formSelectedProducts.map((pp, idx) => {
                          const prod = pp.store_product;
                          if (!prod) return null;
                          const promoPrice = pp.promo_price ?? 0;
                          const isLoss = promoPrice > 0 && promoPrice < prod.hpp;
                          return (
                            <div key={idx} className="grid grid-cols-2 gap-2 items-start">
                              <p className="text-xs text-gray-700 pt-2 truncate">{prod.name}</p>
                              <div>
                                <input type="number" min="0" placeholder="Harga Flash Sale"
                                  value={pp.promo_price ?? ''}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || null;
                                    setFormSelectedProducts((prev) =>
                                      prev.map((p, i) => (i === idx ? { ...p, promo_price: val } : p))
                                    );
                                  }}
                                  className={`input-field text-sm py-1.5 ${isLoss ? 'border-red-400' : ''}`} />
                                {isLoss && <p className="text-xs text-red-500 mt-0.5">Di bawah HPP ({formatRupiah(prod.hpp)})!</p>}
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                )}
              </div>

              {/* Pilih Produk */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Package className="w-4 h-4" /> Produk
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formProductSearch}
                    onChange={(e) => handleProductSearchChange(e.target.value)}
                    onFocus={() => { setFormProductFocused(true); searchProducts(formProductSearch); }}
                    onBlur={() => setTimeout(() => setFormProductFocused(false), 150)}
                    placeholder="Ketik nama atau barcode produk..."
                    className="input-field text-sm"
                  />
                  {formProductFocused && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-56 overflow-y-auto">
                      {productSearchLoading ? (
                        <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin" /> Mencari...
                        </div>
                      ) : filteredProductSearch.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-gray-400">
                          {formProductSearch ? 'Produk tidak ditemukan.' : 'Ketik untuk mencari produk...'}
                        </p>
                      ) : (
                        filteredProductSearch.map((p) => (
                          <button key={p.id} type="button" onClick={() => addProductToForm(p)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
                            <p className="font-medium text-gray-800">{p.name}</p>
                            <p className="text-xs text-gray-400">{p.barcode} · HPP: {formatRupiah(p.hpp)}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {formSelectedProducts.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {formSelectedProducts.map((pp) => {
                      const prod = pp.store_product;
                      return (
                        <div key={pp.store_product_id} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg text-sm">
                          <span className="flex-1 truncate text-gray-800">{prod?.name || pp.store_product_id}</span>
                          <span className="text-gray-400 text-xs">{formatRupiah(prod?.hpp || 0)}</span>
                          <button type="button" onClick={() => removeProductFromForm(pp.store_product_id)} className="text-gray-400 hover:text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <MarginCard />
              </div>

              {/* Validasi */}
              {formType === 'discount' && formSelectedProducts.length > 0 && (() => {
                const prod = formSelectedProducts[0]?.store_product;
                if (!prod) return null;
                const { marginNom } = calcMarginDiscount(prod.hpp, prod.sell_price, formRule.discount_pct_1, formRule.discount_pct_2, formRule.discount_pct_3, formRule.discount_pct_4);
                if (marginNom < 0) return (
                  <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Peringatan: Harga promo di bawah HPP — akan merugi!
                  </div>
                );
                return null;
              })()}

              {formType === 'bundle' && formRule.bundle_price > 0 && formSelectedProducts.length > 0 && (() => {
                const totalHpp = formSelectedProducts.reduce((s, p) => s + (p.store_product?.hpp || 0), 0) * (formRule.min_qty || 2);
                if (formRule.bundle_price < totalHpp) return (
                  <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Harga bundle ({formatRupiah(formRule.bundle_price)}) di bawah total HPP ({formatRupiah(totalHpp)}) — akan merugi!
                  </div>
                );
                return null;
              })()}

              {formType === 'bxgy' && formSelectedProducts.length > 0 && formRule.min_qty > 0 && formRule.free_qty > 0 && (() => {
                const prod = formSelectedProducts[0]?.store_product;
                if (!prod) return null;
                const profitPerSet = (formRule.min_qty * prod.sell_price) - ((formRule.min_qty + formRule.free_qty) * prod.hpp);
                if (profitPerSet < 0) return (
                  <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Beli {formRule.min_qty} Gratis {formRule.free_qty}: toko merugi {formatRupiah(-profitPerSet)} per set!
                  </div>
                );
                return null;
              })()}

              {formType === 'min_purchase' && formRule.discount_nom_1 > formRule.min_purchase && formRule.min_purchase > 0 && (
                <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Diskon nominal melebihi min belanja!
                </div>
              )}

              {/* Setting Lain */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioritas</label>
                  <input type="number" min="1" max="100" value={formPriority}
                    onChange={(e) => setFormPriority(parseInt(e.target.value) || 10)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Maks Penggunaan</label>
                  <input type="number" min="1" value={formMaxUsage} onChange={(e) => setFormMaxUsage(e.target.value)}
                    placeholder="Tidak terbatas" className="input-field" />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary" disabled={saving}>Batal</button>
              <button onClick={handleSave} disabled={saving || !formName.trim()} className="btn-primary flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editPromo ? 'Simpan Perubahan' : 'Buat Promo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
