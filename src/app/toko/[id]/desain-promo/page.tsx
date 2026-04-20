'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Printer, RotateCcw, Plus, Save, Upload, Trash2,
  Eye, EyeOff, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PEl {
  id: string;
  label: string;
  text: string;
  x: number;        // % poster width
  y: number;        // % poster height
  w: number;        // % poster width
  fontSize: number; // px at base 794px width
  color: string;
  bgColor: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  visible: boolean;
  strike: boolean;
  border: boolean;
  borderColor: string;
  padding: number;
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
}

interface ResizeWState {
  id: string;
  startX: number;
  origW: number;
}

interface Preset {
  name: string;
  elements: PEl[];
  bg: string;
  logoX: number;
  logoY: number;
  logoW: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const W = 794;  // A4 portrait at 96dpi
const H = 1123;

const clamp = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));

const INIT_ELS: PEl[] = [
  {
    id: 'store', label: 'Nama Toko',
    text: 'NAMA TOKO',
    x: 0, y: 0, w: 100, fontSize: 40,
    color: '#ffffff', bgColor: '#009fe3',
    bold: true, italic: false, align: 'center', visible: true,
    strike: false, border: false, borderColor: '#009fe3', padding: 14,
  },
  {
    id: 'tagline', label: 'Tagline Promo',
    text: '✦  PROMO SPESIAL  ✦',
    x: 0, y: 9, w: 100, fontSize: 16,
    color: '#1a1a1a', bgColor: '#FFD700',
    bold: true, italic: false, align: 'center', visible: true,
    strike: false, border: false, borderColor: '', padding: 8,
  },
  {
    id: 'product', label: 'Nama Produk',
    text: 'Nama Produk',
    x: 7, y: 34, w: 86, fontSize: 32,
    color: '#1a1a1a', bgColor: '',
    bold: true, italic: false, align: 'center', visible: true,
    strike: false, border: false, borderColor: '', padding: 0,
  },
  {
    id: 'old_p', label: 'Harga Lama',
    text: 'Rp 10.000',
    x: 20, y: 54, w: 60, fontSize: 22,
    color: '#999999', bgColor: '',
    bold: false, italic: false, align: 'center', visible: true,
    strike: true, border: false, borderColor: '', padding: 0,
  },
  {
    id: 'price', label: 'Harga Promo',
    text: 'Rp 8.500',
    x: 7, y: 62, w: 86, fontSize: 64,
    color: '#e8001c', bgColor: '',
    bold: true, italic: false, align: 'center', visible: true,
    strike: false, border: true, borderColor: '#e8001c', padding: 10,
  },
  {
    id: 'period', label: 'Periode Promo',
    text: 'Berlaku s/d 30 April 2026',
    x: 10, y: 82, w: 80, fontSize: 15,
    color: '#555555', bgColor: '',
    bold: false, italic: true, align: 'center', visible: true,
    strike: false, border: false, borderColor: '', padding: 0,
  },
];

const PRINT_CSS = `
@media print {
  * { visibility: hidden !important; }
  #poster-canvas, #poster-canvas * { visibility: visible !important; }
  #poster-canvas {
    position: fixed !important;
    left: 0 !important; top: 0 !important;
    width: 210mm !important; height: 297mm !important;
    transform: none !important;
    box-shadow: none !important;
  }
  @page { size: A4 portrait; margin: 0; }
}
`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DesainPromoPage() {
  const { id: storeId } = useParams() as { id: string };
  const supabase = createClient();

  const [els, setEls] = useState<PEl[]>(INIT_ELS);
  const [selId, setSelId] = useState<string | null>(null);
  const [bg, setBg] = useState('#fff8f8');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [lp, setLp] = useState({ x: 3, y: 16, w: 22 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resizeW, setResizeW] = useState<ResizeWState | null>(null);
  const [scale, setScale] = useState(0.52);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [toast, setToast] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.from('stores').select('name').eq('id', storeId).single().then(({ data }) => {
      if (data?.name) {
        setEls(prev => prev.map(e => e.id === 'store' ? { ...e, text: data.name.toUpperCase() } : e));
      }
    });
    try {
      const saved = localStorage.getItem(`poster_presets_${storeId}`);
      if (saved) setPresets(JSON.parse(saved));
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setScale(w / W);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // ─── Drag / Resize ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!drag && !resizeW) return;

    const onMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (drag) {
        const dx = (e.clientX - drag.startX) / rect.width * 100;
        const dy = (e.clientY - drag.startY) / rect.height * 100;
        if (drag.id === '__logo__') {
          setLp(p => ({ ...p, x: clamp(drag.origX + dx, 0, 100 - p.w), y: clamp(drag.origY + dy, 0, 95) }));
        } else {
          setEls(prev => prev.map(el => el.id === drag.id
            ? { ...el, x: clamp(drag.origX + dx, 0, 100 - el.w), y: clamp(drag.origY + dy, 0, 95) }
            : el));
        }
      }

      if (resizeW) {
        const dw = (e.clientX - resizeW.startX) / rect.width * 100;
        if (resizeW.id === '__logo__') {
          setLp(p => ({ ...p, w: clamp(resizeW.origW + dw, 5, 80) }));
        } else {
          setEls(prev => prev.map(el => el.id === resizeW.id
            ? { ...el, w: clamp(resizeW.origW + dw, 10, 100) }
            : el));
        }
      }
    };

    const onUp = () => { setDrag(null); setResizeW(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, resizeW]);

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const upd = (id: string, patch: Partial<PEl>) =>
    setEls(prev => prev.map(el => el.id === id ? { ...el, ...patch } : el));

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const startDrag = (e: React.MouseEvent, id: string, origX: number, origY: number) => {
    e.preventDefault();
    e.stopPropagation();
    setSelId(id);
    setDrag({ id, startX: e.clientX, startY: e.clientY, origX, origY });
  };

  const startResizeW = (e: React.MouseEvent, id: string, origW: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizeW({ id, startX: e.clientX, origW });
  };

  const handleReset = () => {
    setEls(INIT_ELS);
    setBg('#fff8f8');
    setSelId(null);
    showToast('Layout direset ke default');
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const p: Preset = { name: presetName.trim(), elements: els, bg, logoX: lp.x, logoY: lp.y, logoW: lp.w };
    const next = [...presets.filter(x => x.name !== p.name), p];
    setPresets(next);
    localStorage.setItem(`poster_presets_${storeId}`, JSON.stringify(next));
    setPresetName('');
    showToast('Preset disimpan');
  };

  const loadPreset = (p: Preset) => {
    setEls(p.elements);
    setBg(p.bg);
    setLp({ x: p.logoX, y: p.logoY, w: p.logoW });
    showToast(`"${p.name}" dimuat`);
  };

  const deletePreset = (name: string) => {
    const next = presets.filter(p => p.name !== name);
    setPresets(next);
    localStorage.setItem(`poster_presets_${storeId}`, JSON.stringify(next));
  };

  const sel = els.find(e => e.id === selId);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Desain Poster Promo</h1>
          <p className="text-sm text-gray-500">Drag elemen untuk memindahkan · Handle <span className="text-blue-500 font-medium">■</span> untuk resize</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
            <Printer className="w-4 h-4" /> Cetak Poster
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-start">

        {/* ── LEFT: Controls ─────────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 space-y-3 max-h-[85vh] overflow-y-auto pr-1">

          {/* Background color */}
          <div className="card p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Background Poster</p>
            <div className="flex items-center gap-2">
              <input type="color" value={bg} onChange={e => setBg(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border border-gray-200" />
              <span className="text-xs text-gray-400">{bg}</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {['#ffffff', '#fff8f8', '#fffbf0', '#f0f9ff', '#f5fff5', '#faf0ff'].map(c => (
                <button key={c} onClick={() => setBg(c)}
                  className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {/* Logo */}
          <div className="card p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Logo Toko</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = ev => setLogoUrl(ev.target?.result as string);
                r.readAsDataURL(f);
              }} />
            <button onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors">
              <Upload className="w-3.5 h-3.5" />
              {logoUrl ? 'Ganti Logo' : 'Upload Logo (.png/.jpg)'}
            </button>
            {logoUrl && (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="logo" className="h-12 object-contain mx-auto rounded" />
                <div>
                  <label className="text-xs text-gray-400">Ukuran: {lp.w}%</label>
                  <input type="range" min="5" max="60" value={lp.w}
                    onChange={e => setLp(p => ({ ...p, w: +e.target.value }))} className="w-full" />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {[{ l: 'Kiri', x: 2 }, { l: 'Tengah', x: 50 - lp.w / 2 }, { l: 'Kanan', x: 98 - lp.w }].map(pos => (
                    <button key={pos.l} onClick={() => setLp(p => ({ ...p, x: pos.x, y: 16 }))}
                      className="text-xs py-1 border border-gray-200 rounded hover:bg-gray-50">{pos.l}</button>
                  ))}
                </div>
                <button onClick={() => setLogoUrl(null)}
                  className="w-full text-xs text-red-400 hover:text-red-600 py-1">
                  Hapus Logo
                </button>
              </div>
            )}
          </div>

          {/* Elements list */}
          <div className="card p-3 space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Elemen</p>
              <button onClick={() => {
                const id = `el_${Date.now()}`;
                setEls(p => [...p, {
                  id, label: 'Teks Baru', text: 'Teks Baru',
                  x: 20, y: 50, w: 60, fontSize: 20,
                  color: '#1a1a1a', bgColor: '',
                  bold: false, italic: false, align: 'center', visible: true,
                  strike: false, border: false, borderColor: '', padding: 0,
                }]);
                setSelId(id);
              }} className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">
                <Plus className="w-3 h-3" /> Tambah
              </button>
            </div>
            {els.map(el => (
              <div key={el.id} onClick={() => setSelId(el.id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${selId === el.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                <button onClick={e => { e.stopPropagation(); upd(el.id, { visible: !el.visible }); }}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  {el.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-40" />}
                </button>
                <span className={`flex-1 truncate ${!el.visible ? 'text-gray-300' : 'text-gray-700'}`}>{el.label}</span>
                {!['store', 'product', 'price'].includes(el.id) && (
                  <button onClick={e => {
                    e.stopPropagation();
                    setEls(p => p.filter(x => x.id !== el.id));
                    if (selId === el.id) setSelId(null);
                  }} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Selected element editor */}
          {sel && (
            <div className="card p-3 space-y-2.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">✏ Edit: {sel.label}</p>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Teks</label>
                <textarea value={sel.text} rows={2}
                  onChange={e => upd(sel.id, { text: e.target.value })}
                  className="input-field text-sm w-full resize-none" />
              </div>

              <div>
                <label className="text-xs text-gray-400">Ukuran Font: {sel.fontSize}px</label>
                <input type="range" min="8" max="100" value={sel.fontSize}
                  onChange={e => upd(sel.id, { fontSize: +e.target.value })} className="w-full" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Warna Teks</label>
                  <input type="color" value={sel.color}
                    onChange={e => upd(sel.id, { color: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer border border-gray-200" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Background</label>
                  <div className="flex gap-1">
                    <input type="color" value={sel.bgColor || '#ffffff'}
                      onChange={e => upd(sel.id, { bgColor: e.target.value })}
                      className="flex-1 h-8 rounded cursor-pointer border border-gray-200" />
                    {sel.bgColor && (
                      <button onClick={() => upd(sel.id, { bgColor: '' })}
                        className="text-xs px-1.5 border border-gray-300 rounded hover:bg-gray-50">×</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Style toggles */}
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => upd(sel.id, { bold: !sel.bold })}
                  className={`px-2 py-1 rounded border text-xs font-bold ${sel.bold ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>B</button>
                <button onClick={() => upd(sel.id, { italic: !sel.italic })}
                  className={`px-2 py-1 rounded border text-xs italic ${sel.italic ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>I</button>
                <button onClick={() => upd(sel.id, { strike: !sel.strike })}
                  className={`px-2 py-1 rounded border text-xs line-through ${sel.strike ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>S</button>
                {(['left', 'center', 'right'] as const).map(a => (
                  <button key={a} onClick={() => upd(sel.id, { align: a })}
                    className={`px-2 py-1 rounded border ${sel.align === a ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {a === 'left' ? <AlignLeft className="w-3 h-3" /> : a === 'center' ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
                  </button>
                ))}
                <button onClick={() => upd(sel.id, { border: !sel.border })}
                  className={`px-2 py-1 rounded border text-xs ${sel.border ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>▢</button>
              </div>

              {sel.border && (
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Warna Border</label>
                  <input type="color" value={sel.borderColor || '#000000'}
                    onChange={e => upd(sel.id, { borderColor: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer border border-gray-200" />
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400">Lebar: {Math.round(sel.w)}%</label>
                <input type="range" min="10" max="100" value={sel.w}
                  onChange={e => upd(sel.id, { w: +e.target.value })} className="w-full" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400">X: {Math.round(sel.x)}%</label>
                  <input type="range" min="0" max="90" value={sel.x}
                    onChange={e => upd(sel.id, { x: +e.target.value })} className="w-full" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Y: {Math.round(sel.y)}%</label>
                  <input type="range" min="0" max="90" value={sel.y}
                    onChange={e => upd(sel.id, { y: +e.target.value })} className="w-full" />
                </div>
              </div>
            </div>
          )}

          {/* Presets */}
          <div className="card p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Simpan Preset</p>
            <div className="flex gap-2">
              <input value={presetName} onChange={e => setPresetName(e.target.value)}
                placeholder="Nama preset..." onKeyDown={e => e.key === 'Enter' && savePreset()}
                className="input-field text-xs flex-1 py-1.5" />
              <button onClick={savePreset}
                className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">
                <Save className="w-3.5 h-3.5" />
              </button>
            </div>
            {presets.length > 0 && (
              <div className="space-y-1">
                {presets.map(p => (
                  <div key={p.name} className="flex items-center gap-2">
                    <button onClick={() => loadPreset(p)}
                      className="flex-1 text-left text-xs px-2 py-1.5 bg-gray-50 border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300 truncate">
                      {p.name}
                    </button>
                    <button onClick={() => deletePreset(p.name)} className="text-gray-300 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Poster canvas ────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0" ref={containerRef}>
          {/* Outer wrapper: visual size = W*scale x H*scale */}
          <div style={{ width: W * scale, height: H * scale, overflow: 'hidden', flexShrink: 0 }}>
            <div
              ref={canvasRef}
              id="poster-canvas"
              onClick={() => setSelId(null)}
              style={{
                width: W, height: H,
                backgroundColor: bg,
                position: 'relative',
                overflow: 'hidden',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                userSelect: 'none',
                cursor: 'default',
                boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                fontFamily: 'Arial, Helvetica, sans-serif',
              }}
            >
              {/* Bottom accent strip */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 10, display: 'flex', zIndex: 5 }}>
                <div style={{ flex: 1, backgroundColor: '#009fe3' }} />
                <div style={{ width: '18%', backgroundColor: '#FFD700' }} />
                <div style={{ width: '10%', backgroundColor: '#e8001c' }} />
              </div>

              {/* Logo */}
              {logoUrl && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${lp.x}%`, top: `${lp.y}%`,
                    width: `${lp.w}%`,
                    cursor: 'move',
                    outline: selId === '__logo__' ? '2px dashed #3b82f6' : 'none',
                    outlineOffset: 3,
                    zIndex: 15,
                  }}
                  onMouseDown={e => startDrag(e, '__logo__', lp.x, lp.y)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="logo" style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }} />
                  {selId === '__logo__' && (
                    <div
                      style={{ position: 'absolute', bottom: -7, right: -7, width: 14, height: 14, backgroundColor: '#3b82f6', cursor: 'e-resize', borderRadius: 2, zIndex: 20 }}
                      onMouseDown={e => startResizeW(e, '__logo__', lp.w)}
                    />
                  )}
                </div>
              )}

              {/* Text elements */}
              {els.filter(el => el.visible).map(el => (
                <div
                  key={el.id}
                  style={{
                    position: 'absolute',
                    left: `${el.x}%`, top: `${el.y}%`,
                    width: `${el.w}%`,
                    fontSize: el.fontSize,
                    color: el.color,
                    backgroundColor: el.bgColor || 'transparent',
                    fontWeight: el.bold ? 'bold' : 'normal',
                    fontStyle: el.italic ? 'italic' : 'normal',
                    textAlign: el.align,
                    textDecoration: el.strike ? 'line-through' : 'none',
                    padding: el.padding,
                    border: el.border ? `2px solid ${el.borderColor}` : 'none',
                    borderRadius: el.border ? 8 : 0,
                    cursor: 'move',
                    outline: selId === el.id ? '2px dashed #3b82f6' : 'none',
                    outlineOffset: 3,
                    lineHeight: 1.2,
                    wordBreak: 'break-word',
                    boxSizing: 'border-box',
                    zIndex: 10,
                  }}
                  onMouseDown={e => startDrag(e, el.id, el.x, el.y)}
                >
                  {el.text}
                  {selId === el.id && (
                    <div
                      style={{ position: 'absolute', bottom: -7, right: -7, width: 14, height: 14, backgroundColor: '#3b82f6', cursor: 'e-resize', borderRadius: 2, zIndex: 20 }}
                      onMouseDown={e => startResizeW(e, el.id, el.w)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-2 text-center">
            Klik elemen untuk pilih · Drag untuk pindah · Handle <span className="text-blue-500">■</span> untuk resize lebar
          </p>
        </div>
      </div>
    </>
  );
}
