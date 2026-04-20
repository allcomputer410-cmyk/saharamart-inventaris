@echo off
title Build SyncAgent.exe - SAHARAMART
color 0A
cd /d "%~dp0"

echo.
echo  ============================================================
echo    BUILD SYNC AGENT - SAHARAMART (SM01)
echo    Kemas semua file menjadi 1 file SyncAgent.exe
echo    Estimasi waktu: 3-5 menit
echo  ============================================================
echo.
echo  Setelah selesai, cukup double-click SyncAgent.exe
echo  (tidak butuh Python terinstall di PC tujuan)
echo.
echo  Tekan sembarang tombol untuk mulai build...
pause >nul

echo.
echo  [1/3] Install PyInstaller...
pip install pyinstaller >nul
echo  OK

echo.
echo  [2/3] Bersihkan build lama...
if exist build  rmdir /s /q build
if exist dist   rmdir /s /q dist
echo  OK

echo.
echo  [3/3] Build SyncAgent.exe (mohon tunggu)...
echo.

pyinstaller ^
  --onefile ^
  --windowed ^
  --name SyncAgent ^
  --hidden-import pystray._win32 ^
  --hidden-import psycopg2 ^
  --hidden-import schedule ^
  sync_tray.py

if %errorlevel% neq 0 (
    echo.
    echo  ============================================================
    echo   BUILD GAGAL. Lihat pesan error di atas.
    echo  ============================================================
    pause
    exit /b 1
)

:: Siapkan folder distribusi
if not exist "dist\SyncAgent-SAHARAMART" mkdir "dist\SyncAgent-SAHARAMART"
copy "dist\SyncAgent.exe" "dist\SyncAgent-SAHARAMART\SyncAgent.exe" >nul
copy ".env"               "dist\SyncAgent-SAHARAMART\.env"           >nul

(
echo  Cara pakai:
echo  1. Pastikan file .env ada di folder yang sama
echo  2. Double-click SyncAgent.exe
echo  3. Icon muncul di pojok kanan bawah Windows
echo  4. Klik kanan icon untuk menu
) > "dist\SyncAgent-SAHARAMART\CARA PAKAI.txt"

echo.
echo  ============================================================
echo   BUILD BERHASIL!
echo.
echo   Hasil ada di: dist\SyncAgent-SAHARAMART\
echo     - SyncAgent.exe   ^<-- aplikasi utama
echo     - .env            ^<-- konfigurasi
echo     - CARA PAKAI.txt
echo.
echo   Folder tersebut terbuka otomatis sekarang.
echo  ============================================================
echo.

explorer "dist\SyncAgent-SAHARAMART"
pause
