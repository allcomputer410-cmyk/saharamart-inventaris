"""
sync_tray.py
============
Sync Agent iPOS — Aplikasi System Tray

Cara pakai:
  Double-click JALANKAN_TRAY.bat
  Atau setelah build: double-click SyncAgent.exe

Fitur:
  - Icon di system tray (pojok kanan bawah Windows)
  - HIJAU  = sync berjalan normal
  - MERAH  = error / koneksi terputus
  - KUNING = sedang sync / starting
  - Notifikasi Windows saat koneksi terputus atau error
  - Klik kanan icon untuk menu:
      Sync Sekarang | Lihat Status | Buka Log | Keluar
  - Auto-restart jika sync crash
"""

import os
import sys
import time
import threading
import subprocess
import logging
from datetime import datetime
from pathlib import Path


# ── Deteksi BASE_DIR (benar untuk .py maupun .exe PyInstaller) ──
def get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        # Mode .exe PyInstaller — folder tempat .exe berada
        return Path(sys.executable).parent
    return Path(__file__).parent


BASE_DIR = get_base_dir()
LOG_FILE = BASE_DIR / "sync_agent.log"
ENV_FILE = BASE_DIR / ".env"

# Set CWD ke BASE_DIR agar dotenv + FileHandler menemukan file yang benar
os.chdir(str(BASE_DIR))

# Patch stdout/stderr jika None (mode windowed/exe)
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")


# ── Cek library ──────────────────────────────────────────────────
def _missing_lib_error(libs: str):
    msg = (
        f"Library belum terinstall: {libs}\n\n"
        "Jalankan dulu:\n"
        f"pip install {libs}"
    )
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, "Sync Agent — Error", 0x10)
    except Exception:
        print(msg)
    sys.exit(1)


try:
    import pystray
    from PIL import Image, ImageDraw
except ImportError:
    _missing_lib_error("pystray Pillow")


# ── Load .env SEBELUM import config/sync_agent ──────────────────
try:
    from dotenv import load_dotenv
    load_dotenv(ENV_FILE)
except ImportError:
    _missing_lib_error("python-dotenv")


# ── Single-instance protection via Windows Mutex ────────────────
# Pakai named mutex — lebih reliable dari lock file atau tasklist check.
# Bisa jalan 2 store berbeda sekaligus (SM01 & ARM01) di PC yang sama.
import ctypes as _ctypes
_STORE_CODE_ENV = os.getenv("STORE_CODE", "DEFAULT")
_MUTEX_NAME     = f"Global\\iPOS_SyncAgent_{_STORE_CODE_ENV}"
_mutex_handle   = _ctypes.windll.kernel32.CreateMutexW(None, True, _MUTEX_NAME)
if _ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
    try:
        _ctypes.windll.user32.MessageBoxW(
            0,
            f"Sync Agent ({_STORE_CODE_ENV}) sudah berjalan!\n"
            "Lihat icon di system tray (pojok kanan bawah layar).",
            "Sync Agent — Sudah Aktif",
            0x40,  # MB_ICONINFORMATION
        )
    except Exception:
        pass
    sys.exit(0)


# ── Import modul sync ────────────────────────────────────────────
try:
    sys.path.insert(0, str(BASE_DIR))
    import config
    from sync_agent import run_sync
except ImportError as e:
    _missing_lib_error(f"sync_agent/config — {e}")

# STORE_CODE filter — dibaca dari .env, dikirim ke setiap run_sync call
# Ini yang memastikan tray hanya sync toko sendiri, bukan semua toko
_STORE_CODE = os.getenv("STORE_CODE") or None


# ═══════════════════════════════════════════════════════════════
# STATUS GLOBAL
# ═══════════════════════════════════════════════════════════════

class AppStatus:
    def __init__(self):
        self.running       = False
        self.stopped       = False
        self.last_sync     = None   # datetime
        self.sync_count    = 0
        self.error         = None   # str | None
        self._lock         = threading.Lock()

    def ok(self):
        with self._lock:
            self.running    = True
            self.error      = None
            self.last_sync  = datetime.now()
            self.sync_count += 1

    def fail(self, msg: str):
        with self._lock:
            self.error = str(msg)[:120]

    def tooltip(self) -> str:
        lines = ["Sync Agent iPOS"]
        lines.append("Status : " + ("Berjalan" if self.running and not self.error else
                                     "Error"   if self.error else "Berhenti"))
        if self.last_sync:
            lines.append(f"Sync : {self.last_sync.strftime('%d/%m %H:%M')} ({self.sync_count}x)")
        if self.error:
            lines.append(f"Err : {self.error[:40]}")
        result = "\n".join(lines)
        # Windows tray tooltip maksimal 128 karakter
        return result[:127]


STATUS = AppStatus()


# ═══════════════════════════════════════════════════════════════
# ICON
# ═══════════════════════════════════════════════════════════════

def _make_icon(color: str, size: int = 64) -> Image.Image:
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([5, 5, size - 5, size - 5], fill=(0, 0, 0, 60))   # shadow
    draw.ellipse([3, 3, size - 7, size - 7], fill=color)
    return img


ICON_GREEN  = _make_icon("#22c55e")   # OK
ICON_RED    = _make_icon("#ef4444")   # Error
ICON_YELLOW = _make_icon("#f59e0b")   # Syncing / Starting


# ═══════════════════════════════════════════════════════════════
# NOTIFIKASI WINDOWS
# ═══════════════════════════════════════════════════════════════

def notify(title: str, message: str, is_error: bool = False):
    """Tampilkan balloon notification via PowerShell (tanpa library tambahan)."""
    icon_type = "Error" if is_error else "Info"
    t = title.replace('"', "'")
    m = message.replace('"', "'").replace("\n", " | ")
    script = (
        "Add-Type -AssemblyName System.Windows.Forms;"
        "$n = New-Object System.Windows.Forms.NotifyIcon;"
        "$n.Icon = [System.Drawing.SystemIcons]::Application;"
        "$n.Visible = $true;"
        f'$n.ShowBalloonTip(7000, "{t}", "{m}", '
        f"[System.Windows.Forms.ToolTipIcon]::{icon_type});"
        "Start-Sleep -Seconds 8;"
        "$n.Dispose();"
    )
    try:
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-NonInteractive", "-Command", script],
            creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        logging.warning(f"Notifikasi gagal: {e}")


# ═══════════════════════════════════════════════════════════════
# SYNC DAEMON
# ═══════════════════════════════════════════════════════════════

def _do_sync(sync_type: str = "full"):
    """Jalankan satu siklus sync (blocking)."""
    if STATUS.stopped:
        return
    logging.info(f"[TRAY] Mulai sync ({sync_type}) store={_STORE_CODE or 'ALL'}...")
    try:
        run_sync(sync_type, store_code=_STORE_CODE)
        STATUS.ok()
        logging.info("[TRAY] Sync selesai.")
    except Exception as e:
        STATUS.fail(str(e))
        logging.error(f"[TRAY] Sync gagal: {e}")


def _daemon_loop():
    """Loop utama: sync setiap SYNC_INTERVAL menit."""
    interval_sec = getattr(config, "SYNC_INTERVAL", 15) * 60
    logging.info(f"[TRAY] Daemon aktif — interval {interval_sec // 60} menit")

    # Sync pertama langsung setelah start
    _do_sync("full")

    elapsed = 0
    while not STATUS.stopped:
        time.sleep(5)
        elapsed += 5
        if elapsed >= interval_sec and not STATUS.stopped:
            elapsed = 0
            _do_sync("full")

    logging.info("[TRAY] Daemon berhenti.")


def start_daemon():
    STATUS.running = True
    t = threading.Thread(target=_daemon_loop, daemon=True)
    t.start()


# ═══════════════════════════════════════════════════════════════
# MONITOR — Update icon & kirim notif berdasarkan log
# ═══════════════════════════════════════════════════════════════

def _monitor_loop(icon: pystray.Icon):
    """Pantau log file, update icon, kirim notif saat error."""
    last_pos            = 0
    last_error_notif    = 0.0
    prev_was_error      = False

    while not STATUS.stopped:
        time.sleep(8)

        # Update icon & tooltip
        if STATUS.error:
            icon.icon  = ICON_RED
            prev_was_error = True
        elif STATUS.running and prev_was_error:
            icon.icon  = ICON_GREEN
            prev_was_error = False
        icon.title = STATUS.tooltip()

        # Scan baris baru di log
        if not LOG_FILE.exists():
            continue
        try:
            with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
                f.seek(last_pos)
                new_lines = f.readlines()
                last_pos  = f.tell()
        except Exception:
            continue

        for line in new_lines:
            low = line.lower().strip()
            if not low:
                continue

            # ── Sync berhasil ──────────────────────────────────
            if ("synced" in low and "records" in low) or "sync completed" in low:
                STATUS.ok()
                icon.icon  = ICON_GREEN
                icon.title = STATUS.tooltip()
                prev_was_error = False

            # ── Error / koneksi terputus ───────────────────────
            elif "[error]" in low or "sync failed" in low or \
                 "could not connect" in low or "connection refused" in low or \
                 "operationalerror" in low:

                STATUS.fail(line.strip()[-80:])
                icon.icon  = ICON_RED
                icon.title = STATUS.tooltip()

                # Notif max 1x per 5 menit
                now = time.time()
                if now - last_error_notif > 300:
                    last_error_notif = now
                    notify(
                        "Sync Agent — Koneksi Terputus!",
                        "Gagal sync ke Supabase atau iPOS tidak merespons.\n"
                        "Klik kanan icon → Buka Log untuk detail.",
                        is_error=True,
                    )


# ═══════════════════════════════════════════════════════════════
# MENU ACTIONS
# ═══════════════════════════════════════════════════════════════

def _action_sync_now(icon: pystray.Icon, item):
    """Sync manual sekarang."""
    icon.icon  = ICON_YELLOW
    icon.title = "Sync Agent\nSedang sync manual..."
    notify("Sync Agent", "Sync manual dimulai...")

    def do():
        _do_sync("full")
        if STATUS.error:
            icon.icon = ICON_RED
            notify("Sync Agent — Gagal", "Sync manual gagal. Klik kanan → Buka Log.", is_error=True)
        else:
            icon.icon = ICON_GREEN
            notify("Sync Agent", f"Sync manual selesai! ({datetime.now().strftime('%H:%M:%S')})")
        icon.title = STATUS.tooltip()

    threading.Thread(target=do, daemon=True).start()


def _action_status(icon: pystray.Icon, item):
    """Tampilkan status via notifikasi."""
    state = "Berjalan normal" if STATUS.running and not STATUS.error \
            else ("Error" if STATUS.error else "Berhenti")
    last  = STATUS.last_sync.strftime("%d/%m %H:%M:%S") if STATUS.last_sync else "Belum ada"
    msg   = f"Status: {state}\nSync terakhir: {last}\nTotal sync: {STATUS.sync_count}x"
    if STATUS.error:
        msg += f"\nError: {STATUS.error[:70]}"
    notify("Sync Agent — Status", msg, is_error=bool(STATUS.error))


def _action_open_log(icon: pystray.Icon, item):
    """Buka sync_agent.log di Notepad."""
    try:
        subprocess.Popen(
            ["notepad", str(LOG_FILE)],
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except Exception:
        pass


def _action_quit(icon: pystray.Icon, item):
    """Hentikan sync dan keluar."""
    STATUS.stopped = True
    notify("Sync Agent", "Sync agent dihentikan.")
    time.sleep(1)
    icon.stop()


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    # Setup logging (gabung dengan sync_agent.py handler)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(str(LOG_FILE), encoding="utf-8"),
        ],
    )

    # Cek .env
    if not ENV_FILE.exists():
        notify(
            "Sync Agent — Konfigurasi Hilang",
            "File .env tidak ditemukan! Jalankan 1_INSTALL.bat dulu.",
            is_error=True,
        )
        sys.exit(1)

    # Buat tray icon
    icon = pystray.Icon(
        name="ipos_sync_saharamart",
        icon=ICON_YELLOW,
        title="Sync Agent iPOS\nMemulai...",
        menu=pystray.Menu(
            pystray.MenuItem("✦ Sync Sekarang",  _action_sync_now),
            pystray.MenuItem("● Lihat Status",   _action_status),
            pystray.MenuItem("≡ Buka Log",        _action_open_log),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("✕ Keluar",          _action_quit),
        ),
    )

    # Mulai daemon sync
    start_daemon()

    # Mulai monitor di background
    threading.Thread(target=_monitor_loop, args=(icon,), daemon=True).start()

    # Notifikasi startup
    notify(
        "Sync Agent iPOS — Aktif",
        "Sync berjalan di background setiap 15 menit.\n"
        "Icon di pojok kanan bawah Windows (system tray).",
    )

    # Jalankan tray icon (blocking — program berjalan selama ini aktif)
    icon.run()


if __name__ == "__main__":
    main()
