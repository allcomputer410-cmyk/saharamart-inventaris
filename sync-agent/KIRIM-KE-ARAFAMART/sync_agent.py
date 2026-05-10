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

import os
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
# Logging — force UTF-8 pada stdout Windows (cegah charmap error nama produk)
# ---------------------------------------------------------------------------
import io as _io

def _fix_stdout_utf8():
    """Paksa stdout/stderr Windows ke UTF-8 agar nama produk special chars aman."""
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        elif hasattr(sys.stdout, 'buffer'):
            sys.stdout = _io.TextIOWrapper(
                sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True
            )
    except Exception:
        pass
    try:
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        elif hasattr(sys.stderr, 'buffer'):
            sys.stderr = _io.TextIOWrapper(
                sys.stderr.buffer, encoding='utf-8', errors='replace', line_buffering=True
            )
    except Exception:
        pass

_fix_stdout_utf8()

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("sync_agent.log", encoding="utf-8", errors="replace"),
    ],
)
log = logging.getLogger("sync_agent")


# ---------------------------------------------------------------------------
# Helper: Supabase REST API
# ---------------------------------------------------------------------------
class SupabaseClient:
    """Lightweight Supabase REST client using service_role key."""

    REQUEST_TIMEOUT = 30  # detik per request
    MAX_RETRIES = 3
    RETRY_DELAYS = [5, 10, 20]  # detik antar retry (exponential backoff)

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

    def _do_request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Execute HTTP request dengan retry + exponential backoff untuk 5xx/502."""
        last_err = None
        for attempt in range(self.MAX_RETRIES):
            try:
                kwargs.setdefault("timeout", self.REQUEST_TIMEOUT)
                r = requests.request(method, url, **kwargs)
                # Retry pada 5xx server errors (502, 503, 504, dll)
                if r.status_code >= 500:
                    if attempt < self.MAX_RETRIES - 1:
                        delay = self.RETRY_DELAYS[attempt]
                        log.warning(
                            f"Supabase {r.status_code} pada {url.split('/')[-1]} "
                            f"(attempt {attempt+1}/{self.MAX_RETRIES}) — retry dalam {delay}s"
                        )
                        time.sleep(delay)
                        continue
                return r
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
                last_err = e
                if attempt < self.MAX_RETRIES - 1:
                    delay = self.RETRY_DELAYS[attempt]
                    log.warning(
                        f"Request error: {e} — retry {attempt+1}/{self.MAX_RETRIES} dalam {delay}s"
                    )
                    time.sleep(delay)
        if last_err:
            raise last_err
        return r  # type: ignore

    def select(self, table: str, params: Optional[dict] = None) -> list:
        r = self._do_request("GET", self._url(table), headers=self.headers, params=params or {})
        r.raise_for_status()
        return r.json()

    def select_all(self, table: str, params: Optional[dict] = None) -> list:
        """Fetch ALL rows dengan auto-pagination (bypass PostgREST 1000-row limit)."""
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
        r = self._do_request("POST", self._url(table), headers=headers, json=rows, params=params)
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
        r = self._do_request("POST", self._url(table), headers=self.headers, json=rows)
        r.raise_for_status()
        return r.json()

    def update(self, table: str, data: dict, eq_filters: dict) -> list:
        params = {f"{k}": f"eq.{v}" for k, v in eq_filters.items()}
        r = self._do_request("PATCH", self._url(table), headers=self.headers, json=data, params=params)
        r.raise_for_status()
        return r.json()

    def delete(self, table: str, params: dict) -> requests.Response:
        r = self._do_request("DELETE", self._url(table), headers=self.headers, params=params)
        return r

    def rpc(self, fn_name: str, params: Optional[dict] = None) -> dict:
        r = self._do_request(
            "POST",
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


def safe_str(val, fallback: str = "") -> str:
    """Konversi nilai dari psycopg2 ke str dengan aman.
    Menghindari charmap/UnicodeDecodeError pada nama produk dengan karakter khusus.
    """
    if val is None:
        return fallback
    if isinstance(val, bytes):
        return val.decode("utf-8", errors="replace")
    try:
        return str(val)
    except Exception:
        return fallback


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
            "name": safe_str(item.get("namaitem"), kode).strip(),
            "unit": safe_str(item.get("satuan"), "PCS").strip(),
            "hpp": dec(item.get("hargapokok")),
            "sell_price": dec(item.get("hargajual1")),
            "shelf_location": safe_str(item.get("rak")).strip() or None,
            "is_active": safe_str(item.get("statusjual")) != "1",
            "is_deleted": safe_str(item.get("statushapus")) not in ("", "N", None, "None"),
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
    # tipe = 'KSR' → hanya transaksi kasir normal, exclude IK/RETUR/TRANSFER
    cur.execute("""
        SELECT DATE(tanggal) as sale_date,
               COUNT(*) as total_transactions,
               COALESCE(SUM(totalakhir), 0) as total_revenue
        FROM tbl_ikhd
        WHERE DATE(tanggal) >= %s
          AND kodekantor = %s
          AND tipe = 'KSR'
        GROUP BY DATE(tanggal)
        ORDER BY sale_date
    """, (since_date, kodekantor))
    daily_totals = cur.fetchall()

    if not daily_totals:
        log.info("No sales data found in iPOS")
        cur.close()
        return 0

    # Get product mapping — daftarkan SEMUA varian key agar lookup lebih robust
    products = sb.select_all("store_products", {
        "store_id": f"eq.{store_id}",
        "select": "id,ipos_kodeitem,barcode,hpp",
        "order": "id",
    })
    prod_map: dict = {}
    prod_map_upper: dict = {}

    def _register(key: str, p: dict):
        """Daftarkan key dan semua variannya ke prod_map."""
        if not key:
            return
        prod_map[key] = p
        prod_map_upper[key.upper()] = p
        # Varian tanpa leading zero (misal: "089686598025" → "89686598025")
        stripped = key.lstrip('0')
        if stripped and stripped != key:
            prod_map[stripped] = p
            prod_map_upper[stripped.upper()] = p
        # Varian zero-padded ke 13 digit EAN (misal: "89686598025" → "089686598025")
        padded = key.zfill(13)
        if padded != key:
            prod_map[padded] = p
            prod_map_upper[padded.upper()] = p

    for p in products:
        # Daftarkan ipos_kodeitem DAN barcode sebagai key (keduanya, bukan salah satu)
        _register(str(p.get("ipos_kodeitem") or "").strip(), p)
        _register(str(p.get("barcode") or "").strip(), p)

    log.info(f"Product map: {len(prod_map)} keys (dari {len(products)} produk di store_products)")

    now = datetime.utcnow().isoformat()
    count = 0
    total_items_inserted = 0

    for daily in daily_totals:
        sale_date = str(daily["sale_date"])

        # Get item-level detail for this day (hanya KSR)
        cur.execute("""
            SELECT d.kodeitem,
                   SUM(d.jumlah) as qty_sold,
                   SUM(d.total) as revenue,
                   AVG(d.harga) as avg_price
            FROM tbl_ikdt d
            JOIN tbl_ikhd h ON h.notransaksi = d.notransaksi
            WHERE DATE(h.tanggal) = %s
              AND h.kodekantor = %s
              AND h.tipe = 'KSR'
            GROUP BY d.kodeitem
        """, (sale_date, kodekantor))
        items = cur.fetchall()

        total_items_sold = sum(dec(i.get("qty_sold")) for i in items)
        total_revenue = dec(daily.get("total_revenue"))

        # Calculate profit from item details
        total_hpp = 0.0
        sale_items = []
        skipped = 0
        skipped_kode_samples = []
        for item in items:
            kode = str(item["kodeitem"]).strip()
            # Semua varian sudah didaftarkan saat build map — cukup exact + uppercase
            prod = prod_map.get(kode) or prod_map_upper.get(kode.upper())
            if not prod:
                skipped += 1
                if len(skipped_kode_samples) < 5:
                    skipped_kode_samples.append(kode)
                continue
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
            sample_str = ", ".join(skipped_kode_samples)
            log.warning(
                f"{sale_date}: {skipped}/{len(items)} item dilewati "
                f"— kodeitem tidak ditemukan di store_products "
                f"(contoh: {sample_str})"
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
                del_resp = sb.delete(
                    "daily_sale_items",
                    {"daily_sale_id": f"eq.{daily_sale_id}"},
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
            "name": safe_str(sup.get("nama"), kode).strip(),
            "type": "S",
            "address": safe_str(sup.get("alamat")).strip() or None,
            "city": safe_str(sup.get("kota")).strip() or None,
            "phone": safe_str(sup.get("telepon") or sup.get("hp")).strip() or None,
            "email": safe_str(sup.get("email")).strip() or None,
            "contact_person": safe_str(sup.get("kontak")).strip() or None,
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
        kodesupel = safe_str(h.get("kodesupel")).strip()

        purchase_data = {
            "store_id":         store_id,
            "ipos_notransaksi": notrans,
            "faktur_no":        notrans,
            "tanggal":          h["tanggal"].isoformat() if h.get("tanggal") else None,
            "tipe":             safe_str(h.get("tipe"), "BL").strip(),
            "ipos_kodesupel":   kodesupel or None,
            "supplier_id":      supplier_map.get(kodesupel) if kodesupel else None,
            "total_item":       dec(h.get("totalitem")),
            "subtotal":         dec(h.get("subtotal")),
            "potongan":         dec(h.get("potfaktur")),
            "pajak":            dec(h.get("pajak")),
            "total_akhir":      dec(h.get("totalakhir")),
            "cara_bayar":       safe_str(h.get("carabayar")).strip() or None,
            "keterangan":       safe_str(h.get("keterangan")).strip() or None,
            "synced_at":        now,
            "updated_at":       now,
        }

        # --- Upsert purchase header (robust: tidak bergantung pada satu constraint) ---
        result = None
        if notrans in existing_map:
            # Record sudah ada → update langsung by primary key (selalu aman)
            purchase_data["id"] = existing_map[notrans]
            result = sb.upsert("purchases", [purchase_data], on_conflict="id")
        else:
            # Record baru → coba composite constraint (post-migration),
            # fallback ke constraint lama jika migration belum dijalankan
            try:
                result = sb.upsert(
                    "purchases", [purchase_data],
                    on_conflict="store_id,ipos_notransaksi"
                )
            except Exception as e:
                log.warning(
                    f"Purchases upsert store_id+ipos_notransaksi gagal ({e}), "
                    f"coba fallback constraint ipos_notransaksi..."
                )
                try:
                    result = sb.upsert(
                        "purchases", [purchase_data],
                        on_conflict="ipos_notransaksi"
                    )
                except Exception as e2:
                    log.error(f"Purchase {notrans} gagal diupsert: {e2}")
                    continue

        if not result:
            continue
        purchase_id = result[0]["id"]

        # Upsert purchase items
        items = details_map.get(notrans, [])
        item_rows = []
        for d in items:
            kode = safe_str(d.get("kodeitem")).strip()
            iddetail = safe_str(d.get("iddetail")).strip()
            if not iddetail:
                continue
            item_rows.append({
                "purchase_id":      purchase_id,
                "store_product_id": prod_map.get(kode),
                "ipos_kodeitem":    kode,
                "ipos_iddetail":    iddetail,
                "jumlah":           dec(d.get("jumlah")),
                "satuan":           safe_str(d.get("satuan")).strip() or None,
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
# SYNC: Discounts (tbl_itemdisp → store_item_discounts)
# ---------------------------------------------------------------------------
def sync_discounts(ipos_conn, sb: SupabaseClient, store_id: str, kodekantor: str) -> int:
    """Sync discount data from iPOS tbl_itemdisp + tbl_itemdispdt to store_item_discounts.

    Struktur iPOS:
    - tbl_itemdisp  : header diskon (periode, hari, prioritas, status)
    - tbl_itemdispdt: detail per-item (kodeitem, diskon1..4, disknom1..4)
    JOIN keduanya untuk mendapatkan data lengkap per produk.
    """
    today = datetime.utcnow().date()

    # Bersihkan state koneksi iPOS sebelum mulai
    try:
        ipos_conn.rollback()
    except Exception:
        pass

    # ── Ambil data: JOIN tbl_itemdisp + tbl_itemdispdt ───────────────────────
    try:
        cur = ipos_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                h.iddiskon,
                h.jenis,
                h.merek,
                h.tgldari,
                h.tglsampai,
                h.jamdari,
                h.jamsampai,
                h.stsact,
                h.tipeper,
                h.prioritas,
                h.w1, h.w2, h.w3, h.w4, h.w5, h.w6, h.w7,
                d.kodeitem,
                COALESCE(d.diskon1,  0) AS diskon1,
                COALESCE(d.diskon2,  0) AS diskon2,
                COALESCE(d.diskon3,  0) AS diskon3,
                COALESCE(d.diskon4,  0) AS diskon4,
                COALESCE(d.disknom1, 0) AS disknom1,
                COALESCE(d.disknom2, 0) AS disknom2,
                COALESCE(d.disknom3, 0) AS disknom3,
                COALESCE(d.disknom4, 0) AS disknom4
            FROM tbl_itemdisp h
            LEFT JOIN tbl_itemdispdt d ON d.iddiskon = h.iddiskon
            ORDER BY h.tgldari DESC
        """)
        rows = cur.fetchall()
        cur.close()
    except Exception as e:
        log.error(f"Gagal baca tbl_itemdisp/tbl_itemdispdt: {e}")
        try:
            ipos_conn.rollback()
        except Exception:
            pass
        return 0

    if not rows:
        log.info("Tidak ada data diskon di tbl_itemdisp")
        return 0

    log.info(f"tbl_itemdisp+dt raw rows: {len(rows)}")

    # ── Build product map: ipos_kodeitem → store_product_id ─────────────────
    sp_list = sb.select_all("store_products", {
        "store_id": f"eq.{store_id}",
        "select": "id,ipos_kodeitem",
    })
    kode_to_spid = {r["ipos_kodeitem"]: r["id"] for r in sp_list if r.get("ipos_kodeitem")}

    upsert_rows = []
    for r in rows:
        iddiskon   = safe_str(r.get("iddiskon"))
        kodeitem   = safe_str(r.get("kodeitem"))
        tgl_dari   = r.get("tgldari")
        tgl_sampai = r.get("tglsampai")

        if not iddiskon:
            continue

        # is_active dari stsact header, fallback cek tanggal
        stsact = r.get("stsact")
        if stsact is not None:
            is_active = bool(stsact)
        else:
            is_active = False
            if tgl_dari and tgl_sampai:
                d_dari   = tgl_dari.date()   if hasattr(tgl_dari,   "date") else tgl_dari
                d_sampai = tgl_sampai.date() if hasattr(tgl_sampai, "date") else tgl_sampai
                is_active = d_dari <= today <= d_sampai
            elif tgl_dari:
                d_dari = tgl_dari.date() if hasattr(tgl_dari, "date") else tgl_dari
                is_active = d_dari <= today

        hari_berlaku = {f"w{i}": bool(r.get(f"w{i}")) for i in range(1, 8)}

        upsert_rows.append({
            "store_id":         store_id,
            "store_product_id": kode_to_spid.get(kodeitem) if kodeitem else None,
            "ipos_kodeitem":    kodeitem or None,
            "ipos_iddiskon":    iddiskon,
            "jenis":            safe_str(r.get("jenis") or r.get("tipeper")),
            "merek":            safe_str(r.get("merek")),
            "tgl_dari":         tgl_dari.isoformat()   if tgl_dari   and hasattr(tgl_dari,   "isoformat") else None,
            "tgl_sampai":       tgl_sampai.isoformat() if tgl_sampai and hasattr(tgl_sampai, "isoformat") else None,
            "jam_dari":         str(r.get("jamdari"))   if r.get("jamdari")   else None,
            "jam_sampai":       str(r.get("jamsampai")) if r.get("jamsampai") else None,
            "diskon1":  float(r.get("diskon1")  or 0),
            "diskon2":  float(r.get("diskon2")  or 0),
            "diskon3":  float(r.get("diskon3")  or 0),
            "diskon4":  float(r.get("diskon4")  or 0),
            "disknom1": float(r.get("disknom1") or 0),
            "disknom2": float(r.get("disknom2") or 0),
            "disknom3": float(r.get("disknom3") or 0),
            "disknom4": float(r.get("disknom4") or 0),
            "hari_berlaku": hari_berlaku,
            "is_active":    is_active,
            "prioritas":    int(r.get("prioritas") or 0),
            "synced_at":    datetime.utcnow().isoformat(),
        })

    if not upsert_rows:
        return 0

    BATCH = 200
    for i in range(0, len(upsert_rows), BATCH):
        sb.upsert(
            "store_item_discounts", upsert_rows[i:i+BATCH],
            on_conflict="store_id,ipos_iddiskon,ipos_kodeitem"
        )

    log.info(f"Synced {len(upsert_rows)} discount records")
    return len(upsert_rows)


# ---------------------------------------------------------------------------
# SYNC: Sales Transactions (tbl_ikhd → sales_transactions)
# ---------------------------------------------------------------------------
def sync_sales_transactions(ipos_conn, sb: SupabaseClient, kodekantor: str,
                             store_id: str, days_back: int = 30) -> int:
    """Sync per-transaction data from iPOS tbl_ikhd to sales_transactions."""
    log.info(f"Syncing sales transactions for store {kodekantor} (last {days_back} days)...")

    # Rollback untuk bersihkan state koneksi dari fungsi sebelumnya yang mungkin aborted
    try:
        ipos_conn.rollback()
    except Exception:
        pass

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
                  on_conflict="store_id,notransaksi")

    log.info(f"Synced {len(to_upsert)} sales transactions")
    return len(to_upsert)


# ---------------------------------------------------------------------------
# Main sync orchestration
# ---------------------------------------------------------------------------
LOCK_FILE = "sync.lock"


def run_sync(sync_type: str = "full", store_code: str = None):
    """Run sync for all active stores (or one specific store if store_code given)."""
    # File lock — cegah double sync jika proses sebelumnya masih berjalan
    if os.path.exists(LOCK_FILE):
        stale = False
        try:
            with open(LOCK_FILE) as lf:
                pid = int(lf.read().strip())
            # Cek apakah PID masih hidup
            try:
                os.kill(pid, 0)  # signal 0 = cek eksistensi saja
                # PID masih hidup, cek umur lock file
                lock_age = time.time() - os.path.getmtime(LOCK_FILE)
                if lock_age > 1800:  # 30 menit = stuck
                    log.warning(f"Lock file sudah {int(lock_age/60)} menit (PID {pid}), dianggap stuck — hapus lock.")
                    stale = True
                else:
                    log.warning(f"Sync sudah berjalan (PID {pid}, {int(lock_age/60)} menit), skip.")
                    return
            except (OSError, ProcessLookupError):
                # PID tidak ada = proses sudah mati tapi lock tidak terhapus
                log.warning(f"Stale lock file ditemukan (PID {pid} sudah tidak ada) — hapus lock.")
                stale = True
        except Exception:
            log.warning("Lock file tidak bisa dibaca — hapus lock.")
            stale = True

        if stale:
            try:
                os.remove(LOCK_FILE)
            except Exception:
                pass

    try:
        with open(LOCK_FILE, "w") as lf:
            lf.write(str(os.getpid()))
    except Exception as e:
        log.warning(f"Tidak bisa buat lock file: {e}")

    try:
        _run_sync_inner(sync_type, store_code=store_code)
    finally:
        try:
            if os.path.exists(LOCK_FILE):
                os.remove(LOCK_FILE)
        except Exception:
            pass


def _run_sync_inner(sync_type: str = "full", store_code: str = None):
    """Internal sync logic (dipanggil dari run_sync setelah lock)."""
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        log.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        return

    sb = SupabaseClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)

    # Get active stores with iPOS config
    store_params = {
        "is_active": "eq.true",
        "select": "id,code,name,ipos_kodekantor,ipos_db_host,ipos_db_port,ipos_db_name",
    }
    if store_code:
        store_params["code"] = f"eq.{store_code}"
    stores = sb.select("stores", store_params)

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

            # Sync discounts (tbl_itemdisp → store_item_discounts)
            if sync_type in ("full", "products"):
                try:
                    total_records += sync_discounts(ipos_conn, sb, store_id, kodekantor)
                except Exception as e:
                    log.error(f"Discounts sync failed: {e}")
                    errors.append(f"Discounts: {str(e)}")
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
    parser.add_argument("--store", default=None,
                        help="Filter sync ke satu toko saja berdasarkan code (contoh: ARM01, SM01)")
    args = parser.parse_args()

    # Override SALES_DAYS_BACK dari argumen --days
    if args.days != 7:
        config.SALES_DAYS_BACK = args.days

    # Tentukan filter toko: prioritas --store arg, fallback ke STORE_CODE di .env
    store_filter = args.store or config.STORE_CODE or None

    log.info("=" * 60)
    log.info("iPOS Sync Agent started")
    log.info(f"Supabase: {config.SUPABASE_URL}")
    log.info(f"iPOS: {config.IPOS_DB_HOST}:{config.IPOS_DB_PORT}/{config.IPOS_DB_NAME}")
    if store_filter:
        log.info(f"Filter toko: {store_filter} (hanya sync toko ini)")
    else:
        log.info("Filter toko: semua toko aktif")
    log.info("=" * 60)

    if args.daemon:
        log.info(f"Daemon mode: syncing every {config.SYNC_INTERVAL} minutes")
        # Run once immediately
        run_sync(args.type, store_code=store_filter)

        # Schedule periodic sync
        schedule.every(config.SYNC_INTERVAL).minutes.do(run_sync, args.type, store_code=store_filter)
        # Heartbeat every 5 minutes
        schedule.every(5).minutes.do(send_heartbeat)

        while True:
            schedule.run_pending()
            time.sleep(30)
    else:
        run_sync(args.type, store_code=store_filter)
        log.info("Sync completed")


if __name__ == "__main__":
    main()
