'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Download, Copy, MessageCircle, Loader2, RotateCcw,
  Type, Eye, EyeOff, ChevronDown, ChevronUp,
  Save, FolderOpen, Trash2, Check, Maximize2, X,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PW = 390;
const PH = 560;
const HEADER_H  = 74;
const IMG_TOP   = HEADER_H;
const IMG_LEFT  = 10;
const IMG_W     = 370;
const IMG_H     = 220;
const FOOTER_H  = 52;
const FOOTER_TOP = PH - FOOTER_H;
const RED_BG_H   = IMG_TOP + IMG_H + 18;

// ─── Types ────────────────────────────────────────────────────────────────────

type ElId =
  | 'logo_circle'
  | 'store_name'
  | 'special_offer'
  | 'product_name'
  | 'normal_price'
  | 'promo_price'
  | 'tags';

interface PosterEl {
  id: ElId;
  label: string;
  x: number;       // px from poster left
  y: number;       // px from poster top
  w: number;       // px width (also height for logo_circle)
  fontSize: number;
  fontFamily: 'inter' | 'playfair';
  bold: boolean;
  italic: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  visible: boolean;
}

interface BadgePos { xPct: number; yPct: number }

interface PosterConfig {
  primaryColor: string;
  bgBottomColor: string;
  storeName: string;
  productName: string;
  normalPrice: number;
  promoPrice: number;
  discountPct: number;
  stock: number;
  elements: PosterEl[];
  badgePos: BadgePos;
  showBadge: boolean;
  showNormalPrice: boolean;
  showTags: boolean;
  captionTemplate: string;
}

type LayoutOnly = Pick<PosterConfig,
  'primaryColor' | 'bgBottomColor' | 'elements' | 'badgePos' |
  'showBadge' | 'showNormalPrice' | 'showTags' | 'captionTemplate'>;

interface SavedTemplate { name: string; savedAt: string; layout: LayoutOnly }

interface DragState  { id: ElId; sx: number; sy: number; ox: number; oy: number }
interface ResizeState { id: ElId; sx: number; ow: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fontFace = (el: { fontFamily: string }) =>
  el.fontFamily === 'playfair' ? '"Playfair Display", Georgia, serif' : 'Inter, sans-serif';

/** "SAHARA MART" → "SM", "SAHARAMART" → "SA" */
const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

function buildCaption(cfg: PosterConfig) {
  const selisih = cfg.normalPrice - cfg.promoPrice;
  return cfg.captionTemplate
    .replace(/{storeName}/g,   cfg.storeName)
    .replace(/{productName}/g, cfg.productName)
    .replace(/{normalPrice}/g, fmtRp(cfg.normalPrice))
    .replace(/{promoPrice}/g,  fmtRp(cfg.promoPrice))
    .replace(/{selisih}/g,     fmtRp(selisih))
    .replace(/{stock}/g,       String(cfg.stock))
    .replace(/{storeSlug}/g,   slugify(cfg.storeName))
    .replace(/{productSlug}/g, slugify(cfg.productName));
}

// ─── Default config ───────────────────────────────────────────────────────────

const DEFAULT_ELEMENTS: PosterEl[] = [
  // Header elements — positioned with explicit px so html2canvas renders them identically
  {
    id: 'logo_circle', label: 'Logo (SM)', x: 20, y: 15, w: 44,
    fontSize: 15, fontFamily: 'inter', bold: true, italic: false,
    color: '#ffffff', align: 'center', visible: true,
  },
  {
    id: 'store_name', label: 'Nama Toko', x: 74, y: 29, w: 190,
    fontSize: 16, fontFamily: 'inter', bold: true, italic: false,
    color: '#ffffff', align: 'left', visible: true,
  },
  {
    id: 'special_offer', label: 'Badge "SPECIAL OFFER"', x: 298, y: 19, w: 74,
    fontSize: 10, fontFamily: 'inter', bold: true, italic: false,
    color: '#CC0000', align: 'center', visible: true,
  },
  // Content elements
  {
    id: 'product_name', label: 'Nama Produk', x: 10, y: 152, w: 370,
    fontSize: 20, fontFamily: 'playfair', bold: true, italic: true,
    color: '#1a1a1a', align: 'center', visible: true,
  },
  {
    id: 'normal_price', label: 'Harga Normal (coret)', x: 20, y: 318, w: 350,
    fontSize: 14, fontFamily: 'inter', bold: false, italic: false,
    color: '#999999', align: 'center', visible: true,
  },
  {
    id: 'promo_price', label: 'Harga Promo', x: 10, y: 338, w: 370,
    fontSize: 38, fontFamily: 'inter', bold: true, italic: false,
    color: '#CC0000', align: 'center', visible: true,
  },
  {
    id: 'tags', label: 'Tags Stok & Hemat', x: 10, y: 412, w: 370,
    fontSize: 11, fontFamily: 'inter', bold: true, italic: false,
    color: '#CC0000', align: 'left', visible: true,
  },
];

const DEFAULT_CONFIG: PosterConfig = {
  primaryColor: '#CC0000',
  bgBottomColor: '#ffffff',
  storeName: 'Nama Toko',
  productName: 'Nama Produk',
  normalPrice: 10000,
  promoPrice: 8500,
  discountPct: 15,
  stock: 50,
  elements: DEFAULT_ELEMENTS,
  badgePos: { xPct: 85, yPct: 5 },
  showBadge: true,
  showNormalPrice: true,
  showTags: true,
  captionTemplate:
    '🔥 PROMO {storeName}!\n\n{productName}\n{normalPrice} → {promoPrice}\n\nHemat {selisih}!\nStok tinggal {stock} pcs — buruan! 🔥\n\n📍 {storeName}\n#{storeSlug} #promohariini #{productSlug}',
};

// ─── Poster Render ────────────────────────────────────────────────────────────
// Rendered at fixed PW×PH px — NO transform inside this component.
// Scaling is done ONLY by the parent wrapper outside.

interface PosterRenderProps {
  cfg: PosterConfig;
  exportId?: string;
  selectedId?: ElId | null;
  onSelectEl?: (id: ElId) => void;
  onDragStart?: (id: ElId, sx: number, sy: number) => void;
  onResizeStart?: (id: ElId, sx: number) => void;
  interactive?: boolean;
}

function PosterRender({ cfg, exportId, selectedId, onSelectEl, onDragStart, onResizeStart, interactive = false }: PosterRenderProps) {
  const { primaryColor, bgBottomColor, storeName, productName,
          normalPrice, promoPrice, discountPct, stock,
          elements, badgePos, showBadge, showNormalPrice, showTags } = cfg;
  const initials = getInitials(storeName);

  const renderEl = (el: PosterEl) => {
    if (!el.visible) return null;
    if (el.id === 'normal_price' && !showNormalPrice) return null;
    if (el.id === 'tags' && !showTags) return null;

    const isSelected = interactive && selectedId === el.id;

    const wrapStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${el.x}px`,
      top: `${el.y}px`,
      width: `${el.w}px`,
      cursor: interactive ? 'grab' : 'default',
      outline: isSelected ? '2px dashed rgba(79,70,229,0.9)' : 'none',
      outlineOffset: '3px',
      borderRadius: '3px',
      zIndex: isSelected ? 20 : 5,
      userSelect: 'none',
    };

    const startDrag = (clientX: number, clientY: number) => {
      onSelectEl?.(el.id);
      onDragStart?.(el.id, clientX, clientY);
    };

    const mouseHandlers = interactive ? {
      onMouseDown: (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); startDrag(e.clientX, e.clientY); },
    } : {};

    const touchHandlers = interactive ? {
      onTouchStart: (e: React.TouchEvent) => { e.stopPropagation(); startDrag(e.touches[0].clientX, e.touches[0].clientY); },
    } : {};

    // Resize handle (right edge, center)
    const resizeHandle = isSelected && el.id !== 'logo_circle' ? (
      <div
        style={{
          position: 'absolute', right: '-7px', top: '50%',
          width: '14px', height: '14px', marginTop: '-7px',
          background: '#4f46e5', borderRadius: '3px',
          cursor: 'ew-resize', zIndex: 30,
          border: '2px solid #fff',
        }}
        onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onResizeStart?.(el.id, e.clientX); }}
        onTouchStart={e => { e.stopPropagation(); onResizeStart?.(el.id, e.touches[0].clientX); }}
      />
    ) : null;

    // ── LOGO CIRCLE ──
    if (el.id === 'logo_circle') {
      return (
        <div key={el.id} style={wrapStyle} {...mouseHandlers} {...touchHandlers}>
          <div
            className="poster-logo-circle"
            style={{
              width: `${el.w}px`,
              height: `${el.w}px`,
              borderRadius: '50%',
              background: primaryColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: `${el.fontSize}px`, color: el.color, lineHeight: 1 }}>
              {initials}
            </span>
          </div>
          {isSelected && (
            <div
              style={{
                position: 'absolute', right: '-7px', bottom: '-7px',
                width: '14px', height: '14px',
                background: '#4f46e5', borderRadius: '3px',
                cursor: 'nwse-resize', zIndex: 30,
                border: '2px solid #fff',
              }}
              onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onResizeStart?.(el.id, e.clientX); }}
              onTouchStart={e => { e.stopPropagation(); onResizeStart?.(el.id, e.touches[0].clientX); }}
            />
          )}
        </div>
      );
    }

    // ── SPECIAL OFFER BADGE ──
    if (el.id === 'special_offer') {
      return (
        <div key={el.id} style={wrapStyle} {...mouseHandlers} {...touchHandlers}>
          <div
            className="poster-special-offer"
            style={{
              width: `${el.w}px`,
              height: '36px',
              background: '#ffffff',
              borderRadius: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: `${el.fontSize}px`, color: el.color, letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>
              SPECIAL OFFER
            </span>
          </div>
          {resizeHandle}
        </div>
      );
    }

    // ── TAGS ──
    if (el.id === 'tags') {
      return (
        <div key={el.id} style={wrapStyle} {...mouseHandlers} {...touchHandlers}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              stock > 0 ? `Stok ${stock} pcs` : 'Stok terbatas',
              'Hari ini',
              `Hemat ${fmtRp(normalPrice - promoPrice)}`,
            ].map(tag => (
              <span key={tag} style={{
                background: '#FEF5F5', color: el.color,
                borderRadius: '6px', padding: '4px 10px',
                fontFamily: fontFace(el), fontWeight: 600, fontSize: `${el.fontSize}px`,
              }}>
                {tag}
              </span>
            ))}
          </div>
          {resizeHandle}
        </div>
      );
    }

    // ── TEXT ELEMENTS (store_name, product_name, normal_price, promo_price) ──
    return (
      <div key={el.id} style={wrapStyle} {...mouseHandlers} {...touchHandlers}>
        <div style={{
          fontFamily: fontFace(el),
          fontSize: `${el.fontSize}px`,
          fontWeight: el.bold ? 700 : 400,
          fontStyle: el.italic ? 'italic' : 'normal',
          color: el.color,
          textAlign: el.align,
          lineHeight: 1.35,
          textDecoration: el.id === 'normal_price' ? 'line-through' : 'none',
          whiteSpace: el.id === 'store_name' ? 'nowrap' : 'normal',
        }}>
          {el.id === 'store_name'    ? storeName.toUpperCase()
           : el.id === 'product_name' ? productName
           : el.id === 'normal_price' ? fmtRp(normalPrice)
           : fmtRp(promoPrice)}
        </div>
        {resizeHandle}
      </div>
    );
  };

  return (
    // Fixed PW×PH — NEVER put transform here
    <div
      id={exportId}
      style={{ position: 'relative', width: `${PW}px`, height: `${PH}px`, overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}
      onClick={interactive ? (e) => { e.stopPropagation(); } : undefined}
    >
      {/* Background layers — purely structural */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${RED_BG_H}px`, background: primaryColor }} />
      <div style={{ position: 'absolute', top: `${RED_BG_H}px`, left: 0, width: '100%', height: `${FOOTER_TOP - RED_BG_H}px`, background: bgBottomColor }} />
      <div style={{ position: 'absolute', top: `${FOOTER_TOP}px`, left: 0, width: '100%', height: `${FOOTER_H}px`, background: primaryColor }} />

      {/* Image box — structural, fixed */}
      <div style={{
        position: 'absolute',
        top: `${IMG_TOP}px`, left: `${IMG_LEFT}px`,
        width: `${IMG_W}px`, height: `${IMG_H}px`,
        background: '#ffffff', borderRadius: '12px', overflow: 'hidden',
      }}>
        {[
          { top: '8px', left: '8px',   borderTop: `3px solid ${primaryColor}`,    borderLeft:   `3px solid ${primaryColor}`,  borderRadius: '4px 0 0 0' },
          { top: '8px', right: '8px',  borderTop: `3px solid ${primaryColor}`,    borderRight:  `3px solid ${primaryColor}`,  borderRadius: '0 4px 0 0' },
          { bottom: '8px', left: '8px',  borderBottom: `3px solid ${primaryColor}`, borderLeft: `3px solid ${primaryColor}`,  borderRadius: '0 0 0 4px' },
          { bottom: '8px', right: '8px', borderBottom: `3px solid ${primaryColor}`, borderRight:`3px solid ${primaryColor}`,  borderRadius: '0 0 4px 0' },
        ].map((s, i) => <div key={i} style={{ position: 'absolute', width: '18px', height: '18px', ...s }} />)}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <span style={{ fontSize: '48px' }}>🛍️</span>
        </div>
        {/* Discount badge — positioned INSIDE image box, relative to it */}
        {showBadge && (
          <div style={{
            position: 'absolute',
            left: `${badgePos.xPct}%`, top: `${badgePos.yPct}%`,
            width: '58px', height: '58px', borderRadius: '50%',
            background: primaryColor,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            transform: 'translate(-50%, 0)',
          }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '15px', color: '#fff', lineHeight: 1 }}>
              {Math.round(discountPct)}%
            </span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: '8px', color: '#fff', lineHeight: 1, marginTop: '2px' }}>
              OFF
            </span>
          </div>
        )}
      </div>

      {/* Footer — structural, explicit px positions, NO flexbox centering */}
      <div style={{
        position: 'absolute', top: `${FOOTER_TOP}px`, left: 0,
        width: `${PW}px`, height: `${FOOTER_H}px`,
      }}>
        {/* Footer logo */}
        <div style={{
          position: 'absolute', left: '20px', top: '13px',
          width: '26px', height: '26px', borderRadius: '50%',
          background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '9px', color: primaryColor }}>
            {initials}
          </span>
        </div>
        {/* Footer store name */}
        <div style={{
          position: 'absolute', left: '54px', top: '17px',
          fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '13px', color: '#fff',
        }}>
          {storeName}
        </div>
        {/* Footer domain */}
        <div style={{
          position: 'absolute', right: '20px', top: '19px',
          fontFamily: 'Inter, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.7)',
        }}>
          {slugify(storeName)}.id
        </div>
      </div>

      {/* All draggable elements rendered last (highest z-index) */}
      {elements.map(el => renderEl(el))}
    </div>
  );
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function Section({ label, children, defaultOpen = true }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700 transition-colors">
        {label}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DesainPromoPage() {
  const { id: storeId } = useParams() as { id: string };
  const searchParams   = useSearchParams();
  const router         = useRouter();
  const supabaseRef    = useRef(createClient());
  const supabase       = supabaseRef.current;

  const [cfg, setCfg]               = useState<PosterConfig>(DEFAULT_CONFIG);
  const [selectedId, setSelectedId] = useState<ElId | null>(null);
  const [drag, setDrag]             = useState<DragState | null>(null);
  const [resize, setResize]         = useState<ResizeState | null>(null);
  const [scale, setScale]           = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied]         = useState(false);
  const [showCaptionEdit, setShowCaptionEdit] = useState(false);
  const [templates, setTemplates]   = useState<SavedTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [savedMsg, setSavedMsg]     = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const containerRef   = useRef<HTMLDivElement>(null);
  const prefillApplied = useRef(false);
  const EXPORT_ID      = 'poster-export-hidden';

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const patchCfg = useCallback((p: Partial<PosterConfig>) =>
    setCfg(prev => ({ ...prev, ...p })), []);

  const patchEl = useCallback((id: ElId, p: Partial<PosterEl>) =>
    setCfg(prev => ({
      ...prev,
      elements: prev.elements.map(e => e.id === id ? { ...e, ...p } : e),
    })), []);

  const getEl = (id: ElId) => cfg.elements.find(e => e.id === id)!;
  const selEl = selectedId ? getEl(selectedId) : null;

  // ── Responsive preview scale ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? PW;
      setScale(Math.min(1, w / PW));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('stores').select('name').eq('id', storeId).single()
      .then(({ data }) => { if (data?.name) patchCfg({ storeName: data.name }); });

    const fontId = 'desain-promo-fonts';
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId; link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,900;1,700&family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
    try {
      const raw = localStorage.getItem(`poster_templates_${storeId}`);
      if (raw) setTemplates(JSON.parse(raw));
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Pre-fill from URL params ──────────────────────────────────────────────
  useEffect(() => {
    if (prefillApplied.current) return;
    const productName  = searchParams.get('product_name');
    const sellPrice    = searchParams.get('sell_price');
    const discPctParam = searchParams.get('discount_pct');
    const stockParam   = searchParams.get('stock');
    if (!productName && !sellPrice) return;
    prefillApplied.current = true;

    const sell    = sellPrice    ? parseFloat(sellPrice)    : 0;
    const discPct = discPctParam ? parseFloat(discPctParam) : 10;
    const promo   = sell * (1 - discPct / 100);

    // Apply saved default template layout
    try {
      const raw = localStorage.getItem(`poster_default_template_${storeId}`);
      if (raw) {
        const layout: LayoutOnly = JSON.parse(raw);
        setCfg(prev => ({
          ...prev, ...layout,
          storeName: prev.storeName,
          ...(productName ? { productName }    : {}),
          ...(sell > 0    ? { normalPrice: sell, promoPrice: Math.round(promo), discountPct: discPct } : {}),
          ...(stockParam  ? { stock: parseInt(stockParam) || 0 } : {}),
        }));
        router.replace(`/toko/${storeId}/desain-promo`);
        return;
      }
    } catch { /* ignore */ }

    patchCfg({
      ...(productName ? { productName }    : {}),
      ...(sell > 0    ? { normalPrice: sell, promoPrice: Math.round(promo), discountPct: discPct } : {}),
      ...(stockParam  ? { stock: parseInt(stockParam) || 0 } : {}),
    });
    router.replace(`/toko/${storeId}/desain-promo`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Drag ─────────────────────────────────────────────────────────────────────
  const handleDragStart = (id: ElId, sx: number, sy: number) => {
    const el = cfg.elements.find(e => e.id === id)!;
    setDrag({ id, sx, sy, ox: el.x, oy: el.y });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (clientX: number, clientY: number) => {
      const dx = (clientX - drag.sx) / scale;
      const dy = (clientY - drag.sy) / scale;
      const el = cfg.elements.find(e => e.id === drag.id)!;
      const maxY = el.id === 'logo_circle' ? PH - el.w : PH - 20;
      patchEl(drag.id, {
        x: clamp(drag.ox + dx, 0, PW - el.w),
        y: clamp(drag.oy + dy, 0, maxY),
      });
    };
    const onMM = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTM = (e: TouchEvent) => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onTM, { passive: false });
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onTM);
      window.removeEventListener('touchend',  onUp);
    };
  }, [drag, scale, cfg.elements, patchEl]);

  // ── Resize ───────────────────────────────────────────────────────────────────
  const handleResizeStart = (id: ElId, sx: number) => {
    const el = cfg.elements.find(e => e.id === id)!;
    setResize({ id, sx, ow: el.w });
  };

  useEffect(() => {
    if (!resize) return;
    const move = (clientX: number) => {
      const dx = (clientX - resize.sx) / scale;
      const minW = resize.id === 'logo_circle' ? 24 : 40;
      patchEl(resize.id, { w: Math.max(minW, Math.round(resize.ow + dx)) });
    };
    const onMM = (e: MouseEvent) => move(e.clientX);
    const onTM = (e: TouchEvent) => { e.preventDefault(); move(e.touches[0].clientX); };
    const onUp = () => setResize(null);
    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onTM, { passive: false });
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onTM);
      window.removeEventListener('touchend',  onUp);
    };
  }, [resize, scale, patchEl]);

  // ── Download PNG ─────────────────────────────────────────────────────────────
  // Captures the HIDDEN full-size element (no transform → 100% consistent with preview)
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await document.fonts.ready;
      const el = document.getElementById(EXPORT_ID);
      if (!el) { setDownloading(false); return; }

      const h2c = (await import('html2canvas')).default;
      const canvas = await h2c(el, {
        scale: 3,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        imageTimeout: 0,
        width: PW,
        height: PH,
        windowWidth: PW,
        onclone: (_clonedDoc: Document, clonedEl: HTMLElement) => {
          // Safety: ensure no stray transforms
          clonedEl.style.transform = 'none';
          clonedEl.style.width  = `${PW}px`;
          clonedEl.style.height = `${PH}px`;
          // Ensure logo circles have explicit dimensions
          clonedEl.querySelectorAll<HTMLElement>('.poster-logo-circle').forEach(el => {
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
          });
          // Ensure special offer badge keeps height
          clonedEl.querySelectorAll<HTMLElement>('.poster-special-offer').forEach(el => {
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
          });
        },
      } as Parameters<typeof h2c>[1]);

      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const a = document.createElement('a');
      a.download = `promo-${slugify(cfg.productName)}-${Date.now()}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error('Download gagal:', err);
    } finally {
      setDownloading(false);
    }
  };

  // ── Caption ───────────────────────────────────────────────────────────────────
  const caption = buildCaption(cfg);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleWhatsApp = () =>
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank');

  // ── Template save/load ────────────────────────────────────────────────────────
  const extractLayout = (): LayoutOnly => ({
    primaryColor:    cfg.primaryColor,
    bgBottomColor:   cfg.bgBottomColor,
    elements:        cfg.elements,
    badgePos:        cfg.badgePos,
    showBadge:       cfg.showBadge,
    showNormalPrice: cfg.showNormalPrice,
    showTags:        cfg.showTags,
    captionTemplate: cfg.captionTemplate,
  });

  const saveTemplates = (list: SavedTemplate[]) => {
    setTemplates(list);
    localStorage.setItem(`poster_templates_${storeId}`, JSON.stringify(list));
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim() || `Template ${new Date().toLocaleDateString('id-ID')}`;
    const tmpl: SavedTemplate = { name, savedAt: new Date().toISOString(), layout: extractLayout() };
    saveTemplates([tmpl, ...templates.filter(t => t.name !== name)].slice(0, 10));
    localStorage.setItem(`poster_default_template_${storeId}`, JSON.stringify(extractLayout()));
    setTemplateName('');
    setSavedMsg('Tersimpan!');
    setTimeout(() => setSavedMsg(''), 2000);
  };

  const applyPrimaryColor = (c: string) => {
    patchCfg({ primaryColor: c });
    patchEl('promo_price', { color: c });
    patchEl('tags',         { color: c });
    patchEl('special_offer',{ color: c });
  };

  const handleReset = () => {
    setCfg(prev => ({ ...DEFAULT_CONFIG, storeName: prev.storeName }));
    setSelectedId(null);
    prefillApplied.current = false;
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Hidden full-size poster for export — positioned off-screen, NO transform */}
      <div
        style={{ position: 'absolute', left: `-${PW + 200}px`, top: 0, width: `${PW}px`, height: `${PH}px`, pointerEvents: 'none', zIndex: -1 }}
        aria-hidden
      >
        <PosterRender cfg={cfg} exportId={EXPORT_ID} interactive={false} />
      </div>

      {/* Fullscreen preview modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowPreview(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-7 h-7" />
            </button>
            {/* Poster scaled to fit viewport */}
            <div style={{
              transform: `scale(${Math.min(1, (window.innerHeight * 0.85) / PH)})`,
              transformOrigin: 'top center',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}>
              <PosterRender cfg={cfg} interactive={false} />
            </div>
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PNG (HD 3×)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Desain Poster Promo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Klik elemen di poster → pilih & geser. Handle biru = resize lebar.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            <Maximize2 className="w-4 h-4" /> Preview
          </button>
          <button onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* ── LEFT PANEL ── */}
        <div className="space-y-3 order-2 lg:order-1" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>

          {/* Selected element editor */}
          {selEl ? (
            <div className="border-2 border-indigo-400 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-indigo-50 flex items-center gap-2">
                <Type className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-semibold text-indigo-700">{selEl.label}</span>
                <button onClick={() => patchEl(selEl.id, { visible: !selEl.visible })}
                  className={`ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${selEl.visible ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                  {selEl.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {selEl.visible ? 'Tampil' : 'Hidden'}
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`X — ${Math.round(selEl.x)}px`}>
                    <input type="range" min={0} max={PW - selEl.w} value={Math.round(selEl.x)}
                      onChange={e => patchEl(selEl.id, { x: parseInt(e.target.value) })}
                      className="w-full accent-indigo-600" />
                  </Field>
                  <Field label={`Y — ${Math.round(selEl.y)}px`}>
                    <input type="range" min={0} max={PH - 20} value={Math.round(selEl.y)}
                      onChange={e => patchEl(selEl.id, { y: parseInt(e.target.value) })}
                      className="w-full accent-indigo-600" />
                  </Field>
                </div>
                <Field label={`Lebar/Ukuran — ${selEl.w}px`}>
                  <input type="range" min={selEl.id === 'logo_circle' ? 24 : 40} max={PW} value={selEl.w}
                    onChange={e => patchEl(selEl.id, { w: parseInt(e.target.value) })}
                    className="w-full accent-indigo-600" />
                </Field>
                {selEl.id !== 'logo_circle' && selEl.id !== 'special_offer' && (
                  <>
                    <Field label={`Font — ${selEl.fontSize}px`}>
                      <input type="range" min={8} max={64} value={selEl.fontSize}
                        onChange={e => patchEl(selEl.id, { fontSize: parseInt(e.target.value) })}
                        className="w-full accent-indigo-600" />
                    </Field>
                    <Field label="Jenis Font">
                      <select value={selEl.fontFamily}
                        onChange={e => patchEl(selEl.id, { fontFamily: e.target.value as 'inter' | 'playfair' })}
                        className="input-field text-sm py-1.5">
                        <option value="inter">Inter (Sans-serif)</option>
                        <option value="playfair">Playfair Display (Serif)</option>
                      </select>
                    </Field>
                    <div className="flex gap-2">
                      <button onClick={() => patchEl(selEl.id, { bold: !selEl.bold })}
                        className={`flex-1 py-1.5 font-bold text-sm rounded-lg border transition-colors ${selEl.bold ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300'}`}>B</button>
                      <button onClick={() => patchEl(selEl.id, { italic: !selEl.italic })}
                        className={`flex-1 py-1.5 italic text-sm rounded-lg border transition-colors ${selEl.italic ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300'}`}>I</button>
                    </div>
                    <div className="flex gap-2">
                      {(['left', 'center', 'right'] as const).map(a => (
                        <button key={a} onClick={() => patchEl(selEl.id, { align: a })}
                          className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${selEl.align === a ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300'}`}>
                          {a === 'left' ? '⟵' : a === 'center' ? '↔' : '⟶'}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <Field label="Warna Teks">
                  <input type="color" value={selEl.color}
                    onChange={e => patchEl(selEl.id, { color: e.target.value })}
                    className="w-full h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
                </Field>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-gray-300 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-gray-400">
              <Type className="w-4 h-4" /> Klik elemen di poster untuk edit
            </div>
          )}

          <Section label="Data Produk">
            <Field label="Nama Produk">
              <input value={cfg.productName} onChange={e => patchCfg({ productName: e.target.value })} className="input-field text-sm py-2" />
            </Field>
            <Field label="Nama Toko">
              <input value={cfg.storeName} onChange={e => patchCfg({ storeName: e.target.value })} className="input-field text-sm py-2" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Harga Normal (Rp)">
                <input type="number" value={cfg.normalPrice}
                  onChange={e => { const n = parseFloat(e.target.value)||0; patchCfg({ normalPrice: n, promoPrice: Math.round(n*(1-cfg.discountPct/100)) }); }}
                  className="input-field text-sm py-2" />
              </Field>
              <Field label="Diskon (%)">
                <input type="number" min={0} max={99} value={cfg.discountPct}
                  onChange={e => { const d = parseFloat(e.target.value)||0; patchCfg({ discountPct: d, promoPrice: Math.round(cfg.normalPrice*(1-d/100)) }); }}
                  className="input-field text-sm py-2" />
              </Field>
            </div>
            <Field label={`Harga Promo = ${fmtRp(cfg.promoPrice)}`}>
              <input type="number" value={cfg.promoPrice}
                onChange={e => { const p = parseFloat(e.target.value)||0; patchCfg({ promoPrice: p, discountPct: cfg.normalPrice>0?Math.round((1-p/cfg.normalPrice)*1000)/10:0 }); }}
                className="input-field text-sm py-2" />
            </Field>
            <Field label="Stok">
              <input type="number" value={cfg.stock} onChange={e => patchCfg({ stock: parseInt(e.target.value)||0 })} className="input-field text-sm py-2" />
            </Field>
          </Section>

          <Section label="Warna & Elemen">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Warna Utama">
                <div className="flex gap-2">
                  <input type="color" value={cfg.primaryColor} onChange={e => applyPrimaryColor(e.target.value)}
                    className="w-10 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
                  <input value={cfg.primaryColor} onChange={e => applyPrimaryColor(e.target.value)}
                    className="input-field text-xs py-2 font-mono flex-1" maxLength={7} />
                </div>
              </Field>
              <Field label="Bg Bawah">
                <div className="flex gap-2">
                  <input type="color" value={cfg.bgBottomColor} onChange={e => patchCfg({ bgBottomColor: e.target.value })}
                    className="w-10 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5" />
                  <input value={cfg.bgBottomColor} onChange={e => patchCfg({ bgBottomColor: e.target.value })}
                    className="input-field text-xs py-2 font-mono flex-1" maxLength={7} />
                </div>
              </Field>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[{ l:'Merah',c:'#CC0000' },{ l:'Biru',c:'#0055AA' },{ l:'Hijau',c:'#007A3D' },{ l:'Ungu',c:'#6B21A8' },{ l:'Oranye',c:'#EA580C' }].map(({ l, c }) => (
                <button key={c} onClick={() => applyPrimaryColor(c)} title={l} style={{ background: c }}
                  className="w-7 h-7 rounded-full border-2 border-white shadow hover:scale-110 transition-transform" />
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-2">
              {/* Badge diskon controls */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Badge Diskon</span>
                <button onClick={() => patchCfg({ showBadge: !cfg.showBadge })}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${cfg.showBadge ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {cfg.showBadge ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {cfg.showBadge ? 'Tampil' : 'Hidden'}
                </button>
              </div>
              {cfg.showBadge && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`H. Posisi — ${Math.round(cfg.badgePos.xPct)}%`}>
                    <input type="range" min={5} max={95} value={Math.round(cfg.badgePos.xPct)}
                      onChange={e => patchCfg({ badgePos: { ...cfg.badgePos, xPct: parseInt(e.target.value) } })}
                      className="w-full accent-red-600" />
                  </Field>
                  <Field label={`V. Posisi — ${Math.round(cfg.badgePos.yPct)}%`}>
                    <input type="range" min={0} max={75} value={Math.round(cfg.badgePos.yPct)}
                      onChange={e => patchCfg({ badgePos: { ...cfg.badgePos, yPct: parseInt(e.target.value) } })}
                      className="w-full accent-red-600" />
                  </Field>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Harga Normal (coret)</span>
                <button onClick={() => patchCfg({ showNormalPrice: !cfg.showNormalPrice })}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${cfg.showNormalPrice ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {cfg.showNormalPrice ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {cfg.showNormalPrice ? 'Tampil' : 'Hidden'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Tags Stok & Hemat</span>
                <button onClick={() => patchCfg({ showTags: !cfg.showTags })}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${cfg.showTags ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {cfg.showTags ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {cfg.showTags ? 'Tampil' : 'Hidden'}
                </button>
              </div>
            </div>
          </Section>

          <Section label="Simpan Template" defaultOpen={false}>
            <p className="text-xs text-gray-500">
              Template tersimpan otomatis dipakai saat Buat Poster dari Rekomendasi Promo — hanya data produk yang diganti.
            </p>
            <div className="flex gap-2">
              <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                placeholder="Nama template..." className="input-field text-sm py-2 flex-1" />
              <button onClick={handleSaveTemplate}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                {savedMsg ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {savedMsg || 'Simpan'}
              </button>
            </div>
            {templates.length > 0 && (
              <div className="space-y-2 mt-1">
                {templates.map(t => (
                  <div key={t.name} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <FolderOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{t.name}</p>
                      <p className="text-[10px] text-gray-400">{new Date(t.savedAt).toLocaleDateString('id-ID')}</p>
                    </div>
                    <button onClick={() => setCfg(prev => ({ ...prev, ...t.layout }))}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0">Pakai</button>
                    <button onClick={() => saveTemplates(templates.filter(x => x.name !== t.name))}
                      className="text-gray-400 hover:text-red-500 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section label="Caption" defaultOpen={false}>
            <button onClick={() => setShowCaptionEdit(v => !v)} className="text-xs text-indigo-600 hover:underline">
              {showCaptionEdit ? 'Sembunyikan editor' : 'Edit template caption'}
            </button>
            {showCaptionEdit && (
              <textarea value={cfg.captionTemplate} onChange={e => patchCfg({ captionTemplate: e.target.value })}
                rows={8} className="input-field text-xs py-2 font-mono leading-relaxed w-full resize-none mt-2" />
            )}
            <pre className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {caption}
            </pre>
          </Section>
        </div>

        {/* ── RIGHT PANEL: Preview + Actions ── */}
        <div className="order-1 lg:order-2 space-y-4">
          {/* Preview wrapper: scales the poster via CSS transform on a wrapper div */}
          <div ref={containerRef} className="w-full">
            <div
              style={{ position: 'relative', height: `${PH * scale}px`, overflow: 'hidden', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}
              onClick={() => setSelectedId(null)}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left', width: `${PW}px` }}>
                <PosterRender
                  cfg={cfg}
                  interactive
                  selectedId={selectedId}
                  onSelectEl={setSelectedId}
                  onDragStart={handleDragStart}
                  onResizeStart={handleResizeStart}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="max-w-sm space-y-2">
            <button onClick={handleDownload} disabled={downloading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-semibold rounded-xl transition-colors">
              {downloading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyiapkan PNG...</>
                : <><Download className="w-4 h-4" /> Download PNG (HD 3×)</>}
            </button>
            <div className="flex gap-2">
              <button onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors">
                <Copy className="w-4 h-4" />{copied ? 'Tersalin!' : 'Salin Caption'}
              </button>
              <button onClick={handleWhatsApp}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors">
                <MessageCircle className="w-4 h-4" />Share WA
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
