'use client';

import { useRef, useState, useEffect } from 'react';
import { X, Copy, Download, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecForPoster {
  product_name: string;
  sell_price: number;
  current_stock: number;
  promo_type: 'discount' | 'bundle' | 'bxgy' | 'min_purchase' | 'flash_sale';
  params: Record<string, unknown>;
}

interface PosterData {
  productName: string;
  normalPrice: number;
  promoPrice: number;
  discountPct: number;
  stock: number;
  storeName: string;
  promoLabel: string;
  productSlug: string;
  storeSlug: string;
  hasPromoPrice: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fRp(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}

function computePosterData(rec: RecForPoster, storeName: string): PosterData {
  const base: Omit<PosterData, 'promoPrice' | 'discountPct' | 'promoLabel' | 'hasPromoPrice'> = {
    productName: rec.product_name,
    normalPrice: rec.sell_price,
    stock: rec.current_stock,
    storeName,
    productSlug: toSlug(rec.product_name),
    storeSlug: toSlug(storeName),
  };

  switch (rec.promo_type) {
    case 'discount': {
      const pct = Number(rec.params.discount_pct ?? 0);
      const promoPrice = Math.round(rec.sell_price * (1 - pct / 100));
      return { ...base, promoPrice, discountPct: pct, promoLabel: `Diskon ${pct}%`, hasPromoPrice: pct > 0 };
    }
    case 'flash_sale': {
      const pct = Number(rec.params.flash_discount_pct ?? 0);
      const promoPrice = Math.round(rec.sell_price * (1 - pct / 100));
      return { ...base, promoPrice, discountPct: pct, promoLabel: `Flash Sale ${pct}%`, hasPromoPrice: pct > 0 };
    }
    case 'bundle': {
      const pct = Number(rec.params.bundle_discount_pct ?? 12);
      const promoPrice = Math.round(rec.sell_price * (1 - pct / 100));
      return { ...base, promoPrice, discountPct: pct, promoLabel: `Bundle - Hemat ${pct}%`, hasPromoPrice: pct > 0 };
    }
    case 'bxgy': {
      const buyQty = Number(rec.params.buy_qty ?? 3);
      const freeQty = Number(rec.params.free_qty ?? 1);
      const effectivePct = Math.round((freeQty / (buyQty + freeQty)) * 100);
      return { ...base, promoPrice: rec.sell_price, discountPct: effectivePct, promoLabel: `Beli ${buyQty} Gratis ${freeQty}`, hasPromoPrice: false };
    }
    default:
      return { ...base, promoPrice: rec.sell_price, discountPct: 0, promoLabel: 'Promo Spesial', hasPromoPrice: false };
  }
}

function generateCaption(data: PosterData): string {
  const selisih = data.normalPrice - data.promoPrice;
  const lines = [
    `🍋 PROMO ${data.storeName.toUpperCase()}!`,
    ``,
    data.productName,
    data.hasPromoPrice
      ? `${fRp(data.normalPrice)} → ${fRp(data.promoPrice)}`
      : `${fRp(data.normalPrice)} — ${data.promoLabel}`,
    ``,
    data.hasPromoPrice && selisih > 0
      ? `Hemat ${fRp(selisih)} per pcs!`
      : `${data.promoLabel}!`,
    `Stok tinggal ${data.stock} pcs — buruan! 🔥`,
    ``,
    `📍 ${data.storeName}`,
    `#promo${data.storeSlug} #promohariini #${data.productSlug}`,
  ];
  return lines.join('\n');
}

// ─── Poster Layout ────────────────────────────────────────────────────────────
// All inline styles, hex colors hardcoded, px units — for reliable html2canvas rendering

function PosterLayout({ data }: { data: PosterData }) {
  return (
    <div
      style={{
        width: '390px',
        fontFamily: 'Inter, system-ui, sans-serif',
        background: '#CC0000',
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px 16px',
          background: '#CC0000',
        }}
      >
        {/* Logo + Store name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: '0' as unknown as number,
            }}
          >
            <span
              style={{
                color: '#CC0000',
                fontWeight: '900',
                fontSize: '15px',
                letterSpacing: '-0.5px',
                lineHeight: '1',
              }}
            >
              SM
            </span>
          </div>
          <div>
            <div
              style={{
                color: 'white',
                fontWeight: '800',
                fontSize: '17px',
                lineHeight: '1.1',
                letterSpacing: '0.5px',
              }}
            >
              {data.storeName.toUpperCase()}
            </div>
            <div
              style={{
                color: 'rgba(255,255,255,0.75)',
                fontSize: '10px',
                marginTop: '2px',
                fontWeight: '500',
              }}
            >
              Minimarket Terpercaya
            </div>
          </div>
        </div>

        {/* SPECIAL OFFER badge */}
        <div
          style={{
            background: 'white',
            borderRadius: '20px',
            padding: '7px 14px',
          }}
        >
          <span
            style={{
              color: '#CC0000',
              fontWeight: '800',
              fontSize: '10px',
              letterSpacing: '1.2px',
            }}
          >
            SPECIAL OFFER
          </span>
        </div>
      </div>

      {/* ── Photo area ── */}
      <div
        style={{
          margin: '0 24px',
          background: '#AA0000',
          borderRadius: '10px',
          height: '200px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Corner brackets */}
        <div style={{ position: 'absolute', top: '14px', left: '14px', width: '22px', height: '22px', borderTop: '3px solid rgba(255,255,255,0.6)', borderLeft: '3px solid rgba(255,255,255,0.6)' }} />
        <div style={{ position: 'absolute', top: '14px', right: '14px', width: '22px', height: '22px', borderTop: '3px solid rgba(255,255,255,0.6)', borderRight: '3px solid rgba(255,255,255,0.6)' }} />
        <div style={{ position: 'absolute', bottom: '14px', left: '14px', width: '22px', height: '22px', borderBottom: '3px solid rgba(255,255,255,0.6)', borderLeft: '3px solid rgba(255,255,255,0.6)' }} />
        <div style={{ position: 'absolute', bottom: '14px', right: '14px', width: '22px', height: '22px', borderBottom: '3px solid rgba(255,255,255,0.6)', borderRight: '3px solid rgba(255,255,255,0.6)' }} />

        {/* Placeholder */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '44px', lineHeight: '1', marginBottom: '10px' }}>📷</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', fontWeight: '500' }}>
            Tambah foto produk
          </div>
        </div>
      </div>

      {/* ── White price section ── */}
      <div
        style={{
          background: 'white',
          marginTop: '16px',
          padding: '28px 24px 20px',
          position: 'relative',
        }}
      >
        {/* Discount badge — floating at top-right, overlapping red area */}
        {data.discountPct > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '-34px',
              right: '20px',
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: '#CC0000',
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              border: '3px solid white',
            }}
          >
            <span style={{ fontWeight: '900', fontSize: '22px', lineHeight: '1' }}>
              {Math.round(data.discountPct)}%
            </span>
            <span style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '1px', marginTop: '1px' }}>
              OFF
            </span>
          </div>
        )}

        {/* Product name — Playfair Display italic bold */}
        <h2
          style={{
            fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
            fontStyle: 'italic',
            fontWeight: '700',
            fontSize: '22px',
            color: '#1a1a1a',
            margin: '0 0 14px',
            lineHeight: '1.3',
            paddingRight: data.discountPct > 0 ? '50px' : '0',
          }}
        >
          {data.productName}
        </h2>

        {/* Prices */}
        <div style={{ marginBottom: '16px' }}>
          {data.hasPromoPrice ? (
            <>
              <div
                style={{
                  color: '#9ca3af',
                  fontSize: '15px',
                  textDecoration: 'line-through',
                  marginBottom: '4px',
                  fontWeight: '500',
                }}
              >
                {fRp(data.normalPrice)}
              </div>
              <div
                style={{
                  color: '#CC0000',
                  fontWeight: '800',
                  fontSize: '34px',
                  lineHeight: '1',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                {fRp(data.promoPrice)}
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  color: '#CC0000',
                  fontWeight: '800',
                  fontSize: '22px',
                  lineHeight: '1.2',
                  marginBottom: '4px',
                }}
              >
                {data.promoLabel}
              </div>
              <div
                style={{
                  color: '#1a1a1a',
                  fontWeight: '700',
                  fontSize: '28px',
                  lineHeight: '1',
                }}
              >
                {fRp(data.normalPrice)}
              </div>
            </>
          )}
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
          <div
            style={{
              background: '#FEF5F5',
              borderRadius: '20px',
              padding: '5px 12px',
            }}
          >
            <span style={{ color: '#CC0000', fontSize: '12px', fontWeight: '600' }}>
              Stok {data.stock} pcs
            </span>
          </div>
          <div
            style={{
              background: '#FEF5F5',
              borderRadius: '20px',
              padding: '5px 12px',
            }}
          >
            <span style={{ color: '#CC0000', fontSize: '12px', fontWeight: '600' }}>
              Promo Hari Ini
            </span>
          </div>
          {data.promoLabel && (
            <div
              style={{
                background: '#FEF5F5',
                borderRadius: '20px',
                padding: '5px 12px',
              }}
            >
              <span style={{ color: '#CC0000', fontSize: '12px', fontWeight: '600' }}>
                {data.promoLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          background: '#CC0000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: '0' as unknown as number,
            }}
          >
            <span style={{ color: 'white', fontWeight: '900', fontSize: '9px' }}>SM</span>
          </div>
          <span style={{ color: 'white', fontWeight: '600', fontSize: '13px' }}>
            {data.storeName}
          </span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>
          {data.storeSlug}.id
        </span>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function PromoPostModal({
  rec,
  storeName,
  onClose,
}: {
  rec: RecForPoster;
  storeName: string;
  onClose: () => void;
}) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Preload Playfair Display font for poster rendering
  useEffect(() => {
    const existing = document.querySelector('link[data-promo-font]');
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-promo-font', '1');
    link.href =
      'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,900;1,700&family=Inter:wght@400;500;600;700;800;900&display=swap';
    document.head.appendChild(link);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const posterData = computePosterData(rec, storeName);
  const caption = generateCaption(posterData);

  const downloadPoster = async () => {
    if (!captureRef.current || downloading) return;
    setDownloading(true);
    try {
      // Wait for all fonts to finish loading
      await document.fonts.ready;

      const html2canvas = (await import('html2canvas')).default;
      const el = captureRef.current;

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        imageTimeout: 0,
        removeContainer: true,
        width: 390,
        height: el.offsetHeight,
        windowWidth: 390,
      });

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `promo-${posterData.productSlug}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers that block clipboard
      const ta = document.createElement('textarea');
      ta.value = caption;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const shareWA = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(caption)}`;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <>
      {/* ── Hidden capture div — fixed off-screen, always 390px wide ── */}
      <div
        ref={captureRef}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '0',
          width: '390px',
          zIndex: -1,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <PosterLayout data={posterData} />
      </div>

      {/* ── Modal overlay ── */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.65)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-white rounded-2xl w-full max-w-[460px] max-h-[90vh] overflow-y-auto shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <div>
              <h2 className="font-bold text-gray-800 text-base">Buat Poster Promo</h2>
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[300px]">{rec.product_name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Poster preview */}
          <div className="px-4 py-5 bg-gray-100 flex justify-center">
            <div style={{ width: '390px', maxWidth: '100%' }}>
              <PosterLayout data={posterData} />
            </div>
          </div>

          {/* Caption section */}
          <div className="p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Caption Siap Pakai</p>
            <textarea
              readOnly
              value={caption}
              className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3 resize-none focus:outline-none"
              rows={11}
            />

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={copyCaption}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Copy className="w-3.5 h-3.5 flex-shrink-0" />
                {copied ? 'Tersalin!' : 'Salin'}
              </button>
              <button
                onClick={shareWA}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-xl transition-colors"
              >
                <span className="text-sm leading-none">💬</span>
                Share WA
              </button>
              <button
                onClick={downloadPoster}
                disabled={downloading}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-xs font-medium rounded-xl transition-colors"
              >
                {downloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                ) : (
                  <Download className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                {downloading ? 'Proses...' : 'Download'}
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center">
              PNG resolusi tinggi (3× — setara 1170px)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
