'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah } from '@/lib/utils';
import {
  Printer, Search, AlertTriangle, TrendingUp, Tag, X,
  ChevronRight, Loader2, RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabelData {
  storeName: string;
  productName: string;
  barcode: string;
  price: number;
  colorBlue: string;
  colorRed: string;
}

interface SizePreset {
  key: 'small' | 'normal' | 'large' | 'xl';
  label: string;
  perPage: number;
  heightMm: number;
  rows: number;
}

interface PriceAlert {
  productId: string;
  name: string;
  barcode: string;
  currentHpp: number;
  latestPurchaseHarga: number;
  currentSellPrice: number;
  purchaseDate: string;
}

interface ProductOption {
  id: string;
  name: string;
  barcode: string;
  sell_price: number;
  hpp: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE_PRESETS: SizePreset[] = [
  { key: 'small',  label: 'Kecil',  perPage: 20, heightMm: 28,  rows: 10 },
  { key: 'normal', label: 'Normal', perPage: 14, heightMm: 41,  rows: 7  },
  { key: 'large',  label: 'Besar',  perPage: 8,  heightMm: 71,  rows: 4  },
  { key: 'xl',     label: 'XL',     perPage: 4,  heightMm: 143, rows: 2  },
];

const LABEL_W_MM = 98; // fixed 2 columns on A4

// ─── Barcode Generator ────────────────────────────────────────────────────────

function useBarcodeUrl(barcode: string): string {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!barcode || barcode.length !== 13) { setUrl(''); return; }
    let cancelled = false;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (cancelled) return;
      try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, barcode, {
          format: 'EAN13',
          lineColor: '#000000',
          width: 2,
          height: 50,
          displayValue: false,
          margin: 0,
        });
        const svgStr = new XMLSerializer().serializeToString(svg);
        setUrl(`data:image/svg+xml;base64,${btoa(svgStr)}`);
      } catch {
        setUrl('');
      }
    });
    return () => { cancelled = true; };
  }, [barcode]);

  return url;
}

// ─── Single Label Component ───────────────────────────────────────────────────

function PriceLabel({
  data,
  scale = 1,
  barcodeUrl,
}: {
  data: LabelData;
  scale?: number;
  barcodeUrl: string;
}) {
  const hasBarcode = barcodeUrl && data.barcode.length === 13;
  const priceStr = data.price > 0
    ? formatRupiah(data.price).replace('Rp', '').trim()
    : '0';

  // Base dimensions at scale=1 match "Normal" (98mm × 41mm at 96dpi ≈ 370×155px)
  const baseW = 370;
  const baseH = 155;
  const w = baseW * scale;
  const h = baseH * scale;
  const fs = scale; // font scale factor

  return (
    <div
      className="label-item"
      style={{
        width: w, height: h, minWidth: w, minHeight: h,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Arial, sans-serif',
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
        boxSizing: 'border-box',
        backgroundColor: '#fff',
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
      }}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', height: `${h * 0.25}px`, flexShrink: 0 }}>
        {/* Store name – blue */}
        <div style={{
          backgroundColor: data.colorBlue,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '44%',
          fontWeight: 900,
          fontSize: `${11 * fs}px`,
          padding: '0 4px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          textAlign: 'center',
          lineHeight: 1.1,
        }}>
          {data.storeName || 'TOKO'}
        </div>
        {/* Accent stripes */}
        <div style={{ display: 'flex', width: `${9 * scale}px`, flexShrink: 0 }}>
          <div style={{ flex: 1, backgroundColor: '#FFD700' }} />
          <div style={{ flex: 1, backgroundColor: data.colorRed }} />
        </div>
        {/* Product name – red */}
        <div style={{
          backgroundColor: data.colorRed,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          fontWeight: 700,
          fontSize: `${10 * fs}px`,
          padding: '0 4px',
          textAlign: 'center',
          lineHeight: 1.2,
          wordBreak: 'break-word',
          overflow: 'hidden',
        }}>
          {data.productName || 'NAMA PRODUK'}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        backgroundColor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${4 * scale}px ${6 * scale}px`,
        gap: `${3 * scale}px`,
      }}>
        {/* Barcode */}
        {hasBarcode && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={barcodeUrl}
              alt="barcode"
              style={{ height: `${40 * scale}px`, display: 'block' }}
            />
            <span style={{
              fontFamily: 'Courier New, monospace',
              fontSize: `${8 * fs}px`,
              letterSpacing: '0.12em',
              color: '#333',
              marginTop: `${1 * scale}px`,
            }}>
              {data.barcode}
            </span>
          </div>
        )}

        {/* Price + arrow */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: `${6 * scale}px`,
          width: '100%',
          justifyContent: 'center',
        }}>
          {/* Price box */}
          <div style={{
            position: 'relative',
            border: `${2 * scale}px solid ${data.colorBlue}`,
            borderRadius: `${4 * scale}px`,
            padding: `${3 * scale}px ${10 * scale}px`,
            display: 'flex',
            alignItems: 'baseline',
            gap: `${2 * scale}px`,
            overflow: 'hidden',
            minWidth: `${120 * scale}px`,
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: `${9 * fs}px`, color: '#777', fontWeight: 500 }}>Rp.</span>
            <span style={{
              fontSize: `${20 * fs}px`,
              fontWeight: 900,
              color: '#1a1a1a',
              letterSpacing: '-0.02em',
            }}>
              {priceStr}
            </span>
            {/* Red corner triangle */}
            <div style={{
              position: 'absolute',
              bottom: 0, right: 0,
              width: 0, height: 0,
              borderStyle: 'solid',
              borderWidth: `0 0 ${14 * scale}px ${14 * scale}px`,
              borderColor: `transparent transparent ${data.colorRed} transparent`,
            }} />
          </div>

          {/* Arrow + HARGA */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <span style={{
              color: data.colorRed,
              fontSize: `${18 * fs}px`,
              lineHeight: 1,
              fontWeight: 900,
            }}>↑</span>
            <span style={{
              color: data.colorRed,
              fontSize: `${7 * fs}px`,
              fontWeight: 900,
              letterSpacing: '0.08em',
            }}>HARGA</span>
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div style={{ height: `${5 * scale}px`, display: 'flex', flexShrink: 0 }}>
        <div style={{ flex: 1, backgroundColor: data.colorBlue }} />
        <div style={{ width: '18%', backgroundColor: '#FFD700' }} />
        <div style={{ width: '10%', backgroundColor: data.colorRed }} />
      </div>
    </div>
  );
}

// ─── Print CSS ────────────────────────────────────────────────────────────────

const PRINT_CSS = (heightMm: number) => `
@media print {
  * { visibility: hidden !important; box-sizing: border-box; }
  #print-area, #print-area * { visibility: visible !important; }
  #print-area {
    position: fixed !important;
    inset: 0;
    width: 210mm;
    padding: 5mm;
  }
  .print-grid {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
    gap: 2mm;
    width: 100%;
  }
  .label-print {
    width: ${LABEL_W_MM}mm !important;
    height: ${heightMm}mm !important;
    min-height: ${heightMm}mm !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    border: 1px solid #e5e7eb !important;
  }
  .label-print .lbl-header { height: 25% !important; display: flex !important; }
  .label-print .lbl-body { flex: 1 !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; padding: 2mm 3mm !important; }
  .label-print .lbl-footer { height: 5px !important; display: flex !important; }
  .label-print img { max-height: 60% !important; width: auto !important; }
  @page { size: A4 portrait; margin: 0; }
}
`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CetakLabelPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // ── Meta ──────────────────────────────────────────────────────────────────
  const [storeName, setStoreName] = useState('');

  // ── Label Form ────────────────────────────────────────────────────────────
  const [productName, setProductName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [priceInput, setPriceInput] = useState('');
  const [colorBlue, setColorBlue] = useState('#009fe3');
  const [colorRed, setColorRed] = useState('#e8001c');
  const [sizePreset, setSizePreset] = useState<SizePreset>(SIZE_PRESETS[1]); // Normal
  const [customScale, setCustomScale] = useState(100);
  const [qty, setQty] = useState(14);

  // ── Product search ────────────────────────────────────────────────────────
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);

  // ── Price alerts (Fitur 4) ────────────────────────────────────────────────
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // ─── Derived ──────────────────────────────────────────────────────────────
  const labelData: LabelData = {
    storeName,
    productName,
    barcode,
    price,
    colorBlue,
    colorRed,
  };
  const barcodeUrl = useBarcodeUrl(barcode);
  const previewScale = customScale / 100;
  const activeSizePreset = sizePreset;

  // ─── Load store name ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!storeId) return;
    supabase.from('stores').select('name').eq('id', storeId).single()
      .then(({ data }) => { if (data?.name) setStoreName(data.name.toUpperCase()); });
  }, [storeId, supabase]);

  // ─── Prefill from URL query (from alert "Buat Label" button) ─────────────
  useEffect(() => {
    const pName = searchParams.get('nama');
    const pBarcode = searchParams.get('barcode');
    const pPrice = searchParams.get('harga');
    if (pName) setProductName(pName);
    if (pBarcode) setBarcode(pBarcode);
    if (pPrice) {
      const v = parseInt(pPrice, 10);
      if (!isNaN(v)) { setPrice(v); setPriceInput(v.toLocaleString('id-ID')); }
    }
  }, [searchParams]);

  // ─── Load price alerts ────────────────────────────────────────────────────
  const loadPriceAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      // Get store products with hpp > 0
      const { data: products } = await supabase
        .from('store_products')
        .select('id, name, barcode, sell_price, hpp')
        .eq('store_id', storeId)
        .gt('hpp', 0)
        .limit(500);

      if (!products || products.length === 0) { setAlertsLoading(false); return; }

      const productIds = products.map((p: ProductOption) => p.id);

      // Get latest purchase per product (last 60 days)
      const since = new Date();
      since.setDate(since.getDate() - 60);

      const { data: purchaseItems } = await supabase
        .from('purchase_items')
        .select('store_product_id, harga, purchases!inner(tanggal, store_id)')
        .eq('purchases.store_id', storeId)
        .gte('purchases.tanggal', since.toISOString())
        .in('store_product_id', productIds)
        .order('purchases(tanggal)', { ascending: false });

      if (!purchaseItems || purchaseItems.length === 0) { setAlertsLoading(false); return; }

      // Group by product_id: keep only the latest purchase
      const latestByProduct = new Map<string, { harga: number; tanggal: string }>();
      for (const pi of purchaseItems as Array<{ store_product_id: string; harga: number; purchases: { tanggal: string } | { tanggal: string }[] }>) {
        const pid = pi.store_product_id;
        if (!pid) continue;
        const purchases = Array.isArray(pi.purchases) ? pi.purchases[0] : pi.purchases;
        if (!latestByProduct.has(pid)) {
          latestByProduct.set(pid, { harga: pi.harga, tanggal: purchases?.tanggal || '' });
        }
      }

      // Compare with current hpp
      const alerts: PriceAlert[] = [];
      for (const p of products as ProductOption[]) {
        const latest = latestByProduct.get(p.id);
        if (!latest) continue;
        // Price went up if latest purchase harga > current hpp by more than 0.5%
        if (latest.harga > p.hpp * 1.005 && latest.harga > p.hpp) {
          alerts.push({
            productId: p.id,
            name: p.name,
            barcode: p.barcode || '',
            currentHpp: p.hpp,
            latestPurchaseHarga: latest.harga,
            currentSellPrice: p.sell_price,
            purchaseDate: latest.tanggal,
          });
        }
      }

      // Sort by price increase % descending, top 10
      alerts.sort((a, b) =>
        (b.latestPurchaseHarga - b.currentHpp) / b.currentHpp -
        (a.latestPurchaseHarga - a.currentHpp) / a.currentHpp
      );
      setPriceAlerts(alerts.slice(0, 10));
    } catch {
      // silently fail
    } finally {
      setAlertsLoading(false);
    }
  }, [storeId, supabase]);

  useEffect(() => { loadPriceAlerts(); }, [loadPriceAlerts]);

  // ─── Product search ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQ || searchQ.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('store_products')
        .select('id, name, barcode, sell_price, hpp')
        .eq('store_id', storeId)
        .ilike('name', `%${searchQ}%`)
        .limit(8);
      setSearchResults((data as ProductOption[]) || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, storeId, supabase]);

  function selectProduct(p: ProductOption) {
    setProductName(p.name);
    setBarcode(p.barcode || '');
    setPrice(p.sell_price);
    setPriceInput(p.sell_price.toLocaleString('id-ID'));
    setSearchQ('');
    setSearchResults([]);
  }

  function fillFromAlert(alert: PriceAlert) {
    setProductName(alert.name);
    setBarcode(alert.barcode);
    // Suggest new sell price: scale by same ratio as hpp increase
    const ratio = alert.latestPurchaseHarga / alert.currentHpp;
    const suggestedPrice = Math.ceil((alert.currentSellPrice * ratio) / 100) * 100;
    setPrice(suggestedPrice);
    setPriceInput(suggestedPrice.toLocaleString('id-ID'));
  }

  function handlePriceInput(v: string) {
    const cleaned = v.replace(/\D/g, '');
    setPriceInput(cleaned ? parseInt(cleaned, 10).toLocaleString('id-ID') : '');
    setPrice(cleaned ? parseInt(cleaned, 10) : 0);
  }

  function handleSizePreset(preset: SizePreset) {
    setSizePreset(preset);
    // Map preset to scale
    const scaleMap: Record<string, number> = {
      small: 68, normal: 100, large: 173, xl: 349,
    };
    setCustomScale(scaleMap[preset.key]);
    setQty(preset.perPage);
  }

  function handleSliderChange(v: number) {
    setCustomScale(v);
    // Find closest preset
    const closest = SIZE_PRESETS.reduce((best, p) => {
      const scaleMap: Record<string, number> = { small: 68, normal: 100, large: 173, xl: 349 };
      return Math.abs(scaleMap[p.key] - v) < Math.abs(scaleMap[best.key] - v) ? p : best;
    });
    setSizePreset(closest);
    setQty(closest.perPage);
  }

  function handlePrint() {
    window.print();
  }

  const visibleAlerts = priceAlerts.filter(a => !dismissedAlerts.has(a.productId));

  return (
    <>
      <style>{PRINT_CSS(activeSizePreset.heightMm)}</style>

      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Tag className="w-6 h-6 text-blue-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cetak Label Harga</h1>
            <p className="text-sm text-gray-500">Desain & cetak label harga produk dengan barcode EAN-13</p>
          </div>
        </div>

        {/* ── Fitur 4: Notifikasi Harga Naik ──────────────────────────────── */}
        {(visibleAlerts.length > 0 || alertsLoading) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-amber-600 shrink-0" />
              <h2 className="font-semibold text-amber-800">
                Harga Pembelian Naik — Perlu Cetak Label Baru
              </h2>
              {alertsLoading && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
              <button
                onClick={loadPriceAlerts}
                className="ml-auto p-1 rounded hover:bg-amber-100"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
              </button>
            </div>

            {!alertsLoading && visibleAlerts.length === 0 && (
              <p className="text-sm text-amber-600">Semua harga sudah sinkron.</p>
            )}

            <div className="space-y-2">
              {visibleAlerts.map((alert) => {
                const pctUp = (((alert.latestPurchaseHarga - alert.currentHpp) / alert.currentHpp) * 100).toFixed(1);
                return (
                  <div
                    key={alert.productId}
              className="flex items-center gap-3 bg-white rounded-lg border border-amber-200 px-3 py-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{alert.name}</p>
                      <p className="text-xs text-gray-500">
                        HPP: <span className="line-through">{formatRupiah(alert.currentHpp)}</span>
                        {' → '}
                        <span className="text-red-600 font-semibold">{formatRupiah(alert.latestPurchaseHarga)}</span>
                        <span className="ml-1 text-red-500">(+{pctUp}%)</span>
                        {' · Jual saat ini: '}
                        <span className="font-medium">{formatRupiah(alert.currentSellPrice)}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => fillFromAlert(alert)}
                      className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
                    >
                      <Printer className="w-3 h-3" />
                      Buat Label
                    </button>
                    <button
                      onClick={() => setDismissedAlerts(prev => { const s = new Set(Array.from(prev)); s.add(alert.productId); return s; })}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left: Form ──────────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* Product search */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <h3 className="font-semibold text-gray-800 text-sm">Cari Produk</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Ketik nama produk..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
                {searchResults.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {searchResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => selectProduct(p)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b last:border-0 border-gray-100"
                      >
                        <p className="text-sm font-medium text-gray-800">{p.name}</p>
                        <p className="text-xs text-gray-500">
                          {p.barcode || '—'} · {formatRupiah(p.sell_price)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Label data inputs */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">Data Label</h3>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nama Produk</label>
                <input
                  type="text"
                  value={productName}
                  onChange={e => setProductName(e.target.value.toUpperCase())}
                  placeholder="NAMA PRODUK"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Barcode EAN-13 <span className="text-gray-400">(opsional, tepat 13 digit)</span>
                </label>
                <input
                  type="text"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value.replace(/\D/g, '').slice(0, 13))}
                  placeholder="0000000000000"
                  maxLength={13}
                  className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    barcode && barcode.length !== 13 ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  }`}
                />
                {barcode && barcode.length !== 13 && (
                  <p className="text-xs text-red-500 mt-1">{barcode.length}/13 digit — barcode disembunyikan sampai 13 digit</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Harga Jual (Rp)</label>
                <input
                  type="text"
                  value={priceInput}
                  onChange={e => handlePriceInput(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Jumlah Label Cetak</label>
                <input
                  type="number"
                  value={qty}
                  min={1}
                  max={200}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Color pickers */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">Warna</h3>
              <div className="flex gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Warna Utama (Biru)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colorBlue}
                      onChange={e => setColorBlue(e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border border-gray-200"
                    />
                    <span className="text-xs font-mono text-gray-500">{colorBlue}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Warna Aksen (Merah)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colorRed}
                      onChange={e => setColorRed(e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border border-gray-200"
                    />
                    <span className="text-xs font-mono text-gray-500">{colorRed}</span>
                  </div>
                </div>
                <button
                  onClick={() => { setColorBlue('#009fe3'); setColorRed('#e8001c'); }}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline self-end mb-1"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Size presets + slider (Fitur 5) */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">Ukuran Label</h3>
              <div className="grid grid-cols-4 gap-2">
                {SIZE_PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => handleSizePreset(p)}
                    className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      sizePreset.key === p.key
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p.label}
                    <br />
                    <span className="font-normal opacity-80">{p.perPage}/hal</span>
                  </button>
                ))}
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Ukuran Manual</span>
                  <span className="font-medium text-gray-700">{customScale}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={400}
                  value={customScale}
                  onChange={e => handleSliderChange(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>50%</span>
                  <span>200%</span>
                  <span>400%</span>
                </div>
              </div>
            </div>

            {/* Print button */}
            <button
              onClick={handlePrint}
              disabled={!productName || price === 0}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
            >
              <Printer className="w-5 h-5" />
              Cetak {qty} Label ({activeSizePreset.label}, {activeSizePreset.perPage}/halaman)
            </button>
          </div>

          {/* ── Right: Preview ───────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">Preview Label</h3>
              <div
                className="overflow-auto"
                style={{ maxHeight: '500px' }}
              >
                <div style={{ display: 'inline-block' }}>
                  <PriceLabel
                    data={labelData}
                    scale={previewScale}
                    barcodeUrl={barcodeUrl}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Ukuran cetak: {LABEL_W_MM}mm × {activeSizePreset.heightMm}mm
                · {activeSizePreset.perPage} label per halaman A4
              </p>
            </div>

            {/* Grid preview mini */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />
                Layout A4 ({activeSizePreset.perPage} label / halaman)
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '2px',
                  width: '180px',
                  margin: '0 auto',
                }}
              >
                {Array.from({ length: Math.min(activeSizePreset.perPage, 20) }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: `${Math.round(120 / activeSizePreset.rows)}px`,
                      backgroundColor: i === 0 ? '#009fe3' : '#e5e7eb',
                      borderRadius: '2px',
                      opacity: i === 0 ? 0.8 : 0.5,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Print Area (hidden on screen, visible only when printing) ─────── */}
      <div id="print-area" style={{ display: 'none' }}>
        <div className="print-grid">
          {Array.from({ length: qty }).map((_, i) => (
            <div key={i} className="label-print" style={{ fontFamily: 'Arial, sans-serif' }}>
              {/* Header */}
              <div className="lbl-header">
                <div style={{
                  backgroundColor: colorBlue, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '44%', fontWeight: 900, fontSize: '10px',
                  padding: '0 3px', letterSpacing: '0.05em', textTransform: 'uppercase',
                  textAlign: 'center', lineHeight: 1.1,
                }}>
                  {storeName || 'TOKO'}
                </div>
                <div style={{ display: 'flex', width: '8px', flexShrink: 0 }}>
                  <div style={{ flex: 1, backgroundColor: '#FFD700' }} />
                  <div style={{ flex: 1, backgroundColor: colorRed }} />
                </div>
                <div style={{
                  backgroundColor: colorRed, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flex: 1, fontWeight: 700, fontSize: '9px',
                  padding: '0 3px', textAlign: 'center', lineHeight: 1.2,
                  wordBreak: 'break-word', overflow: 'hidden',
                }}>
                  {productName || 'NAMA PRODUK'}
                </div>
              </div>

              {/* Body */}
              <div className="lbl-body" style={{ backgroundColor: '#fff', gap: '2px' }}>
                {barcodeUrl && barcode.length === 13 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={barcodeUrl} alt="barcode" style={{ maxHeight: '45%', width: 'auto' }} />
                    <span style={{ fontFamily: 'Courier New, monospace', fontSize: '7px', letterSpacing: '0.1em' }}>
                      {barcode}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                  <div style={{
                    position: 'relative',
                    border: `1.5px solid ${colorBlue}`,
                    borderRadius: '3px',
                    padding: '2px 8px',
                    display: 'flex', alignItems: 'baseline', gap: '2px',
                    overflow: 'hidden', minWidth: '80px', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: '8px', color: '#777' }}>Rp.</span>
                    <span style={{ fontSize: '16px', fontWeight: 900, color: '#1a1a1a', letterSpacing: '-0.02em' }}>
                      {price > 0 ? formatRupiah(price).replace('Rp', '').trim() : '0'}
                    </span>
                    <div style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 0, height: 0, borderStyle: 'solid',
                      borderWidth: '0 0 10px 10px',
                      borderColor: `transparent transparent ${colorRed} transparent`,
                    }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                    <span style={{ color: colorRed, fontSize: '14px', lineHeight: 1, fontWeight: 900 }}>↑</span>
                    <span style={{ color: colorRed, fontSize: '6px', fontWeight: 900, letterSpacing: '0.08em' }}>HARGA</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="lbl-footer">
                <div style={{ flex: 1, backgroundColor: colorBlue }} />
                <div style={{ width: '18%', backgroundColor: '#FFD700' }} />
                <div style={{ width: '10%', backgroundColor: colorRed }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
