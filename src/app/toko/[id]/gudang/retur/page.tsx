'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatRupiah, formatDate } from '@/lib/utils';
import { RotateCcw, Plus, X, Loader2, AlertTriangle } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type ReturnReason = 'rusak' | 'expired' | 'salah_kirim';

interface ReturnItem {
  store_product_id: string;
  qty: number;
  reason: ReturnReason;
  store_product?: { id: string; barcode: string; name: string; hpp: number };
}

interface ReturnHistory {
  id: string;
  store_id: string;
  store_product_id: string;
  movement_type: string;
  qty_before: number;
  qty_change: number;
  qty_after: number;
  created_at: string;
  store_product?: { id: string; barcode: string; name: string; hpp: number };
  reference_type?: string;
}

interface SupplierOption {
  id: string;
  name: string;
  code: string;
}

interface StoreProductOption {
  id: string;
  barcode: string;
  name: string;
  hpp: number;
  current_qty: number;
}

const REASON_LABELS: Record<ReturnReason, string> = {
  rusak: 'Barang Rusak',
  expired: 'Kadaluarsa',
  salah_kirim: 'Salah Kirim',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReturSupplierPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabase = createClient();

  const [history, setHistory] = useState<ReturnHistory[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<StoreProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [formSupplier, setFormSupplier] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<ReturnItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('stock_movements')
      .select(`
        id, store_id, store_product_id, movement_type,
        qty_before, qty_change, qty_after, created_at, reference_type,
        store_product:store_products(id, barcode, name, hpp)
      `)
      .eq('store_id', storeId)
      .eq('movement_type', 'return')
      .order('created_at', { ascending: false })
      .limit(100);
    setHistory((data as unknown as ReturnHistory[]) || []);
    setLoading(false);
  }, [storeId, supabase]);

  const fetchSuppliers = useCallback(async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');
    setSuppliers((data as SupplierOption[]) || []);
  }, [supabase]);

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
    fetchHistory();
    fetchSuppliers();
    fetchProducts();
  }, [fetchHistory, fetchSuppliers, fetchProducts]);

  // ─── Form Helpers ────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormSupplier(''); setFormNotes(''); setFormItems([]); setProductSearch('');
  };

  const addItem = (product: StoreProductOption) => {
    if (formItems.some((i) => i.store_product_id === product.id)) return;
    setFormItems((prev) => [
      ...prev,
      { store_product_id: product.id, qty: 1, reason: 'rusak', store_product: product },
    ]);
    setProductSearch('');
  };

  const removeItem = (id: string) => setFormItems((prev) => prev.filter((i) => i.store_product_id !== id));

  const updateItem = (id: string, updates: Partial<ReturnItem>) =>
    setFormItems((prev) => prev.map((i) => i.store_product_id === id ? { ...i, ...updates } : i));

  // ─── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!formSupplier || formItems.length === 0) return;

    // Validasi: qty retur <= stok tersedia
    for (const item of formItems) {
      const available = products.find((p) => p.id === item.store_product_id)?.current_qty ?? 0;
      if (item.qty > available) {
        alert(`Qty retur ${item.store_product?.name} (${item.qty}) melebihi stok tersedia (${available})`);
        return;
      }
    }

    setSaving(true);
    try {
      for (const item of formItems) {
        const { data: stockRow } = await supabase
          .from('stock')
          .select('id, current_qty')
          .eq('store_id', storeId)
          .eq('store_product_id', item.store_product_id)
          .single();

        if (stockRow) {
          const before = (stockRow as { id: string; current_qty: number }).current_qty;
          const newQty = Math.max(0, before - item.qty);
          await supabase.from('stock').update({ current_qty: newQty }).eq('id', (stockRow as { id: string }).id);
          await supabase.from('stock_movements').insert([{
            store_id: storeId,
            store_product_id: item.store_product_id,
            movement_type: 'return',
            qty_before: before,
            qty_change: -item.qty,
            qty_after: newQty,
            reference_type: 'supplier_return',
          }]);
        }
      }

      await supabase.from('audit_log').insert([{
        store_id: storeId,
        action: 'return_to_supplier',
        entity_type: 'stock_movement',
        detail: {
          supplier_id: formSupplier,
          notes: formNotes,
          items: formItems.map((i) => ({ product_id: i.store_product_id, qty: i.qty, reason: i.reason })),
        },
      }]);

      setShowModal(false);
      resetForm();
      fetchHistory();
      fetchProducts();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  const filteredProducts = products.filter(
    (p) =>
      !formItems.some((i) => i.store_product_id === p.id) &&
      (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.barcode.toLowerCase().includes(productSearch.toLowerCase()))
  );

  // Validasi summary
  const overQtyItems = formItems.filter((i) => {
    const available = products.find((p) => p.id === i.store_product_id)?.current_qty ?? 0;
    return i.qty > available;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Retur Supplier</h1>
          <p className="text-sm text-gray-500 mt-1">Kembalikan barang ke supplier</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Buat Retur
        </button>
      </div>

      {/* History */}
      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-medium text-gray-800 text-sm">History Retur</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12">
            <RotateCcw className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Belum ada retur.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs text-gray-500">
                  <th className="px-4 py-2 text-left">Tanggal</th>
                  <th className="px-4 py-2 text-left">Produk</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">HPP</th>
                  <th className="px-4 py-2 text-right">Total HPP</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 text-xs">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-2 text-gray-800">{row.store_product?.name || row.store_product_id}</td>
                    <td className="px-4 py-2 text-right text-red-600 font-medium">{Math.abs(row.qty_change)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{formatRupiah(row.store_product?.hpp || 0)}</td>
                    <td className="px-4 py-2 text-right text-gray-800 font-medium">
                      {formatRupiah((row.store_product?.hpp || 0) * Math.abs(row.qty_change))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Form Retur */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">Form Retur Supplier</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
                <select value={formSupplier} onChange={(e) => setFormSupplier(e.target.value)} className="input-field">
                  <option value="">Pilih supplier...</option>
                  {suppliers.map((s) => (
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
                          <span className="text-gray-400 text-xs ml-2">Stok: {p.current_qty}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {formItems.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {formItems.map((item) => {
                      const prod = item.store_product;
                      const available = products.find((p) => p.id === item.store_product_id)?.current_qty ?? 0;
                      const isOver = item.qty > available;
                      return (
                        <div key={item.store_product_id} className="bg-gray-50 px-3 py-2 rounded-lg space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="flex-1 text-sm text-gray-800 truncate">{prod?.name}</span>
                            <span className="text-xs text-gray-400">/{available}</span>
                            <input type="number" min="1" value={item.qty}
                              onChange={(e) => updateItem(item.store_product_id, { qty: parseInt(e.target.value) || 1 })}
                              className={`w-20 input-field text-sm py-1 text-right ${isOver ? 'border-red-400' : ''}`} />
                            <button type="button" onClick={() => removeItem(item.store_product_id)} className="text-gray-400 hover:text-red-500">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <select value={item.reason} onChange={(e) => updateItem(item.store_product_id, { reason: e.target.value as ReturnReason })}
                            className="input-field text-sm py-1">
                            {(Object.entries(REASON_LABELS) as [ReturnReason, string][]).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                          {isOver && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Qty melebihi stok tersedia
                            </p>
                          )}
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
              <button onClick={handleSubmit}
                disabled={saving || !formSupplier || formItems.length === 0 || overQtyItems.length > 0}
                className="btn-primary flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Retur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
