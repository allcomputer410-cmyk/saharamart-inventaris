'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah } from '@/lib/utils';
import {
  Printer, Search, AlertTriangle, TrendingUp, Tag, X,
  ChevronRight, Loader2, RefreshCw, LayoutTemplate, Eye, EyeOff,
  SlidersHorizontal, ChevronDown, ChevronUp, Plus, Trash2, Save, FolderOpen,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabelItem {
  id: string;
  productName: string;
  barcode: string;
  price: number;
  qty: number;
  isPromo?: boolean;
  originalPrice?: number;
  promoEndDate?: string;
}

interface LabelData {
  storeName: string;
  productName: string;
  barcode: string;
  price: number;
  colorBlue: string;
  colorRed: string;
  isPromo?: boolean;
  originalPrice?: number;
  promoEndDate?: string;
  promoColorPrice?: string;
  promoFontScale?: number;
}

interface ActivePromoInfo {
  promoPrice: number;
  promoName: string;
  endDate?: string;
}

interface LabelLayout {
  showStoreName: boolean;
  showProductName: boolean;
  showBarcode: boolean;
  showPrice: boolean;
  showArrow: boolean;
  showCornerTriangle: boolean;
  showFooter: boolean;
  showRpPrefix: boolean;
  storeNameWidthPct: number;
  headerHeightPct: number;
  fontStoreName: number;
  fontProductName: number;
  fontPrice: number;
  barcodePosition: 'above' | 'below';
  promoPriceLayout: 'stacked' | 'side-by-side';
  autoFitProductName: boolean;
  promoBadgeText: string;
  fontOriginalPrice: number;
  fontPromoDate: number;
}

interface SizePreset {
  key: 'small' | 'normal' | 'compact3' | 'large' | 'xl';
  label: string;
  perPage: number;
  heightMm: number;
  widthMm: number;
  rows: number;
  cols: number;
}

interface DesignTemplate {
  id: string;
  name: string;
  colorBlue: string;
  colorRed: string;
  promoColorPrice: string;
  promoFontScale: number;
  layout: LabelLayout;
  sizePresetKey: SizePreset['key'];
  labelStoreNameOverride: string;
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
  { key: 'small',    label: 'Kecil',  perPage: 20, heightMm: 28,  widthMm: 98, rows: 10, cols: 2 },
  { key: 'normal',   label: 'Normal', perPage: 14, heightMm: 41,  widthMm: 98, rows: 7,  cols: 2 },
  { key: 'compact3', label: '3×7',    perPage: 21, heightMm: 39,  widthMm: 65, rows: 7,  cols: 3 },
  { key: 'large',    label: 'Besar',  perPage: 8,  heightMm: 71,  widthMm: 98, rows: 4,  cols: 2 },
  { key: 'xl',       label: 'XL',     perPage: 4,  heightMm: 143, widthMm: 98, rows: 2,  cols: 2 },
];

const SCALE_MAP: Record<string, number> = { small: 68, normal: 100, compact3: 67, large: 173, xl: 349 };

const DEFAULT_LAYOUT: LabelLayout = {
  showStoreName: true,
  showProductName: true,
  showBarcode: true,
  showPrice: true,
  showArrow: true,
  showCornerTriangle: true,
  showFooter: true,
  showRpPrefix: true,
  storeNameWidthPct: 44,
  headerHeightPct: 25,
  fontStoreName: 1,
  fontProductName: 1,
  fontPrice: 1,
  barcodePosition: 'above',
  promoPriceLayout: 'side-by-side',
  autoFitProductName: false,
  promoBadgeText: 'PROMO',
  fontOriginalPrice: 1,
  fontPromoDate: 1,
};

const LAYOUT_PRESETS: { key: string; label: string; desc: string; layout: Partial<LabelLayout> }[] = [
  { key: 'standard',     label: 'Standard',     desc: 'Default lengkap',           layout: { ...DEFAULT_LAYOUT } },
  { key: 'harga-besar',  label: 'Harga Besar',  desc: 'Fokus harga, tanpa barcode', layout: { showBarcode: false, showArrow: false, showCornerTriangle: false, fontPrice: 1.6, fontStoreName: 1.2, fontProductName: 1.2, headerHeightPct: 28 } },
  { key: 'kompak',       label: 'Kompak',        desc: 'Tanpa footer, font kecil',   layout: { showFooter: false, showArrow: false, fontStoreName: 0.85, fontProductName: 0.85, fontPrice: 0.85, headerHeightPct: 22 } },
  { key: 'barcode-utama', label: 'Barcode',      desc: 'Barcode besar, harga kecil', layout: { showArrow: false, showCornerTriangle: false, fontPrice: 0.8, fontStoreName: 0.85, fontProductName: 0.85, headerHeightPct: 20, barcodePosition: 'above' } },
];

const TEMPLATES_KEY = 'cetaklabel_templates_v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPromoDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch { return dateStr; }
}

function _autoFitFontScale(name: string, base: number, enabled: boolean): number {
  if (!enabled) return base;
  const len = name.length;
  if (len <= 14) return base;
  if (len <= 18) return base * 0.88;
  if (len <= 22) return base * 0.76;
  if (len <= 28) return base * 0.65;
  return base * 0.55;
}

// ─── Barcode Hook ─────────────────────────────────────────────────────────────

const barcodeCache = new Map<string, string>();

function generateBarcodeUrl(barcode: string): Promise<string> {
  return import('jsbarcode').then(({ default: JsBarcode }) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, barcode, { format: 'EAN13', lineColor: '#000000', width: 2, height: 50, displayValue: false, margin: 0 });
    const s = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
  }).catch(() => '');
}

function useBarcodeMap(items: LabelItem[]): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  const barcodesKey = Array.from(new Set(items.map(i => i.barcode).filter(b => /^\d{13}$/.test(b)))).sort().join(',');

  useEffect(() => {
    if (!barcodesKey) { setMap(new Map()); return; }
    let cancelled = false;
    const barcodes = barcodesKey.split(',');
    Promise.all(barcodes.map(async (b): Promise<[string, string]> => {
      if (barcodeCache.has(b)) return [b, barcodeCache.get(b)!];
      const url = await generateBarcodeUrl(b);
      if (url) barcodeCache.set(b, url);
      return [b, url];
    })).then((entries) => { if (!cancelled) setMap(new Map(entries)); });
    return () => { cancelled = true; };
  }, [barcodesKey]);

  return map;
}

// ─── FitText: auto-shrink product name ───────────────────────────────────────

// Canvas-based measurement for print labels (works without DOM layout)
const MM_TO_PX = 3.78;
const PT_TO_PX  = 96 / 72;

function fitPrintFontPt(text: string, basePt: number, minPt: number, containerMm: number): { fontSizePt: number; wrap: boolean } {
  if (typeof document === 'undefined' || containerMm <= 0) return { fontSizePt: basePt, wrap: false };
  const containerPx = Math.max(0, containerMm * MM_TO_PX - 4);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { fontSizePt: basePt, wrap: false };
  let sizePt = basePt;
  ctx.font = `700 ${sizePt * PT_TO_PX}px Arial, sans-serif`;
  while (ctx.measureText(text).width > containerPx && sizePt > minPt) {
    sizePt = Math.max(minPt, sizePt - 0.25);
    ctx.font = `700 ${sizePt * PT_TO_PX}px Arial, sans-serif`;
  }
  return { fontSizePt: sizePt, wrap: ctx.measureText(text).width > containerPx };
}

// React component for live preview — uses canvas + useLayoutEffect + ResizeObserver
function FitText({ text, maxFontPx, minFontPx, containerStyle, color, fontWeight = 700 }: {
  text: string; maxFontPx: number; minFontPx: number;
  containerStyle?: React.CSSProperties; color?: string; fontWeight?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(maxFontPx);
  const [doWrap, setDoWrap]     = useState(false);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const availW = el.clientWidth - 8;
    if (availW <= 0) return; // still hidden — ResizeObserver will retry when visible
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let size = maxFontPx;
    ctx.font = `${fontWeight} ${size}px Arial, sans-serif`;
    while (ctx.measureText(text).width > availW && size > minFontPx) {
      size = Math.max(minFontPx, size - 0.5);
      ctx.font = `${fontWeight} ${size}px Arial, sans-serif`;
    }
    setFontSize(size);
    setDoWrap(ctx.measureText(text).width > availW);
  }, [text, maxFontPx, minFontPx, fontWeight]);

  useLayoutEffect(() => { measure(); }, [measure]);

  // Re-measure when element becomes visible (e.g. print-area display:none → block)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { measure(); });
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, [measure]);

  return (
    <div ref={containerRef} style={{ ...containerStyle, overflow: 'hidden' }}>
      <span style={{
        color, fontWeight, fontSize: `${fontSize}px`,
        display: 'block', textAlign: 'center', lineHeight: 1.2,
        whiteSpace: doWrap ? 'normal' : 'nowrap',
        wordBreak: doWrap ? 'break-word' : undefined,
      }}>{text}</span>
    </div>
  );
}

// ─── PriceLabel Component ─────────────────────────────────────────────────────

function PriceLabel({ data, layout, scale = 1, barcodeUrl }: {
  data: LabelData; layout: LabelLayout; scale?: number; barcodeUrl: string;
}) {
  const hasBarcode = barcodeUrl && /^\d{13}$/.test(data.barcode) && layout.showBarcode;
  const priceStr  = data.price > 0 ? formatRupiah(data.price).replace('Rp', '').trim() : '0';
  const baseH     = 155;
  const baseW     = 370;
  const w = baseW * scale;
  const h = baseH * scale;
  const headerH   = h * (layout.headerHeightPct / 100);
  const footerH   = layout.showFooter ? 5 * scale : 0;
  const fs        = scale;

  // Promo styling — desain asli: amber border, header tetap warna penuh, teks putih
  const isP             = !!data.isPromo;
  const promoPriceColor = data.promoColorPrice || '#DC2626';
  const promoFs         = isP ? (data.promoFontScale ?? 1.2) : 1;
  const priceBoxColor   = isP ? promoPriceColor : data.colorBlue;
  const priceTextColor  = isP ? promoPriceColor : '#1a1a1a';
  const rpColor         = '#777777';

  const maxPnFontPx = 10 * fs * layout.fontProductName;
  const minPnFontPx = Math.max(10 * fs, 5);

  const priceBox = (
    <div style={{
      position: 'relative', border: `${2 * scale}px solid ${priceBoxColor}`,
      borderRadius: `${4 * scale}px`, padding: `${3 * scale}px ${10 * scale}px`,
      display: 'flex', alignItems: 'baseline', gap: `${2 * scale}px`, overflow: 'hidden',
      justifyContent: 'center',
    }}>
      {layout.showRpPrefix && (
        <span style={{ fontSize: `${9 * fs * layout.fontPrice}px`, color: rpColor, fontWeight: 500 }}>Rp.</span>
      )}
      <span style={{ fontSize: `${20 * fs * layout.fontPrice * promoFs}px`, fontWeight: 900, color: priceTextColor, letterSpacing: '-0.02em' }}>
        {priceStr}
      </span>
      {!isP && layout.showCornerTriangle && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: `0 0 ${14 * scale}px ${14 * scale}px`, borderColor: `transparent transparent ${data.colorRed} transparent` }} />
      )}
    </div>
  );

  const priceContent = layout.showPrice && (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${2 * scale}px` }}>
      {isP && layout.promoPriceLayout === 'side-by-side' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: `${5 * scale}px`, justifyContent: 'center', flexWrap: 'wrap' }}>
          {data.originalPrice && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: `${7 * fs}px`, color: '#555', fontWeight: 500 }}>Normal</span>
              <span style={{ fontSize: `${9 * fs * layout.fontPrice * layout.fontOriginalPrice}px`, color: '#000000', textDecoration: 'line-through', fontWeight: 600 }}>
                Rp {data.originalPrice.toLocaleString('id-ID')}
              </span>
            </div>
          )}
          {data.originalPrice && (
            <span style={{ fontSize: `${10 * fs}px`, color: '#555', fontWeight: 700 }}>→</span>
          )}
          {priceBox}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${2 * scale}px` }}>
          {isP && data.originalPrice && (
            <div style={{ fontSize: `${8 * fs * layout.fontPrice * layout.fontOriginalPrice}px`, color: '#000000', textDecoration: 'line-through', fontWeight: 600 }}>
              Rp {data.originalPrice.toLocaleString('id-ID')}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: `${6 * scale}px`, justifyContent: 'center' }}>
            {priceBox}
            {!isP && layout.showArrow && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                <span style={{ color: data.colorRed, fontSize: `${18 * fs}px`, lineHeight: 1, fontWeight: 900 }}>↑</span>
                <span style={{ color: data.colorRed, fontSize: `${7 * fs}px`, fontWeight: 900, letterSpacing: '0.08em' }}>HARGA</span>
              </div>
            )}
          </div>
        </div>
      )}
      {isP && data.promoEndDate && (
        <div style={{ fontSize: `${6.5 * fs * layout.fontPromoDate}px`, color: '#555', fontWeight: 600, letterSpacing: '0.01em', textAlign: 'center', marginTop: `${1 * scale}px` }}>
          s/d {formatPromoDate(data.promoEndDate)}
        </div>
      )}
    </div>
  );

  const barcodeContent = hasBarcode && (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={barcodeUrl} alt="barcode" style={{ height: `${40 * scale}px`, display: 'block' }} />
      <span style={{ fontFamily: 'Courier New, monospace', fontSize: `${8 * fs}px`, letterSpacing: '0.12em', color: '#333', marginTop: `${1 * scale}px` }}>{data.barcode}</span>
    </div>
  );

  return (
    <div style={{
      width: w, height: h, minWidth: w, minHeight: h,
      display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif',
      overflow: 'hidden',
      border: isP ? `${2 * scale}px solid #000000` : '1px solid #e5e7eb',
      boxSizing: 'border-box',
      backgroundColor: isP ? '#FFFDE7' : '#fff',
      pageBreakInside: 'avoid', breakInside: 'avoid',
    }}>
      <div style={{ display: 'flex', height: `${headerH}px`, flexShrink: 0, position: 'relative' }}>
        {layout.showStoreName && (
          <div style={{
            backgroundColor: data.colorBlue, color: isP ? '#000000' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: `${layout.storeNameWidthPct}%`, fontWeight: 900,
            fontSize: `${11 * fs * layout.fontStoreName}px`,
            padding: '0 4px', letterSpacing: '0.06em', textTransform: 'uppercase',
            textAlign: 'center', lineHeight: 1.1,
          }}>{data.storeName || 'TOKO'}</div>
        )}
        <div style={{ display: 'flex', width: `${9 * scale}px`, flexShrink: 0 }}>
          <div style={{ flex: 1, backgroundColor: '#FFD700' }} />
          <div style={{ flex: 1, backgroundColor: data.colorRed }} />
        </div>
        {layout.showProductName && (
          <FitText
            text={data.productName || 'NAMA PRODUK'}
            maxFontPx={maxPnFontPx}
            minFontPx={minPnFontPx}
            color={isP ? '#000000' : '#fff'}
            fontWeight={700}
            containerStyle={{
              backgroundColor: data.colorRed,
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              height: '100%',
            }}
          />
        )}
        {isP && (
          <div style={{
            position: 'absolute', top: `${2 * scale}px`, right: `${2 * scale}px`,
            backgroundColor: '#F59E0B', color: '#fff',
            fontSize: `${6 * fs}px`, fontWeight: 900, letterSpacing: '0.05em',
            padding: `${1.5 * scale}px ${4 * scale}px`, borderRadius: `${3 * scale}px`, lineHeight: 1, zIndex: 10,
          }}>{layout.promoBadgeText || 'PROMO'}</div>
        )}
      </div>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: `${4 * scale}px ${6 * scale}px`, gap: `${3 * scale}px`,
      }}>
        {layout.barcodePosition === 'above' ? <>{barcodeContent}{priceContent}</> : <>{priceContent}{barcodeContent}</>}
      </div>
      {layout.showFooter && (
        <div style={{ height: `${footerH}px`, display: 'flex', flexShrink: 0 }}>
          <div style={{ flex: 1, backgroundColor: data.colorBlue }} />
          <div style={{ width: '18%', backgroundColor: '#FFD700' }} />
          <div style={{ width: '10%', backgroundColor: data.colorRed }} />
        </div>
      )}
    </div>
  );
}

// ─── PrintLabel Component ─────────────────────────────────────────────────────

function PrintLabel({ item, storeName, colorBlue, colorRed, layout, barcodeUrl, heightMm, widthMm = 98, promoColorPrice, promoFontScale }: {
  item: LabelItem; storeName: string; colorBlue: string; colorRed: string;
  layout: LabelLayout; barcodeUrl: string; heightMm: number; widthMm?: number;
  promoColorPrice?: string; promoFontScale?: number;
}) {
  const hasBarcode = barcodeUrl && /^\d{13}$/.test(item.barcode) && layout.showBarcode;
  const priceStr   = item.price > 0 ? formatRupiah(item.price).replace('Rp', '').trim() : '0';
  const barcodeImgH = `${Math.max(6, Math.round(heightMm * 0.28))}mm`;

  const fStore   = `${Math.round(7 * layout.fontStoreName)}pt`;
  const fRp      = `${Math.round(5.5 * layout.fontPrice)}pt`;

  // Auto-shrink product name for print
  const productContainerMm = (widthMm - 2) * (1 - layout.storeNameWidthPct / 100) - 2;
  const { fontSizePt: productFontPt, wrap: productWrap } = fitPrintFontPt(
    item.productName || 'NAMA PRODUK',
    6.5 * layout.fontProductName,
    4.5, // ≈ 6px minimum — harus lebih kecil dari basePt agar shrink bisa berjalan
    productContainerMm
  );
  const fProduct = `${productFontPt.toFixed(1)}pt`;

  const isP             = !!item.isPromo;
  const promoPriceColor = promoColorPrice || '#DC2626';
  const promoFs         = isP ? (promoFontScale ?? 1.2) : 1;
  const priceBoxColor   = isP ? promoPriceColor : colorBlue;
  const priceTextColor  = isP ? promoPriceColor : '#1a1a1a';
  const rpColor         = '#777777';

  const barcodeEl = hasBarcode && (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={barcodeUrl} alt="barcode" style={{ height: barcodeImgH, width: 'auto', display: 'block' }} />
      <span style={{ fontFamily: 'Courier New, monospace', fontSize: '5.5pt', letterSpacing: '0.08em', color: '#333' }}>{item.barcode}</span>
    </div>
  );

  const priceBox = (
    <div style={{
      position: 'relative', border: `1.5px solid ${priceBoxColor}`, borderRadius: '2.5px',
      padding: '1mm 2.5mm', display: 'flex', alignItems: 'baseline', gap: '1.5px',
      overflow: 'hidden', justifyContent: 'center',
    }}>
      {layout.showRpPrefix && <span style={{ fontSize: fRp, color: rpColor, fontWeight: 500 }}>Rp.</span>}
      <span style={{ fontSize: `${Math.round(11 * layout.fontPrice * promoFs)}pt`, fontWeight: 900, color: priceTextColor, letterSpacing: '-0.02em' }}>
        {priceStr}
      </span>
      {!isP && layout.showCornerTriangle && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 0 8px 8px', borderColor: `transparent transparent ${colorRed} transparent` }} />
      )}
    </div>
  );

  const priceEl = layout.showPrice && (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5mm' }}>
      {isP && layout.promoPriceLayout === 'side-by-side' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2mm', justifyContent: 'center', flexWrap: 'wrap' }}>
          {item.originalPrice && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '4pt', color: '#555', fontWeight: 500 }}>Normal</span>
              <span style={{ fontSize: `${Math.round(5 * layout.fontPrice * layout.fontOriginalPrice)}pt`, color: '#000000', textDecoration: 'line-through', fontWeight: 600 }}>
                Rp {item.originalPrice.toLocaleString('id-ID')}
              </span>
            </div>
          )}
          {item.originalPrice && <span style={{ fontSize: '7pt', color: '#555', fontWeight: 700 }}>→</span>}
          {priceBox}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5mm' }}>
          {isP && item.originalPrice && (
            <div style={{ fontSize: `${Math.round(5 * layout.fontPrice * layout.fontOriginalPrice)}pt`, color: '#000000', textDecoration: 'line-through', fontWeight: 600 }}>
              Rp {item.originalPrice.toLocaleString('id-ID')}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2.5px', justifyContent: 'center' }}>
            {priceBox}
            {!isP && layout.showArrow && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                <span style={{ color: colorRed, fontSize: '10pt', lineHeight: 1, fontWeight: 900 }}>↑</span>
                <span style={{ color: colorRed, fontSize: '4.5pt', fontWeight: 900, letterSpacing: '0.08em' }}>HARGA</span>
              </div>
            )}
          </div>
        </div>
      )}
      {isP && item.promoEndDate && (
        <div style={{ fontSize: `${Math.round(4 * layout.fontPromoDate)}pt`, color: '#444', fontWeight: 600, textAlign: 'center' }}>
          s/d {formatPromoDate(item.promoEndDate)}
        </div>
      )}
    </div>
  );

  return (
    <div className="label-print" style={{ backgroundColor: isP ? '#FFFDE7' : 'white', borderColor: isP ? '#000000' : '#e5e7eb', borderWidth: isP ? '2px' : '1px' }}>
      <div style={{ display: 'flex', height: `${layout.headerHeightPct}%`, flexShrink: 0, position: 'relative' }}>
        {layout.showStoreName && (
          <div style={{
            backgroundColor: colorBlue, color: isP ? '#000000' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: `${layout.storeNameWidthPct}%`, fontWeight: 900, fontSize: fStore,
            padding: '0 2px', letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.1,
          }}>{storeName || 'TOKO'}</div>
        )}
        <div style={{ display: 'flex', width: '6px', flexShrink: 0 }}>
          <div style={{ flex: 1, backgroundColor: '#FFD700' }} />
          <div style={{ flex: 1, backgroundColor: colorRed }} />
        </div>
        {layout.showProductName && (
          <div style={{
            backgroundColor: colorRed, color: isP ? '#000000' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flex: 1, fontWeight: 700, fontSize: fProduct,
            padding: '0 2px', textAlign: 'center', lineHeight: 1.2,
            whiteSpace: productWrap ? 'normal' : 'nowrap',
            wordBreak: productWrap ? 'break-word' : undefined,
            overflow: 'hidden',
          }}>{item.productName || 'NAMA PRODUK'}</div>
        )}
        {isP && (
          <div style={{
            position: 'absolute', top: '1px', right: '1px',
            backgroundColor: '#F59E0B', color: '#fff', fontSize: '4pt', fontWeight: 900,
            letterSpacing: '0.05em', padding: '1px 3px', borderRadius: '2px', lineHeight: 1, zIndex: 10,
          }}>{layout.promoBadgeText || 'PROMO'}</div>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1mm 2mm', gap: '0.8mm', overflow: 'hidden' }}>
        {layout.barcodePosition === 'above' ? <>{barcodeEl}{priceEl}</> : <>{priceEl}{barcodeEl}</>}
      </div>
      {layout.showFooter && (
        <div style={{ height: '4px', display: 'flex', flexShrink: 0 }}>
          <div style={{ flex: 1, backgroundColor: colorBlue }} />
          <div style={{ width: '18%', backgroundColor: '#FFD700' }} />
          <div style={{ width: '10%', backgroundColor: colorRed }} />
        </div>
      )}
    </div>
  );
}

// ─── Print CSS ────────────────────────────────────────────────────────────────

const PRINT_CSS = (heightMm: number, cols: number, widthMm: number) => `
@media screen { #print-area { display: none; } }
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; }
  body * { visibility: hidden !important; }
  #print-area, #print-area * { visibility: visible !important; }
  #print-area {
    display: block !important; position: fixed !important;
    top: 0 !important; left: 0 !important;
    width: 210mm !important; padding: 5mm 5mm 6mm 5mm !important;
    box-sizing: border-box !important; background: white !important;
  }
  .print-grid {
    display: grid !important;
    grid-template-columns: repeat(${cols}, 1fr) !important;
    gap: 2mm !important; width: 100% !important;
  }
  .label-print {
    width: ${widthMm}mm !important; height: ${heightMm}mm !important;
    display: flex !important; flex-direction: column !important;
    overflow: hidden !important; page-break-inside: avoid !important;
    break-inside: avoid !important; border-style: solid !important;
    font-family: Arial, sans-serif !important; box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
  }
}
`;

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors">
        <span className="flex items-center gap-2"><Icon className="w-4 h-4 text-blue-500" />{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3 border-t border-gray-100">{children}</div>}
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      <button onClick={() => onChange(!value)}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${value ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
        {value ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        {value ? 'Tampil' : 'Tersembunyi'}
      </button>
    </div>
  );
}

function FontSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span className="font-medium text-gray-700">{Math.round(value * 100)}%</span>
      </div>
      <input type="range" min={50} max={200} step={5} value={Math.round(value * 100)}
        onChange={e => onChange(parseInt(e.target.value, 10) / 100)} className="w-full accent-blue-600" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CetakLabelPage() {
  const params  = useParams();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [storeName,   setStoreName]   = useState('');
  const [labelStoreNameOverride, setLabelStoreNameOverride] = useState('');
  const [items,       setItems]       = useState<LabelItem[]>([]);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);

  const [searchQ,       setSearchQ]       = useState('');
  const [searchResults, setSearchResults] = useState<ProductOption[]>([]);
  const [searching,     setSearching]     = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [manualName,    setManualName]    = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [manualPrice,   setManualPrice]   = useState('');

  const [colorBlue,       setColorBlue]       = useState('#009fe3');
  const [colorRed,        setColorRed]        = useState('#e8001c');
  const [promoColorPrice, setPromoColorPrice] = useState('#DC2626');
  const [promoFontScale,  setPromoFontScale]  = useState(1.2);
  const [sizePreset,      setSizePreset]      = useState<SizePreset>(SIZE_PRESETS[1]);
  const [customScale,     setCustomScale]     = useState(100);
  const [layout,          setLayout]          = useState<LabelLayout>(DEFAULT_LAYOUT);
  const [activeLayoutPreset, setActiveLayoutPreset] = useState('standard');

  // Templates
  const [templates,     setTemplates]     = useState<DesignTemplate[]>([]);
  const [templateName,  setTemplateName]  = useState('');

  const [promoMap,     setPromoMap]     = useState<Map<string, ActivePromoInfo>>(new Map());
  const [priceAlerts,  setPriceAlerts]  = useState<PriceAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const barcodeMap    = useBarcodeMap(items);
  const previewScale  = customScale / 100;
  const selectedItem  = items.find(i => i.id === selectedId) ?? items[0] ?? null;
  const previewBarcodeUrl = selectedItem ? (barcodeMap.get(selectedItem.barcode) ?? '') : '';
  const totalLabels   = items.reduce((s, i) => s + i.qty, 0);
  const effectiveStoreName = labelStoreNameOverride.trim() || storeName;

  const patchLayout = (patch: Partial<LabelLayout>) => {
    setLayout(prev => ({ ...prev, ...patch }));
    setActiveLayoutPreset('custom');
  };

  // Load templates from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY);
      if (raw) setTemplates(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Load store name
  useEffect(() => {
    if (!storeId) return;
    supabase.from('stores').select('name').eq('id', storeId).single()
      .then(({ data }) => { if (data?.name) setStoreName(data.name.toUpperCase()); });
  }, [storeId, supabase]);

  // Load active promos
  useEffect(() => {
    if (!storeId) return;
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('promotions')
      .select('id, name, end_date, promo_products(store_product_id, promo_price)')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .or(`start_date.is.null,start_date.lte.${today}`)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, ActivePromoInfo>();
        for (const promo of data as Array<{ id: string; name: string; end_date: string | null; promo_products: Array<{ store_product_id: string; promo_price: number | null }> | { store_product_id: string; promo_price: number | null } }>) {
          const products = Array.isArray(promo.promo_products) ? promo.promo_products : [promo.promo_products];
          for (const pp of products) {
            if (pp && pp.promo_price && pp.promo_price > 0 && !map.has(pp.store_product_id)) {
              map.set(pp.store_product_id, { promoPrice: pp.promo_price, promoName: promo.name, endDate: promo.end_date ?? undefined });
            }
          }
        }
        setPromoMap(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // beforeprint/afterprint
  useEffect(() => {
    const show = () => { const el = document.getElementById('print-area'); if (el) el.style.display = 'block'; };
    const hide = () => { const el = document.getElementById('print-area'); if (el) el.style.display = ''; };
    window.addEventListener('beforeprint', show);
    window.addEventListener('afterprint', hide);
    return () => { window.removeEventListener('beforeprint', show); window.removeEventListener('afterprint', hide); };
  }, []);

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchResults([]); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Product search
  useEffect(() => {
    if (!searchQ || searchQ.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.from('store_products')
        .select('id, name, barcode, sell_price, hpp')
        .eq('store_id', storeId)
        .or(`name.ilike.%${searchQ}%,barcode.ilike.%${searchQ}%`)
        .limit(10);
      setSearchResults((data as ProductOption[]) || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, storeId, supabase]);

  // Load price alerts
  const loadPriceAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const { data: products } = await supabase
        .from('store_products').select('id, name, barcode, sell_price, hpp')
        .eq('store_id', storeId).gt('hpp', 0).limit(500);
      if (!products?.length) return;

      const since = new Date(); since.setDate(since.getDate() - 60);
      const { data: purchaseItems } = await supabase
        .from('purchase_items')
        .select('store_product_id, harga, purchases!inner(tanggal, store_id)')
        .eq('purchases.store_id', storeId)
        .gte('purchases.tanggal', since.toISOString())
        .in('store_product_id', (products as ProductOption[]).map(p => p.id))
        .order('tanggal', { referencedTable: 'purchases', ascending: false });
      if (!purchaseItems?.length) return;

      const latest = new Map<string, { harga: number; tanggal: string }>();
      for (const pi of purchaseItems as Array<{ store_product_id: string; harga: number; purchases: { tanggal: string } | { tanggal: string }[] }>) {
        if (!pi.store_product_id || latest.has(pi.store_product_id)) continue;
        const p = Array.isArray(pi.purchases) ? pi.purchases[0] : pi.purchases;
        latest.set(pi.store_product_id, { harga: pi.harga, tanggal: p?.tanggal || '' });
      }

      const alerts: PriceAlert[] = [];
      for (const p of products as ProductOption[]) {
        const l = latest.get(p.id);
        if (!l || l.harga <= p.hpp * 1.005) continue;
        alerts.push({ productId: p.id, name: p.name, barcode: p.barcode || '', currentHpp: p.hpp, latestPurchaseHarga: l.harga, currentSellPrice: p.sell_price, purchaseDate: l.tanggal });
      }
      alerts.sort((a, b) => (b.latestPurchaseHarga - b.currentHpp) / b.currentHpp - (a.latestPurchaseHarga - a.currentHpp) / a.currentHpp);
      setPriceAlerts(alerts.slice(0, 10));
    } catch { /* silent */ } finally { setAlertsLoading(false); }
  }, [storeId, supabase]);

  useEffect(() => { loadPriceAlerts(); }, [loadPriceAlerts]);

  // ── Template functions ───────────────────────────────────────────────────────

  function saveTemplate() {
    const name = templateName.trim();
    if (!name) return;
    const tmpl: DesignTemplate = {
      id: `${Date.now()}`, name, colorBlue, colorRed, promoColorPrice, promoFontScale,
      layout, sizePresetKey: sizePreset.key, labelStoreNameOverride,
    };
    const next = [...templates.filter(t => t.name !== name), tmpl];
    setTemplates(next);
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setTemplateName('');
  }

  function loadTemplate(tmpl: DesignTemplate) {
    setColorBlue(tmpl.colorBlue);
    setColorRed(tmpl.colorRed);
    setPromoColorPrice(tmpl.promoColorPrice);
    setPromoFontScale(tmpl.promoFontScale);
    setLayout({ ...DEFAULT_LAYOUT, ...tmpl.layout });
    setActiveLayoutPreset('custom');
    setLabelStoreNameOverride(tmpl.labelStoreNameOverride || '');
    const preset = SIZE_PRESETS.find(p => p.key === tmpl.sizePresetKey);
    if (preset) { setSizePreset(preset); setCustomScale(SCALE_MAP[preset.key] ?? 100); }
  }

  function deleteTemplate(id: string) {
    const next = templates.filter(t => t.id !== id);
    setTemplates(next);
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  // ── Item management ──────────────────────────────────────────────────────────

  function addItemFromProduct(p: ProductOption) {
    const activePromo = promoMap.get(p.id);
    const newItem: LabelItem = {
      id: `${Date.now()}-${Math.random()}`,
      productName: p.name.toUpperCase(),
      barcode: p.barcode || '',
      price: activePromo ? activePromo.promoPrice : p.sell_price,
      qty: 1,
      isPromo: !!activePromo,
      originalPrice: activePromo ? p.sell_price : undefined,
      promoEndDate: activePromo?.endDate,
    };
    setItems(prev => [...prev, newItem]);
    setSelectedId(newItem.id);
    setSearchQ(''); setSearchResults([]);
  }

  function addManualItem() {
    if (!manualName.trim()) return;
    const priceVal = parseInt(manualPrice.replace(/\D/g, ''), 10) || 0;
    const newItem: LabelItem = {
      id: `${Date.now()}-${Math.random()}`,
      productName: manualName.toUpperCase(),
      barcode: manualBarcode.replace(/\D/g, '').slice(0, 13),
      price: priceVal, qty: 1,
    };
    setItems(prev => [...prev, newItem]);
    setSelectedId(newItem.id);
    setManualName(''); setManualBarcode(''); setManualPrice('');
  }

  function addItemFromAlert(alert: PriceAlert) {
    const ratio = alert.latestPurchaseHarga / alert.currentHpp;
    const rawSuggested = Math.ceil((alert.currentSellPrice * ratio) / 100) * 100;
    // Pastikan harga saran tidak di bawah harga beli baru (minimal BEP)
    const suggested = Math.max(rawSuggested, Math.ceil(alert.latestPurchaseHarga / 100) * 100);
    const newItem: LabelItem = {
      id: `${Date.now()}-${Math.random()}`,
      productName: alert.name.toUpperCase(), barcode: alert.barcode,
      price: suggested, qty: 1,
    };
    setItems(prev => [...prev, newItem]);
    setSelectedId(newItem.id);
  }

  function patchItem(id: string, patch: Partial<LabelItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  function removeItem(id: string) {
    setItems(prev => { const next = prev.filter(i => i.id !== id); if (selectedId === id) setSelectedId(next[0]?.id ?? null); return next; });
  }

  function handleSizePreset(p: SizePreset) {
    setSizePreset(p);
    setCustomScale(SCALE_MAP[p.key] ?? 100);
  }

  function handleSliderChange(v: number) {
    setCustomScale(v);
    const closest = SIZE_PRESETS.reduce((b, p) => Math.abs((SCALE_MAP[p.key] ?? 100) - v) < Math.abs((SCALE_MAP[b.key] ?? 100) - v) ? p : b);
    setSizePreset(closest);
  }

  function applyLayoutPreset(key: string) {
    const preset = LAYOUT_PRESETS.find(p => p.key === key);
    if (!preset) return;
    setLayout({ ...DEFAULT_LAYOUT, ...preset.layout });
    setActiveLayoutPreset(key);
  }

  const visibleAlerts = priceAlerts.filter(a => !dismissedAlerts.has(a.productId));

  const previewData: LabelData = selectedItem
    ? { storeName: effectiveStoreName, productName: selectedItem.productName, barcode: selectedItem.barcode, price: selectedItem.price, colorBlue, colorRed, isPromo: selectedItem.isPromo, originalPrice: selectedItem.originalPrice, promoEndDate: selectedItem.promoEndDate, promoColorPrice, promoFontScale }
    : { storeName: effectiveStoreName, productName: 'NAMA PRODUK', barcode: '', price: 0, colorBlue, colorRed, promoColorPrice, promoFontScale };

  return (
    <>
      <style>{PRINT_CSS(sizePreset.heightMm, sizePreset.cols, sizePreset.widthMm)}</style>

      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Tag className="w-6 h-6 text-blue-600 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cetak Label Harga</h1>
            <p className="text-sm text-gray-500">Tambah beberapa produk — 1 label per produk, cetak 1 kertas A4</p>
          </div>
        </div>

        {/* Notifikasi Harga Naik */}
        {(visibleAlerts.length > 0 || alertsLoading) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-amber-600 shrink-0" />
              <h2 className="font-semibold text-amber-800">Harga Pembelian Naik — Perlu Cetak Label Baru</h2>
              {alertsLoading && <Loader2 className="w-4 h-4 animate-spin text-amber-500" />}
              <button onClick={loadPriceAlerts} className="ml-auto p-1 rounded hover:bg-amber-100">
                <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
              </button>
            </div>
            <div className="space-y-2">
              {visibleAlerts.map((alert) => {
                const pct = (((alert.latestPurchaseHarga - alert.currentHpp) / alert.currentHpp) * 100).toFixed(1);
                return (
                  <div key={alert.productId} className="flex items-center gap-3 bg-white rounded-lg border border-amber-200 px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{alert.name}</p>
                      <p className="text-xs text-gray-500">
                        HPP: <span className="line-through">{formatRupiah(alert.currentHpp)}</span>
                        {' → '}<span className="text-red-600 font-semibold">{formatRupiah(alert.latestPurchaseHarga)}</span>
                        <span className="ml-1 text-red-500">(+{pct}%)</span>
                        {' · Jual saat ini: '}<span className="font-medium">{formatRupiah(alert.currentSellPrice)}</span>
                      </p>
                    </div>
                    <button onClick={() => addItemFromAlert(alert)}
                      className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700 transition-colors shrink-0">
                      <Plus className="w-3 h-3" /> Tambah
                    </button>
                    <button onClick={() => setDismissedAlerts(prev => { const s = new Set(Array.from(prev)); s.add(alert.productId); return s; })}
                      className="p-1 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Kolom Kiri: Produk ────────────────────────────────────────── */}
          <div className="space-y-3">

            {/* Cari & Tambah Produk */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-500" /> Cari & Tambah Produk
                </p>
              </div>
              <div className="p-4 space-y-3">
                <div className="relative" ref={searchRef}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                    placeholder="Ketik nama atau barcode produk..."
                    className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {searching
                    ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                    : searchQ && <button onClick={() => { setSearchQ(''); setSearchResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                  }
                  {searchResults.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {searchResults.map(p => {
                        const promo = promoMap.get(p.id);
                        return (
                          <button key={p.id} onClick={() => addItemFromProduct(p)}
                            className={`w-full text-left px-3 py-2.5 transition-colors border-b last:border-0 border-gray-100 flex items-center gap-2 ${promo ? 'hover:bg-amber-50 bg-amber-50/40' : 'hover:bg-blue-50'}`}>
                            <Plus className={`w-3.5 h-3.5 shrink-0 ${promo ? 'text-amber-500' : 'text-blue-500'}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                              <p className="text-xs text-gray-500">
                                {p.barcode || 'Tanpa barcode'} ·{' '}
                                {promo ? (
                                  <>
                                    <span className="line-through text-gray-400">{formatRupiah(p.sell_price)}</span>
                                    {' → '}
                                    <span className="text-red-600 font-semibold">{formatRupiah(promo.promoPrice)}</span>
                                    {promo.endDate && <span className="text-gray-400"> · s/d {formatPromoDate(promo.endDate)}</span>}
                                  </>
                                ) : formatRupiah(p.sell_price)}
                              </p>
                            </div>
                            {promo && <span className="text-[10px] bg-black text-white font-bold px-1.5 py-0.5 rounded shrink-0">PROMO</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {searchQ.length >= 2 && !searching && searchResults.length === 0 && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                      <p className="text-sm text-gray-400 text-center">Produk tidak ditemukan</p>
                    </div>
                  )}
                </div>

                <details className="group">
                  <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-700 select-none list-none flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Tambah Manual (tanpa cari)
                  </summary>
                  <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                    <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Nama Produk *"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
                    <input type="text" value={manualBarcode} onChange={e => setManualBarcode(e.target.value.replace(/\D/g, '').slice(0, 13))} placeholder="Barcode EAN-13 (opsional)"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" value={manualPrice}
                      onChange={e => { const c = e.target.value.replace(/\D/g, ''); setManualPrice(c ? parseInt(c, 10).toLocaleString('id-ID') : ''); }}
                      placeholder="Harga Jual (Rp)"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={addManualItem} disabled={!manualName.trim()}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
                      <Plus className="w-4 h-4" /> Tambah ke Daftar
                    </button>
                  </div>
                </details>
              </div>
            </div>

            {/* Daftar Label */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-500" /> Daftar Label
                </p>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{totalLabels} label</span>
              </div>
              {items.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">Belum ada produk. Cari produk di atas atau tambah manual.</div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.id} onClick={() => setSelectedId(item.id)}
                      className={`px-3 py-2.5 cursor-pointer transition-colors ${
                        selectedId === item.id
                          ? item.isPromo ? 'bg-gray-100 border-l-2 border-black' : 'bg-blue-50 border-l-2 border-blue-500'
                          : item.isPromo ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'hover:bg-gray-50'
                      }`}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <input type="text" value={item.productName} onClick={e => e.stopPropagation()}
                              onChange={e => patchItem(item.id, { productName: e.target.value.toUpperCase() })}
                              className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none uppercase truncate" />
                            {item.isPromo && (
                              <span className="text-[9px] bg-black text-white font-bold px-1.5 py-0.5 rounded shrink-0">PROMO</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <input type="text" value={item.barcode} onClick={e => e.stopPropagation()}
                              onChange={e => patchItem(item.id, { barcode: e.target.value.replace(/\D/g, '').slice(0, 13) })}
                              placeholder="barcode"
                              className={`w-28 text-xs font-mono bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none ${item.barcode && item.barcode.length !== 13 ? 'text-red-500' : 'text-gray-400'}`} />
                            <div className="flex-1 flex flex-col" onClick={e => e.stopPropagation()}>
                              {item.isPromo && item.originalPrice && (
                                <span className="text-[10px] text-gray-400 line-through leading-tight">{item.originalPrice.toLocaleString('id-ID')}</span>
                              )}
                              <input type="text" value={item.price > 0 ? item.price.toLocaleString('id-ID') : ''}
                                onChange={e => { const c = e.target.value.replace(/\D/g, ''); patchItem(item.id, { price: c ? parseInt(c, 10) : 0 }); }}
                                placeholder="harga"
                                className={`w-full text-xs font-semibold bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none ${item.isPromo ? 'text-gray-800' : 'text-blue-700'}`} />
                            </div>
                          </div>
                          {item.isPromo && item.promoEndDate && (
                            <p className="text-[10px] text-gray-400 mt-0.5">s/d {formatPromoDate(item.promoEndDate)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => patchItem(item.id, { qty: Math.max(1, item.qty - 1) })}
                            className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 text-xs font-bold">−</button>
                          <input type="number" min={1} max={200} value={item.qty}
                            onChange={e => patchItem(item.id, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            className="w-10 text-center text-sm font-semibold border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <button onClick={() => patchItem(item.id, { qty: item.qty + 1 })}
                            className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-100 text-xs font-bold">+</button>
                        </div>
                        <button onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {items.length > 0 && (
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <button onClick={() => { setItems([]); setSelectedId(null); }} className="text-xs text-red-400 hover:text-red-600 transition-colors">Hapus semua</button>
                  <span className="text-xs text-gray-400">{items.length} produk · {totalLabels} label total</span>
                </div>
              )}
            </div>

            {/* Warna */}
            <Section title="Warna" icon={SlidersHorizontal}>
              <div className="flex gap-4 mt-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Warna Utama</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={colorBlue} onChange={e => setColorBlue(e.target.value)} className="w-10 h-8 rounded cursor-pointer border border-gray-200" />
                    <span className="text-xs font-mono text-gray-500">{colorBlue}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Warna Aksen</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={colorRed} onChange={e => setColorRed(e.target.value)} className="w-10 h-8 rounded cursor-pointer border border-gray-200" />
                    <span className="text-xs font-mono text-gray-500">{colorRed}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => { setColorBlue('#009fe3'); setColorRed('#e8001c'); setPromoColorPrice('#DC2626'); setPromoFontScale(1.2); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline">Reset warna</button>
            </Section>

            {/* Ukuran */}
            <Section title="Ukuran Label" icon={LayoutTemplate}>
              <div className="grid grid-cols-5 gap-1.5 mt-2">
                {SIZE_PRESETS.map(p => (
                  <button key={p.key} onClick={() => handleSizePreset(p)}
                    className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${sizePreset.key === p.key ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {p.label}<br /><span className="font-normal opacity-80">{p.perPage}/hal</span>
                  </button>
                ))}
              </div>
              {sizePreset.key === 'compact3' && (
                <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-2 py-1.5">
                  3 kolom × 7 baris · 21 label/A4 · border bawah tampil penuh
                </p>
              )}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Zoom Preview</span><span className="font-medium text-gray-700">{customScale}%</span>
                </div>
                <input type="range" min={50} max={400} value={customScale}
                  onChange={e => handleSliderChange(parseInt(e.target.value, 10))} className="w-full accent-blue-600" />
              </div>
            </Section>

            {/* Tombol Cetak */}
            <button
              onClick={() => {
                const el = document.getElementById('print-area');
                if (el) el.style.display = 'block';
                setTimeout(() => { window.print(); setTimeout(() => { if (el) el.style.display = ''; }, 500); }, 250);
              }}
              disabled={items.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
              <Printer className="w-5 h-5" />
              Cetak {totalLabels} Label ({sizePreset.label})
            </button>
          </div>

          {/* ── Kolom Tengah: Tata Letak ──────────────────────────────────── */}
          <div className="space-y-3">

            {/* Template Design */}
            <Section title="Template Design" icon={Save} defaultOpen>
              <div className="mt-2 space-y-2">
                {/* Nama label pada label */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nama Toko di Label (override)</label>
                  <input type="text" value={labelStoreNameOverride}
                    onChange={e => setLabelStoreNameOverride(e.target.value.toUpperCase())}
                    placeholder={storeName || 'Gunakan nama toko default'}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs uppercase focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {/* Save template */}
                <div className="flex gap-2">
                  <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)}
                    placeholder="Nama template..."
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); }} />
                  <button onClick={saveTemplate} disabled={!templateName.trim()}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed transition-colors shrink-0">
                    <Save className="w-3 h-3" /> Simpan
                  </button>
                </div>
                {/* Template list */}
                {templates.length > 0 && (
                  <div className="space-y-1 border-t border-gray-100 pt-2">
                    <p className="text-xs text-gray-400 font-medium flex items-center gap-1"><FolderOpen className="w-3 h-3" /> Template Tersimpan</p>
                    {templates.map(t => (
                      <div key={t.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1.5">
                        <span className="flex-1 text-xs font-medium text-gray-700 truncate">{t.name}</span>
                        <button onClick={() => loadTemplate(t)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold px-1.5 py-0.5 rounded hover:bg-blue-50">Muat</button>
                        <button onClick={() => deleteTemplate(t.id)}
                          className="text-[10px] text-red-400 hover:text-red-600 px-1 py-0.5 rounded hover:bg-red-50">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4 text-blue-500" /> Preset Tata Letak
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {LAYOUT_PRESETS.map(p => (
                  <button key={p.key} onClick={() => applyLayoutPreset(p.key)}
                    className={`py-2 px-3 rounded-lg text-xs text-left border transition-colors ${activeLayoutPreset === p.key ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <p className="font-semibold">{p.label}</p>
                    <p className={`text-[10px] ${activeLayoutPreset === p.key ? 'text-blue-100' : 'text-gray-400'}`}>{p.desc}</p>
                  </button>
                ))}
                <button onClick={() => { setLayout(DEFAULT_LAYOUT); setActiveLayoutPreset('standard'); }}
                  className="py-2 px-3 rounded-lg text-xs text-left border border-dashed border-gray-300 text-gray-400 hover:bg-gray-50 col-span-2">
                  ↺ Reset ke Default
                </button>
              </div>
            </div>

            <Section title="Tampil / Sembunyikan Elemen" icon={Eye} defaultOpen>
              <div className="space-y-2 mt-2">
                <ToggleRow label="Nama Toko (header kiri)" value={layout.showStoreName} onChange={v => patchLayout({ showStoreName: v })} />
                <ToggleRow label="Nama Produk (header kanan)" value={layout.showProductName} onChange={v => patchLayout({ showProductName: v })} />
                <ToggleRow label="Barcode EAN-13" value={layout.showBarcode} onChange={v => patchLayout({ showBarcode: v })} />
                <ToggleRow label="Kotak Harga" value={layout.showPrice} onChange={v => patchLayout({ showPrice: v })} />
                <ToggleRow label="Panah ↑ HARGA" value={layout.showArrow} onChange={v => patchLayout({ showArrow: v })} />
                <ToggleRow label="Segitiga sudut" value={layout.showCornerTriangle} onChange={v => patchLayout({ showCornerTriangle: v })} />
                <ToggleRow label='Prefix "Rp."' value={layout.showRpPrefix} onChange={v => patchLayout({ showRpPrefix: v })} />
                <ToggleRow label="Footer tri-color" value={layout.showFooter} onChange={v => patchLayout({ showFooter: v })} />
              </div>
            </Section>

            <Section title="Ukuran Font & Proporsi" icon={SlidersHorizontal}>
              <div className="space-y-3 mt-2">
                <FontSlider label="Font Nama Toko" value={layout.fontStoreName} onChange={v => patchLayout({ fontStoreName: v })} />
                <FontSlider label="Font Nama Produk" value={layout.fontProductName} onChange={v => patchLayout({ fontProductName: v })} />
                <FontSlider label="Font Harga" value={layout.fontPrice} onChange={v => patchLayout({ fontPrice: v })} />
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Lebar Nama Toko (%)</span>
                    <span className="font-medium text-gray-700">{layout.storeNameWidthPct}%</span>
                  </div>
                  <input type="range" min={20} max={65} value={layout.storeNameWidthPct}
                    onChange={e => patchLayout({ storeNameWidthPct: parseInt(e.target.value, 10) })} className="w-full accent-blue-600" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Tinggi Header (%)</span>
                    <span className="font-medium text-gray-700">{layout.headerHeightPct}%</span>
                  </div>
                  <input type="range" min={15} max={40} value={layout.headerHeightPct}
                    onChange={e => patchLayout({ headerHeightPct: parseInt(e.target.value, 10) })} className="w-full accent-blue-600" />
                </div>
              </div>
            </Section>

            {/* Pengaturan Promo */}
            <Section title="Tata Letak Harga Promo" icon={Tag}>
              <div className="space-y-3 mt-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1.5 font-medium">Layout Harga</p>
                  <div className="flex gap-2">
                    {(['side-by-side', 'stacked'] as const).map(pl => (
                      <button key={pl} onClick={() => patchLayout({ promoPriceLayout: pl })}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${layout.promoPriceLayout === pl ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {pl === 'side-by-side' ? '← Berdampingan' : '↕ Bertumpuk'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Teks Badge Promo</label>
                  <input type="text" value={layout.promoBadgeText}
                    onChange={e => patchLayout({ promoBadgeText: e.target.value.toUpperCase().slice(0, 10) })}
                    placeholder="PROMO"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs uppercase focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Warna Font Harga Promo</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={promoColorPrice} onChange={e => setPromoColorPrice(e.target.value)}
                      className="w-10 h-8 rounded cursor-pointer border border-gray-200" />
                    <span className="text-xs font-mono text-gray-500">{promoColorPrice}</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Ukuran Font Harga Promo</span>
                    <span className="font-medium text-gray-700">{Math.round(promoFontScale * 100)}%</span>
                  </div>
                  <input type="range" min={80} max={200} step={5} value={Math.round(promoFontScale * 100)}
                    onChange={e => setPromoFontScale(parseInt(e.target.value, 10) / 100)} className="w-full accent-red-500" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Ukuran Harga Normal (coret)</span>
                    <span className="font-medium text-gray-700">{Math.round(layout.fontOriginalPrice * 100)}%</span>
                  </div>
                  <input type="range" min={60} max={200} step={5} value={Math.round(layout.fontOriginalPrice * 100)}
                    onChange={e => patchLayout({ fontOriginalPrice: parseInt(e.target.value, 10) / 100 })} className="w-full accent-gray-600" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Ukuran Teks Tanggal Promo</span>
                    <span className="font-medium text-gray-700">{Math.round(layout.fontPromoDate * 100)}%</span>
                  </div>
                  <input type="range" min={60} max={200} step={5} value={Math.round(layout.fontPromoDate * 100)}
                    onChange={e => patchLayout({ fontPromoDate: parseInt(e.target.value, 10) / 100 })} className="w-full accent-gray-600" />
                </div>
                <p className="text-[10px] text-gray-400 bg-gray-50 rounded px-2 py-1.5 leading-relaxed">
                  Label promo: border & teks header hitam, harga normal hitam, tanggal akhir promo tampil otomatis.
                </p>
              </div>
            </Section>

            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <h3 className="font-semibold text-gray-800 text-sm">Posisi Barcode</h3>
              <div className="flex gap-2">
                {(['above', 'below'] as const).map(pos => (
                  <button key={pos} onClick={() => patchLayout({ barcodePosition: pos })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${layout.barcodePosition === pos ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {pos === 'above' ? '↑ Di Atas Harga' : '↓ Di Bawah Harga'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Kolom Kanan: Preview ──────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-1">Preview Label</h3>
              {selectedItem && <p className="text-xs text-blue-600 mb-3 truncate">↑ {selectedItem.productName}</p>}
              <div className="overflow-auto" style={{ maxHeight: '520px' }}>
                <div style={{ display: 'inline-block' }}>
                  <PriceLabel data={previewData} layout={layout} scale={previewScale} barcodeUrl={previewBarcodeUrl} />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                {sizePreset.widthMm}mm × {sizePreset.heightMm}mm · {sizePreset.cols} kolom · {sizePreset.perPage} label/hal A4
              </p>
            </div>

            {/* Mini grid preview */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2">
                <ChevronRight className="w-4 h-4" />Layout A4 ({totalLabels} label, {Math.ceil(totalLabels / sizePreset.perPage)} hal)
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${sizePreset.cols}, 1fr)`,
                gap: '2px', width: '180px', margin: '0 auto',
                border: '1px solid #d1d5db', padding: '2px',
              }}>
                {Array.from({ length: sizePreset.perPage }).map((_, i) => {
                  const flat = items.flatMap(it => Array.from({ length: it.qty }, () => it));
                  const it = flat[i];
                  const isLastRow = i >= sizePreset.perPage - sizePreset.cols;
                  return (
                    <div key={i} style={{
                      height: `${Math.round(118 / sizePreset.rows)}px`,
                      backgroundColor: it ? (it.isPromo ? '#d1d5db' : colorBlue) : '#e5e7eb',
                      border: it?.isPromo ? '1.5px solid #000' : '1px solid #d1d5db',
                      borderBottom: isLastRow && it ? '2px solid #000' : undefined,
                      borderRadius: '1px', opacity: it ? 0.85 : 0.35,
                    }} />
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">
                {sizePreset.cols} kol × {sizePreset.rows} baris
              </p>
              {totalLabels > sizePreset.perPage && (
                <p className="text-xs text-amber-600 text-center mt-1">
                  {totalLabels} label → {Math.ceil(totalLabels / sizePreset.perPage)} halaman
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Print Area */}
      <div id="print-area">
        <div className="print-grid">
          {items.flatMap((item) =>
            Array.from({ length: item.qty }).map((_, i) => (
              <PrintLabel
                key={`${item.id}-${i}`}
                item={{ ...item, productName: item.productName }}
                storeName={effectiveStoreName}
                colorBlue={colorBlue}
                colorRed={colorRed}
                layout={layout}
                barcodeUrl={barcodeMap.get(item.barcode) ?? ''}
                heightMm={sizePreset.heightMm}
                widthMm={sizePreset.widthMm}
                promoColorPrice={promoColorPrice}
                promoFontScale={promoFontScale}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
