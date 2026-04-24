'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ShoppingBag,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Calendar,
  TrendingUp,
  X,
  FileText,
} from 'lucide-react';
import { formatRupiah, formatQty, formatDateShort, formatDateTime } from '@/lib/utils';

interface PurchaseItem {
  id: string;
  ipos_kodeitem: string;
  jumlah: number;
  satuan: string | null;
  harga: number;
  potongan: number;
  total: number;
  store_product: { name: string; barcode: string } | null;
}

interface Purchase {
  id: string;
  faktur_no: string;
  tanggal: string;
  tipe: string;
  cara_bayar: string | null;
  keterangan: string | null;
  total_item: number;
  subtotal: number;
  potongan: number;
  pajak: number;
  total_akhir: number;
  ipos_kodesupel: string;
  supplier: { id: string; name: string; code: string } | null;
}

interface Supplier {
  id: string;
  name: string;
  code: string;
}

const PAGE_SIZE = 20;


function getThisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: start.toISOString().split('T')[0],
    to: end.toISOString().split('T')[0],
  };
}

export default function PembelianMasukPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [dateFrom, setDateFrom] = useState(getThisMonthRange().from);
  const [dateTo, setDateTo] = useState(getThisMonthRange().to);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, PurchaseItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<string | null>(null);

  // Summary stats
  const [stats, setStats] = useState({ totalFaktur: 0, totalNilai: 0, totalQty: 0 });

  // Fetch suppliers for filter
  useEffect(() => {
    supabase.from('suppliers').select('id, name, code').order('name')
      .then(({ data }) => { if (data) setSuppliers(data); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPurchases = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('purchases')
      .select(`
        id, faktur_no, tanggal, tipe, cara_bayar, keterangan,
        total_item, subtotal, potongan, pajak, total_akhir, ipos_kodesupel,
        supplier:suppliers(id, name, code)
      `, { count: 'exact' })
      .eq('store_id', storeId)
      .order('tanggal', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (dateFrom) query = query.gte('tanggal', dateFrom);
    if (dateTo)   query = query.lte('tanggal', dateTo + 'T23:59:59');
    if (filterSupplier) query = query.eq('supplier_id', filterSupplier);
    if (searchQuery) query = query.ilike('faktur_no', `%${searchQuery}%`);

    const { data, error, count } = await query;
    if (!error && data) {
      setPurchases(data as unknown as Purchase[]);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [storeId, page, dateFrom, dateTo, filterSupplier, searchQuery, supabase]);

  useEffect(() => {
    const t = setTimeout(fetchPurchases, 300);
    return () => clearTimeout(t);
  }, [fetchPurchases]);

  // Fetch summary stats for current filter
  useEffect(() => {
    async function fetchStats() {
      let query = supabase
        .from('purchases')
        .select('total_akhir, total_item')
        .eq('store_id', storeId);

      if (dateFrom) query = query.gte('tanggal', dateFrom);
      if (dateTo)   query = query.lte('tanggal', dateTo + 'T23:59:59');
      if (filterSupplier) query = query.eq('supplier_id', filterSupplier);

      const { data } = await query;
      if (data) {
        setStats({
          totalFaktur: data.length,
          totalNilai: data.reduce((s, r) => s + (r.total_akhir || 0), 0),
          totalQty: data.reduce((s, r) => s + (r.total_item || 0), 0),
        });
      }
    }
    fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, dateFrom, dateTo, filterSupplier]);

  const toggleExpand = async (purchaseId: string) => {
    if (expandedId === purchaseId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(purchaseId);

    // Load items if not cached
    if (!itemsMap[purchaseId]) {
      setLoadingItems(purchaseId);
      const { data } = await supabase
        .from('purchase_items')
        .select(`
          id, ipos_kodeitem, jumlah, satuan, harga, potongan, total,
          store_product:store_products(name, barcode)
        `)
        .eq('purchase_id', purchaseId)
        .order('id');

      if (data) {
        setItemsMap((prev) => ({
          ...prev,
          [purchaseId]: data as unknown as PurchaseItem[],
        }));
      }
      setLoadingItems(null);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const resetFilter = () => {
    const range = getThisMonthRange();
    setDateFrom(range.from);
    setDateTo(range.to);
    setFilterSupplier('');
    setSearchQuery('');
    setPage(0);
  };

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-blue-600" />
          Pembelian Masuk
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Riwayat faktur pembelian dari supplier yang masuk ke toko
        </p>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Faktur</p>
            <p className="text-lg font-bold text-gray-800">{stats.totalFaktur}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Nilai Pembelian</p>
            <p className="text-lg font-bold text-gray-800">{formatRupiah(stats.totalNilai)}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Item Diterima</p>
            <p className="text-lg font-bold text-gray-800">{formatQty(stats.totalQty)} pcs</p>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="card bg-gray-50 space-y-3">
        <div className="flex gap-2 flex-wrap items-end">

          {/* Search faktur */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari no faktur..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="input-field pl-9 text-sm"
            />
          </div>

          {/* Tanggal dari */}
          <div className="min-w-[130px]">
            <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Dari
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="input-field text-sm"
            />
          </div>

          {/* Tanggal sampai */}
          <div className="min-w-[130px]">
            <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Sampai
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="input-field text-sm"
            />
          </div>

          {/* Filter supplier */}
          <div className="min-w-[160px]">
            <label className="text-xs text-gray-500 mb-1 block">Supplier</label>
            <select
              value={filterSupplier}
              onChange={(e) => { setFilterSupplier(e.target.value); setPage(0); }}
              className="input-field text-sm"
            >
              <option value="">Semua Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Reset */}
          {(filterSupplier || searchQuery) && (
            <button
              onClick={resetFilter}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
            >
              <X className="w-4 h-4" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : purchases.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Belum ada data pembelian</p>
            <p className="text-sm text-gray-400 mt-1">
              Data akan muncul setelah sync dari iPOS berjalan
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-3 py-3 text-left">Tanggal</th>
                  <th className="px-3 py-3 text-left">No Faktur</th>
                  <th className="px-3 py-3 text-left">Supplier</th>
                  <th className="px-3 py-3 text-center">Tipe</th>
                  <th className="px-3 py-3 text-right">Total Item</th>
                  <th className="px-3 py-3 text-right">Total Nilai</th>
                  <th className="px-3 py-3 text-center">Bayar</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => {
                  const isExpanded = expandedId === purchase.id;
                  const items = itemsMap[purchase.id] || [];
                  const isLoadingThis = loadingItems === purchase.id;

                  return (
                    <>
                      <tr
                        key={purchase.id}
                        className={`hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${
                          isExpanded ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => toggleExpand(purchase.id)}
                      >
                        <td className="px-3 py-3 text-center text-gray-400">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 inline" />
                            : <ChevronRight className="w-4 h-4 inline" />
                          }
                        </td>
                        <td className="table-cell text-sm">
                          {purchase.tanggal ? formatDateTime(purchase.tanggal) : '-'}
                        </td>
                        <td className="table-cell font-mono text-xs font-medium text-blue-700">
                          {purchase.faktur_no}
                        </td>
                        <td className="table-cell text-sm">
                          {purchase.supplier?.name || (
                            <span className="text-gray-400 italic">{purchase.ipos_kodesupel || '-'}</span>
                          )}
                        </td>
                        <td className="table-cell text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            purchase.tipe === 'BL'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {purchase.tipe === 'BL' ? 'Beli' : purchase.tipe || '-'}
                          </span>
                        </td>
                        <td className="table-cell text-right text-sm">
                          {formatQty(purchase.total_item)} pcs
                        </td>
                        <td className="table-cell text-right font-semibold text-green-700">
                          {formatRupiah(purchase.total_akhir)}
                        </td>
                        <td className="table-cell text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            purchase.cara_bayar?.toLowerCase() === 'tunai'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {purchase.cara_bayar || '-'}
                          </span>
                        </td>
                      </tr>

                      {/* ── Detail Items (expandable) ── */}
                      {isExpanded && (
                        <tr key={`${purchase.id}-detail`} className="bg-blue-50">
                          <td colSpan={8} className="px-6 pb-4 pt-2">
                            {isLoadingThis ? (
                              <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Memuat detail...
                              </div>
                            ) : items.length === 0 ? (
                              <p className="text-sm text-gray-400 py-2">Tidak ada detail item</p>
                            ) : (
                              <div className="rounded-lg overflow-hidden border border-blue-200">
                                {/* Info faktur */}
                                <div className="px-4 py-2 bg-blue-100 flex gap-4 text-xs text-blue-700 font-medium">
                                  <span>Faktur: {purchase.faktur_no}</span>
                                  <span>·</span>
                                  <span>{purchase.tanggal ? formatDateShort(purchase.tanggal) : '-'}</span>
                                  <span>·</span>
                                  <span>{purchase.supplier?.name || purchase.ipos_kodesupel}</span>
                                  {purchase.keterangan && (
                                    <>
                                      <span>·</span>
                                      <span className="text-blue-600 italic">{purchase.keterangan}</span>
                                    </>
                                  )}
                                </div>

                                {/* Item table */}
                                <table className="w-full bg-white">
                                  <thead>
                                    <tr className="text-xs text-gray-500 border-b border-gray-100">
                                      <th className="px-4 py-2 text-left">#</th>
                                      <th className="px-4 py-2 text-left">Barcode</th>
                                      <th className="px-4 py-2 text-left">Nama Produk</th>
                                      <th className="px-4 py-2 text-right">Qty</th>
                                      <th className="px-4 py-2 text-right">Harga Satuan</th>
                                      <th className="px-4 py-2 text-right">Potongan</th>
                                      <th className="px-4 py-2 text-right">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((item, idx) => (
                                      <tr
                                        key={item.id}
                                        className="border-b border-gray-50 hover:bg-gray-50 text-sm"
                                      >
                                        <td className="px-4 py-2 text-gray-400 text-xs">{idx + 1}</td>
                                        <td className="px-4 py-2 font-mono text-xs text-gray-500">
                                          {item.store_product?.barcode || item.ipos_kodeitem}
                                        </td>
                                        <td className="px-4 py-2 font-medium text-gray-800">
                                          {item.store_product?.name || (
                                            <span className="text-gray-400 italic">{item.ipos_kodeitem}</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          <span className="font-semibold text-blue-700">
                                            +{formatQty(item.jumlah)}
                                          </span>
                                          <span className="text-gray-400 text-xs ml-1">
                                            {item.satuan || 'pcs'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-right text-gray-600">
                                          {formatRupiah(item.harga)}
                                        </td>
                                        <td className="px-4 py-2 text-right text-gray-400 text-xs">
                                          {item.potongan > 0 ? `-${formatRupiah(item.potongan)}` : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-right font-semibold">
                                          {formatRupiah(item.total)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-gray-50 text-sm font-semibold">
                                      <td colSpan={3} className="px-4 py-2 text-gray-500">
                                        {items.length} jenis produk
                                      </td>
                                      <td className="px-4 py-2 text-right text-blue-700">
                                        +{formatQty(items.reduce((s, i) => s + i.jumlah, 0))} pcs
                                      </td>
                                      <td colSpan={2}></td>
                                      <td className="px-4 py-2 text-right text-green-700">
                                        {formatRupiah(purchase.total_akhir)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Halaman {page + 1} dari {totalPages} ({totalCount} faktur)
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary py-1.5 px-3 disabled:opacity-40 text-sm"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary py-1.5 px-3 disabled:opacity-40 text-sm"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
