'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah } from '@/lib/utils';
import {
  ArrowLeftRight, Plus, X, Loader2, ChevronDown, ChevronUp, CheckCircle2, XCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type TransferStatus = 'draft' | 'sent' | 'received' | 'cancelled';

interface Transfer {
  id: string;
  transfer_number: string;
  from_store_id: string;
  to_store_id: string;
  transfer_date: string;
  status: TransferStatus;
  notes: string | null;
  created_at: string;
  from_store?: { id: string; name: string };
  to_store?: { id: string; name: string };
  items?: TransferItem[];
}

interface TransferItem {
  id?: string;
  transfer_id?: string;
  store_product_id: string;
  qty: number;
  notes: string | null;
  store_product?: { id: string; barcode: string; name: string; hpp: number };
}

interface StoreOption {
  id: string;
  name: string;
  code: string;
}

interface StoreProductOption {
  id: string;
  barcode: string;
  name: string;
  hpp: number;
  current_qty?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TransferStatus, string> = {
  draft: 'Draft',
  sent: 'Dikirim',
  received: 'Diterima',
  cancelled: 'Dibatalkan',
};

const STATUS_COLORS: Record<TransferStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

function generateTransferNumber(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `TRF-${yyyymmdd}-${rand}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransferStokPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [products, setProducts] = useState<StoreProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form
  const [formToStore, setFormToStore] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<TransferItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('warehouse_transfers')
      .select(`
        *,
        from_store:stores!warehouse_transfers_from_store_id_fkey(id, name),
        to_store:stores!warehouse_transfers_to_store_id_fkey(id, name),
        items:warehouse_transfer_items(*, store_product:store_products(id, barcode, name, hpp))
      `)
      .or(`from_store_id.eq.${storeId},to_store_id.eq.${storeId}`)
      .order('created_at', { ascending: false });
    setTransfers((data as Transfer[]) || []);
    setLoading(false);
  }, [storeId, supabase]);

  const fetchStores = useCallback(async () => {
    const { data } = await supabase
      .from('stores')
      .select('id, name, code')
      .eq('is_active', true)
      .neq('id', storeId);
    setStores((data as StoreOption[]) || []);
  }, [storeId, supabase]);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from('store_products')
      .select('id, barcode, name, hpp, stock:stock(current_qty)')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('name');
    const mapped = (data || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      barcode: p.barcode as string,
      name: p.name as string,
      hpp: p.hpp as number,
      current_qty: Array.isArray(p.stock) && p.stock.length > 0
        ? (p.stock[0] as Record<string, unknown>).current_qty as number
        : 0,
    }));
    setProducts(mapped);
  }, [storeId, supabase]);

  useEffect(() => {
    fetchTransfers();
    fetchStores();
    fetchProducts();
  }, [fetchTransfers, fetchStores, fetchProducts]);

  // ─── Form Helpers ────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormToStore(''); setFormNotes(''); setFormItems([]); setProductSearch('');
  };

  const addItem = (product: StoreProductOption) => {
    if (formItems.some((i) => i.store_product_id === product.id)) return;
    setFormItems((prev) => [
      ...prev,
      { store_product_id: product.id, qty: 1, notes: null, store_product: product },
    ]);
    setProductSearch('');
  };

  const removeItem = (productId: string) => setFormItems((prev) => prev.filter((i) => i.store_product_id !== productId));
  const updateItemQty = (productId: string, qty: number) =>
    setFormItems((prev) => prev.map((i) => i.store_product_id === productId ? { ...i, qty } : i));

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!formToStore || formItems.length === 0) return;
    setSaving(true);
    try {
      const transferNumber = generateTransferNumber();
      const { data: trData } = await supabase
        .from('warehouse_transfers')
        .insert([{
          transfer_number: transferNumber,
          from_store_id: storeId,
          to_store_id: formToStore,
          transfer_date: new Date().toISOString().slice(0, 10),
          status: 'draft',
          notes: formNotes || null,
          feature_enabled: true,
        }])
        .select('id')
        .single();

      const transferId = (trData as { id: string } | null)?.id;
      if (!transferId) return;

      await supabase.from('warehouse_transfer_items').insert(
        formItems.map((i) => ({
          transfer_id: transferId,
          store_product_id: i.store_product_id,
          qty: i.qty,
          notes: i.notes,
        }))
      );

      await supabase.from('audit_log').insert([{
        store_id: storeId,
        action: 'create_transfer',
        entity_type: 'warehouse_transfer',
        detail: { transfer_number: transferNumber, to_store_id: formToStore, items: formItems.length },
      }]);

      setShowModal(false);
      resetForm();
      fetchTransfers();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Status Actions ───────────────────────────────────────────────────────────

  const handleSend = async (transfer: Transfer) => {
    if (!confirm('Kirim transfer? Stok toko asal akan berkurang.')) return;

    // Validasi stok terkini sebelum proses — cegah stok hantu jika stok berubah sejak transfer dibuat
    const transferItems = transfer.items || [];
    for (const item of transferItems) {
      const { data: stockCheck } = await supabase
        .from('stock')
        .select('current_qty')
        .eq('store_id', storeId)
        .eq('store_product_id', item.store_product_id)
        .single();
      const tersedia = (stockCheck?.current_qty as number) ?? 0;
      if (tersedia < item.qty) {
        const namaProduk = item.store_product?.name || item.store_product_id;
        alert(`Stok tidak cukup untuk "${namaProduk}"\nTersedia: ${tersedia} | Diminta: ${item.qty}\n\nTransfer dibatalkan.`);
        return;
      }
    }

    // Kurangi stock di toko asal
    for (const item of transferItems) {
      const { data: stockRow } = await supabase
        .from('stock')
        .select('id, current_qty')
        .eq('store_id', storeId)
        .eq('store_product_id', item.store_product_id)
        .single();

      if (stockRow) {
        const newQty = (stockRow.current_qty as number) - item.qty;
        await supabase.from('stock').update({ current_qty: newQty }).eq('id', stockRow.id);
        await supabase.from('stock_movements').insert([{
          store_id: storeId,
          store_product_id: item.store_product_id,
          movement_type: 'transfer_out',
          qty_before: stockRow.current_qty,
          qty_change: -item.qty,
          qty_after: newQty,
          reference_type: 'transfer',
          reference_id: transfer.id,
        }]);
      }
    }

    await supabase.from('warehouse_transfers').update({ status: 'sent' }).eq('id', transfer.id);
    await supabase.from('audit_log').insert([{
      store_id: storeId,
      action: 'send_transfer',
      entity_type: 'warehouse_transfer',
      detail: { transfer_number: transfer.transfer_number },
    }]);
    fetchTransfers();
  };

  const handleReceive = async (transfer: Transfer) => {
    if (!confirm('Konfirmasi penerimaan? Stok toko ini akan bertambah.')) return;

    // Tambah stock di toko tujuan (storeId = toko penerima)
    for (const item of transfer.items || []) {
      const { data: stockRow } = await supabase
        .from('stock')
        .select('id, current_qty')
        .eq('store_id', storeId)
        .eq('store_product_id', item.store_product_id)
        .single();

      const qtyBefore = (stockRow?.current_qty as number) ?? 0;
      const newQty = qtyBefore + item.qty;

      if (stockRow) {
        // Produk sudah ada di toko penerima → update
        await supabase.from('stock').update({ current_qty: newQty }).eq('id', stockRow.id);
      } else {
        // Produk belum ada di toko penerima → insert baru
        await supabase.from('stock').insert([{
          store_id: storeId,
          store_product_id: item.store_product_id,
          current_qty: newQty,
          min_qty: 0,
          max_qty: 0,
        }]);
      }
      await supabase.from('stock_movements').insert([{
        store_id: storeId,
        store_product_id: item.store_product_id,
        movement_type: 'transfer_in',
        qty_before: qtyBefore,
        qty_change: item.qty,
        qty_after: newQty,
        reference_type: 'transfer',
        reference_id: transfer.id,
      }]);
    }

    await supabase.from('warehouse_transfers').update({ status: 'received' }).eq('id', transfer.id);
    await supabase.from('audit_log').insert([{
      store_id: storeId,
      action: 'receive_transfer',
      entity_type: 'warehouse_transfer',
      detail: { transfer_number: transfer.transfer_number },
    }]);
    fetchTransfers();
  };

  const handleCancel = async (transfer: Transfer) => {
    if (!confirm('Batalkan transfer ini?')) return;

    // Restore stock jika sudah sent
    if (transfer.status === 'sent') {
      for (const item of transfer.items || []) {
        const { data: stockRow } = await supabase
          .from('stock')
          .select('id, current_qty')
          .eq('store_id', transfer.from_store_id)
          .eq('store_product_id', item.store_product_id)
          .single();
        if (stockRow) {
          const newQty = (stockRow.current_qty as number) + item.qty;
          await supabase.from('stock').update({ current_qty: newQty }).eq('id', stockRow.id);
          // Log pembatalan ke stock_movements
          await supabase.from('stock_movements').insert([{
            store_id: transfer.from_store_id,
            store_product_id: item.store_product_id,
            movement_type: 'transfer_cancel',
            qty_before: stockRow.current_qty,
            qty_change: item.qty,
            qty_after: newQty,
            reference_type: 'transfer',
            reference_id: transfer.id,
          }]);
        }
      }
    }

    await supabase.from('warehouse_transfers').update({ status: 'cancelled' }).eq('id', transfer.id);
    await supabase.from('audit_log').insert([{
      store_id: storeId,
      action: 'cancel_transfer',
      entity_type: 'warehouse_transfer',
      detail: { transfer_number: transfer.transfer_number },
    }]);
    fetchTransfers();
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  const filteredProducts = products.filter(
    (p) =>
      !formItems.some((i) => i.store_product_id === p.id) &&
      (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Transfer Stok</h1>
          <p className="text-sm text-gray-500 mt-1">Transfer stok antar toko</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Buat Transfer
        </button>
      </div>

      {/* Transfer List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : transfers.length === 0 ? (
          <div className="card text-center py-16">
            <ArrowLeftRight className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Belum ada transfer stok.</p>
          </div>
        ) : (
          transfers.map((tr) => {
            const isExpanded = expandedId === tr.id;
            const isFrom = tr.from_store_id === storeId;
            return (
              <div key={tr.id} className="card p-0 overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : tr.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 text-sm">{tr.transfer_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[tr.status as TransferStatus]}`}>
                        {STATUS_LABELS[tr.status as TransferStatus]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isFrom ? 'Ke' : 'Dari'}: {isFrom ? tr.to_store?.name : tr.from_store?.name} · {tr.transfer_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Actions */}
                    {tr.status === 'draft' && isFrom && (
                      <button onClick={(e) => { e.stopPropagation(); handleSend(tr); }} className="btn-primary text-xs py-1 px-2">
                        Kirim
                      </button>
                    )}
                    {tr.status === 'sent' && !isFrom && (
                      <button onClick={(e) => { e.stopPropagation(); handleReceive(tr); }} className="btn-primary text-xs py-1 px-2 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Terima
                      </button>
                    )}
                    {['draft', 'sent'].includes(tr.status) && (
                      <button onClick={(e) => { e.stopPropagation(); handleCancel(tr); }} className="text-red-500 hover:text-red-700 p-1">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    {tr.notes && <p className="text-xs text-gray-500 mb-2">Catatan: {tr.notes}</p>}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500">
                          <th className="text-left pb-1">Produk</th>
                          <th className="text-right pb-1">Qty</th>
                          <th className="text-right pb-1">HPP/item</th>
                          <th className="text-right pb-1">Total HPP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(tr.items || []).map((item) => (
                          <tr key={item.id} className="border-t border-gray-50">
                            <td className="py-1 text-gray-800">{item.store_product?.name || item.store_product_id}</td>
                            <td className="py-1 text-right text-gray-600">{item.qty}</td>
                            <td className="py-1 text-right text-gray-600">{formatRupiah(item.store_product?.hpp || 0)}</td>
                            <td className="py-1 text-right font-medium text-gray-800">{formatRupiah((item.store_product?.hpp || 0) * item.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Buat Transfer */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">Buat Transfer Stok</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Toko Tujuan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Toko Tujuan *</label>
                <select value={formToStore} onChange={(e) => setFormToStore(e.target.value)} className="input-field">
                  <option value="">Pilih toko tujuan...</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              {/* Produk */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Produk *</label>
                <div className="relative">
                  <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Cari produk..." className="input-field text-sm" />
                  {productSearch && filteredProducts.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {filteredProducts.slice(0, 10).map((p) => (
                        <button key={p.id} type="button" onClick={() => addItem(p)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                          <span className="font-medium text-gray-800">{p.name}</span>
                          <span className="text-gray-400 text-xs ml-2">Stok: {p.current_qty ?? 0}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {formItems.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {formItems.map((item) => {
                      const prod = item.store_product;
                      const availQty = products.find((p) => p.id === item.store_product_id)?.current_qty ?? 0;
                      const overStock = item.qty > availQty;
                      return (
                        <div key={item.store_product_id} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                          <span className="flex-1 text-sm text-gray-800 truncate">{prod?.name}</span>
                          <span className="text-xs text-gray-400">/{availQty}</span>
                          <input type="number" min="1" max={availQty} value={item.qty}
                            onChange={(e) => updateItemQty(item.store_product_id, parseInt(e.target.value) || 1)}
                            className={`w-20 input-field text-sm py-1 text-right ${overStock ? 'border-red-400' : ''}`} />
                          <button type="button" onClick={() => removeItem(item.store_product_id)} className="text-gray-400 hover:text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="input-field" placeholder="Opsional..." />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary" disabled={saving}>Batal</button>
              <button onClick={handleCreate} disabled={saving || !formToStore || formItems.length === 0} className="btn-primary flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Buat Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
