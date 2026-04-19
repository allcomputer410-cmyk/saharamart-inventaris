'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ScanLine, Search, Trash2, RotateCcw, Loader2, Plus, Minus,
  Keyboard, FileSpreadsheet, FileText, History, CheckCircle2,
} from 'lucide-react';
import { formatRupiah, formatQty } from '@/lib/utils';

interface CekStokItem {
  id: string;               // UUID di DB (cek_stok_session_items.id), atau temp UUID sebelum tersimpan
  store_product_id: string;
  barcode: string;
  name: string;
  unit: string | null;
  stokSistem: number;
  stokFisik: number;
  selisih: number;
  hpp: number;
  sellPrice: number;
  supplier: string;
  kategori: string;
  merek: string;
  rak: string;
  maxQty: number;
  minQty: number;
  saved: boolean;           // sudah tersimpan ke DB?
}

export default function CekStokPage() {
  const params = useParams();
  const storeId = params.id as string;

  // Bug #1 fix: stabilkan supabase client — satu instance per mount
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // ── Meta ──────────────────────────────────────────────────────────────────
  const [storeName, setStoreName] = useState('');
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // ── Session ───────────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [resumeBanner, setResumeBanner] = useState(false); // tampil banner "sesi ditemukan"

  // ── Items ─────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<CekStokItem[]>([]);

  // ── Scanner ───────────────────────────────────────────────────────────────
  const [scanMode, setScanMode] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scannerStatus, setScannerStatus] = useState('');
  const [usbMode, setUsbMode] = useState(false);
  const [usbInput, setUsbInput] = useState('');
  const [usbFeedback, setUsbFeedback] = useState<'added' | 'duplicate' | 'notfound' | ''>('');

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CekStokItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // ── Export ────────────────────────────────────────────────────────────────
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const usbInputRef = useRef<HTMLInputElement>(null);

  // Debounce timer untuk auto-save stok fisik
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load meta (store name + user) ─────────────────────────────────────────
  useEffect(() => {
    async function fetchMeta() {
      const [{ data: storeData }, { data: { user } }] = await Promise.all([
        supabase.from('stores').select('name').eq('id', storeId).single(),
        supabase.auth.getUser(),
      ]);
      if (storeData) setStoreName(storeData.name);
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from('user_profiles').select('name').eq('id', user.id).single();
        if (profile?.name) setUserName(profile.name);
      }
    }
    fetchMeta();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Load / Resume active session ──────────────────────────────────────────
  useEffect(() => {
    async function loadSession() {
      setLoadingSession(true);

      // Cek apakah ada sesi aktif untuk toko ini
      const { data: existing } = await supabase
        .from('cek_stok_sessions')
        .select('id, started_at')
        .eq('store_id', storeId)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        // Load items dari sesi aktif
        const { data: sessionItems } = await supabase
          .from('cek_stok_session_items')
          .select('*')
          .eq('session_id', existing.id)
          .order('created_at', { ascending: true });

        if (sessionItems && sessionItems.length > 0) {
          const loaded: CekStokItem[] = sessionItems.map((si) => ({
            id: si.id,
            store_product_id: si.store_product_id,
            barcode: si.barcode,
            name: si.name,
            unit: si.unit,
            stokSistem: si.stok_sistem,
            stokFisik: si.stok_fisik,
            selisih: si.selisih ?? (si.stok_fisik - si.stok_sistem),
            hpp: si.hpp,
            sellPrice: si.sell_price,
            supplier: si.supplier,
            kategori: si.kategori,
            merek: si.merek,
            rak: si.rak,
            maxQty: si.max_qty,
            minQty: si.min_qty,
            saved: true,
          }));
          setItems(loaded);
          setResumeBanner(true);
        }

        setSessionId(existing.id);
        setSessionStartedAt(existing.started_at);
      }

      setLoadingSession(false);
    }

    loadSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Buat session baru di DB ───────────────────────────────────────────────
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;

    const { data } = await supabase
      .from('cek_stok_sessions')
      .insert({ store_id: storeId, user_id: userId, status: 'active' })
      .select('id, started_at')
      .single();

    const newId = data?.id as string;
    setSessionId(newId);
    setSessionStartedAt(data?.started_at ?? null);
    return newId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, storeId, userId]);

  // ── Scanner kamera ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scanMode) return;
    let stopped = false;

    async function initScanner() {
      try {
        setScannerError('');
        setScannerStatus('Meminta izin kamera...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        setScannerStatus('Menunggu kamera siap...');

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout')), 8000);
          const done = () => { clearTimeout(timeout); resolve(); };
          if (video.readyState >= 3) { done(); return; }
          video.addEventListener('playing', done, { once: true });
          video.play().catch(reject);
        });

        if (stopped) return;

        const { HTMLCanvasElementLuminanceSource } = await import('@zxing/browser');
        const { BinaryBitmap, HybridBinarizer, DecodeHintType, BarcodeFormat, MultiFormatReader } = await import('@zxing/library');

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new MultiFormatReader();
        reader.setHints(hints);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        setScannerStatus('Kamera aktif · Arahkan barcode ke kotak biru...');

        let lastValue = '';
        let lastTime = 0;

        const scanLoop = () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              const vw = video.videoWidth, vh = video.videoHeight;
              const cropW = Math.floor(vw * 0.75), cropH = Math.floor(vh * 0.35);
              canvas.width = cropW; canvas.height = cropH;
              ctx.drawImage(video, Math.floor((vw - cropW) / 2), Math.floor((vh - cropH) / 2), cropW, cropH, 0, 0, cropW, cropH);
              try {
                const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas))));
                const value = result.getText();
                const now = Date.now();
                if (value !== lastValue || now - lastTime > 2000) {
                  lastValue = value; lastTime = now;
                  handleBarcodeScanned(value);
                }
              } catch { /* no barcode in frame */ }
            }
          } catch { /* frame error */ }
          animFrameRef.current = requestAnimationFrame(scanLoop);
        };
        animFrameRef.current = requestAnimationFrame(scanLoop);
      } catch (err) {
        if (!stopped) {
          console.error('[Scanner]', err);
          setScannerStatus('');
          setScannerError('Tidak bisa mengakses kamera. Gunakan Scanner USB atau pencarian manual.');
        }
      }
    }

    initScanner();
    const videoEl = videoRef.current;
    return () => {
      stopped = true;
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
      if (zxingControlsRef.current) { zxingControlsRef.current.stop(); zxingControlsRef.current = null; }
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
      setScannerStatus('');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode]);

  // ── Fetch & tambah produk ─────────────────────────────────────────────────
  const fetchAndAddProduct = useCallback(async (barcode: string): Promise<'added' | 'duplicate' | 'notfound'> => {
    if (items.find((i) => i.barcode === barcode)) return 'duplicate';

    const { data } = await supabase
      .from('store_products')
      .select(`
        id, barcode, name, unit, hpp, sell_price, shelf_location,
        category:categories(name),
        brand:brands(name),
        supplier:suppliers(id, name),
        stock(current_qty, min_qty, max_qty)
      `)
      .eq('store_id', storeId)
      .eq('barcode', barcode)
      .eq('is_deleted', false)
      .single();

    if (!data) return 'notfound';

    const stock = Array.isArray(data.stock) ? data.stock[0] : data.stock;
    const cat   = Array.isArray(data.category) ? data.category[0] : data.category;
    const brand = Array.isArray(data.brand) ? data.brand[0] : data.brand;
    const sup   = Array.isArray(data.supplier) ? data.supplier[0] : data.supplier;

    const newItem: CekStokItem = {
      id: crypto.randomUUID(),
      store_product_id: data.id,
      barcode: data.barcode,
      name: data.name,
      unit: data.unit,
      stokSistem: stock?.current_qty || 0,
      stokFisik: stock?.current_qty || 0,
      selisih: 0,
      hpp: data.hpp,
      sellPrice: data.sell_price,
      supplier: sup?.name || '-',
      kategori: cat?.name || '-',
      merek: brand?.name || '-',
      rak: data.shelf_location || '-',
      maxQty: stock?.max_qty || 0,
      minQty: stock?.min_qty || 0,
      saved: false,
    };

    // Simpan ke DB — buat session jika belum ada
    const sid = await ensureSession();
    const { data: saved } = await supabase
      .from('cek_stok_session_items')
      .upsert({
        session_id: sid,
        store_product_id: newItem.store_product_id,
        barcode: newItem.barcode,
        name: newItem.name,
        unit: newItem.unit,
        stok_sistem: newItem.stokSistem,
        stok_fisik: newItem.stokFisik,
        hpp: newItem.hpp,
        sell_price: newItem.sellPrice,
        supplier: newItem.supplier,
        kategori: newItem.kategori,
        merek: newItem.merek,
        rak: newItem.rak,
        max_qty: newItem.maxQty,
        min_qty: newItem.minQty,
      }, { onConflict: 'session_id,store_product_id' })
      .select('id')
      .single();

    // Gunakan id dari DB
    const dbId = saved?.id || newItem.id;
    setItems((prev) => [{ ...newItem, id: dbId, saved: true }, ...prev]);
    return 'added';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, storeId, ensureSession]);

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    await fetchAndAddProduct(barcode);
  }, [fetchAndAddProduct]);

  // ── USB scanner ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (usbMode) {
      const t = setTimeout(() => usbInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [usbMode]);

  const handleUsbKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const barcode = usbInput.trim();
    if (barcode.length < 6) return;
    setUsbInput('');
    const result = await fetchAndAddProduct(barcode);
    setUsbFeedback(result);
    setTimeout(() => setUsbFeedback(''), 2500);
    usbInputRef.current?.focus();
  }, [usbInput, fetchAndAddProduct]);

  // ── Pencarian manual ──────────────────────────────────────────────────────
  const handleSearchProducts = async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);

    const { data } = await supabase
      .from('store_products')
      .select(`
        id, barcode, name, unit, hpp, sell_price, shelf_location,
        category:categories(name),
        brand:brands(name),
        supplier:suppliers(id, name),
        stock(current_qty, min_qty, max_qty)
      `)
      .eq('store_id', storeId)
      .eq('is_deleted', false)
      .or(`name.ilike.%${query}%,barcode.ilike.%${query}%`)
      .limit(10);

    if (data) {
      const results: CekStokItem[] = data
        .filter((d) => !items.find((i) => i.barcode === d.barcode))
        .map((d) => {
          const stock = Array.isArray(d.stock) ? d.stock[0] : d.stock;
          const cat   = Array.isArray(d.category) ? d.category[0] : d.category;
          const brand = Array.isArray(d.brand) ? d.brand[0] : d.brand;
          const sup   = Array.isArray(d.supplier) ? d.supplier[0] : d.supplier;
          return {
            id: crypto.randomUUID(),
            store_product_id: d.id,
            barcode: d.barcode,
            name: d.name,
            unit: d.unit,
            stokSistem: stock?.current_qty || 0,
            stokFisik: stock?.current_qty || 0,
            selisih: 0,
            hpp: d.hpp,
            sellPrice: d.sell_price,
            supplier: sup?.name || '-',
            kategori: cat?.name || '-',
            merek: brand?.name || '-',
            rak: d.shelf_location || '-',
            maxQty: stock?.max_qty || 0,
            minQty: stock?.min_qty || 0,
            saved: false,
          };
        });
      setSearchResults(results);
    }
    setSearching(false);
  };

  const addFromSearch = (item: CekStokItem) => {
    fetchAndAddProduct(item.barcode);
    setSearchResults((prev) => prev.filter((r) => r.barcode !== item.barcode));
    setSearchQuery('');
    setShowSearch(false);
  };

  // ── Update stok fisik — auto-save dengan debounce 600ms ───────────────────
  const updateFisik = (id: string, value: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, stokFisik: value, selisih: value - item.stokSistem }
          : item
      )
    );

    // Debounce save ke DB
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const sid = await ensureSession();
      const target = items.find(i => i.id === id);
      if (!target) return;
      await supabase
        .from('cek_stok_session_items')
        .update({ stok_fisik: value })
        .eq('id', id)
        .eq('session_id', sid);
    }, 600);
  };

  // ── Hapus item ────────────────────────────────────────────────────────────
  const removeItem = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (sessionId) {
      await supabase.from('cek_stok_session_items').delete().eq('id', id);
    }
  };

  // ── Reset sesi ────────────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!confirm('Reset semua item? Sesi ini akan ditutup.')) return;
    if (sessionId) {
      await supabase
        .from('cek_stok_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
    setItems([]);
    setSessionId(null);
    setSessionStartedAt(null);
    setResumeBanner(false);
  };

  // ── Format helpers ────────────────────────────────────────────────────────
  const getAuditTimestamp = () =>
    new Date().toLocaleString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const getFileDateStamp = () => {
    const now = new Date();
    return `${now.toISOString().slice(0, 10).replace(/-/g, '')}_${now.toTimeString().slice(0, 5).replace(':', '')}`;
  };

  // ── Export Excel ──────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (items.length === 0) return;
    setExportingExcel(true);
    try {
      const XLSX = await import('xlsx');
      const auditTime = getAuditTimestamp();
      const auditor = userName || 'Unknown';

      const headerRows = [
        ['LAPORAN CEK STOK'],
        [`Toko: ${storeName}`],
        [`Tanggal Audit: ${auditTime}`],
        [`Auditor: ${auditor}`],
        [],
        ['No', 'Barcode', 'Nama Produk', 'Satuan', 'Kategori', 'Merek', 'Rak', 'Supplier',
         'Stok Sistem', 'Stok Fisik', 'Selisih', 'HPP', 'Harga Jual', 'Nilai Selisih (HPP)'],
      ];

      const dataRows = items.map((item, idx) => [
        idx + 1, item.barcode, item.name, item.unit || '-',
        item.kategori, item.merek, item.rak, item.supplier,
        item.stokSistem, item.stokFisik, item.selisih,
        item.hpp, item.sellPrice, item.selisih * item.hpp,
      ]);

      const deficitItems = items.filter(i => i.selisih < 0);
      const surplusItems = items.filter(i => i.selisih > 0);
      const totalNilaiSelisih = items.reduce((sum, i) => sum + (i.selisih * i.hpp), 0);

      const summaryRows = [
        [], ['RINGKASAN'],
        ['Total Item Dicek', items.length],
        ['Item Kurang Stok', deficitItems.length],
        ['Item Lebih Stok', surplusItems.length],
        ['Item Sesuai', items.filter(i => i.selisih === 0).length],
        ['Total Nilai Selisih (HPP)', totalNilaiSelisih],
      ];

      const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows, ...summaryRows]);
      ws['!cols'] = [
        { wch: 4 }, { wch: 15 }, { wch: 35 }, { wch: 8 }, { wch: 15 },
        { wch: 15 }, { wch: 8 }, { wch: 20 }, { wch: 12 }, { wch: 10 },
        { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cek Stok');
      XLSX.writeFile(wb, `CekStok_${storeName.replace(/\s+/g, '_')}_${getFileDateStamp()}.xlsx`);

      // Tandai sesi sebagai exported
      if (sessionId) {
        await supabase.from('cek_stok_sessions')
          .update({ status: 'exported', completed_at: new Date().toISOString() })
          .eq('id', sessionId);
      }

      await supabase.from('audit_log').insert({
        user_id: userId,
        store_id: storeId,
        action: 'export_cek_stok',
        entity_type: 'cek_stok',
        detail: { format: 'excel', total_items: items.length, deficit_items: deficitItems.length, auditor, audit_time: auditTime, session_id: sessionId },
      });
    } catch (err) {
      console.error('Export Excel error:', err);
    } finally {
      setExportingExcel(false);
    }
  };

  // ── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (items.length === 0) return;
    setExportingPdf(true);
    try {
      const { pdf, Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer');
      const auditTime = getAuditTimestamp();
      const auditor = userName || 'Unknown';

      const styles = StyleSheet.create({
        page: { padding: 32, fontSize: 8, fontFamily: 'Helvetica' },
        title: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
        meta: { fontSize: 8, color: '#555', marginBottom: 2 },
        divider: { borderBottomWidth: 1, borderBottomColor: '#ccc', marginVertical: 8 },
        tableHeader: { flexDirection: 'row', backgroundColor: '#1e3a5f', color: 'white', padding: 4 },
        tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', padding: 3 },
        tableRowAlt: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', padding: 3, backgroundColor: '#f9fafb' },
        tableRowRed: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#fecaca', padding: 3, backgroundColor: '#fef2f2' },
        tableRowGreen: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#bbf7d0', padding: 3, backgroundColor: '#f0fdf4' },
        colNo: { width: '4%' }, colBarcode: { width: '12%' }, colName: { width: '26%' },
        colUnit: { width: '6%' }, colSupplier: { width: '14%' },
        colSistem: { width: '9%', textAlign: 'right' }, colFisik: { width: '9%', textAlign: 'right' },
        colSelisih: { width: '9%', textAlign: 'right' }, colNilai: { width: '11%', textAlign: 'right' },
        summaryBox: { marginTop: 12, padding: 8, backgroundColor: '#f1f5f9', borderRadius: 4 },
        summaryTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
        summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
        footer: { position: 'absolute', bottom: 20, left: 32, right: 32, fontSize: 7, color: '#9ca3af', flexDirection: 'row', justifyContent: 'space-between' },
        signSection: { marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end' },
        signBox: { width: 160, alignItems: 'center' },
        signLine: { borderBottomWidth: 1, borderBottomColor: '#374151', width: 140, marginTop: 40, marginBottom: 4 },
      });

      const deficitItems = items.filter(i => i.selisih < 0);
      const surplusItems = items.filter(i => i.selisih > 0);
      const totalNilaiSelisih = items.reduce((sum, i) => sum + (i.selisih * i.hpp), 0);
      const formatRp = (n: number) =>
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

      const ITEMS_PER_PAGE = 30;
      const pages = [];
      for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) pages.push(items.slice(i, i + ITEMS_PER_PAGE));

      const MyDoc = (
        <Document>
          {pages.map((pageItems, pageIdx) => (
            <Page key={pageIdx} size="A4" orientation="landscape" style={styles.page}>
              {pageIdx === 0 ? (
                <>
                  <Text style={styles.title}>LAPORAN CEK STOK</Text>
                  <Text style={styles.meta}>Toko: {storeName}</Text>
                  <Text style={styles.meta}>Tanggal Audit: {auditTime}</Text>
                  <Text style={styles.meta}>Auditor: {auditor}</Text>
                  <View style={styles.divider} />
                </>
              ) : (
                <Text style={{ fontSize: 8, color: '#555', marginBottom: 6 }}>
                  {storeName} — Laporan Cek Stok — {auditTime} (lanjutan hal. {pageIdx + 1})
                </Text>
              )}

              <View style={styles.tableHeader}>
                <Text style={styles.colNo}>#</Text>
                <Text style={styles.colBarcode}>Barcode</Text>
                <Text style={styles.colName}>Nama Produk</Text>
                <Text style={styles.colUnit}>Sat.</Text>
                <Text style={styles.colSupplier}>Supplier</Text>
                <Text style={styles.colSistem}>Stok Sis.</Text>
                <Text style={styles.colFisik}>Stok Fisik</Text>
                <Text style={styles.colSelisih}>Selisih</Text>
                <Text style={styles.colNilai}>Nilai Selisih</Text>
              </View>

              {pageItems.map((item, idx) => {
                const gIdx = pageIdx * ITEMS_PER_PAGE + idx;
                const rowStyle = item.selisih < 0 ? styles.tableRowRed
                  : item.selisih > 0 ? styles.tableRowGreen
                  : gIdx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                return (
                  <View key={item.id} style={rowStyle}>
                    <Text style={styles.colNo}>{gIdx + 1}</Text>
                    <Text style={styles.colBarcode}>{item.barcode}</Text>
                    <Text style={styles.colName}>{item.name}</Text>
                    <Text style={styles.colUnit}>{item.unit || '-'}</Text>
                    <Text style={styles.colSupplier}>{item.supplier}</Text>
                    <Text style={styles.colSistem}>{item.stokSistem}</Text>
                    <Text style={styles.colFisik}>{item.stokFisik}</Text>
                    <Text style={[styles.colSelisih, { color: item.selisih < 0 ? '#dc2626' : item.selisih > 0 ? '#16a34a' : '#374151' }]}>
                      {item.selisih > 0 ? `+${item.selisih}` : item.selisih}
                    </Text>
                    <Text style={[styles.colNilai, { color: item.selisih < 0 ? '#dc2626' : item.selisih > 0 ? '#16a34a' : '#374151' }]}>
                      {formatRp(item.selisih * item.hpp)}
                    </Text>
                  </View>
                );
              })}

              {pageIdx === pages.length - 1 && (
                <>
                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryTitle}>RINGKASAN</Text>
                    <View style={styles.summaryRow}><Text>Total Item Dicek</Text><Text style={{ fontWeight: 'bold' }}>{items.length}</Text></View>
                    <View style={styles.summaryRow}><Text>Item Kurang Stok</Text><Text style={{ color: '#dc2626', fontWeight: 'bold' }}>{deficitItems.length}</Text></View>
                    <View style={styles.summaryRow}><Text>Item Lebih Stok</Text><Text style={{ color: '#16a34a', fontWeight: 'bold' }}>{surplusItems.length}</Text></View>
                    <View style={styles.summaryRow}><Text>Item Sesuai</Text><Text style={{ fontWeight: 'bold' }}>{items.filter(i => i.selisih === 0).length}</Text></View>
                    <View style={[styles.summaryRow, { marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#cbd5e1', paddingTop: 4 }]}>
                      <Text>Total Nilai Selisih (HPP)</Text>
                      <Text style={{ fontWeight: 'bold', color: totalNilaiSelisih < 0 ? '#dc2626' : '#374151' }}>
                        {formatRp(totalNilaiSelisih)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.signSection}>
                    <View style={styles.signBox}>
                      <Text style={{ fontSize: 8, marginBottom: 2 }}>Mengetahui,</Text>
                      <Text style={{ fontSize: 8 }}>Kepala Toko / GM</Text>
                      <View style={styles.signLine} />
                      <Text style={{ fontSize: 8 }}>{auditor}</Text>
                    </View>
                  </View>
                </>
              )}

              <View style={styles.footer}>
                <Text>Dicetak: {auditTime}</Text>
                <Text>Hal. {pageIdx + 1} / {pages.length}</Text>
              </View>
            </Page>
          ))}
        </Document>
      );

      const blob = await pdf(MyDoc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CekStok_${storeName.replace(/\s+/g, '_')}_${getFileDateStamp()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      // Tandai sesi sebagai exported
      if (sessionId) {
        await supabase.from('cek_stok_sessions')
          .update({ status: 'exported', completed_at: new Date().toISOString() })
          .eq('id', sessionId);
      }

      await supabase.from('audit_log').insert({
        user_id: userId,
        store_id: storeId,
        action: 'export_cek_stok',
        entity_type: 'cek_stok',
        detail: { format: 'pdf', total_items: items.length, deficit_items: deficitItems.length, auditor, audit_time: auditTime, session_id: sessionId },
      });
    } catch (err) {
      console.error('Export PDF error:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  const deficitCount = items.filter((i) => i.selisih < 0).length;

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadingSession) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin mr-2" />
        <span className="text-gray-500 text-sm">Memuat sesi...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Cek Stok</h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length > 0
              ? `${items.length} item · ${deficitCount > 0 ? `${deficitCount} kurang stok · ` : ''}${sessionStartedAt ? `Sesi dimulai ${new Date(sessionStartedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`
              : 'Scan barcode atau cari produk untuk memulai cek stok'}
          </p>
        </div>

        {items.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              {exportingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Excel
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Banner resume sesi */}
      {resumeBanner && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
          <History className="w-5 h-5 text-blue-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-800">Sesi sebelumnya dilanjutkan</p>
            <p className="text-xs text-blue-600">
              {items.length} item tersimpan sejak{' '}
              {sessionStartedAt
                ? new Date(sessionStartedAt).toLocaleString('id-ID', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
                : '-'}
            </p>
          </div>
          <button
            onClick={() => setResumeBanner(false)}
            className="text-blue-400 hover:text-blue-600 text-xs shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar scan & cari */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setScanMode(!scanMode); setUsbMode(false); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            scanMode ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          <ScanLine className="w-4 h-4" />
          {scanMode ? 'Tutup Kamera' : 'Kamera'}
        </button>

        <button
          onClick={() => { setUsbMode(!usbMode); setScanMode(false); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            usbMode ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Keyboard className="w-4 h-4" />
          {usbMode ? 'Tutup USB' : 'Scanner USB'}
        </button>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Cari produk..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); handleSearchProducts(e.target.value); }}
            onFocus={() => setShowSearch(true)}
            className="input-field pl-10"
          />
          {showSearch && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 z-20 max-h-60 overflow-y-auto">
              {searching ? (
                <div className="p-4 text-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Mencari...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">Tidak ditemukan</div>
              ) : (
                searchResults.map((result) => (
                  <button key={result.barcode} onClick={() => addFromSearch(result)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b last:border-0 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{result.name}</p>
                      <p className="text-xs text-gray-400">{result.barcode} | Stok: {formatQty(result.stokSistem)}</p>
                    </div>
                    <Plus className="w-4 h-4 text-blue-500" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* USB Scanner Input */}
      {usbMode && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
              <Keyboard className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-sm text-gray-800">Mode Scanner USB</p>
              <p className="text-xs text-gray-400">Tembakkan scanner ke barcode — otomatis terdeteksi.</p>
            </div>
          </div>
          <input
            ref={usbInputRef}
            type="text"
            value={usbInput}
            onChange={(e) => setUsbInput(e.target.value)}
            onKeyDown={handleUsbKeyDown}
            placeholder="Scan barcode di sini..."
            className={`w-full px-4 py-3 border-2 rounded-lg font-mono text-lg tracking-widest text-center transition-colors focus:outline-none ${
              usbFeedback === 'added' ? 'border-green-400 bg-green-50 text-green-800'
              : usbFeedback === 'notfound' ? 'border-red-400 bg-red-50 text-red-800'
              : usbFeedback === 'duplicate' ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
              : 'border-gray-300 focus:border-green-400'
            }`}
            autoComplete="off"
          />
          <div className="mt-2 h-5 text-center text-sm font-medium">
            {usbFeedback === 'added' && <span className="text-green-600">✓ Produk berhasil ditambahkan</span>}
            {usbFeedback === 'notfound' && <span className="text-red-600">✗ Barcode tidak ditemukan di database</span>}
            {usbFeedback === 'duplicate' && <span className="text-yellow-600">⚠ Produk sudah ada di daftar</span>}
            {!usbFeedback && <span className="text-gray-400 text-xs">Tekan Enter setelah mengetik · Scanner USB otomatis kirim Enter</span>}
          </div>
        </div>
      )}

      {/* Scanner Kamera */}
      {scanMode && (
        <div className="card">
          {scannerError ? (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm text-center">{scannerError}</div>
          ) : (
            <div className="max-w-md mx-auto">
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-full" style={{ maxHeight: '280px', objectFit: 'cover' }} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-blue-400 rounded" style={{ width: '75%', height: '30%' }} />
                </div>
              </div>
              {scannerStatus && <p className="text-xs text-center text-blue-600 mt-2 font-medium">{scannerStatus}</p>}
              <p className="text-xs text-center text-gray-400 mt-1">Arahkan barcode ke dalam kotak · EAN-13, CODE-128, QR Code</p>
            </div>
          )}
        </div>
      )}

      {/* Tabel item */}
      <div className="card p-0 overflow-hidden">
        {items.length === 0 ? (
          <div className="text-center py-16">
            <ScanLine className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Belum ada item</p>
            <p className="text-sm text-gray-400 mt-1">Scan barcode atau cari produk untuk memulai cek stok</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3 text-left">Barcode</th>
                  <th className="px-3 py-3 text-left">Nama Produk</th>
                  <th className="px-3 py-3">Satuan</th>
                  <th className="px-3 py-3 text-right">Stok Sistem</th>
                  <th className="px-3 py-3 text-center">Stok Fisik</th>
                  <th className="px-3 py-3 text-right">Selisih</th>
                  <th className="px-3 py-3 text-right">HPP</th>
                  <th className="px-3 py-3 text-right">Harga Jual</th>
                  <th className="px-3 py-3">Supplier</th>
                  <th className="px-3 py-3">Kategori</th>
                  <th className="px-3 py-3">Merek</th>
                  <th className="px-3 py-3">Rak</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className={`hover:bg-gray-50 ${
                    item.selisih < 0 ? 'bg-red-50/50' : item.selisih > 0 ? 'bg-green-50/50' : ''
                  }`}>
                    <td className="table-cell text-gray-400 text-center">{index + 1}</td>
                    <td className="table-cell font-mono text-xs">{item.barcode}</td>
                    <td className="table-cell font-medium text-sm max-w-[150px] truncate" title={item.name}>{item.name}</td>
                    <td className="table-cell text-center text-sm">{item.unit || '-'}</td>
                    <td className="table-cell text-right">{formatQty(item.stokSistem)}</td>
                    <td className="table-cell">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => updateFisik(item.id, Math.max(0, item.stokFisik - 1))} className="p-1 rounded hover:bg-gray-200 text-gray-500">
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          value={item.stokFisik}
                          onChange={(e) => updateFisik(item.id, parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 border rounded text-right text-sm"
                          min={0}
                        />
                        <button onClick={() => updateFisik(item.id, item.stokFisik + 1)} className="p-1 rounded hover:bg-gray-200 text-gray-500">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className={`table-cell text-right font-medium ${item.selisih < 0 ? 'text-red-600' : item.selisih > 0 ? 'text-green-600' : ''}`}>
                      {item.selisih > 0 ? '+' : ''}{formatQty(item.selisih)}
                    </td>
                    <td className="table-cell text-right text-sm">{formatRupiah(item.hpp)}</td>
                    <td className="table-cell text-right text-sm">{formatRupiah(item.sellPrice)}</td>
                    <td className="table-cell text-sm">{item.supplier}</td>
                    <td className="table-cell text-sm">{item.kategori}</td>
                    <td className="table-cell text-sm">{item.merek}</td>
                    <td className="table-cell text-sm">{item.rak}</td>
                    <td className="table-cell">
                      <button onClick={() => removeItem(item.id)} className="p-1 text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary & Reset */}
      {items.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="card text-center">
              <p className="text-xs text-gray-500">Total Item</p>
              <p className="text-lg font-bold">{items.length}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-gray-500">Kurang Stok</p>
              <p className="text-lg font-bold text-red-600">{deficitCount}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-gray-500">Lebih Stok</p>
              <p className="text-lg font-bold text-green-600">{items.filter((i) => i.selisih > 0).length}</p>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={handleReset} className="btn-secondary flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              Reset Sesi
            </button>
          </div>
        </>
      )}
    </div>
  );
}
