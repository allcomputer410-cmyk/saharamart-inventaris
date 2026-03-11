# Catatan Rebuild SyncAgent.exe

## Kapan Perlu Rebuild?

Rebuild `.exe` diperlukan setiap kali ada perubahan pada:
- `sync-agent/sync_agent.py`
- `sync-agent/config.py`
- Dependency baru ditambahkan ke `requirements.txt`

## Cara Rebuild

### Prasyarat
- Python 3.8+ sudah terinstall
- PyInstaller sudah terinstall: `pip install pyinstaller`
- Semua dependency terinstall: `pip install -r requirements.txt`

### Perintah Rebuild

```bash
cd sync-agent
pyinstaller --onefile --name SyncAgent --distpath dist/SyncAgent-SAHARAMART sync_agent.py
```

### Output

File hasil build: `sync-agent/dist/SyncAgent-SAHARAMART/SyncAgent.exe`

### Deploy ke PC Kasir

1. Copy `SyncAgent.exe` ke folder di PC kasir (misal: `C:\SyncAgent\`)
2. Copy `config.py` ke folder yang sama (atau sesuaikan path di exe)
3. Jalankan: double-click `SyncAgent.exe` atau via scheduled task Windows

## Catatan

- Agent Claude Code TIDAK BISA rebuild .exe secara langsung karena butuh PyInstaller di environment Python lokal
- Rebuild harus dilakukan di PC dengan Python + PyInstaller terinstall
- Setelah rebuild, test dulu dengan `SyncAgent.exe --type products` sebelum deploy ke kasir
