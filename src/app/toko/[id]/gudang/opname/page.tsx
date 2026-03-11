'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ClipboardList, Plus, X, Loader2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type OpnameStatus = 'draft' | 'counting' | 'completed' | 'approved';

interface Opname {
  id: string;
  store_id: string;
  period: string;
  opname_date: string;
  status: OpnameStatus;
  created_at: string;
  items?: OpnameItem[];
}

interface OpnameItem {
  id?: string;
  opname_id?: string;
  store_product_id: string;
  qty_system: number;
  qty_physical: number;
  qty_diff: number;
  notes: string | null;
  store_product?: { id: string; barcode: string; name: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<OpnameStatus, string> = {
  draft: 'Draft',
  counting: 'Sedang Hitung',
  completed: 'Selesai',
  approved: 'Disetujui',
};

const STATUS_COLORS: Record<OpnameStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  counting: 'bg-blue-100 text-blue-700',
  completed: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
};

const PAGE_SIZE = 20;

// ─── Component ────────────────────────────────────────────────────────────────

export default function StokOpnamePage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabase = createClient();

  const [opnames, setOpnames] = useState<Opname[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Form
  const [formPeriod, setFormPeriod] = useState('');

  // Editing opname items (for counting status)
  const [editingItems, setEditingItems] = useState<Record<string, number>>({});

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchOpnames = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('stock_opnames')
      .select(`
        *,
        items:stock_opname_items(
          *,
          store_product:store_products(id, barcode, name)
        )
      `)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    setOpnames((data as Opname[]) || []);
    setLoading(false);
  }, [storeId, supabase]);

  useEffect(() => { fetchOpnames(); }, [fetchOpnames]);

  // ─── Create Opname ───────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!formPeriod.trim()) return;
    setSaving(true);
    try {
      // Load all active products with current stock
      const { data: stockData } = await supabase
        .from('stock')
        .select('store_product_id, current_qty')
        .eq('store_id', storeId);

      const stockMap: Record<string, number> = {};
      for (const s of (stockData || [])) {
        stockMap[(s as { store_product_id: string; current_qty: number }).store_product_id] =
          (s as { store_product_id: string; current_qty: number }).current_qty;
      }

      const { data: opnameData } = await supabase
        .from('stock_opnames')
        .insert([{
          store_id: storeId,
          period: formPeriod.trim(),
          opname_date: new Date().toISOString().slice(0, 10),
          status: 'counting',
          feature_enabled: true,
        }])
        .select('id')
        .single();

      const opnameId = (opnameData as { id: string } | null)?.id;
      if (!opnameId) return;

      // Get all active products
      const { data: products } = await supabase
        .from('store_products')
        .select('id')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .eq('is_deleted', false);

      if (products && products.length > 0) {
        const items = products.map((p: { id: string }) => ({
          opname_id: opnameId,
          store_product_id: p.id,
          qty_system: stockMap[p.id] ?? 0,
          qty_physical: stockMap[p.id] ?? 0,
          qty_diff: 0,
          notes: null,
        }));
        // Insert in batches of 500
        for (let i = 0; i < items.length; i += 500) {
          await supabase.from('stock_opname_items').insert(items.slice(i, i + 500));
        }
      }

      await supabase.from('audit_log').insert([{
        store_id: storeId,
        action: 'create_opname',
        entity_type: 'stock_opname',
        detail: { period: formPeriod },
      }]);

      setShowModal(false);
      setFormPeriod('');
      fetchOpnames();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Update Physical Qty ──────────────────────────────────────────────────────

  const handleSavePhysical = async (opname: Opname) => {
    setSaving(true);
    try {
      for (const item of (opname.items || [])) {
        if (!item.id) continue;
        const physQty = editingItems[item.id] ?? item.qty_physical;
        const diff = physQty - item.qty_system;
        await supabase.from('stock_opname_items').update({
          qty_physical: physQty,
          qty_diff: diff,
        }).eq('id', item.id);
      }
      await supabase.from('stock_opnames').update({ status: 'completed' }).eq('id', opname.id);
      setEditingItems({});
      fetchOpnames();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Approve ─────────────────────────────────────────────────────────────────

  const handleApprove = async (opname: Opname) => {
    if (!confirm('Setujui opname? Stok akan diupdate sesuai hitungan fisik.')) return;
    setSaving(true);
    try {
      for (const item of (opname.items || [])) {
        if (!item.id || item.qty_diff === 0) continue;
        const { data: stockRow } = await supabase
          .from('stock')
          .select('id, current_qty')
          .eq('store_id', storeId)
          .eq('store_product_id', item.store_product_id)
          .single();

        if (stockRow) {
          const before = (stockRow as { id: string; current_qty: number }).current_qty;
          await supabase.from('stock').update({ current_qty: item.qty_physical }).eq('id', (stockRow as { id: string }).id);
          await supabase.from('stock_movements').insert([{
            store_id: storeId,
            store_product_id: item.store_product_id,
            movement_type: 'opname',
            qty_before: before,
            qty_change: item.qty_diff,
            qty_after: item.qty_physical,
            reference_type: 'opname',
            reference_id: opname.id,
          }]);
        }
      }

      await supabase.from('stock_opnames').update({ status: 'approved' }).eq('id', opname.id);
      await supabase.from('audit_log').insert([{
        store_id: storeId,
        action: 'approve_opname',
        entity_type: 'stock_opname',
        detail: { period: opname.period, opname_id: opname.id },
      }]);
      fetchOpnames();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Stok Opname</h1>
          <p className="text-sm text-gray-500 mt-1">Hitung fisik stok dan sinkronkan ke sistem</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Buat Opname
        </button>
      </div>

      {/* Opname List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : opnames.length === 0 ? (
          <div className="card text-center py-16">
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Belum ada stok opname.</p>
          </div>
        ) : (
          opnames.map((opname) => {
            const isExpanded = expandedId === opname.id;
            const visibleItems = (opname.items || []).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            const totalItems = (opname.items || []).length;
            const diffItems = (opname.items || []).filter((i) => i.qty_diff !== 0).length;

            return (
              <div key={opname.id} className="card p-0 overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => { setExpandedId(isExpanded ? null : opname.id); setPage(0); }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 text-sm">{opname.period}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[opname.status as OpnameStatus]}`}>
                        {STATUS_LABELS[opname.status as OpnameStatus]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {opname.opname_date} · {totalItems} produk {diffItems > 0 ? `· ${diffItems} selisih` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {opname.status === 'completed' && (
                      <button onClick={(e) => { e.stopPropagation(); handleApprove(opname); }}
                        className="btn-primary text-xs py-1 px-2 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Setujui
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr className="text-xs text-gray-500">
                            <th className="px-4 py-2 text-left">Produk</th>
                            <th className="px-4 py-2 text-right">Sistem</th>
                            <th className="px-4 py-2 text-right">Fisik</th>
                            <th className="px-4 py-2 text-right">Selisih</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleItems.map((item) => {
                            const physQty = item.id && editingItems[item.id] !== undefined
                              ? editingItems[item.id]
                              : item.qty_physical;
                            const diff = physQty - item.qty_system;
                            return (
                              <tr key={item.id || item.store_product_id} className="border-t border-gray-50 hover:bg-gray-50">
                                <td className="px-4 py-2 text-gray-800">
                                  {item.store_product?.name || item.store_product_id}
                                </td>
                                <td className="px-4 py-2 text-right text-gray-600">{item.qty_system}</td>
                                <td className="px-4 py-2 text-right">
                                  {opname.status === 'counting' && item.id ? (
                                    <input
                                      type="number" min="0"
                                      value={physQty}
                                      onChange={(e) => setEditingItems((prev) => ({
                                        ...prev,
                                        [item.id!]: parseFloat(e.target.value) || 0,
                                      }))}
                                      className="w-20 input-field text-sm py-1 text-right"
                                    />
                                  ) : (
                                    <span className={physQty !== item.qty_system ? 'font-semibold text-blue-600' : 'text-gray-600'}>
                                      {physQty}
                                    </span>
                                  )}
                                </td>
                                <td className={`px-4 py-2 text-right font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                  {diff > 0 ? `+${diff}` : diff}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalItems > PAGE_SIZE && (
                      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
                        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                          className="px-2 py-1 border rounded disabled:opacity-40">
                          Prev
                        </button>
                        <span>Hal {page + 1} / {Math.ceil(totalItems / PAGE_SIZE)}</span>
                        <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= totalItems}
                          className="px-2 py-1 border rounded disabled:opacity-40">
                          Next
                        </button>
                      </div>
                    )}

                    {opname.status === 'counting' && (
                      <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
                        <button onClick={() => handleSavePhysical(opname)} disabled={saving} className="btn-primary flex items-center gap-2">
                          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                          Simpan & Selesaikan
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Buat Opname */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">Buat Stok Opname</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Periode *</label>
                <input type="text" value={formPeriod} onChange={(e) => setFormPeriod(e.target.value)}
                  placeholder="contoh: MAR 2026" className="input-field" />
                <p className="text-xs text-gray-400 mt-1">Semua produk aktif akan dimuat otomatis</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>Batal</button>
              <button onClick={handleCreate} disabled={saving || !formPeriod.trim()} className="btn-primary flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Buat Opname
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
