#!/usr/bin/env python3
"""
Sync Agent iPOS 4 (PostgreSQL 8.4) → Supabase
Membaca data dari database iPOS lokal dan mengirim ke Supabase cloud.

Tabel yang disync:
  - tbl_item + tbl_itemstok → store_products + stock
  - tbl_ikhd + tbl_ikdt → daily_sales + daily_sale_items
  - tbl_supel → suppliers
  - tbl_itemjenis → categories
  - tbl_itemmerek → brands

Penggunaan:
  python sync_agent.py              # Sync sekali
  python sync_agent.py --daemon     # Jalankan sebagai daemon (interval dari config)
  python sync_agent.py --type products  # Sync produk saja
  python sync_agent.py --type stock     # Sync stok saja
  python sync_agent.py --type sales     # Sync penjualan saja
"""

import sys
import time
import json
import logging
import argparse
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional

import psycopg2
import psycopg2.extras
import requests
import schedule

import config

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("sync_agent.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("sync_agent")


# ---------------------------------------------------------------------------
# Helper: Supabase REST API
# ---------------------------------------------------------------------------
class SupabaseClient:
    """Lightweight Supabase REST client using service_role key."""

    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/")
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def _url(self, table: str) -> str:
        return f"{self.base}/rest/v1/{table}"

    def select(self, table: str, params: Optional[dict] = None) -> list:
        r = requests.get(self._url(table), headers=self.headers, params=params or {})
        r.raise_for_status()
        return r.json()

    def select_all(self, table: str, params: Optional[dict] = None) -> list:
        """Fetch ALL rows with auto-pagination (bypasses PostgREST 1000-row limit)."""
        all_rows = []
        page_size = 1000
        offset = 0
        p = dict(params or {})
        while True:
            p["limit"] = page_size
            p["offset"] = offset
            rows = self.select(table, p)
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size
        return all_rows

    def upsert(self, table: str, rows: list, on_conflict: str = "") -> list:
        headers = {**self.headers, "Prefer": "return=representation,resolution=merge-duplicates"}
        params = {}
        if on_conflict:
            params["on_conflict"] = on_conflict
        r = requests.post(self._url(table), headers=headers, json=rows, params=params)
        if not r.ok:
            try:
                err = r.json()
                log.error(f"Supabase {table} error {r.status_code}: "
                          f"{err.get('message','')} | {err.get('details','')}")
            except Exception:
                log.error(f"Supabase {table} error {r.status_code}: {r.text[:300]}")
        r.raise_for_status()
        return r.json()

    def insert(self, table: str, rows: list) -> list:
        r = requests.post(self._url(table), headers=self.headers, json=rows)
        r.raise_for_status()
        return r.json()

    def update(self, table: str, data: dict, eq_filters: dict) -> list:
        params = {f"{k}": f"eq.{v}" for k, v in eq_filters.items()}
        r = requests.patch(self._url(table), headers=self.headers, json=data, params=params)
        r.raise_for_status()
        return r.json()

    def rpc(self, fn_name: str, params: Optional[dict] = None) -> dict:
        r = requests.post(
            f"{self.base}/rest/v1/rpc/{fn_name}",
            headers=self.headers,
            json=params or {},
        )
        r.raise_for_status()
        return r.json()


# ---------------------------------------------------------------------------
# Helper: decimal → float for JSON
# ---------------------------------------------------------------------------
def dec(val) -> float:
    if val is None:
        return 0.0
    if isinstance(val, Decimal):
        return float(val)
    return float(val)


# ---------------------------------------------------------------------------
# iPOS Connection
# ---------------------------------------------------------------------------
def get_ipos_connection(store: dict = None):
    """Connect to iPOS PostgreSQL 8.4 database."""
    host = (store or {}).get("ipos_db_host") or config.IPOS_DB_HOST
    port = (store or {}).get("ipos_db_port") or config.IPOS_DB_PORT
    name = (store or {}).get("ipos_db_name") or config.IPOS_DB_NAME

    log.info(f"Connecting to iPOS: {host}:{port}/{name}")
    conn = psycopg2.connect(
        host=host,
        port=port,
        dbname=name,
        user=config.IPOS_DB_USER,
        password=config.IPOS_DB_PASS,
        connect_timeout=10,
    )
    conn.set_client_encoding("UTF8")
    return conn


# ---------------------------------------------------------------------------
# Sync Log Management
# ---------------------------------------------------------------------------
def create_sync_log(sb: SupabaseClient, store_id: str, sync_type: str) -> str:
    """Create a sync_log entry and return its ID."""
    rows = sb.insert("sync_log", [{
        "store_id": store_id,
        "sync_type": sync_type,
        "status": "running",
        "records_synced": 0,
    }])
    return rows[0]["id"]


def complete_sync_log(sb: SupabaseClient, log_id: str, records: int, errors: list = None):
    """Mark sync_log as completed."""
    status = "success" if not errors else "partial"
    sb.update("sync_log", {
        "completed_at": datetime.utcnow().isoformat(),
        "records_synced": records,
        "status": status,
        "errors": {"messages": errors} if errors else None,
    }, {"id": log_id})


def fail_sync_log(sb: SupabaseClient, log_id: str, error_msg: str):
    """Mark sync_log as failed."""
    sb.update("sync_log", {
        "completed_at": datetime.utcnow().isoformat(),
        "status": "failed",
        "errors": {"messages": [error_msg]},
    }, {"id": log_id})


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------
def audit(sb: SupabaseClient, store_id: str, action: str, entity_type: str, detail: dict = None):
    """Insert audit log entry."""
    try:
        sb.insert("audit_log", [{
            "store_id": store_id,
            "action": action,
            "entity_type": entity_type,
            "detail": detail or {},
        }])
    except Exception as e:
        log.warning(f"Audit log failed: {e}")


# ---------------------------------------------------------------------------
# SYNC: Products (tbl_item → store_products)
# ---------------------------------------------------------------------------
def sync_products(ipos_conn, sb: SupabaseClient, store_id: str, kodekantor: str) -> int:
    """Sync master products from iPOS tbl_item to store_products."""
    log.info(f"Syncing products for store {kodekantor}...")

    cur = ipos_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT kodeitem, namaitem, jenis, satuan, merek,
               hargapokok, hargajual1, supplier1, stokmin, stok,
               rak, dateupd, statusjual, statushapus
        FROM tbl_item
        ORDER BY kodeitem
    """)
    ipos_items = cur.fetchall()
    cur.close()

    if not ipos_items:
        log.info("No products found in iPOS")
        return 0

    # Get existing store_products for mapping (select_all: bypass 1000-row limit)
    existing = sb.select_all("store_products", {
        "store_id": f"eq.{store_id}",
        "select": "id,ipos_kodeitem,barcode",
    })
    existing_map = {p["ipos_kodeitem"]: p for p in existing if p.get("ipos_kodeitem")}

    # Get category/brand mappings
    categories = sb.select("categories", {"select": "id,code"})
    cat_map = {c["code"]: c["id"] for c in categories}

    brands = sb.select("brands", {"select": "id,code"})
    brand_map = {b["code"]: b["id"] for b in brands}

    # Get supplier mappings
    suppliers = sb.select("suppliers", {"select": "id,ipos_kode"})
    sup_map = {s["ipos_kode"]: s["id"] for s in suppliers if s.get("ipos_kode")}

    now = datetime.utcnow().isoformat()
    to_upsert = []
    count = 0

    for item in ipos_items:
        kode = str(item["kodeitem"]).strip()
        if not kode:
            continue

        # Map category, brand, supplier — selalu None jika tidak ditemukan
        # (PostgREST butuh semua row punya key yang sama persis)
        jenis = str(item.get("jenis") or "").strip()
        merek = str(item.get("merek") or "").strip()
        sup_code = str(item.get("supplier1") or "").strip()

        product_data = {
            "store_id": store_id,
            "barcode": kode,
            "name": str(item.get("namaitem") or kode).strip(),
            "unit": str(item.get("satuan") or "PCS").strip(),
            "hpp": dec(item.get("hargapokok")),
            "sell_price": dec(item.get("hargajual1")),
            "shelf_location": str(item.get("rak") or "").strip() or None,
            "is_active": str(item.get("statusjual")) != "1",
            "is_deleted": str(item.get("statushapus") or "0") == "1",
            "ipos_kodeitem": kode,
            "ipos_supplier_code": sup_code or None,
            "category_id": cat_map.get(jenis) if jenis else None,
            "brand_id": brand_map.get(merek) if merek else None,
            "supplier_id": sup_map.get(sup_code) if sup_code else None,
            "last_synced": now,
        }

        # If existing, include id for upsert
        if kode in existing_map:
            product_data["id"] = existing_map[kode]["id"]

        to_upsert.append(product_data)
        count += 1

    # Batch upsert in chunks of 500
    BATCH = 500
    for i in range(0, len(to_upsert), BATCH):
        batch = to_upsert[i : i + BATCH]
        # Remove id field for upsert — let store_id+barcode uniqueness handle conflicts
        for row in batch:
            row.pop("id", None)
        sb.upsert("store_products", batch, on_conflict="store_id,barcode")

    log.info(f"Synced {count} products")
    return count


# ---------------------------------------------------------------------------
# SYNC: Stock (tbl_itemstok → stock)
# ---------------------------------------------------------------------------
def sync_stock(ipos_conn, sb: SupabaseClient, store_id: str, kodekantor: str) -> int:
    """Sync stock quantities from iPOS tbl_itemstok to stock table."""
    log.info(f"Syncing stock for store {kodekantor}...")

    cur = ipos_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    # LEFT JOIN: ambil SEMUA produk aktif, pakai stok dari tbl_itemstok jika ada,
    # fallback ke tbl_item.stok (stok utama iPOS untuk single-store)
    cur.execute("""
        SELECT i.kodeitem,
               COALESCE(s.stok, i.stok, 0) AS stok,
               CASE WHEN i.stokmin IS NULL OR i.stokmin = 0 THEN 5
                    ELSE i.stokmin END AS stokmin
        FROM tbl_item i
        LEFT JOIN tbl_itemstok s ON s.kodeitem = i.kodeitem AND s.kantor = %s
        WHERE (i.statushapus = '0' OR i.statushapus IS NULL)
    """, (kodekantor,))
    ipos_stock = cur.fetchall()
    cur.close()

    if not ipos_stock:
        log.info("No stock data found in iPOS")
        return 0

    # Get store_products mapping (select_all: bypass 1000-row limit)
    products = sb.select_all("store_products", {
        "store_id": f"eq.{store_id}",
        "select": "id,ipos_kodeitem",
    })
    prod_map = {p["ipos_kodeitem"]: p["id"] for p in products if p.get("ipos_kodeitem")}

    # Get existing stock records (select_all: bypass 1000-row limit)
    existing_stock = sb.select_all("stock", {
        "store_id": f"eq.{store_id}",
        "select": "id,store_product_id,current_qty",
    })
    stock_map = {s["store_product_id"]: s for s in existing_stock}

    now = datetime.utcnow().isoformat()
    stock_upserts = []
    movements = []
    count = 0

    for row in ipos_stock:
        kode = str(row["kodeitem"]).strip()
        if kode not in prod_map:
            continue

        sp_id = prod_map[kode]
        new_qty = dec(row.get("stok"))
        min_qty = dec(row.get("stokmin"))

        stock_data = {
            "store_id": store_id,
            "store_product_id": sp_id,
            "current_qty": new_qty,
            "min_qty": min_qty,
            "last_synced": now,
        }

        # Check if stock changed for movement recording
        if sp_id in stock_map:
            old_stock = stock_map[sp_id]
            stock_data["id"] = old_stock["id"]
            old_qty = dec(old_stock.get("current_qty"))
            if old_qty != new_qty:
                movements.append({
                    "store_id": store_id,
                    "store_product_id": sp_id,
                    "movement_type": "sync_ipos",
                    "qty_before": old_qty,
                    "qty_change": new_qty - old_qty,
                    "qty_after": new_qty,
                    "reference_type": "sync",
                })

        stock_upserts.append(stock_data)
        count += 1

    # Batch upsert stock
    BATCH = 500
    for i in range(0, len(stock_upserts), BATCH):
        batch = stock_upserts[i : i + BATCH]
        items_with_id = [s for s in batch if "id" in s]
        items_new = [s for s in batch if "id" not in s]
        if items_with_id:
            sb.upsert("stock", items_with_id, on_conflict="id")
        if items_new:
            sb.upsert("stock", items_new, on_conflict="store_id,store_product_id")

    # Record stock movements
    if movements:
        for i in range(0, len(movements), BATCH):
            sb.insert("stock_movements", movements[i : i + BATCH])
        log.info(f"Recorded {len(movements)} stock movements")

    log.info(f"Synced {count} stock records")
    return count


# ---------------------------------------------------------------------------
# SYNC: Sales (tbl_ikhd + tbl_ikdt → daily_sales + daily_sale_items)
# ---------------------------------------------------------------------------
def sync_sales(ipos_conn, sb: SupabaseClient, store_id: str, kodekantor: str,
               days_back: int = 30) -> int:
    """Sync daily sales dari iPOS ke daily_sales + daily_sale_items."""
    log.info(f"Syncing sales for store {kodekantor} (last {days_back} days)...")

    since_date = (date.today() - timedelta(days=days_back)).isoformat()

    cur = ipos_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Get daily totals from tbl_ikhd (header penjualan)
    cur.execute("""
        SELECT DATE(tanggal) as sale_date,
               COUNT(*) as total_transactions,
               COALESCE(SUM(totalakhir), 0) as total_revenue
        FROM tbl_ikhd
        WHERE DATE(tanggal) >= %s
          AND kodekantor = %s
        GROUP BY DATE(tanggal)
        ORDER BY sale_date
    """, (since_date, kodekantor))
    daily_totals = cur.fetchall()

    if not daily_totals:
        log.info("No sales data found in iPOS")
        cur.close()
        return 0

    # Get product mapping — gunakan ipos_kodeitem, fallback ke barcode
    # (fallback diperlukan jika produk disync sebelum kolom ipos_kodeitem terisi)
    products = sb.select_all("store_products", {
        "store_id": f"eq.{store_id}",
        "select": "id,ipos_kodeitem,barcode,hpp",
    })
    prod_map: dict = {}
    for p in products:
        key = str(p.get("ipos_kodeitem") or p.get("barcode") or "").strip()
        if key:
            prod_map[key] = p
    log.info(f"Product map: {len(prod_map)} produk (dari {len(products)} di store_products)")

    now = datetime.utcnow().isoformat()
    count = 0
    total_items_inserted = 0

    for daily in daily_totals:
        sale_date = str(daily["sale_date"])

        # Get item-level detail for this day
        cur.execute("""
            SELECT d.kodeitem,
                   SUM(d.jumlah) as qty_sold,
                   SUM(d.total) as revenue,
                   AVG(d.harga) as avg_price
            FROM tbl_ikdt d
            JOIN tbl_ikhd h ON h.notransaksi = d.notransaksi
            WHERE DATE(h.tanggal) = %s
              AND h.kodekantor = %s
            GROUP BY d.kodeitem
        """, (sale_date, kodekantor))
        items = cur.fetchall()

        total_items_sold = sum(dec(i.get("qty_sold")) for i in items)
        total_revenue = dec(daily.get("total_revenue"))

        # Calculate profit from item details
        total_hpp = 0.0
        sale_items = []
        skipped = 0
        for item in items:
            kode = str(item["kodeitem"]).strip()
            if kode not in prod_map:
                skipped += 1
                continue
            prod = prod_map[kode]
            qty = dec(item.get("qty_sold"))
            rev = dec(item.get("revenue"))
            hpp = dec(prod.get("hpp")) * qty
            total_hpp += hpp
            sale_items.append({
                "store_product_id": prod["id"],
                "qty_sold": qty,
                "revenue": rev,
                "hpp_total": hpp,
                "profit": rev - hpp,
                "avg_sell_price": dec(item.get("avg_price")),
            })

        if skipped > 0:
            log.warning(
                f"{sale_date}: {skipped}/{len(items)} item dilewati "
                f"— kodeitem tidak ditemukan di store_products"
            )
        if not sale_items and items:
            log.warning(
                f"{sale_date}: {len(items)} item di tbl_ikdt tapi 0 cocok "
                f"— pastikan sync produk sudah dijalankan terlebih dahulu"
            )

        total_profit = total_revenue - total_hpp

        # Upsert daily_sales
        daily_data = [{
            "store_id": store_id,
            "sale_date": sale_date,
            "total_transactions": int(daily.get("total_transactions", 0)),
            "total_revenue": total_revenue,
            "total_items_sold": total_items_sold,
            "total_profit": total_profit,
            "synced_at": now,
        }]

        result = sb.upsert("daily_sales", daily_data, on_conflict="store_id,sale_date")

        # Insert sale items
        if result and sale_items:
            daily_sale_id = result[0]["id"]

            # Hapus item lama untuk hari ini sebelum insert ulang
            try:
                del_resp = requests.delete(
                    f"{sb.base}/rest/v1/daily_sale_items",
                    headers=sb.headers,
                    params={"daily_sale_id": f"eq.{daily_sale_id}"},
                )
                if not del_resp.ok:
                    log.warning(f"Delete items {sale_date}: HTTP {del_resp.status_code}")
            except Exception as e:
                log.warning(f"Delete items {sale_date} gagal: {e}")

            # Insert item baru
            for si in sale_items:
                si["daily_sale_id"] = daily_sale_id
            try:
                BATCH = 500
                for i in range(0, len(sale_items), BATCH):
                    sb.insert("daily_sale_items", sale_items[i : i + BATCH])
                total_items_inserted += len(sale_items)
                log.debug(f"{sale_date}: inserted {len(sale_items)} sale items")
            except Exception as e:
                log.error(f"Insert daily_sale_items gagal untuk {sale_date}: {e}")
                raise

        count += 1

    cur.close()
    log.info(f"Synced {count} hari, {total_items_inserted} total sale items inserted")
    return count


# ---------------------------------------------------------------------------
# SYNC: Suppliers (tbl_supel → suppliers + store_suppliers)
# ---------------------------------------------------------------------------
def sync_suppliers(ipos_conn, sb: SupabaseClient, store_id: str = None) -> int:
    """Sync suppliers from iPOS tbl_supel to suppliers + store_suppliers tables."""
    log.info("Syncing suppliers...")

    cur = ipos_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    # Ambil semua bukan pelanggan (PL) — termasuk SU, S, atau tipe kosong
    cur.execute("""
        SELECT kode, nama, alamat, kota, telepon, email, kontak, tipe
        FROM tbl_supel
        WHERE (tipe IS NULL OR tipe NOT IN ('PL'))
          AND kode IS NOT NULL
        ORDER BY kode
    """)
    ipos_suppliers = cur.fetchall()
    cur.close()

    if not ipos_suppliers:
        log.info("No suppliers found in iPOS")
        return 0

    # Get existing suppliers in Supabase
    existing = sb.select("suppliers", {"select": "id,ipos_kode,code"})
    existing_by_ipos = {s["ipos_kode"]: s["id"] for s in existing if s.get("ipos_kode")}
    existing_by_code = {s["code"]: s["id"] for s in existing if s.get("code")}

    to_upsert = []
    for sup in ipos_suppliers:
        kode = str(sup["kode"]).strip()
        if not kode:
            continue

        data = {
            "code": kode,
            "name": str(sup.get("nama") or kode).strip(),
            "type": "S",
            "address": str(sup.get("alamat") or "").strip() or None,
            "city": str(sup.get("kota") or "").strip() or None,
            "phone": str(sup.get("telepon") or sup.get("hp") or "").strip() or None,
            "email": str(sup.get("email") or "").strip() or None,
            "contact_person": str(sup.get("kontak") or "").strip() or None,
            "ipos_kode": kode,
            "is_active": True,
        }

        # Pakai id yang sudah ada (cegah duplikasi)
        existing_id = existing_by_ipos.get(kode) or existing_by_code.get(kode)
        if existing_id:
            data["id"] = existing_id

        to_upsert.append(data)

    # Upsert ke tabel suppliers
    synced_ids = []
    if to_upsert:
        items_with_id = [s for s in to_upsert if "id" in s]
        items_new = [s for s in to_upsert if "id" not in s]
        if items_with_id:
            result = sb.upsert("suppliers", items_with_id, on_conflict="id")
            synced_ids += [r["id"] for r in result]
        if items_new:
            result = sb.upsert("suppliers", items_new, on_conflict="code")
            synced_ids += [r["id"] for r in result]

    log.info(f"Synced {len(to_upsert)} suppliers to suppliers table")

    # Link ke store_suppliers (agar muncul di halaman Daftar Supplier per toko)
    if store_id and synced_ids:
        # Ambil existing store_supplier links
        existing_links = sb.select("store_suppliers", {
            "store_id": f"eq.{store_id}",
            "select": "supplier_id",
        })
        linked_ids = {lnk["supplier_id"] for lnk in existing_links}

        # Insert yang belum terhubung
        new_links = [
            {"store_id": store_id, "supplier_id": sid, "is_primary": False}
            for sid in synced_ids
            if sid not in linked_ids
        ]
        if new_links:
            sb.upsert("store_suppliers", new_links, on_conflict="store_id,supplier_id")
            log.info(f"Linked {len(new_links)} new suppliers to store")
        else:
            log.info("All suppliers already linked to store")

    return len(to_upsert)


# ---------------------------------------------------------------------------
# SYNC: Purchases (tbl_imhd + tbl_imdt → purchases + purchase_items)
# ---------------------------------------------------------------------------
def sync_purchases(ipos_conn, sb: SupabaseClient, store_id: str, kodekantor: str,
                   days_back: int = 90) -> int:
    """Sync purchase invoices from iPOS tbl_imhd + tbl_imdt to Supabase."""
    log.info(f"Syncing purchases for store {kodekantor} (last {days_back} days)...")

    since_date = (date.today() - timedelta(days=days_back)).isoformat()

    cur = ipos_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Fetch purchase headers (tbl_imhd)
    cur.execute("""
        SELECT notransaksi, tanggal, kodekantor, kantortujuan, tipe,
               kodesupel, totalitem, subtotal, potfaktur, pajak,
               totalakhir, carabayar, keterangan
        FROM tbl_imhd
        WHERE (kodekantor = %s OR kantortujuan = %s)
          AND tanggal >= %s
        ORDER BY tanggal DESC
    """, (kodekantor, kodekantor, since_date))
    headers = cur.fetchall()

    if not headers:
        log.info("No purchase data found in iPOS")
        cur.close()
        return 0

    notrans_list = [h["notransaksi"] for h in headers]

    # Fetch all detail rows in one query (tbl_imdt)
    cur.execute("""
        SELECT iddetail, notransaksi, kodeitem, jumlah, satuan,
               harga, potongan, total
        FROM tbl_imdt
        WHERE notransaksi = ANY(%s)
    """, (notrans_list,))
    all_details = cur.fetchall()
    cur.close()

    # Group details by notransaksi
    details_map: dict = {}
    for d in all_details:
        key = d["notransaksi"]
        details_map.setdefault(key, []).append(d)

    # Build lookup maps from Supabase
    existing = sb.select("purchases", {
        "store_id": f"eq.{store_id}",
        "select": "id,ipos_notransaksi",
    })
    existing_map = {p["ipos_notransaksi"]: p["id"] for p in existing}

    suppliers = sb.select("suppliers", {"select": "id,ipos_kode"})
    supplier_map = {s["ipos_kode"]: s["id"] for s in suppliers if s.get("ipos_kode")}

    products = sb.select_all("store_products", {
        "store_id": f"eq.{store_id}",
        "select": "id,ipos_kodeitem",
    })
    prod_map = {p["ipos_kodeitem"]: p["id"] for p in products if p.get("ipos_kodeitem")}

    now = datetime.utcnow().isoformat()
    count = 0

    BATCH = 100  # smaller batch — purchases have nested items

    for h in headers:
        notrans = h["notransaksi"]
        kodesupel = str(h.get("kodesupel") or "").strip()

        purchase_data = {
            "store_id":         store_id,
            "ipos_notransaksi": notrans,
            "faktur_no":        notrans,
            "tanggal":          h["tanggal"].isoformat() if h.get("tanggal") else None,
            "tipe":             str(h.get("tipe") or "BL").strip(),
            "ipos_kodesupel":   kodesupel,
            "supplier_id":      supplier_map.get(kodesupel),
            "total_item":       dec(h.get("totalitem")),
            "subtotal":         dec(h.get("subtotal")),
            "potongan":         dec(h.get("potfaktur")),
            "pajak":            dec(h.get("pajak")),
            "total_akhir":      dec(h.get("totalakhir")),
            "cara_bayar":       str(h.get("carabayar") or "").strip() or None,
            "keterangan":       str(h.get("keterangan") or "").strip() or None,
            "synced_at":        now,
            "updated_at":       now,
        }

        if notrans in existing_map:
            purchase_data["id"] = existing_map[notrans]

        # Upsert purchase header
        result = sb.upsert("purchases", [purchase_data], on_conflict="ipos_notransaksi")
        if not result:
            continue
        purchase_id = result[0]["id"]

        # Upsert purchase items
        items = details_map.get(notrans, [])
        item_rows = []
        for d in items:
            kode = str(d.get("kodeitem") or "").strip()
            iddetail = str(d.get("iddetail") or "").strip()
            if not iddetail:
                continue
            item_rows.append({
                "purchase_id":      purchase_id,
                "store_product_id": prod_map.get(kode),
                "ipos_kodeitem":    kode,
                "ipos_iddetail":    iddetail,
                "jumlah":           dec(d.get("jumlah")),
                "satuan":           str(d.get("satuan") or "").strip() or None,
                "harga":            dec(d.get("harga")),
                "potongan":         dec(d.get("potongan")),
                "total":            dec(d.get("total")),
            })

        if item_rows:
            for i in range(0, len(item_rows), BATCH):
                sb.upsert("purchase_items", item_rows[i:i+BATCH],
                          on_conflict="ipos_iddetail")

        count += 1

    log.info(f"Synced {count} purchases with {len(all_details)} item lines")
    return count


# ---------------------------------------------------------------------------
# SYNC: Sales Transactions (tbl_ikhd → sales_transactions)
# ---------------------------------------------------------------------------
def sync_sales_transactions(ipos_conn, sb: SupabaseClient, kodekantor: str,
                             store_id: str, days_back: int = 30) -> int:
    """Sync per-transaction data from iPOS tbl_ikhd to sales_transactions."""
    log.info(f"Syncing sales transactions for store {kodekantor} (last {days_back} days)...")

    since_date = (date.today() - timedelta(days=days_back)).isoformat()

    cur = ipos_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT notransaksi, tanggal, kodekantor, tipe,
               kodesupel, totalakhir, jmltunai, jmlkredit,
               jmldebit, jmlemoney, keterangan, user1, shiftkerja
        FROM tbl_ikhd
        WHERE kodekantor = %s
          AND tanggal >= %s
        ORDER BY tanggal DESC
    """, (kodekantor, since_date))
    rows = cur.fetchall()
    cur.close()

    if not rows:
        log.info("No transaction data found in iPOS")
        return 0

    to_upsert = []
    for row in rows:
        notrans = str(row["notransaksi"]).strip()
        if not notrans:
            continue

        tanggal = row.get("tanggal")
        tanggal_iso = tanggal.isoformat() if tanggal else None

        to_upsert.append({
            "notransaksi": notrans,
            "store_id":    store_id,
            "kodekantor":  kodekantor,
            "tanggal":     tanggal_iso,
            "totalakhir":  dec(row.get("totalakhir")),
            "keterangan":  str(row.get("keterangan") or "").strip() or None,
            "kasir":       str(row.get("user1") or "").strip() or None,
            "shiftkerja":  str(row.get("shiftkerja") or "").strip() or None,
            "tipe":        str(row.get("tipe") or "").strip() or None,
        })

    BATCH = 500
    for i in range(0, len(to_upsert), BATCH):
        sb.upsert("sales_transactions", to_upsert[i:i+BATCH],
                  on_conflict="notransaksi")

    log.info(f"Synced {len(to_upsert)} sales transactions")
    return len(to_upsert)


# ---------------------------------------------------------------------------
# Main sync orchestration
# ---------------------------------------------------------------------------
def run_sync(sync_type: str = "full"):
    """Run sync for all active stores."""
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        log.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        return

    sb = SupabaseClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)

    # Get active stores with iPOS config
    stores = sb.select("stores", {
        "is_active": "eq.true",
        "select": "id,code,name,ipos_kodekantor,ipos_db_host,ipos_db_port,ipos_db_name",
    })

    if not stores:
        log.warning("No active stores found")
        return

    for store in stores:
        store_id = store["id"]
        kodekantor = store.get("ipos_kodekantor")

        if not kodekantor:
            log.info(f"Store {store['code']} has no ipos_kodekantor, skipping")
            continue

        log_id = create_sync_log(sb, store_id, sync_type)
        total_records = 0
        errors = []

        try:
            ipos_conn = get_ipos_connection(store)

            # Sync suppliers + link ke store_suppliers
            if sync_type in ("full", "products"):
                try:
                    total_records += sync_suppliers(ipos_conn, sb, store_id)
                except Exception as e:
                    log.error(f"Supplier sync failed: {e}")
                    errors.append(f"Supplier: {str(e)}")
                    ipos_conn.rollback()

            # Sync products
            if sync_type in ("full", "products"):
                try:
                    total_records += sync_products(ipos_conn, sb, store_id, kodekantor)
                except Exception as e:
                    log.error(f"Product sync failed: {e}")
                    errors.append(f"Products: {str(e)}")
                    ipos_conn.rollback()

            # Sync stock
            if sync_type in ("full", "stock"):
                try:
                    total_records += sync_stock(ipos_conn, sb, store_id, kodekantor)
                except Exception as e:
                    log.error(f"Stock sync failed: {e}")
                    errors.append(f"Stock: {str(e)}")
                    ipos_conn.rollback()

            # Sync sales
            if sync_type in ("full", "sales"):
                try:
                    total_records += sync_sales(
                        ipos_conn, sb, store_id, kodekantor, config.SALES_DAYS_BACK)
                except Exception as e:
                    log.error(f"Sales sync failed: {e}")
                    errors.append(f"Sales: {str(e)}")
                    ipos_conn.rollback()

            # Sync purchases (tbl_imhd + tbl_imdt)
            if sync_type in ("full", "purchases"):
                try:
                    total_records += sync_purchases(ipos_conn, sb, store_id, kodekantor)
                except Exception as e:
                    log.error(f"Purchase sync failed: {e}")
                    errors.append(f"Purchases: {str(e)}")
                    ipos_conn.rollback()

            # Sync sales transactions (per-transaksi, untuk Rekap Kasir)
            if sync_type in ("full", "sales"):
                try:
                    total_records += sync_sales_transactions(
                        ipos_conn, sb, kodekantor, store_id, config.SALES_DAYS_BACK)
                except Exception as e:
                    log.error(f"Sales transactions sync failed: {e}")
                    errors.append(f"SalesTransactions: {str(e)}")
                    ipos_conn.rollback()

            ipos_conn.close()

            complete_sync_log(sb, log_id, total_records, errors if errors else None)
            audit(sb, store_id, "sync_completed", "sync", {
                "type": sync_type,
                "records": total_records,
                "errors": len(errors),
            })

            log.info(f"✓ Store {store['code']}: synced {total_records} records"
                     + (f" ({len(errors)} errors)" if errors else ""))

        except Exception as e:
            log.error(f"Sync failed for store {store['code']}: {e}")
            fail_sync_log(sb, log_id, str(e))
            audit(sb, store_id, "sync_failed", "sync", {"error": str(e)})


# ---------------------------------------------------------------------------
# Heartbeat
# ---------------------------------------------------------------------------
def send_heartbeat():
    """Send heartbeat to Supabase (insert sync_log with type 'heartbeat')."""
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        return
    try:
        sb = SupabaseClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
        sb.insert("sync_log", [{
            "sync_type": "heartbeat",
            "status": "success",
            "records_synced": 0,
            "completed_at": datetime.utcnow().isoformat(),
        }])
    except Exception as e:
        log.warning(f"Heartbeat failed: {e}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="iPOS → Supabase Sync Agent")
    parser.add_argument("--daemon", action="store_true", help="Run as daemon with scheduled sync")
    parser.add_argument("--type", choices=["full", "products", "stock", "sales", "purchases"],
                        default="full", help="Type of sync to run")
    parser.add_argument("--days", type=int, default=7, help="Days of sales to sync (default: 7)")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("iPOS Sync Agent started")
    log.info(f"Supabase: {config.SUPABASE_URL}")
    log.info(f"iPOS: {config.IPOS_DB_HOST}:{config.IPOS_DB_PORT}/{config.IPOS_DB_NAME}")
    log.info("=" * 60)

    if args.daemon:
        log.info(f"Daemon mode: syncing every {config.SYNC_INTERVAL} minutes")
        # Run once immediately
        run_sync(args.type)

        # Schedule periodic sync
        schedule.every(config.SYNC_INTERVAL).minutes.do(run_sync, args.type)
        # Heartbeat every 5 minutes
        schedule.every(5).minutes.do(send_heartbeat)

        while True:
            schedule.run_pending()
            time.sleep(30)
    else:
        run_sync(args.type)
        log.info("Sync completed")


if __name__ == "__main__":
    main()
