'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Download, Copy, MessageCircle, Loader2 } from 'lucide-react';

export interface PromoPostData {
  productName: string;
  normalPrice: number;
  promoPrice: number;
  discountPct: number;
  stock: number;
  storeName: string;
  promoType: string;
}

interface Props {
  data: PromoPostData;
  onClose: () => void;
}

const formatRp = (n: number) =>
  'Rp ' + Math.round(n).toLocaleString('id-ID');

const slugify = (s: string) =>
  s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

export default function PromoPostModal({ data, onClose }: Props) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    productName,
    normalPrice,
    promoPrice,
    discountPct,
    stock,
    storeName,
  } = data;

  const selisih = normalPrice - promoPrice;
  const storeSlug = slugify(storeName);
  const productSlug = slugify(productName);

  const caption = `🔥 PROMO ${storeName.toUpperCase()}!

${productName}
${formatRp(normalPrice)} → ${formatRp(promoPrice)}

Hemat ${formatRp(selisih)}!
Stok tinggal ${stock} pcs — buruan! 🔥

📍 ${storeName}
#promo${storeSlug} #promohariini #${productSlug}`;

  // Preload Google Fonts
  useEffect(() => {
    const id = 'promo-poster-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,900;1,700&family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  const handleDownload = async () => {
    if (!posterRef.current) return;
    setDownloading(true);
    try {
      await document.fonts.ready;

      // Render off-screen clone with fixed width
      const clone = posterRef.current.cloneNode(true) as HTMLDivElement;
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      clone.style.top = '0';
      clone.style.width = '390px';
      clone.style.removeProperty('transform');
      document.body.appendChild(clone);

      const h2c = (await import('html2canvas')).default;
      const canvas = await h2c(clone, {
        scale: 3,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        imageTimeout: 0,
        removeContainer: true,
        width: 390,
        height: clone.offsetHeight,
        windowWidth: 390,
      });

      document.body.removeChild(clone);

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const a = document.createElement('a');
      a.download = `promo-${productSlug}-${Date.now()}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error('Download gagal:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(caption)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Poster Promo</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Poster */}
        <div className="px-5 pt-4">
          <div
            ref={posterRef}
            style={{
              width: '100%',
              fontFamily: 'Inter, sans-serif',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            }}
          >
            {/* Top red area */}
            <div
              style={{
                background: '#CC0000',
                padding: '20px 20px 0',
              }}
            >
              {/* Header: logo + nama toko + badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Logo circle */}
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 700,
                        fontSize: '15px',
                        color: '#CC0000',
                        letterSpacing: '-0.5px',
                      }}
                    >
                      {storeName.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 700,
                      fontSize: '16px',
                      color: '#ffffff',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {storeName.toUpperCase()}
                  </span>
                </div>
                {/* Badge */}
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '20px',
                    padding: '5px 12px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 700,
                      fontSize: '10px',
                      color: '#CC0000',
                      letterSpacing: '1px',
                    }}
                  >
                    SPECIAL OFFER
                  </span>
                </div>
              </div>

              {/* Product image placeholder */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  height: '200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Corner brackets */}
                {[
                  { top: '8px', left: '8px', borderTop: '3px solid #CC0000', borderLeft: '3px solid #CC0000', borderRadius: '4px 0 0 0' },
                  { top: '8px', right: '8px', borderTop: '3px solid #CC0000', borderRight: '3px solid #CC0000', borderRadius: '0 4px 0 0' },
                  { bottom: '8px', left: '8px', borderBottom: '3px solid #CC0000', borderLeft: '3px solid #CC0000', borderRadius: '0 0 0 4px' },
                  { bottom: '8px', right: '8px', borderBottom: '3px solid #CC0000', borderRight: '3px solid #CC0000', borderRadius: '0 0 4px 0' },
                ].map((s, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      width: '18px',
                      height: '18px',
                      ...s,
                    }}
                  />
                ))}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '36px',
                      marginBottom: '6px',
                    }}
                  >
                    🛍️
                  </div>
                  <span
                    style={{
                      fontFamily: 'Playfair Display, Georgia, serif',
                      fontWeight: 900,
                      fontStyle: 'italic',
                      fontSize: '18px',
                      color: '#1a1a1a',
                      textAlign: 'center',
                      display: 'block',
                      padding: '0 16px',
                      lineHeight: 1.3,
                    }}
                  >
                    {productName}
                  </span>
                </div>

                {/* Discount badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: '#CC0000',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 700,
                      fontSize: '14px',
                      color: '#ffffff',
                      lineHeight: 1,
                    }}
                  >
                    {Math.round(discountPct)}%
                  </span>
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 500,
                      fontSize: '8px',
                      color: '#ffffff',
                      lineHeight: 1,
                      marginTop: '2px',
                    }}
                  >
                    OFF
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom white area */}
            <div style={{ background: '#ffffff', padding: '18px 20px 0' }}>
              {/* Normal price (strikethrough) */}
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '14px',
                  color: '#999999',
                  textDecoration: 'line-through',
                  marginBottom: '4px',
                }}
              >
                {formatRp(normalPrice)}
              </div>

              {/* Promo price */}
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 700,
                  fontSize: '36px',
                  color: '#CC0000',
                  lineHeight: 1,
                  marginBottom: '14px',
                }}
              >
                {formatRp(promoPrice)}
              </div>

              {/* Tags row */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[
                  stock > 0 ? `Stok ${stock} pcs` : 'Stok terbatas',
                  'Hari ini',
                  `Hemat ${formatRp(selisih)}`,
                ].map((tag) => (
                  <span
                    key={tag}
                    style={{
                      background: '#FEF5F5',
                      color: '#CC0000',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      fontSize: '11px',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                background: '#CC0000',
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 700,
                      fontSize: '9px',
                      color: '#CC0000',
                    }}
                  >
                    {storeName.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: '#ffffff',
                  }}
                >
                  {storeName}
                </span>
              </div>
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                {storeSlug.toLowerCase()}.id
              </span>
            </div>
          </div>
        </div>

        {/* Caption */}
        <div className="px-5 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-1.5">Caption otomatis</p>
          <pre
            className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed"
          >
            {caption}
          </pre>
        </div>

        {/* Action buttons */}
        <div className="px-5 py-4 flex flex-col gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {downloading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyiapkan...</>
              : <><Download className="w-4 h-4" /> Download PNG</>
            }
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Tersalin!' : 'Salin Caption'}
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Share WA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
