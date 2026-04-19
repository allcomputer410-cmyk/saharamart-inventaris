'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  Filter,
  Package,
  Loader2,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Edit3,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { formatRupiah, formatQty } from '@/lib/utils';
import type { Category, Brand } from '@/types/database';

interface ProductRow {
  id: string;
  barcode: string;
  name: string;
  unit: string | null;
  hpp: number;
  sell_price: number;
  shelf_location: string | null;
  is_active: boolean;
  category: { id: string; name: string | null } | null;
  brand: { id: string; name: string | null } | null;
  supplier: { id: string; code: string; name: string } | null;
  stock: { id: string; current_qty: number; min_qty: number; max_qty: number }[];
}

interface EditState {
  [productId: string]: {
    hpp?: number;
    sell_price?: number;
    min_qty?: number;
    max_qty?: number;
  };
}

const PAGE_SIZE = 30;

export default function MasterProdukPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabase = createClient();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterStock, setFilterStock] = useState(''); // '' | 'critical' | 'low' | 'ok'
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [editState, setEditState] = useState<EditState>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set()); // for "Pesan Stok"
  const [successMsg, setSuccessMsg] = useState('');
  const [settingDefaultMin, setSettingDefaultMin] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch categories and brands for filters
  useEffect(() => {
    async function fetchFilters() {
      const [catRes, brandRes] = await Promise.all([
        supabase.from('categories').select('id, code, name').order('name'),
        supabase.from('brands').select('id, code, name').order('name'),
      ]);
      if (catRes.data) setCategories(catRes.data);
      if (brandRes.data) setBrands(brandRes.data);
    }
    fetchFilters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('store_products')
      .select(`
        id, barcode, name, unit, hpp, sell_price, shelf_location, is_active,
        category:categories(id, name),
        brand:brands(id, name),
        supplier:suppliers(id, code, name),
        stock(id, current_qty, min_qty, max_qty)
      `, { count: 'exact' })
      .eq('store_id', storeId)
      .eq('is_deleted', false)
      .order('name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (searchQuery) {
      query = query.or(`name.ilike.%${searchQuery}%,barcode.ilike.%${searchQuery}%`);
    }
    if (filterCategory) {
      query = query.eq('category_id', filterCategory);
    }
    if (filterBrand) {
      query = query.eq('brand_id', filterBrand);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching products:', error);
    } else {
      setProducts((data as unknown as ProductRow[]) || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [storeId, searchQuery, filterCategory, filterBrand, page, supabase]);

  useEffect(() => {
    const debounce = setTimeout(fetchProducts, 300);
    return () => clearTimeout(debounce);
  }, [fetchProducts]);

  // Focus input when editing
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleEditField = (productId: string, field: string, value: number) => {
    setEditState((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const hasEdits = Object.keys(editState).length > 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleSaveAll = async () => {
    if (!hasEdits) return;
    setSaving(true);

    const updates = Object.entries(editState);
    let errorCount = 0;

    for (const [productId, changes] of updates) {
      // Separate stock fields from product fields
      const productFields: Record<string, number> = {};
      const stockFields: Record<string, number> = {};

      if (changes.hpp !== undefined) productFields.hpp = changes.hpp;
      if (changes.sell_price !== undefined) productFields.sell_price = changes.sell_price;
      if (changes.min_qty !== undefined) stockFields.min_qty = changes.min_qty;
      if (changes.max_qty !== undefined) stockFields.max_qty = changes.max_qty;

      // Update product fields
      if (Object.keys(productFields).length > 0) {
        const { error } = await supabase
          .from('store_products')
          .update({ ...productFields, updated_at: new Date().toISOString() })
          .eq('id', productId);
        if (error) errorCount++;
      }

      // Update stock fields
      if (Object.keys(stockFields).length > 0) {
        const { error } = await supabase
          .from('stock')
          .update(stockFields)
          .eq('store_product_id', productId)
          .eq('store_id', storeId);
        if (error) errorCount++;
      }
    }

    // Audit log — catat semua produk yang diubah
    if (errorCount === 0) {
      await supabase.from('audit_log').insert({
        store_id: storeId,
        action: 'update_products',
        entity_type: 'store_products',
        detail: {
          products_updated: updates.length,
          changes: Object.fromEntries(updates),
        },
      });
    }

    setSaving(false);
    if (errorCount === 0) {
      setEditState({});
      setSuccessMsg(`${updates.length} produk berhasil diupdate`);
      setTimeout(() => setSuccessMsg(''), 3000);
      fetchProducts();
    }
  };

  const handleCancelEdits = () => {
    setEditState({});
    setEditingCell(null);
  };

  const handleSetDefaultMinStock = async () => {
    if (!confirm(
      'Set stok minimal ke 5 untuk semua produk yang min stoknya masih 0?\n\nProduk yang sudah memiliki min stok > 0 tidak akan diubah.'
    )) return;
    setSettingDefaultMin(true);
    const { error } = await supabase
      .from('stock')
      .update({ min_qty: 5 })
      .eq('store_id', storeId)
      .or('min_qty.is.null,min_qty.eq.0');
    setSettingDefaultMin(false);
    if (!error) {
      setSuccessMsg('Stok minimal berhasil diset ke 5 untuk semua produk yang belum ada min stoknya');
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchProducts();
    }
  };

  const toggleSelectItem = (productId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handlePesanStok = () => {
    const itemsToOrder = products
      .filter((p) => selectedItems.has(p.id))
      .map((p) => {
        const stock = p.stock?.[0];
        return {
          store_product_id: p.id,
          barcode: p.barcode,
          name: p.name,
          unit: p.unit,
          hpp: p.hpp,
          current_qty: stock?.current_qty || 0,
          min_qty: stock?.min_qty || 0,
          max_qty: stock?.max_qty || 0,
          supplier_id: p.supplier?.id || null,
          supplier_name: p.supplier?.name || null,
        };
      });
    sessionStorage.setItem(`pesanan_prefill_${storeId}`, JSON.stringify(itemsToOrder));
    window.location.href = `/toko/${storeId}/pesanan?from=master-produk`;
  };

  const getStockStatus = (stock: ProductRow['stock']) => {
    const s = stock?.[0];
    if (!s) return { label: '-', class: 'text-gray-400' };
    if (s.current_qty <= s.min_qty) return { label: 'Kritis', class: 'badge-danger' };
    if (s.max_qty > 0 && s.current_qty <= s.max_qty * 0.5) return { label: 'Rendah', class: 'badge-warning' };
    if (s.max_qty > 0 && s.current_qty > s.max_qty) return { label: 'Overstock', class: 'badge-info' };
    return { label: 'OK', class: 'badge-success' };
  };

  // Render an editable cell
  const renderEditableCell = (
    productId: string,
    field: string,
    currentValue: number,
    format: 'rupiah' | 'qty' = 'rupiah'
  ) => {
    const cellId = `${productId}-${field}`;
    const editedValue = editState[productId]?.[field as keyof EditState[string]];
    const displayValue = editedValue !== undefined ? editedValue : currentValue;
    const isEditing = editingCell === cellId;
    const isModified = editedValue !== undefined;

    if (isEditing) {
      return (
        <input
          ref={inputRef}
          type="number"
          defaultValue={displayValue}
          onBlur={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val !== currentValue) {
              handleEditField(productId, field, val);
            }
            setEditingCell(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setEditingCell(null);
            }
          }}
          className="w-24 px-2 py-1 border-2 border-blue-400 rounded text-right text-sm focus:outline-none"
          step={format === 'qty' ? '1' : '100'}
        />
      );
    }

    return (
      <button
        onClick={() => setEditingCell(cellId)}
        className={`text-right w-full group flex items-center justify-end gap-1 ${
          isModified ? 'text-blue-600 font-semibold' : ''
        }`}
        title="Klik untuk edit"
      >
        <span>
          {format === 'rupiah' ? formatRupiah(displayValue) : formatQty(displayValue)}
        </span>
        <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0" />
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Master Produk</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount} produk
            {(filterCategory || filterBrand || filterStock) && (
              <span className="ml-1 text-blue-600 font-medium">
                {filterStock === 'critical' ? '— menampilkan produk hampir habis' :
                 filterStock === 'low'      ? '— menampilkan stok rendah' :
                 filterStock === 'ok'       ? '— menampilkan stok aman' :
                 '(terfilter)'}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={handleSetDefaultMinStock}
            disabled={settingDefaultMin}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Set stok minimal = 5 untuk semua produk yang min stoknya masih 0"
          >
            {settingDefaultMin
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <AlertTriangle className="w-4 h-4 text-yellow-500" />
            }
            Set Min Stok 5
          </button>
          {selectedItems.size > 0 && (
            <button onClick={handlePesanStok} className="btn-primary flex items-center gap-1 text-sm">
              <ShoppingCart className="w-4 h-4" />
              Pesan Stok ({selectedItems.size})
            </button>
          )}
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <Check className="w-4 h-4" />
          {successMsg}
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama produk atau barcode..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="input-field pl-10"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary flex items-center gap-1 ${showFilters ? 'bg-blue-50 border-blue-300' : ''}`}
        >
          <Filter className="w-4 h-4" />
          <span className="hidden sm:inline">Filter</span>
          {(filterCategory || filterBrand || filterStock) && (
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          )}
        </button>
      </div>

      {/* Quick Filter Tabs — Status Stok */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {[
          { val: '',         label: 'Semua',         active: 'bg-gray-800 text-white border-gray-800',   idle: 'text-gray-600' },
          { val: 'critical', label: '⚠ Hampir Habis', active: 'bg-red-600 text-white border-red-600',     idle: 'text-red-600' },
          { val: 'low',      label: '📉 Stok Rendah', active: 'bg-yellow-500 text-white border-yellow-500', idle: 'text-yellow-600' },
          { val: 'ok',       label: '✓ Aman',         active: 'bg-green-600 text-white border-green-600',  idle: 'text-green-700' },
        ].map(({ val, label, active, idle }) => (
          <button
            key={val}
            onClick={() => { setFilterStock(val); setPage(0); }}
            className={`px-4 py-1.5 text-sm font-medium rounded-full border whitespace-nowrap transition-colors ${
              filterStock === val
                ? active
                : `bg-white border-gray-200 ${idle} hover:bg-gray-50`
            }`}
          >
            {label}
          </button>
        ))}
        {filterStock && (
          <button
            onClick={() => { setFilterStock(''); setPage(0); }}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Reset filter
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="card bg-gray-50 flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs text-gray-500 mb-1 block">Kategori</label>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}
              className="input-field text-sm"
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.code}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs text-gray-500 mb-1 block">Merek</label>
            <select
              value={filterBrand}
              onChange={(e) => { setFilterBrand(e.target.value); setPage(0); }}
              className="input-field text-sm"
            >
              <option value="">Semua Merek</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name || b.code}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs text-gray-500 mb-1 block">Status Stok</label>
            <select
              value={filterStock}
              onChange={(e) => { setFilterStock(e.target.value); setPage(0); }}
              className="input-field text-sm"
            >
              <option value="">Semua</option>
              <option value="critical">Kritis</option>
              <option value="low">Rendah</option>
              <option value="ok">OK</option>
            </select>
          </div>
          <button
            onClick={() => { setFilterCategory(''); setFilterBrand(''); setFilterStock(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            Reset
          </button>
        </div>
      )}

      {/* Edit toolbar */}
      {hasEdits && (
        <div className="sticky top-0 z-10 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-blue-700">
            {Object.keys(editState).length} produk diubah (belum disimpan)
          </span>
          <div className="flex gap-2">
            <button onClick={handleCancelEdits} className="btn-secondary text-sm py-1.5 flex items-center gap-1">
              <X className="w-4 h-4" />
              Batal
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="btn-primary text-sm py-1.5 flex items-center gap-1"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan Semua
            </button>
          </div>
        </div>
      )}

      {/* Products Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Belum ada produk</p>
            <p className="text-sm text-gray-400 mt-1">
              Produk akan muncul setelah sync dari iPOS
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-2 py-3 w-8">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedItems.size === products.length && products.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedItems(new Set(products.map((p) => p.id)));
                        } else {
                          setSelectedItems(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-3 py-3 text-left">Barcode</th>
                  <th className="px-3 py-3 text-left">Nama Produk</th>
                  <th className="px-3 py-3 text-left">Kategori</th>
                  <th className="px-3 py-3 text-left">Merek</th>
                  <th className="px-3 py-3 text-right">HPP</th>
                  <th className="px-3 py-3 text-right">Harga Jual</th>
                  <th className="px-3 py-3 text-right">Stok</th>
                  <th className="px-3 py-3 text-right">Min</th>
                  <th className="px-3 py-3 text-right">Max</th>
                  <th className="px-3 py-3 text-left">Supplier</th>
                  <th className="px-3 py-3 text-left">Rak</th>
                  <th className="px-3 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .filter((product) => {
                    if (!filterStock) return true;
                    const s = product.stock?.[0];
                    if (!s) return filterStock === 'critical';
                    if (filterStock === 'critical') return s.current_qty <= s.min_qty;
                    if (filterStock === 'low') return s.current_qty > s.min_qty && s.current_qty <= (s.max_qty * 0.5);
                    if (filterStock === 'ok') return s.current_qty > s.min_qty;
                    return true;
                  })
                  .map((product) => {
                    const stock = product.stock?.[0];
                    const stockStatus = getStockStatus(product.stock);
                    const isSelected = selectedItems.has(product.id);
                    const isLowStock = stock && stock.current_qty <= stock.min_qty;

                    return (
                      <tr
                        key={product.id}
                        className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''} ${
                          isLowStock ? 'border-l-2 border-l-red-400' : ''
                        }`}
                      >
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(product.id)}
                          />
                        </td>
                        <td className="table-cell font-mono text-xs">{product.barcode}</td>
                        <td className="table-cell font-medium max-w-[200px] truncate" title={product.name}>
                          {product.name}
                          {isLowStock && (
                            <AlertTriangle className="w-3 h-3 text-red-500 inline ml-1" />
                          )}
                        </td>
                        <td className="table-cell text-gray-500 text-sm">
                          {product.category?.name || '-'}
                        </td>
                        <td className="table-cell text-gray-500 text-sm">
                          {product.brand?.name || '-'}
                        </td>
                        <td className="table-cell">
                          {renderEditableCell(product.id, 'hpp', product.hpp, 'rupiah')}
                        </td>
                        <td className="table-cell">
                          {renderEditableCell(product.id, 'sell_price', product.sell_price, 'rupiah')}
                        </td>
                        <td className={`table-cell text-right font-medium ${
                          isLowStock ? 'text-red-600' : ''
                        }`}>
                          {stock ? formatQty(stock.current_qty) : '-'}
                        </td>
                        <td className="table-cell">
                          {stock ? renderEditableCell(product.id, 'min_qty', stock.min_qty, 'qty') : '-'}
                        </td>
                        <td className="table-cell">
                          {stock ? renderEditableCell(product.id, 'max_qty', stock.max_qty, 'qty') : '-'}
                        </td>
                        <td className="table-cell text-gray-500 text-sm">
                          {product.supplier?.name || '-'}
                        </td>
                        <td className="table-cell text-gray-400 text-sm">
                          {product.shelf_location || '-'}
                        </td>
                        <td className="table-cell text-center">
                          <span className={stockStatus.class}>{stockStatus.label}</span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Halaman {page + 1} dari {totalPages} ({totalCount} produk)
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary py-1.5 px-3 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary py-1.5 px-3 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
