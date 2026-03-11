// Database types matching PostgreSQL schema v7.0
// All monetary/qty fields use number (mapped from numeric(20,3))

export type StoreType = 'toko' | 'gudang' | 'pusat';
export type UserRole = 'direktur' | 'gm' | 'supervisor' | 'admin_gudang';
export type OrderStatus = 'draft' | 'ordered' | 'partial' | 'complete' | 'cancelled';
export type OrderItemStatus = 'pending' | 'received' | 'partial' | 'cancelled';
export type TransferStatus = 'draft' | 'sent' | 'received' | 'cancelled';
export type OpnameStatus = 'draft' | 'counting' | 'completed' | 'approved';
export type PromoType = 'discount' | 'bundle' | 'bxgy' | 'min_purchase' | 'flash_sale';
export type PromoStatus = 'draft' | 'active' | 'expired' | 'cancelled';
export type SyncType = 'products' | 'stock' | 'sales' | 'full';
export type MovementType = 'sync_ipos' | 'received' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'opname' | 'return';
export type SupplierType = 'S' | 'P'; // S=Supplier, P=Pelanggan

export interface Store {
  id: string;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  type: StoreType;
  ipos_kodekantor?: string;
  ipos_db_host?: string;
  ipos_db_port?: number;
  ipos_db_name?: string;
  is_active: boolean;
  feature_promo: boolean;
  feature_gudang: boolean;
  feature_roles: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  code: string;
  name?: string;
  ipos_jenis?: string;
}

export interface Brand {
  id: string;
  code: string;
  name?: string;
}

export interface Unit {
  id: string;
  name: string;
  description?: string;
  conversion: number;
  base_unit?: string;
  is_primary: boolean;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  type: SupplierType;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  contact_person?: string;
  ipos_kode?: string;
  is_active: boolean;
  created_at: string;
}

export interface StoreSupplier {
  id: string;
  store_id: string;
  supplier_id: string;
  is_primary: boolean;
  notes?: string;
  supplier?: Supplier;
}

export interface ProductCatalog {
  id: string;
  barcode: string;
  name: string;
  category_id?: string;
  brand_id?: string;
  unit_id?: string;
  default_supplier_id?: string;
  created_at: string;
}

export interface StoreProduct {
  id: string;
  store_id: string;
  catalog_id?: string;
  barcode: string;
  name: string;
  category_id?: string;
  brand_id?: string;
  unit?: string;
  hpp: number;
  sell_price: number;
  supplier_id?: string;
  shelf_location?: string;
  is_active: boolean;
  is_deleted: boolean;
  ipos_kodeitem?: string;
  ipos_supplier_code?: string;
  ipos_last_update?: string;
  last_synced?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  category?: Category;
  brand?: Brand;
  supplier?: Supplier;
  stock?: Stock;
}

export interface Stock {
  id: string;
  store_id: string;
  store_product_id: string;
  current_qty: number;
  max_qty: number;
  min_qty: number;
  last_synced?: string;
}

export interface Order {
  id: string;
  store_id: string;
  supplier_id: string;
  do_number: string;
  order_date: string;
  status: OrderStatus;
  sent_at?: string;
  sent_via?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined
  supplier?: Supplier;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  store_product_id: string;
  qty_ordered: number;
  qty_received: number;
  hpp_at_order?: number;
  status: OrderItemStatus;
  received_at?: string;
  received_by?: string;
  notes?: string;
  // Joined
  store_product?: StoreProduct;
}

export interface DailySales {
  id: string;
  store_id: string;
  sale_date: string;
  total_transactions: number;
  total_revenue: number;
  total_items_sold: number;
  total_profit: number;
  synced_at?: string;
}

export interface DailySaleItem {
  id: string;
  daily_sale_id: string;
  store_product_id: string;
  qty_sold: number;
  revenue: number;
  hpp_total: number;
  profit: number;
  avg_sell_price: number;
  store_product?: StoreProduct;
}

export interface StockMovement {
  id: string;
  store_id?: string;
  store_product_id?: string;
  movement_type: MovementType;
  qty_before?: number;
  qty_change?: number;
  qty_after?: number;
  reference_type?: string;
  reference_id?: string;
  created_by?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  store_id?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  detail?: Record<string, unknown>;
  created_at: string;
}

export interface SyncLog {
  id: string;
  store_id?: string;
  sync_type?: SyncType;
  started_at: string;
  completed_at?: string;
  records_synced: number;
  errors?: Record<string, unknown>;
  status: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  store_id?: string;
  phone?: string;
  is_active: boolean;
  feature_enabled: boolean;
}

export interface Notification {
  id: string;
  user_id?: string;
  store_id?: string;
  type: string;
  title?: string;
  message?: string;
  is_read: boolean;
  action_url?: string;
  created_at: string;
}

export type MetodeBayar = 'TUNAI' | 'QRIS' | 'TRANSFER' | 'DEBIT';

export interface SalesTransaction {
  id: string;
  notransaksi: string;
  store_id: string;
  kodekantor?: string;
  tanggal: string;
  totalakhir: number;
  keterangan?: string;
  kasir?: string;
  shiftkerja?: string;
  tipe?: string;
  created_at: string;
}

export interface PaymentMethodOverride {
  id: string;
  notransaksi: string;
  metode_override: MetodeBayar;
  alasan?: string;
  corrected_by?: string;
  corrected_at: string;
}

export interface OperationalCost {
  id: string;
  store_id: string;
  bulan: string;
  gaji_karyawan: number;
  listrik: number;
  sewa_tempat: number;
  plastik_kemasan: number;
  transportasi: number;
  lain_lain: number;
  total_biaya: number;
  modal_investasi: number;
  catatan?: string;
  updated_at: string;
}

export interface SaleItemDetail {
  id: string;
  store_id: string;
  sale_date: string;
  store_product_id: string;
  barcode: string;
  nama_produk: string;
  hpp: number;
  sell_price: number;
  kategori_kode: string;
  kategori_nama: string;
  qty_sold: number;
  revenue: number;
  hpp_total: number;
  profit: number;
}

export interface MarginRendahRow {
  id: string;
  store_id: string;
  barcode: string;
  nama_produk: string;
  kategori_kode: string;
  hpp: number;
  harga_jual: number;
  margin_pct: number;
  status_margin: 'KRITIS' | 'RENDAH' | 'SEDANG' | 'SEHAT' | 'NO_HPP';
}

export interface RekapKasirRow {
  id: string;
  notransaksi: string;
  store_id: string;
  kodekantor?: string;
  tanggal: string;
  totalakhir: number;
  keterangan?: string;
  kasir?: string;
  shiftkerja?: string;
  tipe?: string;
  created_at: string;
  // Computed by view
  metode_bayar: MetodeBayar;
  is_manual_override: boolean;
  alasan_override?: string;
  corrected_by?: string;
  corrected_at?: string;
  needs_review: boolean;
}
