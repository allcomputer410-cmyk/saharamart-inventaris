'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Palette,
  Plus,
  X,
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

interface StoreProductOption {
  id: string;
  barcode: string;
  name: string;
  hpp: number;
  sell_price: number;
  stock: { current_qty: number }[] | null;
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
  qty_sold: number;
  revenue: number;
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
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
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
          .from('v_sale_items_detail')
          .select('qty_sold, revenue')
          .eq('store_product_id', storeProductId)
          .gte('sale_date', before7Start.toISOString().split('T')[0])
          .lt('sale_date', tglDari.toISOString().split('T')[0]),
        supabase
          .from('v_sale_items_detail')
          .select('qty_sold, revenue')
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

  const sumQty = (r: SalesRow[]) => r.reduce((s, x) => s + x.qty_sold, 0);
  const sumRev = (r: SalesRow[]) => r.reduce((s, x) => s + x.revenue, 0);

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
  onCancelEdit,
  onSaveEdit,
  onEditParamChange,
  onOpenPromoForm,
  onMakePoster,
}: {
  rec: PromoRecommendation;
  editingId: string | null;
  editParams: Record<string, number>;
  discountInfo?: DiscountInfo;
  onApprove: (rec: PromoRecommendation) => void;
  onReject: (id: string) => void;
  onStartEdit: (rec: PromoRecommendation) => void;
  onCancelEdit: () => void;
  onSaveEdit: (rec: PromoRecommendation) => void;
  onEditParamChange: (key: string, value: number) => void;
  onOpenPromoForm: (rec: PromoRecommendation) => void;
  onMakePoster: (rec: PromoRecommendation) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const isEditing = editingId === rec.id;
  const pc = PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.optional;

  // Get margin pct for display
  const marginPct = isEditing
    ? (editParams.margin_promo_pct ?? editParams.margin_bundle_pct ?? editParams.margin_flash_pct ?? editParams.margin_efektif_pct ?? 0)
    : Number(rec.params.margin_promo_pct ?? rec.params.margin_bundle_pct ?? rec.params.margin_flash_pct ?? rec.params.margin_efektif_pct ?? 0);


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
              <p className="font-semibold text-green-700">{formatRupiah(isEditing ? (editParams.est_revenue ?? rec.est_revenue) : rec.est_revenue)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg px-2 py-1.5">
              <p className="text-blue-600">Est. Profit</p>
              <p className="font-semibold text-blue-700">{formatRupiah(isEditing ? (editParams.est_profit ?? rec.est_profit) : rec.est_profit)}</p>
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
              onClick={onCancelEdit}
              className="px-3 py-2 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Batal
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onApprove(rec)}
              disabled={marginPct < 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
              title={marginPct < 0 ? `Tidak bisa approve — margin negatif (${marginPct.toFixed(1)}%), toko akan rugi` : 'Klik untuk konfirmasi — promo akan langsung dibuat & aktif'}
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

      {/* Shortcut buttons */}
      <div className="border-t border-gray-100 pt-2 flex gap-1">
        <button
          onClick={() => onOpenPromoForm(rec)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Buat Promo
        </button>
        <button
          onClick={() => onMakePoster(rec)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors border border-purple-200"
        >
          <Palette className="w-3 h-3" />
          Buat Poster
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
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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
  // Konfirmasi approve — cegah salah klik
  const [approveConfirm, setApproveConfirm] = useState<PromoRecommendation | null>(null);
  // Konfirmasi restore approved — tampilkan info promo yang akan dihapus
  const [restoreConfirm, setRestoreConfirm] = useState<PromoRecommendation | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [discountMap, setDiscountMap] = useState<Record<string, DiscountInfo>>({});

  // State untuk tambah manual
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualSearchResults, setManualSearchResults] = useState<StoreProductOption[]>([]);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [manualFocused, setManualFocused] = useState(false);
  const [manualSelected, setManualSelected] = useState<StoreProductOption | null>(null);
  const [manualPromoType, setManualPromoType] = useState<PromoType>('discount');
  const [manualPriority, setManualPriority] = useState<Priority>('suggested');
  const [manualReason, setManualReason] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const manualSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualDuplicateWarning, setManualDuplicateWarning] = useState<string | null>(null);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [activePromoWarning, setActivePromoWarning] = useState<{ rec: PromoRecommendation; promoName: string } | null>(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const searchManualProducts = useCallback(async (query: string) => {
    setManualSearchLoading(true);
    let req = supabase
      .from('store_products')
      .select('id, barcode, name, hpp, sell_price, stock(current_qty)')
      .eq('store_id', storeId)
      .eq('is_deleted', false)
      .order('name')
      .limit(30);
    if (query.trim()) {
      req = req.or(`name.ilike.%${query.trim()}%,barcode.ilike.%${query.trim()}%`);
    }
    const { data } = await req;
    setManualSearchResults((data as StoreProductOption[]) || []);
    setManualSearchLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleManualSearchChange = (val: string) => {
    setManualSearch(val);
    if (manualSearchTimer.current) clearTimeout(manualSearchTimer.current);
    manualSearchTimer.current = setTimeout(() => searchManualProducts(val), 300);
  };

  const handleManualAdd = async () => {
    if (!manualSelected) return;
    const existing = recs.find(r => r.store_product_id === manualSelected.id);
    if (existing) {
      showToast(`"${manualSelected.name}" sudah ada di analisis promo`, 'error');
      return;
    }
    setManualSaving(true);
    try {
      await supabase.from('promo_recommendations').insert([{
        store_id: storeId,
        store_product_id: manualSelected.id,
        status: 'pending',
        priority: manualPriority,
        promo_type: manualPromoType,
        reason: manualReason.trim() || 'Ditambahkan manual oleh pengguna',
        product_name: manualSelected.name,
        product_barcode: manualSelected.barcode || '',
        hpp: manualSelected.hpp,
        sell_price: manualSelected.sell_price,
        current_stock: manualSelected.stock?.[0]?.current_qty ?? 0,
        days_no_sale: 0,
        params: {},
        est_revenue: 0,
        est_profit: 0,
        loss_if_no_promo: 0,
        analyzed_at: new Date().toISOString(),
      }]);
      setShowManualAdd(false);
      setManualSelected(null);
      setManualSearch('');
      setManualReason('');
      setManualPromoType('discount');
      setManualPriority('suggested');
      setManualDuplicateWarning(null);
      await fetchRecs();
      showToast('Produk berhasil ditambahkan ke rekomendasi promo');
    } catch (err) {
      showToast('Gagal menambahkan: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    } finally {
      setManualSaving(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    setCleaningDuplicates(true);
    try {
      // Kelompokkan per store_product_id, keep yang analyzed_at terbaru
      const grouped = new Map<string, PromoRecommendation[]>();
      for (const rec of recs) {
        if (!grouped.has(rec.store_product_id)) grouped.set(rec.store_product_id, []);
        grouped.get(rec.store_product_id)!.push(rec);
      }
      const toDelete: string[] = [];
      for (const group of Array.from(grouped.values())) {
        if (group.length > 1) {
          const sorted = [...group].sort(
            (a, b) => new Date(b.analyzed_at).getTime() - new Date(a.analyzed_at).getTime()
          );
          toDelete.push(...sorted.slice(1).map(r => r.id));
        }
      }
      if (toDelete.length === 0) {
        showToast('Tidak ada duplikat ditemukan');
        return;
      }
      const { error } = await supabase.from('promo_recommendations').delete().in('id', toDelete);
      if (error) throw error;
      await fetchRecs();
      showToast(`${toDelete.length} duplikat berhasil dihapus`);
    } catch (err) {
      showToast('Gagal membersihkan duplikat: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
    } finally {
      setCleaningDuplicates(false);
    }
  };

  const checkAndConfirmApprove = async (rec: PromoRecommendation) => {
    try {
      const { data: ppData } = await supabase
        .from('promo_products')
        .select('promo_id')
        .eq('store_product_id', rec.store_product_id);

      if (ppData && ppData.length > 0) {
        const promoIds = ppData.map((p: { promo_id: string }) => p.promo_id);
        const { data: activePromo } = await supabase
          .from('promotions')
          .select('id, name')
          .eq('store_id', storeId)
          .eq('status', 'active')
          .in('id', promoIds)
          .limit(1)
          .maybeSingle();

        if (activePromo) {
          setActivePromoWarning({ rec, promoName: activePromo.name });
          return;
        }
      }
      setApproveConfirm(rec);
    } catch {
      // silent — lanjut ke approve confirm biasa jika query gagal
      setApproveConfirm(rec);
    }
  };

  useEffect(() => { fetchRecs(); fetchDiscounts(); }, [fetchRecs, fetchDiscounts]);

  const handleRefresh = async (force = false) => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/promo-intelligence/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, force }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.skipped) {
          showToast('Analisis masih terkini — data belum berubah sejak 6 jam lalu');
        } else if (data.total_recommendations === 0) {
          setEmptyReason(data.no_sale_data ? 'no_sale_data' : 'all_normal');
          showToast('Analisis selesai — tidak ada rekomendasi baru');
        } else {
          setEmptyReason(null);
          showToast(`Analisis selesai: ${data.total_recommendations} rekomendasi`);
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
    // Safety net: hitung ulang margin dari params sebelum approve
    let finalMargin = 0;
    if (rec.promo_type === 'discount') {
      const promoPrice = rec.sell_price * (1 - Number(rec.params.discount_pct ?? 0) / 100);
      finalMargin = promoPrice > 0 ? (promoPrice - rec.hpp) / promoPrice * 100 : -100;
    } else if (rec.promo_type === 'bundle') {
      const bundlePrice = rec.sell_price * 2 * (1 - Number(rec.params.bundle_discount_pct ?? 12) / 100);
      finalMargin = bundlePrice > 0 ? (bundlePrice - rec.hpp * 2) / bundlePrice * 100 : -100;
    } else if (rec.promo_type === 'bxgy') {
      const buyQty = Number(rec.params.buy_qty ?? 3);
      const freeQty = Number(rec.params.free_qty ?? 1);
      const profitPerSet = (buyQty * rec.sell_price) - ((buyQty + freeQty) * rec.hpp);
      finalMargin = buyQty > 0 ? profitPerSet / (buyQty * rec.sell_price) * 100 : -100;
    } else if (rec.promo_type === 'flash_sale') {
      const flashPrice = rec.sell_price * (1 - Number(rec.params.flash_discount_pct ?? 0) / 100);
      finalMargin = flashPrice > 0 ? (flashPrice - rec.hpp) / flashPrice * 100 : -100;
    } else if (rec.promo_type === 'min_purchase') {
      const minPurchase = Number(rec.params.min_purchase ?? rec.sell_price);
      const discNom = Number(rec.params.discount_nom ?? 0);
      const netRevenue = minPurchase - discNom;
      finalMargin = netRevenue > 0 ? (netRevenue - rec.hpp) / netRevenue * 100 : -100;
    }
    if (finalMargin < 0) {
      showToast(`Tidak bisa approve — margin negatif (${finalMargin.toFixed(1)}%), promo price di bawah HPP`, 'error');
      return;
    }

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
        const bundleDiscPct = Number(rec.params.bundle_discount_pct ?? 12);
        const bundleQty = Number(rec.params.bundle_qty ?? 2);
        ruleData.bundle_price = Math.round(rec.sell_price * bundleQty * (1 - bundleDiscPct / 100));
        ruleData.min_qty = bundleQty;
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

  // Restore: reset rekomendasi ke pending. Jika sebelumnya approved + punya promotion_id → hapus promo yang auto-dibuat.
  const handleRestore = async (h: PromoRecommendation) => {
    setRestoring(true);
    try {
      if (h.status === 'approved' && h.promotion_id) {
        // Hapus promo yang dibuat otomatis saat approve
        await supabase.from('promotions').delete().eq('id', h.promotion_id);
      }
      await supabase
        .from('promo_recommendations')
        .update({ status: 'pending', rejected_at: null, approved_at: null, promotion_id: null })
        .eq('id', h.id);
      setHistory((prev) => prev.filter((r) => r.id !== h.id));
      await fetchRecs();
      showToast(
        h.status === 'approved' && h.promotion_id
          ? 'Promo dihapus & rekomendasi dikembalikan ke Pending'
          : 'Rekomendasi dikembalikan ke Pending'
      );
    } catch {
      showToast('Gagal mengembalikan rekomendasi', 'error');
    } finally {
      setRestoring(false);
      setRestoreConfirm(null);
    }
  };

  // Buat ulang promo dari data rekomendasi (untuk yang sudah approved tapi promonya terlanjur dihapus)
  const handleRebuild = async (h: PromoRecommendation) => {
    setRestoring(true);
    try {
      // Hapus promo lama jika masih ada
      if (h.promotion_id) {
        await supabase.from('promotions').delete().eq('id', h.promotion_id);
      }
      // Reset dulu ke pending agar handleApprove bisa dipakai ulang
      await supabase
        .from('promo_recommendations')
        .update({ status: 'pending', rejected_at: null, approved_at: null, promotion_id: null })
        .eq('id', h.id);
      setRestoreConfirm(null);
      setHistory((prev) => prev.filter((r) => r.id !== h.id));
      // Jalankan approve → buat promo baru
      await handleApprove({ ...h, status: 'pending', promotion_id: null });
    } catch {
      showToast('Gagal membuat ulang promo', 'error');
    } finally {
      setRestoring(false);
    }
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

  const handleMakePoster = (rec: PromoRecommendation) => {
    const discountPct: number = rec.promo_type === 'discount'
      ? Number(rec.params.discount_pct ?? 10)
      : rec.promo_type === 'bundle'
        ? Number(rec.params.bundle_discount_pct ?? 12)
        : rec.promo_type === 'flash_sale'
          ? Number(rec.params.flash_discount_pct ?? 10)
          : 0;
    const q = new URLSearchParams({
      product_name: rec.product_name,
      sell_price: String(rec.sell_price),
      promo_type: rec.promo_type,
      discount_pct: String(discountPct),
      stock: String(rec.current_stock ?? 0),
    });
    router.push(`/toko/${storeId}/desain-promo?${q.toString()}`);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditParams({});
  };

  const handleStartEdit = (rec: PromoRecommendation) => {
    setEditingId(rec.id);
    if (rec.params && Object.keys(rec.params).length > 0) {
      const numParams: Record<string, number> = {};
      Object.entries(rec.params).forEach(([k, v]) => {
        if (typeof v === 'number') numParams[k] = v;
      });
      setEditParams(numParams);
    } else {
      // Item manual — pakai default params sesuai tipe promo
      const defaults: Record<string, number> =
        rec.promo_type === 'discount'     ? { discount_pct: 10 } :
        rec.promo_type === 'bundle'       ? { bundle_discount_pct: 12, bundle_qty: 2 } :
        rec.promo_type === 'bxgy'         ? { buy_qty: 3, free_qty: 1 } :
        rec.promo_type === 'flash_sale'   ? { flash_discount_pct: 10, kuota_per_hari: 10 } :
        rec.promo_type === 'min_purchase' ? { min_purchase: rec.sell_price, discount_nom: 0 } :
        {};
      setEditParams(defaults);
    }
  };

  const handleEditParamChange = (key: string, value: number) => {
    setEditParams((prev) => {
      const updated = { ...prev, [key]: value };
      // Recalculate displayed margin in real-time
      const rec = recs.find(r => r.id === editingId);
      if (rec) {
        if (rec.promo_type === 'discount') {
          const discPct = key === 'discount_pct' ? value : (updated.discount_pct ?? 0);
          const promoPrice = rec.sell_price * (1 - discPct / 100);
          updated.margin_promo_pct = promoPrice > 0 ? (promoPrice - rec.hpp) / promoPrice * 100 : -100;
          updated.est_profit = Math.max(0, Math.round(rec.current_stock * Math.max(0, promoPrice - rec.hpp)));
          updated.est_revenue = Math.max(0, Math.round(rec.current_stock * promoPrice));
        } else if (rec.promo_type === 'bundle') {
          const bundleDiscPct = key === 'bundle_discount_pct' ? value : (updated.bundle_discount_pct ?? 12);
          const bundlePrice = rec.sell_price * 2 * (1 - bundleDiscPct / 100);
          const profitBundle = bundlePrice - rec.hpp * 2;
          updated.margin_bundle_pct = bundlePrice > 0 ? profitBundle / bundlePrice * 100 : -100;
          updated.est_profit = Math.max(0, Math.round((rec.current_stock / 2) * Math.max(0, profitBundle)));
          updated.est_revenue = Math.max(0, Math.round((rec.current_stock / 2) * bundlePrice));
        } else if (rec.promo_type === 'bxgy') {
          const buyQty  = key === 'buy_qty'  ? value : (updated.buy_qty  ?? 3);
          const freeQty = key === 'free_qty' ? value : (updated.free_qty ?? 1);
          const profitPerSet = (buyQty * rec.sell_price) - ((buyQty + freeQty) * rec.hpp);
          updated.margin_efektif_pct = buyQty > 0 ? profitPerSet / (buyQty * rec.sell_price) * 100 : -100;
          updated.est_profit = Math.max(0, Math.round((rec.current_stock / (buyQty + freeQty)) * Math.max(0, profitPerSet)));
          updated.est_revenue = Math.max(0, Math.round((rec.current_stock / (buyQty + freeQty)) * buyQty * rec.sell_price));
        } else if (rec.promo_type === 'flash_sale') {
          const flashDisc  = key === 'flash_discount_pct' ? value : (updated.flash_discount_pct ?? 10);
          const flashPrice = rec.sell_price * (1 - flashDisc / 100);
          const quota = key === 'kuota_per_hari' ? value : (updated.kuota_per_hari ?? Number(rec.params.kuota_per_hari ?? 1));
          updated.margin_flash_pct = flashPrice > 0 ? (flashPrice - rec.hpp) / flashPrice * 100 : -100;
          updated.est_profit = Math.max(0, Math.round(quota * 7 * Math.max(0, flashPrice - rec.hpp)));
          updated.est_revenue = Math.max(0, Math.round(quota * 7 * flashPrice));
        } else if (rec.promo_type === 'min_purchase') {
          const minPurchase = key === 'min_purchase' ? value : (updated.min_purchase ?? rec.sell_price);
          const discNom     = key === 'discount_nom'  ? value : (updated.discount_nom  ?? 0);
          const netRevenue  = minPurchase - discNom;
          updated.margin_efektif_pct = netRevenue > 0 ? (netRevenue - rec.hpp) / netRevenue * 100 : -100;
        }
      }
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
    } else if (rec.promo_type === 'min_purchase') {
      const minPurchase = editParams.min_purchase ?? rec.sell_price;
      const discNom = editParams.discount_nom ?? 0;
      const netRevenue = minPurchase - discNom;
      marginPct = netRevenue > 0 ? ((netRevenue - rec.hpp) / netRevenue) * 100 : -100;
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

  // Deteksi duplikat di state recs
  const seenProductIds = new Set<string>();
  let duplicateCount = 0;
  for (const rec of recs) {
    if (seenProductIds.has(rec.store_product_id)) duplicateCount++;
    seenProductIds.add(rec.store_product_id);
  }

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowManualAdd(true); searchManualProducts(''); }}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tambah Manual
          </button>
          <button
            onClick={handleCleanupDuplicates}
            disabled={cleaningDuplicates || duplicateCount === 0}
            title={duplicateCount === 0 ? 'Tidak ada duplikat' : `${duplicateCount} duplikat ditemukan`}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              duplicateCount > 0
                ? 'border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100'
                : 'border-gray-200 text-gray-300 cursor-not-allowed'
            }`}
          >
            {cleaningDuplicates
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <AlertTriangle className="w-4 h-4" />
            }
            {cleaningDuplicates ? 'Membersihkan...' : `Duplikat${duplicateCount > 0 ? ` (${duplicateCount})` : ''}`}
          </button>
          <button
            onClick={() => handleRefresh(false)}
            disabled={analyzing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {analyzing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />
            }
            {analyzing ? 'Menganalisis...' : 'Refresh'}
          </button>
          <button
            onClick={() => handleRefresh(true)}
            disabled={analyzing}
            className="flex items-center gap-2 px-3 py-2 border border-purple-300 text-purple-700 hover:bg-purple-50 text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            title="Paksa analisis ulang meskipun data belum lama"
          >
            <RefreshCw className="w-4 h-4" />
            Analisis Ulang
          </button>
        </div>
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
                      onApprove={(rec) => checkAndConfirmApprove(rec)}
                      onReject={handleReject}
                      onStartEdit={handleStartEdit}
                      onCancelEdit={handleCancelEdit}
                      onSaveEdit={handleSaveEdit}
                      onEditParamChange={handleEditParamChange}
                      onOpenPromoForm={handleOpenPromoForm}
                      onMakePoster={handleMakePoster}
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
                              onClick={() => h.status === 'approved' && h.promotion_id ? setRestoreConfirm(h) : handleRestore(h)}
                              title={h.status === 'approved' ? 'Batalkan promo & kembalikan ke Pending' : 'Kembalikan ke Pending'}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${
                                h.status === 'approved'
                                  ? 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100'
                                  : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              {h.status === 'approved' ? 'Batalkan' : 'Kembalikan'}
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

      {/* ── Modal Promo Aktif Warning ────────────────────────────────────────── */}
      {activePromoWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Produk Sudah Dipromosikan</h3>
                <p className="text-xs text-gray-500 mt-0.5">Terdapat promo aktif untuk produk ini</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm space-y-1">
              <p className="font-medium text-gray-800">{activePromoWarning.rec.product_name}</p>
              <p className="text-xs text-gray-500">
                Promo aktif: <span className="font-medium text-amber-700">{activePromoWarning.promoName}</span>
              </p>
            </div>
            <p className="text-xs text-gray-500">
              Produk ini sudah memiliki promo yang sedang berjalan. Tetap lanjutkan akan membuat promo baru di samping promo yang sudah ada.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setActivePromoWarning(null)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const rec = activePromoWarning.rec;
                  setActivePromoWarning(null);
                  setApproveConfirm(rec);
                }}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Tetap Setujui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Konfirmasi Setuju ───────────────────────────────────────────── */}
      {approveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Konfirmasi Buat Promo</h3>
                <p className="text-xs text-gray-500 mt-0.5">Promo akan langsung aktif setelah dikonfirmasi</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <p className="font-medium text-gray-800">{approveConfirm.product_name}</p>
              <p className="text-gray-500">
                Tipe: <span className="font-medium text-gray-700">{TYPE_LABELS[approveConfirm.promo_type]}</span>
              </p>
              <p className="text-gray-500">
                Est. Profit: <span className="font-medium text-green-700">{formatRupiah(approveConfirm.est_profit)}</span>
              </p>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠ Promo akan otomatis dibuat &amp; diaktifkan. Jika ingin membatalkan nanti, gunakan tombol <b>Batalkan</b> di tab Riwayat.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setApproveConfirm(null)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => { handleApprove(approveConfirm); setApproveConfirm(null); }}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Ya, Buat Promo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Tambah Manual ──────────────────────────────────────────────── */}
      {showManualAdd && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 py-8 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-purple-600" />
                Tambah Produk Manual ke Analisis
              </h3>
              <button onClick={() => setShowManualAdd(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                Untuk produk yang tidak terdeteksi analisis otomatis tapi ingin dipromosikan.
              </p>

              {/* Pilih Produk */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Produk *</label>
                {manualSelected ? (
                  <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{manualSelected.name}</p>
                      <p className="text-xs text-gray-500">{manualSelected.barcode} · Harga: {formatRupiah(manualSelected.sell_price)} · HPP: {formatRupiah(manualSelected.hpp)}</p>
                    </div>
                    <button onClick={() => { setManualSelected(null); setManualSearch(''); setManualDuplicateWarning(null); }} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={manualSearch}
                      onChange={(e) => handleManualSearchChange(e.target.value)}
                      onFocus={() => { setManualFocused(true); searchManualProducts(manualSearch); }}
                      onBlur={() => setTimeout(() => setManualFocused(false), 150)}
                      placeholder="Ketik nama atau barcode produk..."
                      className="input-field pl-9 text-sm"
                    />
                    {manualFocused && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-56 overflow-y-auto">
                        {manualSearchLoading ? (
                          <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin" /> Mencari...
                          </div>
                        ) : manualSearchResults.length === 0 ? (
                          <p className="px-3 py-3 text-sm text-gray-400">
                            {manualSearch ? 'Produk tidak ditemukan.' : 'Ketik untuk mencari produk...'}
                          </p>
                        ) : (
                          manualSearchResults.map((p) => {
                            const isDuplicate = recs.some(r => r.store_product_id === p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setManualSelected(p);
                                  setManualSearch('');
                                  setManualDuplicateWarning(isDuplicate ? p.name : null);
                                }}
                                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-800">{p.name}</p>
                                    <p className="text-xs text-gray-400">{p.barcode} · HPP: {formatRupiah(p.hpp)}</p>
                                  </div>
                                  {isDuplicate && (
                                    <span className="flex-shrink-0 text-xs font-medium px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                                      Sudah ada
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Warning duplikat */}
              {manualDuplicateWarning && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                  <span>
                    <strong>&ldquo;{manualDuplicateWarning}&rdquo;</strong> sudah ada di analisis promo.
                    Pilih produk lain atau tutup modal ini.
                  </span>
                </div>
              )}

              {/* Tipe Promo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Promo</label>
                <select
                  value={manualPromoType}
                  onChange={(e) => setManualPromoType(e.target.value as PromoType)}
                  className="input-field text-sm"
                >
                  {(Object.entries(TYPE_LABELS) as [PromoType, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Prioritas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Prioritas</label>
                <div className="flex gap-2">
                  {(['urgent', 'suggested', 'optional'] as Priority[]).map((p) => {
                    const cfg = PRIORITY_CONFIG[p];
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setManualPriority(p)}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${manualPriority === p ? `${cfg.color} font-bold` : 'text-gray-500 border-gray-300 hover:border-gray-400'}`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Alasan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alasan / Catatan</label>
                <textarea
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Contoh: Produk slow moving, ingin dorong penjualan sebelum expired..."
                  rows={2}
                  className="input-field text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setShowManualAdd(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleManualAdd}
                disabled={!manualSelected || manualSaving || !!manualDuplicateWarning}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {manualSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Tambahkan ke Analisis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Restore / Rebuild Promo (approved) ────────────────────────── */}
      {restoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Kelola Promo Ini</h3>
                <p className="text-xs text-gray-500 mt-0.5">Pilih tindakan untuk rekomendasi yang sudah disetujui</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <p className="font-medium text-gray-800">{restoreConfirm.product_name}</p>
              <p className="text-xs text-gray-500">
                {TYPE_LABELS[restoreConfirm.promo_type]} · Est. profit {formatRupiah(restoreConfirm.est_profit)}
              </p>
            </div>

            {/* Pilihan 1: Buat Ulang */}
            <div className="border border-green-200 rounded-xl p-3 space-y-1.5">
              <p className="text-sm font-semibold text-green-700 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" /> Buat Ulang Promo
              </p>
              <p className="text-xs text-gray-500">
                Promo lama dihapus (jika masih ada), lalu promo baru langsung dibuat &amp; diaktifkan dari data rekomendasi ini.
                Gunakan ini jika promonya terlanjur terhapus.
              </p>
              <button
                onClick={() => handleRebuild(restoreConfirm)}
                disabled={restoring}
                className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {restoring ? 'Memproses...' : 'Buat Ulang Promo'}
              </button>
            </div>

            {/* Pilihan 2: Reset ke Pending */}
            <div className="border border-amber-200 rounded-xl p-3 space-y-1.5">
              <p className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" /> Kembalikan ke Pending
              </p>
              <p className="text-xs text-gray-500">
                Promo yang terkait dihapus (jika masih ada). Rekomendasi kembali ke daftar Pending — bisa diedit &amp; disetujui ulang secara manual.
              </p>
              <button
                onClick={() => handleRestore(restoreConfirm)}
                disabled={restoring}
                className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {restoring ? 'Memproses...' : 'Kembalikan ke Pending'}
              </button>
            </div>

            <button
              onClick={() => setRestoreConfirm(null)}
              disabled={restoring}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
