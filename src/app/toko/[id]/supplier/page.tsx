'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Search,
  Plus,
  Truck,
  Loader2,
  Phone,
  Mail,
  Edit2,
  Trash2,
  X,
  Save,
  MapPin,
  User,
} from 'lucide-react';
import type { Supplier } from '@/types/database';

interface StoreSupplierRow {
  id: string;
  supplier_id: string;
  is_primary: boolean;
  notes: string | null;
  supplier: Supplier;
}

interface SupplierForm {
  code: string;
  name: string;
  type: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  contact_person: string;
}

const emptyForm: SupplierForm = {
  code: '',
  name: '',
  type: 'S',
  address: '',
  city: '',
  phone: '',
  email: '',
  contact_person: '',
};

export default function SupplierPage() {
  const params = useParams();
  const storeId = params.id as string;
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [storeSuppliers, setStoreSuppliers] = useState<StoreSupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchSuppliers = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('store_suppliers')
      .select(`
        id, supplier_id, is_primary, notes,
        supplier:suppliers(*)
      `)
      .eq('store_id', storeId);

    if (fetchError) {
      console.error('Error:', fetchError);
    } else if (data) {
      const rows: StoreSupplierRow[] = [];
      for (const row of data) {
        const sup = row.supplier;
        if (Array.isArray(sup) && sup.length > 0) {
          rows.push({ ...row, supplier: sup[0] as Supplier });
        } else if (sup && !Array.isArray(sup)) {
          rows.push({ ...row, supplier: sup as unknown as Supplier });
        }
      }
      setStoreSuppliers(rows);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const filteredSuppliers = storeSuppliers.filter(
    (ss) =>
      ss.supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ss.supplier.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ss.supplier.contact_person || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenAdd = () => {
    setForm(emptyForm);
    setEditingSupplierId(null);
    setShowForm(true);
    setError('');
  };

  const handleOpenEdit = (supplier: Supplier) => {
    setForm({
      code: supplier.code,
      name: supplier.name,
      type: supplier.type || 'S',
      address: supplier.address || '',
      city: supplier.city || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      contact_person: supplier.contact_person || '',
    });
    setEditingSupplierId(supplier.id);
    setShowForm(true);
    setError('');
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('Kode dan Nama supplier wajib diisi');
      return;
    }
    setSaving(true);
    setError('');

    if (editingSupplierId) {
      // Update existing supplier
      const { error: updateErr } = await supabase
        .from('suppliers')
        .update({
          code: form.code.trim(),
          name: form.name.trim(),
          type: form.type,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          contact_person: form.contact_person.trim() || null,
        })
        .eq('id', editingSupplierId);

      if (updateErr) {
        setError(updateErr.message);
      } else {
        await supabase.from('audit_log').insert({
          store_id: storeId,
          action: 'update_supplier',
          entity_type: 'suppliers',
          entity_id: editingSupplierId,
          detail: { supplier_name: form.name.trim(), code: form.code.trim() },
        });
        setShowForm(false);
        fetchSuppliers();
      }
    } else {
      // Create new supplier + link to store
      const { data: newSupplier, error: insertErr } = await supabase
        .from('suppliers')
        .insert({
          code: form.code.trim(),
          name: form.name.trim(),
          type: form.type,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          contact_person: form.contact_person.trim() || null,
        })
        .select()
        .single();

      if (insertErr) {
        setError(insertErr.message);
      } else if (newSupplier) {
        // Link to store
        await supabase.from('store_suppliers').insert({
          store_id: storeId,
          supplier_id: newSupplier.id,
        });
        await supabase.from('audit_log').insert({
          store_id: storeId,
          action: 'create_supplier',
          entity_type: 'suppliers',
          entity_id: newSupplier.id,
          detail: { supplier_name: newSupplier.name, code: newSupplier.code },
        });
        setShowForm(false);
        fetchSuppliers();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (storeSupplierRow: StoreSupplierRow) => {
    // Remove store_supplier link (not the supplier itself)
    const { error: delErr } = await supabase
      .from('store_suppliers')
      .delete()
      .eq('id', storeSupplierRow.id);

    if (!delErr) {
      await supabase.from('audit_log').insert({
        store_id: storeId,
        action: 'remove_supplier_link',
        entity_type: 'store_suppliers',
        entity_id: storeSupplierRow.id,
        detail: {
          supplier_id: storeSupplierRow.supplier?.id,
          supplier_name: storeSupplierRow.supplier?.name,
        },
      });
      setDeleteConfirm(null);
      fetchSuppliers();
    }
  };

  const handleTogglePrimary = async (row: StoreSupplierRow) => {
    await supabase
      .from('store_suppliers')
      .update({ is_primary: !row.is_primary })
      .eq('id', row.id);
    fetchSuppliers();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Daftar Supplier</h1>
          <p className="text-sm text-gray-500 mt-1">{storeSuppliers.length} supplier terdaftar</p>
        </div>
        <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Tambah</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Cari supplier..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingSupplierId ? 'Edit Supplier' : 'Tambah Supplier Baru'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Kode *</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="input-field"
                    placeholder="SUP-001"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Tipe</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="input-field"
                  >
                    <option value="S">Supplier</option>
                    <option value="P">Pelanggan</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Nama Supplier *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  placeholder="PT Distributor Utama"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Contact Person</label>
                <input
                  type="text"
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                  className="input-field"
                  placeholder="Budi Santoso"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Telepon</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="input-field"
                    placeholder="08123456789"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    placeholder="supplier@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Alamat</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="input-field"
                  rows={2}
                  placeholder="Jl. Raya No. 123"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Kota</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="input-field"
                  placeholder="Jakarta"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowForm(false)} className="btn-secondary">
                Batal
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingSupplierId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-800 mb-2">Hapus Supplier?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Supplier akan dihapus dari daftar toko ini. Data supplier tetap tersimpan di sistem.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Batal</button>
              <button
                onClick={() => {
                  const row = storeSuppliers.find((ss) => ss.id === deleteConfirm);
                  if (row) handleDelete(row);
                }}
                className="btn-danger flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="card text-center py-16">
          <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Belum ada supplier</p>
          <p className="text-sm text-gray-400 mt-1">
            Klik &quot;Tambah&quot; untuk menambahkan supplier baru
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSuppliers.map((ss) => {
            const supplier = ss.supplier;
            return (
              <div key={ss.id} className="card hover:border-blue-200 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800 truncate">{supplier.name}</h3>
                      {ss.is_primary && (
                        <span className="badge-info text-[10px]">Utama</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Kode: {supplier.code}</p>
                    {supplier.contact_person && (
                      <div className="flex items-center gap-1 mt-1.5 text-sm text-gray-600">
                        <User className="w-3 h-3" />
                        {supplier.contact_person}
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-start gap-1 mt-1 text-sm text-gray-500">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="truncate">{supplier.address}{supplier.city ? `, ${supplier.city}` : ''}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {supplier.phone && (
                      <a
                        href={`https://wa.me/${supplier.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-green-50 text-green-600"
                        title="WhatsApp"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    {supplier.email && (
                      <a
                        href={`mailto:${supplier.email}`}
                        className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"
                        title="Email"
                      >
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => handleOpenEdit(supplier)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(ss.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-400"
                      title="Hapus dari toko"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Toggle primary */}
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                  <button
                    onClick={() => handleTogglePrimary(ss)}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      ss.is_primary
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-blue-50'
                    }`}
                  >
                    {ss.is_primary ? 'Supplier Utama' : 'Jadikan Utama'}
                  </button>
                  {supplier.phone && (
                    <a
                      href={`tel:${supplier.phone}`}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      {supplier.phone}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
