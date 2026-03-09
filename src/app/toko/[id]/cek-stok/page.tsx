'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ScanLine, Search, Trash2, Send, RotateCcw, Loader2, Plus, Minus, Keyboard } from 'lucide-react';
import { formatRupiah, formatQty } from '@/lib/utils';

interface CekStokItem {
  id: string;
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
  supplier_id: string | null;
  kategori: string;
  merek: string;
  rak: string;
  maxQty: number;
  minQty: number;
  suggestedOrder: number;
}

export default function CekStokPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeId = params.id as string;
  const supabase = createClient();

  const [items, setItems] = useState<CekStokItem[]>([]);
  const [scanMode, setScanMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CekStokItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scannerStatus, setScannerStatus] = useState('');
  const [usbMode, setUsbMode] = useState(false);
  const [usbInput, setUsbInput] = useState('');
  const [usbFeedback, setUsbFeedback] = useState<'added' | 'duplicate' | 'notfound' | ''>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const usbInputRef = useRef<HTMLInputElement>(null);

  // Load items from master-produk if redirected
  useEffect(() => {
    if (searchParams.get('from') === 'master-produk') {
      const stored = sessionStorage.getItem(`order_items_${storeId}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const loadedItems: CekStokItem[] = parsed.map((item: Record<string, unknown>) => ({
            id: crypto.randomUUID(),
            store_product_id: item.store_product_id,
            barcode: item.barcode,
            name: item.name,
            unit: item.unit,
            stokSistem: item.current_qty || 0,
            stokFisik: item.current_qty || 0,
            selisih: 0,
            hpp: item.hpp || 0,
            sellPrice: 0,
            supplier: item.supplier_name || '-',
            supplier_id: item.supplier_id || null,
            kategori: '',
            merek: '',
            rak: '',
            maxQty: item.max_qty || 0,
            minQty: item.min_qty || 0,
            suggestedOrder: item.suggested_qty || 0,
          }));
          setItems(loadedItems);
          sessionStorage.removeItem(`order_items_${storeId}`);
        } catch { /* ignore parse errors */ }
      }
    }
  }, [searchParams, storeId]);

  // Init barcode scanner — crop frame ke area kotak biru → decode via ZXing MultiFormatReader
  useEffect(() => {
    if (!scanMode) return;

    let stopped = false;

    async function initScanner() {
      try {
        console.log('[Scanner] ===== initScanner =====');
        setScannerError('');
        setScannerStatus('Meminta izin kamera...');

        // STEP 1: Minta stream kamera belakang
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        console.log('[Scanner] Stream kamera OK:', stream.getVideoTracks()[0]?.label);

        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }

        // STEP 2: Pasang stream ke video element
        const video = videoRef.current;
        if (!video) { console.error('[Scanner] videoRef NULL!'); return; }
        video.srcObject = stream;
        setScannerStatus('Menunggu kamera siap...');

        // STEP 3: Tunggu video benar-benar playing
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video timeout 8 detik')), 8000);
          const done = () => { clearTimeout(timeout); resolve(); };
          if (video.readyState >= 3) { done(); return; }
          video.addEventListener('playing', done, { once: true });
          video.play().catch(reject);
        });

        if (stopped) return;
        console.log('[Scanner] Video playing! Dimensi:', video.videoWidth, 'x', video.videoHeight);

        // STEP 4: Import ZXing low-level API (decode dari canvas)
        const { HTMLCanvasElementLuminanceSource } = await import('@zxing/browser');
        const { BinaryBitmap, HybridBinarizer, DecodeHintType, BarcodeFormat, MultiFormatReader } = await import('@zxing/library');

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new MultiFormatReader();
        reader.setHints(hints);
        console.log('[Scanner] MultiFormatReader siap (EAN-13, EAN-8, UPC, CODE-128, CODE-39, QR)');

        // STEP 5: Buat canvas offscreen untuk crop frame
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        setScannerStatus('Kamera aktif · Arahkan barcode ke kotak biru...');
        console.log('[Scanner] Scan loop dimulai (crop area = 75% lebar × 35% tinggi, tengah video)');

        let frameCount = 0;
        let lastValue = '';
        let lastTime = 0;

        const scanLoop = () => {
          if (stopped) return;
          frameCount++;

          try {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              // Crop hanya area kotak biru: 75% lebar, 35% tinggi, posisi tengah
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              const cropW = Math.floor(vw * 0.75);
              const cropH = Math.floor(vh * 0.35);
              const cropX = Math.floor((vw - cropW) / 2);
              const cropY = Math.floor((vh - cropH) / 2);

              canvas.width = cropW;
              canvas.height = cropH;
              ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

              if (frameCount % 60 === 0) {
                console.log(`[Scanner] Frame #${frameCount} | crop: ${cropW}×${cropH} dari ${vw}×${vh}`);
              }

              try {
                // Decode dari canvas yang sudah di-crop
                const luminance = new HTMLCanvasElementLuminanceSource(canvas);
                const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
                const result = reader.decode(bitmap);

                const value = result.getText();
                const now = Date.now();
                // Debounce: barcode sama tidak trigger ulang dalam 2 detik
                if (value !== lastValue || now - lastTime > 2000) {
                  lastValue = value;
                  lastTime = now;
                  console.log(`[Scanner] ✅ TERDETEKSI! Format: ${result.getBarcodeFormat()} | Nilai: "${value}"`);
                  handleBarcodeScanned(value);
                }
              } catch {
                // NotFoundException per frame = normal, tidak ada barcode di crop area
              }
            }
          } catch (err) {
            console.warn('[Scanner] Frame error:', err);
          }

          animFrameRef.current = requestAnimationFrame(scanLoop);
        };

        animFrameRef.current = requestAnimationFrame(scanLoop);

      } catch (err) {
        if (!stopped) {
          console.error('[Scanner] ❌ Error fatal:', err);
          setScannerStatus('');
          setScannerError(
            'Tidak bisa mengakses kamera. Pastikan izin kamera diberikan atau gunakan pencarian manual.'
          );
        }
      }
    }

    initScanner();

    const videoEl = videoRef.current;
    return () => {
      stopped = true;
      console.log('[Scanner] Cleanup');
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
      if (zxingControlsRef.current) { zxingControlsRef.current.stop(); zxingControlsRef.current = null; }
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
      setScannerStatus('');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode]);

  // Shared function: fetch produk dari Supabase dan tambahkan ke list
  // Return: 'added' | 'duplicate' | 'notfound'
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
    const cat = Array.isArray(data.category) ? data.category[0] : data.category;
    const brand = Array.isArray(data.brand) ? data.brand[0] : data.brand;
    const sup = Array.isArray(data.supplier) ? data.supplier[0] : data.supplier;

    const currentQty = stock?.current_qty || 0;
    const maxQty = stock?.max_qty || 0;
    const minQty = stock?.min_qty || 0;

    const newItem: CekStokItem = {
      id: crypto.randomUUID(),
      store_product_id: data.id,
      barcode: data.barcode,
      name: data.name,
      unit: data.unit,
      stokSistem: currentQty,
      stokFisik: currentQty,
      selisih: 0,
      hpp: data.hpp,
      sellPrice: data.sell_price,
      supplier: sup?.name || '-',
      supplier_id: sup?.id || null,
      kategori: cat?.name || '-',
      merek: brand?.name || '-',
      rak: data.shelf_location || '-',
      maxQty,
      minQty,
      suggestedOrder: Math.max(0, maxQty - currentQty),
    };
    setItems((prev) => [newItem, ...prev]);
    return 'added';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, storeId]);

  // Dipanggil oleh scanner kamera — tidak perlu feedback visual
  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    await fetchAndAddProduct(barcode);
  }, [fetchAndAddProduct]);

  // Auto-focus input USB saat mode aktif
  useEffect(() => {
    if (usbMode) {
      const t = setTimeout(() => usbInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [usbMode]);

  // Dipanggil oleh scanner USB — dengan feedback visual
  const handleUsbKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const barcode = usbInput.trim();
    if (barcode.length < 6) return;

    setUsbInput('');
    const result = await fetchAndAddProduct(barcode);
    setUsbFeedback(result);
    setTimeout(() => setUsbFeedback(''), 2500);
    // Kembalikan fokus ke input agar scanner berikutnya langsung masuk
    usbInputRef.current?.focus();
  }, [usbInput, fetchAndAddProduct]);

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
          const cat = Array.isArray(d.category) ? d.category[0] : d.category;
          const brand = Array.isArray(d.brand) ? d.brand[0] : d.brand;
          const sup = Array.isArray(d.supplier) ? d.supplier[0] : d.supplier;
          const currentQty = stock?.current_qty || 0;
          const maxQty = stock?.max_qty || 0;

          return {
            id: crypto.randomUUID(),
            store_product_id: d.id,
            barcode: d.barcode,
            name: d.name,
            unit: d.unit,
            stokSistem: currentQty,
            stokFisik: currentQty,
            selisih: 0,
            hpp: d.hpp,
            sellPrice: d.sell_price,
            supplier: sup?.name || '-',
            supplier_id: sup?.id || null,
            kategori: cat?.name || '-',
            merek: brand?.name || '-',
            rak: d.shelf_location || '-',
            maxQty,
            minQty: stock?.min_qty || 0,
            suggestedOrder: Math.max(0, maxQty - currentQty),
          };
        });
      setSearchResults(results);
    }
    setSearching(false);
  };

  const addFromSearch = (item: CekStokItem) => {
    setItems((prev) => [item, ...prev]);
    setSearchResults((prev) => prev.filter((r) => r.barcode !== item.barcode));
    setSearchQuery('');
    setShowSearch(false);
  };

  const updateFisik = (id: string, value: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, stokFisik: value, selisih: value - item.stokSistem }
          : item
      )
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleReset = () => {
    setItems([]);
  };

  const handleTransferToPesanan = () => {
    // Group items by supplier and store in sessionStorage
    const orderData = items
      .filter((item) => item.selisih < 0) // Only items with deficit
      .map((item) => ({
        store_product_id: item.store_product_id,
        barcode: item.barcode,
        name: item.name,
        unit: item.unit,
        hpp: item.hpp,
        qty_to_order: Math.abs(item.selisih),
        supplier_id: item.supplier_id,
        supplier_name: item.supplier,
      }));

    if (orderData.length === 0) {
      // If no deficit items, transfer all with suggested order qty
      const allData = items.map((item) => ({
        store_product_id: item.store_product_id,
        barcode: item.barcode,
        name: item.name,
        unit: item.unit,
        hpp: item.hpp,
        qty_to_order: item.suggestedOrder > 0 ? item.suggestedOrder : Math.max(0, item.maxQty - item.stokFisik),
        supplier_id: item.supplier_id,
        supplier_name: item.supplier,
      }));
      sessionStorage.setItem(`pesanan_items_${storeId}`, JSON.stringify(allData));
    } else {
      sessionStorage.setItem(`pesanan_items_${storeId}`, JSON.stringify(orderData));
    }

    // Audit log — catat transfer cek stok ke pesanan
    const transferredCount = orderData.length > 0 ? orderData.length : items.length;
    supabase.from('audit_log').insert({
      store_id: storeId,
      action: 'transfer_cek_stok_to_pesanan',
      entity_type: 'cek_stok',
      detail: {
        total_items_checked: items.length,
        items_transferred: transferredCount,
        deficit_items: orderData.length,
      },
    });

    window.location.href = `/toko/${storeId}/pesanan?from=cek-stok`;
  };

  const deficitCount = items.filter((i) => i.selisih < 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Input Cek Stok</h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} item {deficitCount > 0 && `(${deficitCount} kurang stok)`}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setScanMode(!scanMode); setUsbMode(false); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            scanMode
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          <ScanLine className="w-4 h-4" />
          {scanMode ? 'Tutup Kamera' : 'Kamera'}
        </button>

        <button
          onClick={() => { setUsbMode(!usbMode); setScanMode(false); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            usbMode
              ? 'bg-green-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
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
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearch(true);
              handleSearchProducts(e.target.value);
            }}
            onFocus={() => setShowSearch(true)}
            className="input-field pl-10"
          />

          {/* Search dropdown */}
          {showSearch && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 z-20 max-h-60 overflow-y-auto">
              {searching ? (
                <div className="p-4 text-center text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Mencari...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">Tidak ditemukan</div>
              ) : (
                searchResults.map((result) => (
                  <button
                    key={result.barcode}
                    onClick={() => addFromSearch(result)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b last:border-0 flex items-center justify-between"
                  >
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
            <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Keyboard className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-sm text-gray-800">Mode Scanner USB</p>
              <p className="text-xs text-gray-400">
                Tembakkan scanner ke barcode — otomatis terdeteksi. Atau ketik barcode lalu tekan Enter.
              </p>
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
              usbFeedback === 'added'
                ? 'border-green-400 bg-green-50 text-green-800'
                : usbFeedback === 'notfound'
                ? 'border-red-400 bg-red-50 text-red-800'
                : usbFeedback === 'duplicate'
                ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                : 'border-gray-300 focus:border-green-400'
            }`}
            autoComplete="off"
          />

          <div className="mt-2 h-5 text-center text-sm font-medium">
            {usbFeedback === 'added' && (
              <span className="text-green-600">✓ Produk berhasil ditambahkan</span>
            )}
            {usbFeedback === 'notfound' && (
              <span className="text-red-600">✗ Barcode tidak ditemukan di database</span>
            )}
            {usbFeedback === 'duplicate' && (
              <span className="text-yellow-600">⚠ Produk sudah ada di daftar</span>
            )}
            {!usbFeedback && (
              <span className="text-gray-400 text-xs">Tekan Enter setelah mengetik · Scanner USB otomatis kirim Enter</span>
            )}
          </div>
        </div>
      )}

      {/* Scanner Kamera */}
      {scanMode && (
        <div className="card">
          {scannerError ? (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm text-center">
              {scannerError}
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full"
                  style={{ maxHeight: '280px', objectFit: 'cover' }}
                />
                {/* Garis panduan scan */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-blue-400 rounded" style={{ width: '75%', height: '30%' }} />
                </div>
              </div>
              {/* Status scanner — tampil di layar & di console */}
              {scannerStatus && (
                <p className="text-xs text-center text-blue-600 mt-2 font-medium">{scannerStatus}</p>
              )}
              <p className="text-xs text-center text-gray-400 mt-1">
                Arahkan barcode ke dalam kotak · EAN-13, CODE-128, QR Code
              </p>
            </div>
          )}
        </div>
      )}

      {/* Items Table */}
      <div className="card p-0 overflow-hidden">
        {items.length === 0 ? (
          <div className="text-center py-16">
            <ScanLine className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Belum ada item</p>
            <p className="text-sm text-gray-400 mt-1">
              Scan barcode atau cari produk untuk memulai cek stok
            </p>
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
                  <tr
                    key={item.id}
                    className={`hover:bg-gray-50 ${
                      item.selisih < 0 ? 'bg-red-50/50' : item.selisih > 0 ? 'bg-green-50/50' : ''
                    }`}
                  >
                    <td className="table-cell text-gray-400 text-center">{index + 1}</td>
                    <td className="table-cell font-mono text-xs">{item.barcode}</td>
                    <td className="table-cell font-medium text-sm max-w-[150px] truncate" title={item.name}>
                      {item.name}
                    </td>
                    <td className="table-cell text-center text-sm">{item.unit || '-'}</td>
                    <td className="table-cell text-right">{formatQty(item.stokSistem)}</td>
                    <td className="table-cell">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => updateFisik(item.id, Math.max(0, item.stokFisik - 1))}
                          className="p-1 rounded hover:bg-gray-200 text-gray-500"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          value={item.stokFisik}
                          onChange={(e) => updateFisik(item.id, parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 border rounded text-right text-sm"
                          min={0}
                        />
                        <button
                          onClick={() => updateFisik(item.id, item.stokFisik + 1)}
                          className="p-1 rounded hover:bg-gray-200 text-gray-500"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className={`table-cell text-right font-medium ${
                      item.selisih < 0 ? 'text-red-600' : item.selisih > 0 ? 'text-green-600' : ''
                    }`}>
                      {item.selisih > 0 ? '+' : ''}{formatQty(item.selisih)}
                    </td>
                    <td className="table-cell text-right text-sm">{formatRupiah(item.hpp)}</td>
                    <td className="table-cell text-right text-sm">{formatRupiah(item.sellPrice)}</td>
                    <td className="table-cell text-sm">{item.supplier}</td>
                    <td className="table-cell text-sm">{item.kategori}</td>
                    <td className="table-cell text-sm">{item.merek}</td>
                    <td className="table-cell text-sm">{item.rak}</td>
                    <td className="table-cell">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1 text-red-400 hover:text-red-600"
                      >
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

      {/* Summary & Actions */}
      {items.length > 0 && (
        <>
          {/* Summary */}
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
              <p className="text-lg font-bold text-green-600">
                {items.filter((i) => i.selisih > 0).length}
              </p>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex gap-2 justify-end">
            <button onClick={handleReset} className="btn-secondary flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button onClick={handleTransferToPesanan} className="btn-primary flex items-center gap-2">
              <Send className="w-4 h-4" />
              Transfer ke Pesanan
            </button>
          </div>
        </>
      )}
    </div>
  );
}
