'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah, formatDate } from '@/lib/utils';
import {
  Lightbulb,
  RefreshCw,
  CheckCircle,
  XCircle,
  SlidersHorizontal,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Package,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Tag,
  BarChart2,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Priority = 'urgent' | 'suggested' | 'optional';
type PromoType = 'discount' | 'bundle' | 'bxgy' | 'min_purchase' | 'flash_sale';
type RecStatus = 'pending' | 'approved' | 'rejected';

interface PromoRecommendation {
  id: string;
  store_id: string;
  store_product_id: string;
  status: RecStatus;
  priority: Priority;
  promo_type: PromoType;
  reason: string;
  product_name: string;
  product_barcode: string;
  hpp: number;
  sell_price: number;
  current_stock: number;
  days_no_sale: number;
  params: Record<string, unknown>;
  est_revenue: number;
  est_profit: number;
  loss_if_no_promo: number;
  analyzed_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  promotion_id: string | null;
}

interface DiscountInfo {
  ipos_iddiskon: string;
  diskon1: number;
  disknom1: number;
  tgl_dari: string | null;
  tgl_sampai: string | null;
  jam_dari: string | null;
  jam_sampai: string | null;
}

interface SalesRow {
  sale_date: string;
  total_qty: number;
  total_revenue: number;
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

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; dot: string }> = {
  urgent:    { label: 'URGENT',      color: 'bg-red-100 text-red-700 border-red-200',     dot: 'bg-red-500' },
  suggested: { label: 'DISARANKAN',  color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  optional:  { label: 'OPSIONAL',    color: 'bg-gray-100 text-gray-600 border-gray-200',   dot: 'bg-gray-400' },
};

const PRIORITY_ORDER: Priority[] = ['urgent', 'suggested', 'optional'];

// ─── Sales Comparison Panel ───────────────────────────────────────────────────

function SalesComparisonPanel({
  storeProductId,
  discountInfo,
}: {
  storeProductId: string;
  discountInfo: DiscountInfo;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<{ before: SalesRow[]; during: SalesRow[] } | null>(null);
  const [compLoading, setCompLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const tglDari = discountInfo.tgl_dari ? new Date(discountInfo.tgl_dari) : null;
      if (!tglDari) { setCompLoading(false); return; }

      const today = new Date();
      const before7Start = new Date(tglDari);
      before7Start.setDate(before7Start.getDate() - 7);

      const [{ data: beforeData }, { data: duringData }] = await Promise.all([
        supabase
          .from('daily_sale_items')
          .select('sale_date, total_qty, total_revenue')
          .eq('store_product_id', storeProductId)
          .gte('sale_date', before7Start.toISOString().split('T')[0])
          .lt('sale_date', tglDari.toISOString().split('T')[0]),
        supabase
          .from('daily_sale_items')
          .select('sale_date, total_qty, total_revenue')
          .eq('store_product_id', storeProductId)
          .gte('sale_date', tglDari.toISOString().split('T')[0])
          .lte('sale_date', today.toISOString().split('T')[0]),
      ]);

      setRows({ before: beforeData || [], during: duringData || [] });
      setCompLoading(false);
    };
    fetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeProductId, discountInfo.tgl_dari]);

  const sumQty = (r: SalesRow[]) => r.reduce((s, x) => s + x.total_qty, 0);
  const sumRev = (r: SalesRow[]) => r.reduce((s, x) => s + x.total_revenue, 0);

  if (compLoading) return (
    <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
      <Loader2 className="w-3 h-3 animate-spin" /> Memuat data penjualan...
    </div>
  );

  if (!rows) return null;

  const beforeQty = sumQty(rows.before);
  const duringQty = sumQty(rows.during);
  const beforeRev = sumRev(rows.before);
  const duringRev = sumRev(rows.during);
  const qtyChange = beforeQty === 0 ? null : ((duringQty - beforeQty) / beforeQty * 100);
  const revChange = beforeRev === 0 ? null : ((duringRev - beforeRev) / beforeRev * 100);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
        <BarChart2 className="w-3.5 h-3.5 text-blue-500" />
        Perbandingan Penjualan (Sebelum vs Selama Diskon)
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded-lg px-2 py-1.5">
          <p className="text-gray-400">7 Hari Sebelum</p>
          <p className="font-semibold text-gray-700">{beforeQty} pcs</p>
          <p className="text-gray-500">{formatRupiah(beforeRev)}</p>
        </div>
        <div className="bg-blue-50 rounded-lg px-2 py-1.5">
          <p className="text-blue-500">Selama Diskon</p>
          <p className="font-semibold text-blue-700">{duringQty} pcs
            {qtyChange !== null && (
              <span className={`ml-1 text-xs font-normal ${qtyChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                ({qtyChange >= 0 ? '+' : ''}{qtyChange.toFixed(0)}%)
              </span>
            )}
          </p>
          <p className="text-blue-600">{formatRupiah(duringRev)}
            {revChange !== null && (
              <span className={`ml-1 text-xs ${revChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                ({revChange >= 0 ? '+' : ''}{revChange.toFixed(0)}%)
              </span>
            )}
          </p>
        </div>
      </div>
      {rows.before.length === 0 && rows.during.length === 0 && (
        <p className="text-xs text-gray-400">Belum ada data penjualan tersinkron.</p>
      )}
    </div>
  );
}

// ─── Margin Bar Component ─────────────────────────────────────────────────────

function MarginBar({ marginPct }: { marginPct: number }) {
  const barColor = marginPct >= 20 ? 'bg-green-500' : marginPct >= 5 ? 'bg-yellow-400' : 'bg-red-500';
  const barWidth = Math.min(Math.max(marginPct, 0), 50);
  return (
    <div className="space-y-1">
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${barColor} h-2 rounded-full transition-all`}
          style={{ width: `${barWidth * 2}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>0%</span>
        <span>5% min</span>
        <span>20% aman</span>
        <span>50%</span>
      </div>
    </div>
  );
}

// ─── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({
  rec,
  editingId,
  editParams,
  discountInfo,
  onApprove,
  onReject,
  onStartEdit,
  onSaveEdit,
  onEditParamChange,
  onOpenPromoForm,
}: {
  rec: PromoRecommendation;
  editingId: string | null;
  editParams: Record<string, number>;
  discountInfo?: DiscountInfo;
  onApprove: (rec: PromoRecommendation) => void;
  onReject: (id: string) => void;
  onStartEdit: (rec: PromoRecommendation) => void;
  onSaveEdit: (rec: PromoRecommendation) => void;
  onEditParamChange: (key: string, value: number) => void;
  onOpenPromoForm: (rec: PromoRecommendation) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const isEditing = editingId === rec.id;
  const pc = PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.optional;

  // Get margin pct for display
  const marginPct = isEditing
    ? (editParams.margin_promo_pct ?? editParams.margin_bundle_pct ?? editParams.margin_flash_pct ?? editParams.margin_efektif_pct ?? 0)
    : Number(rec.params.margin_promo_pct ?? rec.params.margin_bundle_pct ?? rec.params.margin_flash_pct ?? rec.params.margin_efektif_pct ?? 0);

  const _canApprove = !isEditing || marginPct >= 0;

  return (
    <div className={`card border ${pc.color} space-y-3`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${pc.dot}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${pc.color}`}>
                {pc.label}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[rec.promo_type]}`}>
                {TYPE_LABELS[rec.promo_type]}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <h3 className="font-semibold text-gray-800 truncate">{rec.product_name}</h3>
              {discountInfo && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full flex-shrink-0">
                  <Tag className="w-3 h-3" />
                  Diskon iPOS{discountInfo.diskon1 > 0 ? ` ${discountInfo.diskon1}%` : discountInfo.disknom1 > 0 ? ` -${formatRupiah(discountInfo.disknom1)}` : ''}
                </span>
              )}
            </div>
            {rec.product_barcode && (
              <p className="text-xs text-gray-400">{rec.product_barcode}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
        >
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Reason */}
      <p className="text-sm text-gray-600">{rec.reason}</p>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-gray-50 rounded-lg px-2 py-1.5">
          <p className="text-gray-400">Stok</p>
          <p className="font-semibold text-gray-700">{rec.current_stock} pcs</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-2 py-1.5">
          <p className="text-gray-400">Tdk Terjual</p>
          <p className="font-semibold text-gray-700">{rec.days_no_sale} hari</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-2 py-1.5">
          <p className="text-gray-400">HPP</p>
          <p className="font-semibold text-gray-700">{formatRupiah(rec.hpp)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-2 py-1.5">
          <p className="text-gray-400">Harga Jual</p>
          <p className="font-semibold text-gray-700">{formatRupiah(rec.sell_price)}</p>
        </div>
      </div>

      {/* Details (collapsible) */}
      {showDetails && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          {/* Promo params */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1">Detail Rekomendasi</p>
            {isEditing ? (
              <div className="space-y-2">
                {rec.promo_type === 'discount' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-gray-500 block mb-0.5">Diskon (%)</label>
                      <input
                        type="number" min="1" max="90" step="0.1"
                        value={editParams.discount_pct ?? 0}
                        onChange={(e) => onEditParamChange('discount_pct', parseFloat(e.target.value) || 0)}
                        className="input-field py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 block mb-0.5">Harga Promo</label>
                      <p className="font-semibold text-gray-700 pt-1">
                        {formatRupiah(rec.sell_price * (1 - (editParams.discount_pct ?? 0) / 100))}
                      </p>
                    </div>
                  </div>
                )}
                {rec.promo_type === 'bundle' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-gray-500 block mb-0.5">Diskon Bundle (%)</label>
                      <input
                        type="number" min="1" max="50" step="0.1"
                        value={editParams.bundle_discount_pct ?? 12}
                        onChange={(e) => onEditParamChange('bundle_discount_pct', parseFloat(e.target.value) || 0)}
                        className="input-field py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 block mb-0.5">Harga Bundle</label>
                      <p className="font-semibold text-gray-700 pt-1">
                        {formatRupiah(rec.sell_price * 2 * (1 - (editParams.bundle_discount_pct ?? 12) / 100))}
                      </p>
                    </div>
                  </div>
                )}
                {rec.promo_type === 'bxgy' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-gray-500 block mb-0.5">Beli (qty)</label>
                      <input
                        type="number" min="1" max="10"
                        value={editParams.buy_qty ?? 3}
                        onChange={(e) => onEditParamChange('buy_qty', parseInt(e.target.value) || 1)}
                        className="input-field py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 block mb-0.5">Gratis (qty)</label>
                      <input
                        type="number" min="1" max="5"
                        value={editParams.free_qty ?? 1}
                        onChange={(e) => onEditParamChange('free_qty', parseInt(e.target.value) || 1)}
                        className="input-field py-1 text-xs"
                      />
                    </div>
                  </div>
                )}
                {rec.promo_type === 'flash_sale' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-gray-500 block mb-0.5">Diskon Flash (%)</label>
                      <input
                        type="number" min="1" max="50" step="0.1"
                        value={editParams.flash_discount_pct ?? 10}
                        onChange={(e) => onEditParamChange('flash_discount_pct', parseFloat(e.target.value) || 0)}
                        className="input-field py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 block mb-0.5">Kuota/Hari</label>
                      <input
                        type="number" min="1"
                        value={editParams.kuota_per_hari ?? 10}
                        onChange={(e) => onEditParamChange('kuota_per_hari', parseInt(e.target.value) || 1)}
                        className="input-field py-1 text-xs"
                      />
                    </div>
                  </div>
                )}
                {rec.promo_type === 'min_purchase' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-gray-500 block mb-0.5">Min Belanja (Rp)</label>
                      <input
                        type="number" min="0" step="1000"
                        value={editParams.min_purchase ?? 0}
                        onChange={(e) => onEditParamChange('min_purchase', parseFloat(e.target.value) || 0)}
                        className="input-field py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500 block mb-0.5">Diskon Nominal (Rp)</label>
                      <input
                        type="number" min="0" step="1000"
                        value={editParams.discount_nom ?? 0}
                        onChange={(e) => onEditParamChange('discount_nom', parseFloat(e.target.value) || 0)}
                        className="input-field py-1 text-xs"
                      />
                    </div>
                  </div>
                )}
                {marginPct < 5 && (
                  <div className="flex items-center gap-2 bg-yellow-50 text-yellow-700 px-3 py-2 rounded-lg text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Margin di bawah 5% — pertimbangkan kembali
                  </div>
                )}
                {marginPct < 0 && (
                  <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Margin negatif — akan merugi! Tidak dapat disetujui.
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {Object.entries(rec.params).map(([k, v]) => {
                  if (k === 'nama_promo') return null;
                  return (
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-400 capitalize">{k.replace(/_/g, ' ')}</span>
                      <span className="font-medium text-gray-700">
                        {typeof v === 'number' && k.includes('price') ? formatRupiah(v) : String(v)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Margin bar */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1">Margin Promo: {marginPct.toFixed(1)}%</p>
            <MarginBar marginPct={marginPct} />
          </div>

          {/* Estimasi */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 rounded-lg px-2 py-1.5">
              <p className="text-green-600">Est. Revenue</p>
              <p className="font-semibold text-green-700">{formatRupiah(rec.est_revenue)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg px-2 py-1.5">
              <p className="text-blue-600">Est. Profit</p>
              <p className="font-semibold text-blue-700">{formatRupiah(rec.est_profit)}</p>
            </div>
            <div className="bg-red-50 rounded-lg px-2 py-1.5">
              <p className="text-red-600">Rugi Jika Tdk</p>
              <p className="font-semibold text-red-700">{formatRupiah(rec.loss_if_no_promo)}</p>
            </div>
          </div>

          {/* Sales comparison — hanya untuk item yang sedang diskon di iPOS */}
          {discountInfo && (
            <SalesComparisonPanel
              storeProductId={rec.store_product_id}
              discountInfo={discountInfo}
            />
          )}
        </div>
      )}

      {/* Margin warning — tampil di view mode ketika margin promo tipis */}
      {!isEditing && rec.params.margin_warning === true && marginPct > 0 && (
        <div className="flex items-center gap-2 bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-2 rounded-lg text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Margin promo tipis ({marginPct.toFixed(1)}%) — pastikan stok habis agar tidak rugi
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        {isEditing ? (
          <>
            <button
              onClick={() => onSaveEdit(rec)}
              disabled={marginPct < 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Simpan &amp; Setuju
            </button>
            <button
              onClick={() => onStartEdit({ ...rec, params: {} } as PromoRecommendation)}
              className="px-3 py-2 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onApprove(rec)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Setuju
            </button>
            <button
              onClick={() => onStartEdit(rec)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Ubah Parameter
            </button>
            <button
              onClick={() => onReject(rec.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Tolak
            </button>
          </>
        )}
      </div>

      {/* Shortcut: buat promo manual dari rekomendasi ini */}
      <div className="border-t border-gray-100 pt-2">
        <button
          onClick={() => onOpenPromoForm(rec)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Buat Promo Manual (form lengkap)
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RekomendasiPromoPage() {
  const params = useParams();
  const storeId = params.id as string;
  const router = useRouter();
  const supabase = createClient();

  const [recs, setRecs] = useState<PromoRecommendation[]>([]);
  const [history, setHistory] = useState<PromoRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [filterPriority, setFilterPriority] = useState<'' | Priority>('');
  const [filterType, setFilterType] = useState<'' | PromoType>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editParams, setEditParams] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [emptyReason, setEmptyReason] = useState<'no_sale_data' | 'all_normal' | null>(null);
  const [discountMap, setDiscountMap] = useState<Record<string, DiscountInfo>>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRecs = useCallback(async () => {
    setLoading(true);
    const [{ data: pending }, { data: hist }] = await Promise.all([
      supabase
        .from('promo_recommendations')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'pending')
        .order('priority', { ascending: true }) // urgent < suggested < optional alphabetically handled via PRIORITY_ORDER
        .order('analyzed_at', { ascending: false }),
      supabase
        .from('promo_recommendations')
        .select('*')
        .eq('store_id', storeId)
        .in('status', ['approved', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    // Sort pending by priority order
    const sortedPending = (pending || []).sort((a: PromoRecommendation, b: PromoRecommendation) => {
      return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    });
    setRecs(sortedPending);
    setHistory(hist || []);
    setLoading(false);
  }, [storeId, supabase]);

  const fetchDiscounts = useCallback(async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('store_item_discounts')
      .select('store_product_id, ipos_iddiskon, diskon1, disknom1, tgl_dari, tgl_sampai, jam_dari, jam_sampai')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .or(`tgl_sampai.is.null,tgl_sampai.gte.${now}`)
      .or(`tgl_dari.is.null,tgl_dari.lte.${now}`);

    if (data) {
      const map: Record<string, DiscountInfo> = {};
      for (const d of data) {
        if (d.store_product_id) {
          map[d.store_product_id] = {
            ipos_iddiskon: d.ipos_iddiskon,
            diskon1: d.diskon1 ?? 0,
            disknom1: d.disknom1 ?? 0,
            tgl_dari: d.tgl_dari,
            tgl_sampai: d.tgl_sampai,
            jam_dari: d.jam_dari,
            jam_sampai: d.jam_sampai,
          };
        }
      }
      setDiscountMap(map);
    }
  }, [storeId, supabase]);

  useEffect(() => { fetchRecs(); fetchDiscounts(); }, [fetchRecs, fetchDiscounts]);

  const handleRefresh = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/promo-intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.total_recommendations === 0) {
          setEmptyReason(data.no_sale_data ? 'no_sale_data' : 'all_normal');
          showToast('Analisis selesai — tidak ada rekomendasi baru');
        } else {
          setEmptyReason(null);
          showToast(`Analisis selesai: ${data.total_recommendations} rekomendasi baru`);
        }
        await fetchRecs();
      } else {
        showToast('Analisis gagal: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch {
      showToast('Gagal menghubungi server analisis', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApprove = async (rec: PromoRecommendation) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 14);
      const endDateStr = endDate.toISOString().split('T')[0];

      const promoName = String(rec.params.nama_promo || `${TYPE_LABELS[rec.promo_type]} - ${rec.product_name}`);

      // Insert promotion
      const { data: promoData, error: promoError } = await supabase
        .from('promotions')
        .insert([{
          store_id: storeId,
          name: promoName,
          type: rec.promo_type,
          start_date: today,
          end_date: endDateStr,
          status: 'active',
          priority: 10,
          active_days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
          feature_enabled: true,
        }])
        .select('id')
        .single();

      if (promoError || !promoData) {
        showToast('Gagal membuat promo: ' + (promoError?.message || 'Unknown'), 'error');
        return;
      }

      const promoId = promoData.id;

      // Insert promo_rules based on type
      const ruleData: Record<string, number> = {
        discount_pct_1: 0, discount_pct_2: 0, discount_pct_3: 0, discount_pct_4: 0,
        discount_nom_1: 0, discount_nom_2: 0, discount_nom_3: 0, discount_nom_4: 0,
        min_qty: 0, free_qty: 0, min_purchase: 0, bundle_price: 0,
      };

      if (rec.promo_type === 'discount') {
        ruleData.discount_pct_1 = Number(rec.params.discount_pct ?? 0);
      } else if (rec.promo_type === 'bundle') {
        ruleData.bundle_price = Number(rec.params.bundle_price ?? 0);
        ruleData.min_qty = Number(rec.params.bundle_qty ?? 2);
      } else if (rec.promo_type === 'bxgy') {
        ruleData.min_qty = Number(rec.params.buy_qty ?? 3);
        ruleData.free_qty = Number(rec.params.free_qty ?? 1);
      } else if (rec.promo_type === 'min_purchase') {
        ruleData.min_purchase = Number(rec.params.min_purchase ?? 0);
        ruleData.discount_nom_1 = Number(rec.params.discount_nom ?? 0);
      } else if (rec.promo_type === 'flash_sale') {
        ruleData.discount_pct_1 = Number(rec.params.flash_discount_pct ?? 0);
      }

      await supabase.from('promo_rules').insert([{ promo_id: promoId, ...ruleData }]);

      // Insert promo_products
      const promoPrice = rec.promo_type === 'discount'
        ? rec.sell_price * (1 - Number(rec.params.discount_pct ?? 0) / 100)
        : rec.promo_type === 'flash_sale'
          ? rec.sell_price * (1 - Number(rec.params.flash_discount_pct ?? 0) / 100)
          : null;

      await supabase.from('promo_products').insert([{
        promo_id: promoId,
        store_product_id: rec.store_product_id,
        promo_price: promoPrice ? Math.round(promoPrice) : null,
        is_bundle_item: rec.promo_type === 'bundle',
      }]);

      // Update recommendation status + simpan promotion_id untuk link balik
      await supabase
        .from('promo_recommendations')
        .update({ status: 'approved', approved_at: new Date().toISOString(), promotion_id: promoId })
        .eq('id', rec.id);

      setRecs((prev) => prev.filter((r) => r.id !== rec.id));
      showToast(`Promo "${promoName}" berhasil dibuat dan diaktifkan`);
    } catch (err) {
      showToast('Terjadi kesalahan: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    }
  };

  const handleReject = async (id: string) => {
    await supabase
      .from('promo_recommendations')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', id);
    setRecs((prev) => prev.filter((r) => r.id !== id));
    showToast('Rekomendasi ditolak');
  };

  const handleRestore = async (id: string) => {
    await supabase
      .from('promo_recommendations')
      .update({ status: 'pending', rejected_at: null, approved_at: null, promotion_id: null })
      .eq('id', id);
    setHistory((prev) => prev.filter((r) => r.id !== id));
    await fetchRecs();
    showToast('Rekomendasi dikembalikan ke Pending');
  };

  const handleOpenPromoForm = (rec: PromoRecommendation) => {
    const q = new URLSearchParams({
      product_id: rec.store_product_id,
      product_name: rec.product_name,
      product_barcode: rec.product_barcode || '',
      hpp: String(rec.hpp),
      sell_price: String(rec.sell_price),
      promo_type: rec.promo_type,
      rec_id: rec.id,
    });
    router.push(`/toko/${storeId}/promo?${q.toString()}`);
  };

  const handleStartEdit = (rec: PromoRecommendation) => {
    if (!rec.params || Object.keys(rec.params).length === 0) {
      // Cancel edit
      setEditingId(null);
      setEditParams({});
      return;
    }
    setEditingId(rec.id);
    const numParams: Record<string, number> = {};
    Object.entries(rec.params).forEach(([k, v]) => {
      if (typeof v === 'number') numParams[k] = v;
    });
    setEditParams(numParams);
  };

  const handleEditParamChange = (key: string, value: number) => {
    setEditParams((prev) => {
      const updated = { ...prev, [key]: value };
      // Recalculate margin based on type
      return updated;
    });
  };

  const handleSaveEdit = async (rec: PromoRecommendation) => {
    // Recalculate margin before approving
    let marginPct = 0;
    if (rec.promo_type === 'discount') {
      const discPct = editParams.discount_pct ?? 0;
      const promoPrice = rec.sell_price * (1 - discPct / 100);
      marginPct = promoPrice > 0 ? (promoPrice - rec.hpp) / promoPrice * 100 : 0;
    } else if (rec.promo_type === 'bundle') {
      const bundleDiscPct = editParams.bundle_discount_pct ?? 12;
      const bundlePrice = rec.sell_price * 2 * (1 - bundleDiscPct / 100);
      marginPct = bundlePrice > 0 ? (bundlePrice - rec.hpp * 2) / bundlePrice * 100 : 0;
    } else if (rec.promo_type === 'bxgy') {
      const buyQty = editParams.buy_qty ?? 3;
      const freeQty = editParams.free_qty ?? 1;
      const profitPerSet = (buyQty * rec.sell_price) - ((buyQty + freeQty) * rec.hpp);
      marginPct = profitPerSet / (buyQty * rec.sell_price) * 100;
    } else if (rec.promo_type === 'flash_sale') {
      const flashDisc = editParams.flash_discount_pct ?? 10;
      const flashPrice = rec.sell_price * (1 - flashDisc / 100);
      marginPct = flashPrice > 0 ? (flashPrice - rec.hpp) / flashPrice * 100 : 0;
    }

    if (marginPct < 0) {
      showToast('Tidak dapat menyetujui — margin negatif', 'error');
      return;
    }

    // Merge edited params back
    const updatedRec = {
      ...rec,
      params: { ...rec.params, ...editParams },
    };
    setEditingId(null);
    setEditParams({});
    await handleApprove(updatedRec);
  };

  // Filter
  const filteredRecs = recs.filter((r) => {
    if (filterPriority && r.priority !== filterPriority) return false;
    if (filterType && r.promo_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.product_name.toLowerCase().includes(q) && !(r.product_barcode || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const urgentCount = recs.filter((r) => r.priority === 'urgent').length;
  const latestAnalyzedAt = recs.length > 0 ? recs[0].analyzed_at : null;

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-purple-600" />
            Rekomendasi Promo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {latestAnalyzedAt
              ? `Dianalisis: ${formatDate(latestAnalyzedAt)}`
              : 'Belum ada analisis — klik Refresh untuk memulai'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={analyzing}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
        >
          {analyzing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />
          }
          {analyzing ? 'Menganalisis...' : 'Refresh Analisis'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'pending' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Rekomendasi
          {recs.length > 0 && (
            <span className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${urgentCount > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
              {recs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'history' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Riwayat
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'pending' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="space-y-2">
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cari produk atau barcode..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-field pl-9 text-sm py-2 w-full"
                  />
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex gap-1">
                    {(['', 'urgent', 'suggested', 'optional'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setFilterPriority(p)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${filterPriority === p ? 'bg-purple-600 text-white border-purple-600' : 'text-gray-600 border-gray-300 hover:border-purple-400'}`}
                      >
                        {p === '' ? 'Semua' : PRIORITY_CONFIG[p as Priority].label}
                      </button>
                    ))}
                  </div>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as '' | PromoType)}
                    className="input-field w-auto text-sm py-1.5"
                  >
                    <option value="">Semua Tipe</option>
                    {(Object.entries(TYPE_LABELS) as [PromoType, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredRecs.length === 0 ? (
                <div className="text-center py-16 card space-y-2">
                  <Package className="w-12 h-12 text-gray-200 mx-auto" />
                  {recs.length === 0 ? (
                    emptyReason === 'no_sale_data' ? (
                      <>
                        <p className="text-gray-700 text-sm font-medium">Data penjualan belum tersedia</p>
                        <p className="text-gray-400 text-xs max-w-xs mx-auto">
                          Pastikan SyncAgent sudah berjalan dan telah melakukan sync minimal 1 kali.
                          Setelah sync selesai, klik &quot;Refresh Analisis&quot;.
                        </p>
                      </>
                    ) : emptyReason === 'all_normal' ? (
                      <>
                        <p className="text-gray-700 text-sm font-medium">Semua produk dalam kondisi normal</p>
                        <p className="text-gray-400 text-xs">Tidak ada produk yang butuh promo saat ini.</p>
                      </>
                    ) : (
                      <p className="text-gray-500 text-sm">
                        Belum ada rekomendasi. Klik &quot;Refresh Analisis&quot; untuk memulai.
                      </p>
                    )
                  ) : (
                    <p className="text-gray-500 text-sm">Tidak ada rekomendasi yang sesuai filter.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredRecs.map((rec) => (
                    <RecommendationCard
                      key={rec.id}
                      rec={rec}
                      editingId={editingId}
                      editParams={editParams}
                      discountInfo={discountMap[rec.store_product_id]}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleSaveEdit}
                      onEditParamChange={handleEditParamChange}
                      onOpenPromoForm={handleOpenPromoForm}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="card overflow-hidden p-0">
              {history.length === 0 ? (
                <div className="text-center py-16">
                  <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">Belum ada riwayat persetujuan/penolakan.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Tanggal</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Produk</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Tipe Promo</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Est. Profit</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {history.map((h) => (
                        <tr key={h.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                            {formatDate(h.approved_at || h.rejected_at || h.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800 truncate max-w-[160px]">{h.product_name}</p>
                            {h.product_barcode && (
                              <p className="text-xs text-gray-400">{h.product_barcode}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[h.promo_type]}`}>
                              {TYPE_LABELS[h.promo_type]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-700">
                            {formatRupiah(h.est_profit)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {h.status === 'approved' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <TrendingUp className="w-3 h-3" /> Disetujui
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                                <XCircle className="w-3 h-3" /> Ditolak
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleRestore(h.id)}
                              title={h.status === 'rejected' ? 'Kembalikan ke Pending' : 'Reset ke Pending'}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              {h.status === 'rejected' ? 'Kembalikan' : 'Reset'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

    </div>
  );
}
