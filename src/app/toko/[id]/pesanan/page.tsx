'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ShoppingCart, Search, CheckCircle2, Loader2, ChevronDown, ChevronUp,
  Plus, Trash2, Send, AlertTriangle, PackageSearch, X, MonitorSmartphone,
  ClipboardList, Package, MessageCircle, Mail, Download, Bell, RotateCcw,
} from 'lucide-react';
import { formatRupiah, formatDateShort, generateDoNumber } from '@/lib/utils';
import type { Order } from '@/types/database';
import type { RekapPDFProps } from '@/components/ui/RekapPDF';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabType = 'buat' | 'rekap' | 'terima' | 'kosong';

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  pending:   { label: 'Menunggu',          class: 'badge-info' },
  draft:     { label: 'Draft',             class: 'badge-info' },
  ordered:   { label: 'Dipesan',           class: 'badge-warning' },
  partial:   { label: 'Sebagian Diterima', class: 'badge-warning' },
  complete:  { label: 'Selesai',           class: 'badge-success' },
  received:  { label: 'Diterima',          class: 'badge-success' },
  cancelled: { label: 'Semua Kosong',        class: 'badge-danger' },
};

interface PendingItem {
  store_product_id: string;
  barcode: string;
  name: string;
  unit: string | null;
  hpp: number;
  qty_to_order: number;
  supplier_id: string | null;
  supplier_name: string;
}

interface ProductSearchResult {
  store_product_id: string;
  barcode: string;
  name: string;
  unit: string | null;
  hpp: number;
  current_qty: number;
  min_qty: number;
  max_qty: number;
  supplier_id: string | null;
  supplier_name: string;
  status: 'kritis' | 'rendah' | 'ok' | 'overstock';
}

interface RekapSupplier {
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  supplierEmail?: string;
  items: {
    productName: string;
    barcode: string;
    unit: string;
    qty: number;
    hpp: number;
    subtotal: number;
    doNumber?: string;
  }[];
  totalItems: number;
  totalValue: number;
}

interface KosongItem {
  itemId: string;
  productId: string;
  barcode: string;
  productName: string;
  unit: string;
  hpp: number;
  qtyOrdered: number;
  doNumber: string;
  tanggal: string;
}

interface KosongGroup {
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  items: KosongItem[];
}

// ── Sound helpers ─────────────────────────────────────────────────────────────

function playBeep(freq: number, duration: number, vol = 0.3) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* browser may block autoplay before user interaction */ }
}

/** Dua beep naik — semua barang pesanan diterima */
function playReceiveSound() {
  playBeep(660, 0.15);
  setTimeout(() => playBeep(880, 0.35), 200);
  // Suara ucapan setelah beep
  setTimeout(() => {
    try {
      if (!window.speechSynthesis) return;
      const utt = new SpeechSynthesisUtterance('Tolong input data ke dalam aplikasi iPOS');
      utt.lang = 'id-ID';
      utt.rate = 0.9;
      utt.volume = 1;
      window.speechSynthesis.speak(utt);
    } catch { /* ignore */ }
  }, 700);
}

/** Tiga beep naik — stok dikonfirmasi masuk dari sync iPOS */
function playSyncConfirmSound() {
  playBeep(523, 0.12);
  setTimeout(() => playBeep(659, 0.12), 160);
  setTimeout(() => playBeep(784, 0.45, 0.4), 320);
}

// ── Component ─────────────────────────────────────────────────────────────────

function PesananContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeId = params.id as string;

  // Stabilkan supabase client — satu instance per mount, tidak trigger re-render
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>('buat');

  // ── Shared state ──────────────────────────────────────────────────────────
  const [storeName, setStoreName] = useState('Toko');
  const [iposReminder, setIposReminder] = useState<string | null>(null);
  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  // Produk yang sedang ditunggu sync-nya — pakai ref agar tidak perlu di deps Realtime
  const awaitingSyncProductsRef = useRef<Set<string>>(new Set());

  // Interval reminder suara setiap 10 menit setelah barang diterima
  const reminderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [deleteConfirmOrderId, setDeleteConfirmOrderId] = useState<string | null>(null);
  const [kosongGroups, setKosongGroups] = useState<KosongGroup[]>([]);
  const [kosongLoading, setKosongLoading] = useState(false);

  // Bersihkan interval saat komponen unmount
  useEffect(() => {
    return () => {
      if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current);
    };
  }, []);

  // ── Buat tab ──────────────────────────────────────────────────────────────
  // Inisialisasi dengan nilai aman — baca sessionStorage di useEffect setelah hydration
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [searchingProduct, setSearchingProduct] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [criticalProducts, setCriticalProducts] = useState<ProductSearchResult[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ── Rekap tab ─────────────────────────────────────────────────────────────
  const [rekap, setRekap] = useState<RekapSupplier[]>([]);
  const [rekapLoading, setRekapLoading] = useState(false);
  const [expandedRekapSupplier, setExpandedRekapSupplier] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  // ── Penerimaan tab ────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Fetch store name ───────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('stores').select('name').eq('id', storeId).single()
      .then(({ data }) => { if (data?.name) setStoreName(data.name); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Load draft dari sessionStorage setelah hydration (client-only) ───────
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`pesanan_draft_${storeId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.length > 0) {
          setPendingItems(parsed);
          setShowCreateForm(true);
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // hanya sekali setelah mount

  // ── Persist draft ke sessionStorage ──────────────────────────────────────
  useEffect(() => {
    if (pendingItems.length > 0) {
      sessionStorage.setItem(`pesanan_draft_${storeId}`, JSON.stringify(pendingItems));
    } else {
      sessionStorage.removeItem(`pesanan_draft_${storeId}`);
    }
  }, [pendingItems, storeId]);

  // ── Prefill dari master-produk — jalankan SEKALI saat mount ───────────────
  useEffect(() => {
    if (searchParams.get('from') !== 'master-produk') return;
    const stored = sessionStorage.getItem(`pesanan_prefill_${storeId}`);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      const prefilled: PendingItem[] = parsed.map((item: Record<string, unknown>) => ({
        store_product_id: item.store_product_id,
        barcode: item.barcode,
        name: item.name,
        unit: item.unit,
        hpp: item.hpp || 0,
        qty_to_order: Math.max(1, (item.max_qty as number || 0) - (item.current_qty as number || 0)),
        supplier_id: item.supplier_id || null,
        supplier_name: item.supplier_name || '-',
      }));
      setPendingItems(prefilled);
      setShowCreateForm(true);
      setActiveTab('buat');
    } catch { /* ignore */ }
    sessionStorage.removeItem(`pesanan_prefill_${storeId}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // hanya saat mount

  // ── Fetch orders (Penerimaan) ─────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select(`
        *,
        supplier:suppliers(id, code, name, phone),
        items:order_items(
          *,
          store_product:store_products(id, barcode, name, unit, hpp, sell_price)
        )
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (filterStatus === 'active') {
      query = query.in('status', ['draft', 'ordered', 'partial']);
    } else if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    const { data, error } = await query.limit(50);
    if (!error) {
      const normalized = (data || []).map((order) => {
        const sup = Array.isArray(order.supplier) ? order.supplier[0] : order.supplier;
        const items = (order.items || []).map((item: Record<string, unknown>) => {
          const sp = Array.isArray(item.store_product) ? item.store_product[0] : item.store_product;
          return { ...item, store_product: sp };
        });
        return { ...order, supplier: sup, items };
      });
      setOrders(normalized as Order[]);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, filterStatus]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Fetch rekap (Rekap tab) ───────────────────────────────────────────────
  const fetchRekap = useCallback(async () => {
    setRekapLoading(true);
    const { data: activeOrders } = await supabase
      .from('orders')
      .select(`
        id, do_number, status,
        items:order_items(
          id, qty_ordered, hpp_at_order, status,
          store_product:store_products(
            id, barcode, name, unit, hpp,
            supplier:suppliers(id, name, phone, email)
          )
        )
      `)
      .eq('store_id', storeId)
      .in('status', ['draft', 'ordered'])
      .order('created_at', { ascending: false });

    const supplierMap = new Map<string, RekapSupplier>();
    (activeOrders || []).forEach((rawOrder: Record<string, unknown>) => {
      const doNumber = rawOrder.do_number as string;
      const rawItems = Array.isArray(rawOrder.items) ? rawOrder.items : [];

      (rawItems as Record<string, unknown>[]).forEach((item) => {
        const sp = Array.isArray(item.store_product) ? item.store_product[0] : item.store_product;
        const spData = sp as Record<string, unknown> | null;
        if (!spData) return;

        // Kelompokkan berdasarkan supplier produk (bukan supplier order)
        const rawSup = Array.isArray(spData.supplier) ? (spData.supplier as unknown[])[0] : spData.supplier;
        const supData = rawSup as Record<string, string> | null;
        const supplierId = supData?.id || 'unknown';

        if (!supplierMap.has(supplierId)) {
          supplierMap.set(supplierId, {
            supplierId,
            supplierName: supData?.name || 'Tanpa Supplier',
            supplierPhone: supData?.phone,
            supplierEmail: supData?.email,
            items: [],
            totalItems: 0,
            totalValue: 0,
          });
        }

        const entry = supplierMap.get(supplierId)!;
        const hpp = (item.hpp_at_order as number) || (spData.hpp as number) || 0;
        const qty = (item.qty_ordered as number) || 0;
        const subtotal = qty * hpp;

        entry.items.push({
          productName: (spData.name as string) || '-',
          barcode: (spData.barcode as string) || '-',
          unit: (spData.unit as string) || '-',
          qty,
          hpp,
          subtotal,
          doNumber,
        });
        entry.totalItems += qty;
        entry.totalValue += subtotal;
      });
    });

    const result = Array.from(supplierMap.values()).filter(s => s.items.length > 0);
    setRekap(result);
    setRekapLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    if (activeTab === 'rekap') fetchRekap();
  }, [activeTab, fetchRekap]);

  // ── Supabase Realtime: deteksi stok bertambah setelah sync iPOS ───────────
  useEffect(() => {
    const channel = supabase
      .channel(`stock-watch-${storeId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stock' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const productId = payload.new?.store_product_id as string;
          const newQty = payload.new?.current_qty as number;
          const oldQty = payload.old?.current_qty as number;
          if (
            productId &&
            awaitingSyncProductsRef.current.has(productId) &&
            typeof newQty === 'number' &&
            typeof oldQty === 'number' &&
            newQty > oldQty
          ) {
            playSyncConfirmSound();
            setSyncNotification('Stok sudah bertambah dari sync iPOS');
            awaitingSyncProductsRef.current.delete(productId);

            // Hentikan interval reminder — stok sudah dikonfirmasi masuk
            if (reminderIntervalRef.current) {
              clearInterval(reminderIntervalRef.current);
              reminderIntervalRef.current = null;
            }
            setIposReminder(null); // tutup banner amber juga
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Fetch produk kritis (saran pesanan) ───────────────────────────────────
  const fetchCriticalStock = useCallback(async () => {
    setLoadingSuggestions(true);
    const { data } = await supabase
      .from('store_products')
      .select(`
        id, barcode, name, unit, hpp,
        supplier:suppliers(id, name),
        stock(current_qty, min_qty, max_qty)
      `)
      .eq('store_id', storeId)
      .eq('is_active', true)
      .eq('is_deleted', false);

    if (data) {
      const critical: ProductSearchResult[] = [];
      for (const d of data) {
        const stock = Array.isArray(d.stock) ? d.stock[0] : d.stock;
        const sup = Array.isArray(d.supplier) ? d.supplier[0] : d.supplier;
        const currentQty = (stock as Record<string, number> | null)?.current_qty ?? 0;
        const minQty = (stock as Record<string, number> | null)?.min_qty ?? 0;
        const maxQty = (stock as Record<string, number> | null)?.max_qty ?? 0;
        let status: ProductSearchResult['status'] = 'ok';
        if (minQty > 0 && currentQty <= minQty) status = 'kritis';
        else if (maxQty > 0 && currentQty <= maxQty * 0.5) status = 'rendah';
        if (status === 'kritis' || status === 'rendah') {
          critical.push({
            store_product_id: d.id, barcode: d.barcode, name: d.name, unit: d.unit, hpp: d.hpp,
            current_qty: currentQty, min_qty: minQty, max_qty: maxQty,
            supplier_id: (sup as Record<string, string> | null)?.id || null,
            supplier_name: (sup as Record<string, string> | null)?.name || '-',
            status,
          });
        }
      }
      critical.sort((a, b) => {
        if (a.status === 'kritis' && b.status !== 'kritis') return -1;
        if (a.status !== 'kritis' && b.status === 'kritis') return 1;
        return a.current_qty - b.current_qty;
      });
      setCriticalProducts(critical.slice(0, 20));
    }
    setLoadingSuggestions(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // ── Pencarian produk ──────────────────────────────────────────────────────
  const handleProductSearch = useCallback(async (query: string) => {
    if (query.length < 2) { setProductResults([]); return; }
    setSearchingProduct(true);
    const { data } = await supabase
      .from('store_products')
      .select(`
        id, barcode, name, unit, hpp,
        supplier:suppliers(id, name),
        stock(current_qty, min_qty, max_qty)
      `)
      .eq('store_id', storeId)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .or(`name.ilike.%${query}%,barcode.ilike.%${query}%`)
      .limit(8);

    if (data) {
      const results: ProductSearchResult[] = data.map((d) => {
        const stock = Array.isArray(d.stock) ? d.stock[0] : d.stock;
        const sup = Array.isArray(d.supplier) ? d.supplier[0] : d.supplier;
        const currentQty = (stock as Record<string, number> | null)?.current_qty ?? 0;
        const minQty = (stock as Record<string, number> | null)?.min_qty ?? 0;
        const maxQty = (stock as Record<string, number> | null)?.max_qty ?? 0;
        let status: ProductSearchResult['status'] = 'ok';
        if (currentQty > maxQty && maxQty > 0) status = 'overstock';
        else if (minQty > 0 && currentQty <= minQty) status = 'kritis';
        else if (maxQty > 0 && currentQty <= maxQty * 0.5) status = 'rendah';
        return {
          store_product_id: d.id, barcode: d.barcode, name: d.name, unit: d.unit, hpp: d.hpp,
          current_qty: currentQty, min_qty: minQty, max_qty: maxQty,
          supplier_id: (sup as Record<string, string> | null)?.id || null,
          supplier_name: (sup as Record<string, string> | null)?.name || '-',
          status,
        };
      });
      setProductResults(results);
    }
    setSearchingProduct(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    const t = setTimeout(() => handleProductSearch(productSearch), 300);
    return () => clearTimeout(t);
  }, [productSearch, handleProductSearch]);

  // ── Handlers: Buat Pesanan ────────────────────────────────────────────────

  const addProductToPending = (product: ProductSearchResult) => {
    if (pendingItems.find(i => i.store_product_id === product.store_product_id)) return;
    const suggestedQty = product.max_qty > 0
      ? Math.max(1, product.max_qty - product.current_qty)
      : 1;
    setPendingItems(prev => [...prev, {
      store_product_id: product.store_product_id,
      barcode: product.barcode,
      name: product.name,
      unit: product.unit,
      hpp: product.hpp,
      qty_to_order: suggestedQty,
      supplier_id: product.supplier_id,
      supplier_name: product.supplier_name,
    }]);
    setProductSearch('');
    setProductResults([]);
    setShowProductDropdown(false);
  };

  const handleCreateOrder = async () => {
    if (pendingItems.length === 0) return;
    setCreating(true);

    const bySupplier = new Map<string, PendingItem[]>();
    for (const item of pendingItems) {
      const key = item.supplier_id || 'unknown';
      if (!bySupplier.has(key)) bySupplier.set(key, []);
      bySupplier.get(key)!.push(item);
    }

    const { data: store } = await supabase.from('stores').select('code').eq('id', storeId).single();
    const storeCode = store?.code || 'XX';
    const { count } = await supabase.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .gte('order_date', new Date().toISOString().split('T')[0]);

    let seq = (count || 0) + 1;
    const { data: { user } } = await supabase.auth.getUser();

    for (const [supplierId, items] of Array.from(bySupplier.entries())) {
      const doNumber = generateDoNumber(storeCode, seq++);
      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          store_id: storeId,
          supplier_id: supplierId === 'unknown' ? null : supplierId,
          do_number: doNumber,
          status: 'draft',
        })
        .select()
        .single();

      if (orderErr || !newOrder) { console.error('Error creating order:', orderErr); continue; }

      await supabase.from('order_items').insert(
        items.map(item => ({
          order_id: newOrder.id,
          store_product_id: item.store_product_id,
          qty_ordered: item.qty_to_order,
          hpp_at_order: item.hpp,
          status: 'pending',
        }))
      );
      await supabase.from('audit_log').insert({
        user_id: user?.id || null,
        store_id: storeId,
        action: 'create_order',
        entity_type: 'order',
        entity_id: newOrder.id,
        detail: { do_number: doNumber, items_count: items.length, supplier_id: supplierId },
      });
    }

    setCreating(false);
    setPendingItems([]);
    setShowCreateForm(false);
    setProductSearch('');
    sessionStorage.removeItem(`pesanan_draft_${storeId}`);
    fetchOrders();
    setActiveTab('terima'); // pindah ke tab Penerimaan setelah buat pesanan
  };

  // ── Handlers: Penerimaan ──────────────────────────────────────────────────

  /**
   * Fix Bug #4 + #5:
   * - Semua komputasi dilakukan dari closure `orders` sebelum memanggil setState
   * - Tidak ada side effect di dalam setState callback
   * - allReceived dihitung dari data yang sudah diketahui, bukan dari dalam setState
   */
  const handleConfirmItem = async (
    orderId: string,
    itemId: string,
    qtyReceived: number,
    _storeProductId: string,
  ) => {
    setActionLoading(itemId);

    const { error } = await supabase
      .from('order_items')
      .update({ qty_received: qtyReceived, status: 'received', received_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      console.error('Error confirming item:', error);
      setActionLoading(null);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_log').insert({
      user_id: user?.id || null,
      store_id: storeId,
      action: 'receive_item',
      entity_type: 'order_item',
      entity_id: itemId,
      detail: { order_id: orderId, qty_received: qtyReceived, note: 'stok diupdate via sync iPOS' },
    });

    // Hitung state baru dari closure orders — tidak menggunakan setState dengan side effect
    const currentOrder = orders.find(o => o.id === orderId);
    if (!currentOrder) { setActionLoading(null); return; }

    const updatedItems = currentOrder.items?.map(item =>
      item.id === itemId
        ? { ...item, qty_received: qtyReceived, status: 'received' as const }
        : item
    );
    const allReceived = updatedItems?.every(i => i.status === 'received' || i.status === 'cancelled') ?? false;
    const someReceived = updatedItems?.some(i => i.status === 'received') ?? false;
    const newStatus = allReceived ? 'complete' as const
      : someReceived ? 'partial' as const
      : currentOrder.status;

    // Update DB
    await supabase.from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    // Update local state — murni tanpa side effect
    setOrders(prev => prev.map(o =>
      o.id !== orderId ? o : { ...o, items: updatedItems, status: newStatus }
    ));

    // Semua item diterima → play sound + reminder + interval 10 menit + watch sync
    if (allReceived) {
      playReceiveSound();
      setIposReminder(currentOrder.do_number);

      // Daftarkan produk untuk dipantau Realtime sync
      updatedItems?.forEach(item => {
        if (item.store_product_id) {
          awaitingSyncProductsRef.current.add(item.store_product_id);
        }
      });

      // Mulai interval pengingat suara setiap 10 menit
      if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current);
      reminderIntervalRef.current = setInterval(() => {
        try {
          playBeep(440, 0.25, 0.4);
          setTimeout(() => playBeep(550, 0.25, 0.4), 280);
          setTimeout(() => {
            if (!window.speechSynthesis) return;
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance('Tolong segera update barang ke aplikasi iPOS');
            utt.lang = 'id-ID';
            utt.rate = 0.9;
            utt.volume = 1;
            window.speechSynthesis.speak(utt);
          }, 700);
        } catch { /* ignore */ }
      }, 10 * 60 * 1000); // 10 menit
    }

    setActionLoading(null);
  };

  const handleMarkOrdered = async (orderId: string) => {
    setActionLoading(`order-${orderId}`);
    await supabase.from('orders')
      .update({ status: 'ordered', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_log').insert({
      user_id: user?.id || null, store_id: storeId,
      action: 'mark_ordered', entity_type: 'order', entity_id: orderId,
    });
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, status: 'ordered' as const } : o
    ));
    setActionLoading(null);
  };

  const handleMarkSent = async (orderId: string, via: string) => {
    setActionLoading(`sent-${orderId}`);
    await supabase.from('orders').update({
      sent_at: new Date().toISOString(), sent_via: via,
      status: 'ordered', updated_at: new Date().toISOString(),
    }).eq('id', orderId);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_log').insert({
      user_id: user?.id || null, store_id: storeId,
      action: 'order_sent', entity_type: 'order', entity_id: orderId,
      detail: { sent_via: via },
    });
    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? { ...o, status: 'ordered' as const, sent_at: new Date().toISOString(), sent_via: via }
        : o
    ));
    setActionLoading(null);
  };

  const handleCompleteOrder = async (orderId: string) => {
    setActionLoading(`complete-${orderId}`);
    await supabase.from('orders')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_log').insert({
      user_id: user?.id || null, store_id: storeId,
      action: 'complete_order', entity_type: 'order', entity_id: orderId,
    });
    fetchOrders();
    setActionLoading(null);
  };

  const fetchKosong = useCallback(async () => {
    setKosongLoading(true);
    const { data: orderData } = await supabase
      .from('orders')
      .select('id')
      .eq('store_id', storeId);

    const orderIds = (orderData || []).map((o: Record<string, string>) => o.id);
    if (orderIds.length === 0) { setKosongGroups([]); setKosongLoading(false); return; }

    const { data } = await supabase
      .from('order_items')
      .select(`
        id, qty_ordered, received_at,
        order:orders(do_number, order_date),
        store_product:store_products(
          id, barcode, name, unit, hpp,
          supplier:suppliers(id, name, phone)
        )
      `)
      .eq('status', 'cancelled')
      .in('order_id', orderIds)
      .order('received_at', { ascending: false });

    const groupMap = new Map<string, KosongGroup>();
    for (const row of (data || [])) {
      const sp = Array.isArray(row.store_product) ? row.store_product[0] : row.store_product;
      const spData = sp as Record<string, unknown> | null;
      if (!spData) continue;
      const rawSup = Array.isArray(spData.supplier) ? (spData.supplier as unknown[])[0] : spData.supplier;
      const sup = rawSup as Record<string, string> | null;
      const supplierId = sup?.id || 'unknown';
      const orderRaw = Array.isArray(row.order) ? row.order[0] : row.order;
      const orderData2 = orderRaw as Record<string, string> | null;

      if (!groupMap.has(supplierId)) {
        groupMap.set(supplierId, {
          supplierId,
          supplierName: sup?.name || 'Tanpa Supplier',
          supplierPhone: sup?.phone,
          items: [],
        });
      }
      groupMap.get(supplierId)!.items.push({
        itemId: row.id as string,
        productId: spData.id as string,
        barcode: spData.barcode as string,
        productName: spData.name as string,
        unit: (spData.unit as string) || '-',
        hpp: (spData.hpp as number) || 0,
        qtyOrdered: (row.qty_ordered as number) || 0,
        doNumber: orderData2?.do_number || '-',
        tanggal: orderData2?.order_date || (row.received_at as string) || '',
      });
    }
    setKosongGroups(Array.from(groupMap.values()));
    setKosongLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    if (activeTab === 'kosong') fetchKosong();
  }, [activeTab, fetchKosong]);

  const handleAddKosongToOrder = (item: KosongItem, supplierName: string) => {
    const alreadyAdded = pendingItems.some(p => p.store_product_id === item.productId);
    if (alreadyAdded) return;
    const sup = kosongGroups.find(g => g.items.some(i => i.productId === item.productId));
    setPendingItems(prev => [...prev, {
      store_product_id: item.productId,
      barcode: item.barcode,
      name: item.productName,
      unit: item.unit,
      hpp: item.hpp,
      qty_to_order: item.qtyOrdered,
      supplier_id: sup?.supplierId === 'unknown' ? null : (sup?.supplierId || null),
      supplier_name: supplierName,
    }]);
    setActiveTab('buat');
    setShowCreateForm(true);
  };

  const handleDeleteItem = async (orderId: string, itemId: string) => {
    setActionLoading(`del-item-${itemId}`);
    await supabase.from('order_items').delete().eq('id', itemId);

    const currentOrder = orders.find(o => o.id === orderId);
    const remainingItems = currentOrder?.items?.filter(i => i.id !== itemId) || [];

    if (remainingItems.length === 0) {
      await supabase.from('orders').delete().eq('id', orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } else {
      setOrders(prev => prev.map(o =>
        o.id !== orderId ? o : { ...o, items: remainingItems }
      ));
    }
    setActionLoading(null);
  };

  const handleDeleteOrder = async (orderId: string) => {
    setActionLoading(`del-order-${orderId}`);
    await supabase.from('order_items').delete().eq('order_id', orderId);
    await supabase.from('orders').delete().eq('id', orderId);
    setOrders(prev => prev.filter(o => o.id !== orderId));
    setDeleteConfirmOrderId(null);
    setActionLoading(null);
  };

  const handleReceiveAll = async (orderId: string) => {
    setActionLoading(`receive-all-${orderId}`);
    const currentOrder = orders.find(o => o.id === orderId);
    if (!currentOrder) { setActionLoading(null); return; }

    const pendingItems = currentOrder.items?.filter(
      i => i.status !== 'received' && i.status !== 'cancelled'
    ) || [];

    for (const item of pendingItems) {
      const input = document.getElementById(`qty-${item.id}`) as HTMLInputElement;
      const qty = parseFloat(input?.value || String(item.qty_ordered));
      await supabase.from('order_items').update({
        qty_received: qty,
        status: 'received',
        received_at: new Date().toISOString(),
      }).eq('id', item.id);
    }

    await supabase.from('orders')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', orderId);

    const updatedItems = currentOrder.items?.map(item =>
      item.status === 'received' || item.status === 'cancelled' ? item
        : { ...item, qty_received: item.qty_ordered, status: 'received' as const }
    );
    setOrders(prev => prev.map(o =>
      o.id !== orderId ? o : { ...o, items: updatedItems, status: 'complete' as const }
    ));

    playReceiveSound();
    setIposReminder(currentOrder.do_number);
    updatedItems?.forEach(item => {
      if (item.store_product_id) awaitingSyncProductsRef.current.add(item.store_product_id);
    });

    if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current);
    reminderIntervalRef.current = setInterval(() => {
      try {
        playBeep(440, 0.25, 0.4);
        setTimeout(() => playBeep(550, 0.25, 0.4), 280);
        setTimeout(() => {
          if (!window.speechSynthesis) return;
          window.speechSynthesis.cancel();
          const utt = new SpeechSynthesisUtterance('Tolong segera update barang ke aplikasi iPOS');
          utt.lang = 'id-ID';
          utt.rate = 0.9;
          utt.volume = 1;
          window.speechSynthesis.speak(utt);
        }, 700);
      } catch { /* ignore */ }
    }, 10 * 60 * 1000);

    setActionLoading(null);
  };

  const handleMarkKosong = async (orderId: string, itemId: string) => {
    setActionLoading(`kosong-${itemId}`);
    await supabase.from('order_items').update({
      qty_received: 0,
      status: 'cancelled',
      received_at: new Date().toISOString(),
    }).eq('id', itemId);

    const currentOrder = orders.find(o => o.id === orderId);
    if (!currentOrder) { setActionLoading(null); return; }

    const updatedItems = currentOrder.items?.map(item =>
      item.id === itemId ? { ...item, qty_received: 0, status: 'cancelled' as const } : item
    );
    const allDone = updatedItems?.every(i => i.status === 'received' || i.status === 'cancelled') ?? false;
    const anyReceived = updatedItems?.some(i => i.status === 'received') ?? false;
    const newStatus = allDone
      ? (anyReceived ? 'complete' as const : 'cancelled' as const)
      : currentOrder.status;

    if (allDone) {
      await supabase.from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);
    }

    setOrders(prev => prev.map(o =>
      o.id !== orderId ? o : { ...o, items: updatedItems, status: newStatus }
    ));
    setActionLoading(null);
  };

  // ── Handlers: Rekap ───────────────────────────────────────────────────────

  const handleSendWhatsApp = (supplier: RekapSupplier) => {
    let message = `*PESANAN STOK*\n\nKepada: ${supplier.supplierName}\n\n`;
    supplier.items.forEach((item, i) => {
      message += `${i + 1}. ${item.productName} - ${item.qty} ${item.unit}\n`;
    });
    message += `\nTotal: ${supplier.totalItems} item\nNilai: ${formatRupiah(supplier.totalValue)}\n\nMohon konfirmasi. Terima kasih.`;
    const phone = supplier.supplierPhone?.replace(/[^0-9]/g, '') || '';
    const waPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSendEmail = (supplier: RekapSupplier) => {
    const subject = `Pesanan Stok - ${supplier.supplierName}`;
    let body = `Kepada ${supplier.supplierName},\n\nBerikut daftar pesanan stok kami:\n\n`;
    supplier.items.forEach((item, i) => {
      body += `${i + 1}. ${item.productName} (${item.barcode}) - ${item.qty} ${item.unit} @ ${formatRupiah(item.hpp)}\n`;
    });
    body += `\nTotal: ${supplier.totalItems} item\nNilai: ${formatRupiah(supplier.totalValue)}\n\nMohon konfirmasi ketersediaan.\nTerima kasih.`;
    window.open(
      `mailto:${supplier.supplierEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      '_self',
    );
  };

  const handleDownloadPdf = async (supplier: RekapSupplier) => {
    setPdfLoading(supplier.supplierId);
    try {
      const [{ pdf }, { RekapPDFDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/ui/RekapPDF'),
      ]);
      const props: RekapPDFProps = {
        storeName,
        supplierName: supplier.supplierName,
        supplierPhone: supplier.supplierPhone,
        items: supplier.items.map(item => ({
          productName: item.productName,
          barcode: item.barcode,
          unit: item.unit,
          qty: item.qty,
          subtotal: item.subtotal,
        })),
        totalItems: Math.round(supplier.totalItems),
        totalValue: supplier.totalValue,
      };
      const blob = await pdf(<RekapPDFDocument {...props} />).toBlob();
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeName = supplier.supplierName.replace(/[^a-zA-Z0-9]/g, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `SuratPesanan-${safeName}-${dateStr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Gagal generate PDF:', err);
      alert('Gagal membuat PDF. Coba lagi.');
    } finally {
      setPdfLoading(null);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredOrders = orders.filter(o =>
    o.do_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.supplier?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const STATUS_BADGE: Record<string, string> = {
    kritis:    'bg-red-100 text-red-700',
    rendah:    'bg-yellow-100 text-yellow-700',
    ok:        'bg-green-100 text-green-700',
    overstock: 'bg-blue-100 text-blue-700',
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-800">Pesanan & Penerimaan</h1>
        <p className="text-sm text-gray-500 mt-1">
          Buat pesanan ke supplier, lihat rekap, dan konfirmasi penerimaan barang
        </p>
      </div>

      {/* ── Notifikasi global ─────────────────────────────────────────────── */}
      {iposReminder && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg">
          <MonitorSmartphone className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              Semua barang pesanan <span className="font-mono">{iposReminder}</span> sudah diterima
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Segera input penerimaan di <strong>iPOS 4</strong> agar stok terupdate saat sync berikutnya.
            </p>
          </div>
          <button
            onClick={() => {
              setIposReminder(null);
              // User tutup manual → hentikan interval reminder
              if (reminderIntervalRef.current) {
                clearInterval(reminderIntervalRef.current);
                reminderIntervalRef.current = null;
              }
            }}
            className="text-amber-400 hover:text-amber-600 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {syncNotification && (
        <div className="flex items-start gap-3 px-4 py-3 bg-green-50 border border-green-300 rounded-lg">
          <Bell className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Stok sudah diperbarui dari sync iPOS</p>
            <p className="text-xs text-green-700 mt-0.5">
              Sistem mendeteksi stok bertambah dari sync agent. Cek Master Produk untuk detail terbaru.
            </p>
          </div>
          <button onClick={() => setSyncNotification(null)} className="text-green-400 hover:text-green-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Tab navigation ────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([
          { id: 'buat',   label: 'Buat Pesanan',  icon: ShoppingCart },
          { id: 'rekap',  label: 'Rekap Supplier', icon: ClipboardList },
          { id: 'terima', label: 'Penerimaan',     icon: Package },
          { id: 'kosong', label: 'Kosong',         icon: AlertTriangle },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ══ TAB: BUAT PESANAN ════════════════════════════════════════════════ */}
      {activeTab === 'buat' && (
        <div className="space-y-4">
          {!showCreateForm ? (
            <div className="card text-center py-16">
              <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Buat pesanan baru ke supplier</p>
              <p className="text-sm text-gray-400 mt-1 mb-4">
                Cari produk yang ingin dipesan atau lihat saran stok kritis
              </p>
              <button
                onClick={() => { setShowCreateForm(true); fetchCriticalStock(); }}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />Buat Pesanan
              </button>
            </div>
          ) : (
            <div className="card border-blue-200 bg-blue-50/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">
                  Buat Pesanan Baru{pendingItems.length > 0 && ` · ${pendingItems.length} item`}
                </h3>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setPendingItems([]);
                    setProductSearch('');
                    sessionStorage.removeItem(`pesanan_draft_${storeId}`);
                  }}
                  className="p-1 hover:bg-gray-200 rounded-lg"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              {/* Pencarian produk */}
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cari produk (nama atau barcode)..."
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="input-field pl-10"
                  />
                </div>
                {showProductDropdown && productSearch.length >= 2 && (
                  <div className="absolute top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 z-20 max-h-64 overflow-y-auto">
                    {searchingProduct ? (
                      <div className="p-4 text-center text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Mencari...
                      </div>
                    ) : productResults.length === 0 ? (
                      <div className="p-4 text-center text-gray-400 text-sm">Produk tidak ditemukan</div>
                    ) : productResults.map((p) => {
                      const alreadyAdded = pendingItems.some(i => i.store_product_id === p.store_product_id);
                      return (
                        <button
                          key={p.store_product_id}
                          onClick={() => !alreadyAdded && addProductToPending(p)}
                          disabled={alreadyAdded}
                          className={`w-full px-4 py-3 text-left border-b last:border-0 flex items-center justify-between ${
                            alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{p.name}</p>
                            <p className="text-xs text-gray-400">
                              {p.barcode} · Stok: {p.current_qty} · {p.supplier_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[p.status]}`}>
                              {p.status}
                            </span>
                            {alreadyAdded
                              ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                              : <Plus className="w-4 h-4 text-blue-500" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Saran produk kritis */}
              <div>
                <button
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className="flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700"
                >
                  <PackageSearch className="w-4 h-4" />
                  Saran Produk Kritis
                  {criticalProducts.length > 0 && (
                    <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                      {criticalProducts.length}
                    </span>
                  )}
                  {loadingSuggestions && <Loader2 className="w-3 h-3 animate-spin" />}
                  {showSuggestions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showSuggestions && (
                  <div className="mt-2 border rounded-lg overflow-hidden">
                    {criticalProducts.length === 0 ? (
                      <p className="text-sm text-gray-400 p-4 text-center">
                        {loadingSuggestions ? 'Memuat...' : 'Tidak ada produk stok kritis saat ini'}
                      </p>
                    ) : (
                      <div className="max-h-60 overflow-y-auto">
                        {criticalProducts.map((p) => {
                          const alreadyAdded = pendingItems.some(i => i.store_product_id === p.store_product_id);
                          return (
                            <div
                              key={p.store_product_id}
                              className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 hover:bg-gray-50"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm truncate">{p.name}</p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_BADGE[p.status]}`}>
                                    {p.status}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400">
                                  Stok: {p.current_qty} / Min: {p.min_qty} · {p.supplier_name}
                                </p>
                              </div>
                              <button
                                onClick={() => !alreadyAdded && addProductToPending(p)}
                                disabled={alreadyAdded}
                                className={`ml-3 shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                                  alreadyAdded
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {alreadyAdded ? <CheckCircle2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                {alreadyAdded ? 'Ditambah' : 'Tambah'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Daftar item pending */}
              {pendingItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Item Pesanan
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b">
                            <th className="px-3 py-2">Produk</th>
                            <th className="px-3 py-2">Supplier</th>
                            <th className="px-3 py-2 text-right">HPP</th>
                            <th className="px-3 py-2 text-center">Qty Pesan</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingItems.map((item, idx) => (
                            <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <p className="font-medium">{item.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{item.barcode}</p>
                              </td>
                              <td className="px-3 py-2 text-gray-500 text-xs">{item.supplier_name}</td>
                              <td className="px-3 py-2 text-right text-xs">{formatRupiah(item.hpp)}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  value={item.qty_to_order}
                                  onChange={(e) =>
                                    setPendingItems(prev =>
                                      prev.map((it, i) =>
                                        i === idx ? { ...it, qty_to_order: parseFloat(e.target.value) || 0 } : it
                                      )
                                    )
                                  }
                                  className="w-20 px-2 py-1 border rounded text-center text-sm mx-auto block"
                                  min={1}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => setPendingItems(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={handleCreateOrder}
                      disabled={creating}
                      className="btn-primary flex items-center gap-2"
                    >
                      {creating
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <ShoppingCart className="w-4 h-4" />}
                      Buat Pesanan
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: REKAP SUPPLIER ══════════════════════════════════════════════ */}
      {activeTab === 'rekap' && (
        <div className="space-y-3">
          {/* Tombol refresh manual */}
          <div className="flex justify-end">
            <button
              onClick={fetchRekap}
              disabled={rekapLoading}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {rekapLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RotateCcw className="w-3.5 h-3.5" />}
              Refresh
            </button>
          </div>

          {rekapLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : rekap.length === 0 ? (
            <div className="card text-center py-16">
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Belum ada rekap</p>
              <p className="text-sm text-gray-400 mt-1">
                Buat pesanan di tab &quot;Buat Pesanan&quot; terlebih dahulu
              </p>
            </div>
          ) : rekap.map((supplier) => {
            const isExpanded = expandedRekapSupplier === supplier.supplierId;
            return (
              <div key={supplier.supplierId} className="card p-0 overflow-hidden">
                <button
                  onClick={() => setExpandedRekapSupplier(isExpanded ? null : supplier.supplierId)}
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">{supplier.supplierName}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span>{supplier.items.length} produk</span>
                        <span>{formatRupiah(supplier.totalValue)}</span>
                      </div>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-5 h-5 text-gray-400" />
                      : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="table-header">
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">No. Pesanan</th>
                            <th className="px-3 py-2">Produk</th>
                            <th className="px-3 py-2">Barcode</th>
                            <th className="px-3 py-2">Satuan</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">HPP</th>
                            <th className="px-3 py-2 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplier.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="table-cell text-gray-400 text-sm">{idx + 1}</td>
                              <td className="table-cell font-mono text-xs text-blue-600">{item.doNumber || '-'}</td>
                              <td className="table-cell font-medium text-sm">{item.productName}</td>
                              <td className="table-cell font-mono text-xs">{item.barcode}</td>
                              <td className="table-cell text-sm">{item.unit}</td>
                              <td className="table-cell text-right font-medium">{item.qty}</td>
                              <td className="table-cell text-right text-sm">{formatRupiah(item.hpp)}</td>
                              <td className="table-cell text-right font-medium">{formatRupiah(item.subtotal)}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-semibold">
                            <td colSpan={5} className="px-3 py-2 text-sm text-right">Total:</td>
                            <td className="px-3 py-2 text-right text-sm">{supplier.totalItems}</td>
                            <td className="px-3 py-2"></td>
                            <td className="px-3 py-2 text-right text-sm">{formatRupiah(supplier.totalValue)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="px-4 py-3 bg-gray-50 flex flex-wrap gap-2 justify-end">
                      <button
                        onClick={() => handleSendWhatsApp(supplier)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />Kirim WA
                      </button>
                      <button
                        onClick={() => handleSendEmail(supplier)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        <Mail className="w-4 h-4" />Email
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(supplier)}
                        disabled={pdfLoading === supplier.supplierId}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {pdfLoading === supplier.supplierId
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Download className="w-4 h-4" />}
                        {pdfLoading === supplier.supplierId ? 'Membuat PDF...' : 'Download PDF'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ TAB: PENERIMAAN ══════════════════════════════════════════════════ */}
      {activeTab === 'terima' && (
        <div className="space-y-4">
          {/* Filter & Search */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cari DO number atau supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field w-auto"
            >
              <option value="active">Pesanan Aktif</option>
              <option value="draft">Draft</option>
              <option value="ordered">Dipesan</option>
              <option value="partial">Sebagian Diterima</option>
              <option value="complete">Selesai</option>
              <option value="cancelled">Semua Kosong</option>
              <option value="all">Semua</option>
            </select>
          </div>

          {/* Daftar pesanan */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="card text-center py-16">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Belum ada pesanan</p>
              <p className="text-sm text-gray-400 mt-1">
                Buat pesanan di tab &quot;Buat Pesanan&quot; terlebih dahulu
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const isExpanded = expandedOrder === order.id;
                const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.draft;
                const totalItems = order.items?.length || 0;
                const receivedItems = order.items?.filter(i => i.status === 'received').length || 0;
                const hasUnreceivedItems = order.items?.some(i => i.status !== 'received' && i.status !== 'cancelled');

                return (
                  <div key={order.id} className="card p-0 overflow-hidden">
                    <button
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800 font-mono text-sm">
                              {order.do_number}
                            </span>
                            <span className={statusInfo.class}>{statusInfo.label}</span>
                            {order.sent_via && (
                              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                via {order.sent_via}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {order.supplier?.name || 'Supplier tidak diketahui'}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span>{formatDateShort(order.order_date)}</span>
                            <span>{receivedItems}/{totalItems} item diterima</span>
                            {order.sent_at && (
                              <span>Dikirim: {formatDateShort(order.sent_at)}</span>
                            )}
                          </div>
                        </div>
                        {isExpanded
                          ? <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
                          : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />}
                      </div>
                    </button>

                    {isExpanded && order.items && (
                      <div className="border-t border-gray-100">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="table-header">
                                <th className="px-3 py-2">Produk</th>
                                <th className="px-3 py-2">Satuan</th>
                                <th className="px-3 py-2 text-right">Qty Pesan</th>
                                <th className="px-3 py-2 text-right">Qty Diterima</th>
                                <th className="px-3 py-2 text-right">HPP</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Aksi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item) => {
                                const itemStatus = item.status === 'cancelled'
                                  ? { label: 'Kosong', class: 'badge-danger' }
                                  : (STATUS_LABELS[item.status] || STATUS_LABELS.pending);
                                const isItemLoading = actionLoading === item.id;
                                return (
                                  <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="table-cell">
                                      <p className="font-medium text-sm">{item.store_product?.name || '-'}</p>
                                      <p className="text-xs text-gray-400 font-mono">{item.store_product?.barcode}</p>
                                    </td>
                                    <td className="table-cell text-sm">{item.store_product?.unit || '-'}</td>
                                    <td className="table-cell text-right font-medium">{item.qty_ordered}</td>
                                    <td className="table-cell text-right">
                                      {item.status === 'received' ? (
                                        <span className="font-medium text-green-600">{item.qty_received}</span>
                                      ) : (
                                        <input
                                          type="number"
                                          defaultValue={item.qty_ordered}
                                          min={0}
                                          className="w-20 px-2 py-1 border rounded text-right text-sm"
                                          id={`qty-${item.id}`}
                                        />
                                      )}
                                    </td>
                                    <td className="table-cell text-right text-sm">
                                      {item.hpp_at_order ? formatRupiah(item.hpp_at_order) : '-'}
                                    </td>
                                    <td className="table-cell">
                                      <span className={itemStatus.class}>{itemStatus.label}</span>
                                    </td>
                                    <td className="table-cell">
                                      {item.status !== 'received' && item.status !== 'cancelled' && (
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => {
                                              const input = document.getElementById(`qty-${item.id}`) as HTMLInputElement;
                                              const qty = parseFloat(input?.value || '0');
                                              handleConfirmItem(order.id, item.id, qty, item.store_product_id);
                                            }}
                                            disabled={!!actionLoading}
                                            className="text-xs btn-primary py-1 px-2"
                                          >
                                            {actionLoading === item.id ? (
                                              <Loader2 className="w-3 h-3 inline animate-spin" />
                                            ) : (
                                              <><CheckCircle2 className="w-3 h-3 inline mr-1" />Terima</>
                                            )}
                                          </button>
                                          <button
                                            onClick={() => handleMarkKosong(order.id, item.id)}
                                            disabled={!!actionLoading}
                                            title="Tandai kosong / tidak tersedia"
                                            className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                          >
                                            {actionLoading === `kosong-${item.id}` ? (
                                              <Loader2 className="w-3 h-3 inline animate-spin" />
                                            ) : 'Kosong'}
                                          </button>
                                          <button
                                            onClick={() => handleDeleteItem(order.id, item.id)}
                                            disabled={!!actionLoading}
                                            title="Hapus item ini"
                                            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                                          >
                                            {actionLoading === `del-item-${item.id}` ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                              <Trash2 className="w-3.5 h-3.5" />
                                            )}
                                          </button>
                                        </div>
                                      )}
                                      {item.status === 'received' && item.qty_received !== item.qty_ordered && (
                                        <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                                          <AlertTriangle className="w-3 h-3" />Selisih
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="px-4 py-3 bg-gray-50 flex flex-wrap justify-between gap-2">
                          {/* Kiri: Hapus DO */}
                          <button
                            onClick={() => setDeleteConfirmOrderId(order.id)}
                            disabled={!!actionLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />Hapus DO
                          </button>

                          {/* Kanan: aksi utama */}
                          <div className="flex flex-wrap gap-2">
                            {order.status === 'draft' && !order.sent_at && (
                              <>
                                <button
                                  onClick={() => handleMarkSent(order.id, 'whatsapp')}
                                  disabled={actionLoading === `sent-${order.id}`}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                                >
                                  <Send className="w-3.5 h-3.5" />Kirim WA
                                </button>
                                <button
                                  onClick={() => handleMarkOrdered(order.id)}
                                  disabled={actionLoading === `order-${order.id}`}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                                >
                                  <ShoppingCart className="w-3.5 h-3.5" />Tandai Dipesan
                                </button>
                              </>
                            )}
                            {hasUnreceivedItems && order.status !== 'complete' && (
                              <button
                                onClick={() => handleReceiveAll(order.id)}
                                disabled={actionLoading === `receive-all-${order.id}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
                              >
                                {actionLoading === `receive-all-${order.id}` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                Terima Semua
                              </button>
                            )}
                            {order.status !== 'complete' && !hasUnreceivedItems && (
                              <button
                                onClick={() => handleCompleteOrder(order.id)}
                                disabled={actionLoading === `complete-${order.id}`}
                                className="btn-primary text-sm py-1.5"
                              >
                                {actionLoading === `complete-${order.id}` ? (
                                  <Loader2 className="w-4 h-4 inline animate-spin mr-1" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 inline mr-1" />
                                )}
                                Selesaikan Pesanan
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* ══ TAB: KOSONG ══════════════════════════════════════════════════════ */}
      {activeTab === 'kosong' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Produk Kosong per Supplier</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Item yang ditandai kosong — bisa langsung ditambahkan ke pesanan minggu depan
              </p>
            </div>
            <button
              onClick={fetchKosong}
              disabled={kosongLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${kosongLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {kosongLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : kosongGroups.length === 0 ? (
            <div className="card text-center py-16">
              <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Tidak ada item kosong</p>
              <p className="text-sm text-gray-400 mt-1">
                Semua pesanan terpenuhi dari supplier
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {kosongGroups.map((group) => (
                <div key={group.supplierId} className="card p-0 overflow-hidden">
                  {/* Header supplier */}
                  <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-100">
                    <div>
                      <p className="font-semibold text-gray-800">{group.supplierName}</p>
                      <p className="text-xs text-amber-700 mt-0.5">{group.items.length} produk kosong</p>
                    </div>
                    <button
                      onClick={() => {
                        const unAdded = group.items.filter(
                          item => !pendingItems.some(p => p.store_product_id === item.productId)
                        );
                        unAdded.forEach(item => handleAddKosongToOrder(item, group.supplierName));
                        if (unAdded.length > 0) { setActiveTab('buat'); setShowCreateForm(true); }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Pesan Semua
                    </button>
                  </div>

                  {/* Tabel item */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="table-header">
                          <th className="px-3 py-2 text-left">Produk</th>
                          <th className="px-3 py-2 text-right">Qty Pesan</th>
                          <th className="px-3 py-2">DO / Tanggal</th>
                          <th className="px-3 py-2 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => {
                          const alreadyAdded = pendingItems.some(p => p.store_product_id === item.productId);
                          return (
                            <tr key={item.itemId} className="hover:bg-gray-50">
                              <td className="table-cell">
                                <p className="font-medium text-sm">{item.productName}</p>
                                <p className="text-xs text-gray-400 font-mono">{item.barcode}</p>
                              </td>
                              <td className="table-cell text-right font-medium">
                                {item.qtyOrdered} {item.unit}
                              </td>
                              <td className="table-cell">
                                <p className="text-xs font-mono text-gray-600">{item.doNumber}</p>
                                <p className="text-xs text-gray-400">{formatDateShort(item.tanggal)}</p>
                              </td>
                              <td className="table-cell text-center">
                                {alreadyAdded ? (
                                  <span className="text-xs text-green-600 flex items-center justify-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />Ditambahkan
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleAddKosongToOrder(item, group.supplierName)}
                                    className="flex items-center gap-1 mx-auto px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />Pesan
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal konfirmasi hapus DO */}
      {deleteConfirmOrderId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-2">Hapus Pesanan?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Seluruh item dalam DO ini akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmOrderId(null)}
                className="btn-secondary"
              >
                Batal
              </button>
              <button
                onClick={() => handleDeleteOrder(deleteConfirmOrderId)}
                disabled={actionLoading === `del-order-${deleteConfirmOrderId}`}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                {actionLoading === `del-order-${deleteConfirmOrderId}` ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrapper wajib karena useSearchParams() butuh Suspense di Next.js 14 App Router
// Tanpa ini → hydration mismatch antara server dan client render
export default function PesananPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    }>
      <PesananContent />
    </Suspense>
  );
}
