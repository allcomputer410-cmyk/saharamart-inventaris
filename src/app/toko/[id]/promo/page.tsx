'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
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
  const marginPct = hpp > 0 ? (marginNom / hpp) * 100 : 0;
  return { promoPrice, marginNom, marginPct };
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PromoPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabase = createClient();

  const [promos, setPromos] = useState<Promo[]>([]);
  const [products, setProducts] = useState<StoreProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPromo, setEditPromo] = useState<Promo | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

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

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('promotions')
      .select(`*, promo_rules(*), promo_products(*, store_product:store_products(id, barcode, name, hpp, sell_price))`)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    setPromos((data as Promo[]) || []);
    setLoading(false);
  }, [storeId, supabase]);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from('store_products')
      .select('id, barcode, name, hpp, sell_price')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('name');
    setProducts((data as StoreProductOption[]) || []);
  }, [storeId, supabase]);

  useEffect(() => { fetchPromos(); fetchProducts(); }, [fetchPromos, fetchProducts]);

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
    await supabase.from('promotions').delete().eq('id', id);
    fetchPromos();
  };

  // ─── Filtered ────────────────────────────────────────────────────────────────

  const filteredPromos = promos.filter((p) => {
    if (filterType && p.type !== filterType) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    return true;
  });

  const filteredProductSearch = products.filter(
    (p) =>
      !formSelectedProducts.some((sp) => sp.store_product_id === p.id) &&
      (p.name.toLowerCase().includes(formProductSearch.toLowerCase()) ||
        p.barcode.toLowerCase().includes(formProductSearch.toLowerCase()))
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Promo &amp; Diskon</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola promosi dan diskon produk</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Buat Promo Baru
        </button>
      </div>

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
                  <input type="text" value={formProductSearch} onChange={(e) => setFormProductSearch(e.target.value)}
                    placeholder="Cari produk (nama / barcode)..." className="input-field text-sm" />
                  {formProductSearch && filteredProductSearch.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {filteredProductSearch.slice(0, 10).map((p) => (
                        <button key={p.id} type="button" onClick={() => addProductToForm(p)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                          <span className="font-medium text-gray-800">{p.name}</span>
                          <span className="text-gray-400 text-xs ml-2">{p.barcode}</span>
                          <span className="text-gray-400 text-xs ml-2">HPP: {formatRupiah(p.hpp)}</span>
                        </button>
                      ))}
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
