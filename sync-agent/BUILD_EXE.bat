@echo off
title Build SyncAgent.exe
color 0A
cd /d "%~dp0"

echo.
echo  ============================================================
echo    BUILD SYNC AGENT → SyncAgent.exe
echo    Proses ini mengemas semua file menjadi 1 file .exe
echo    Estimasi waktu: 2-5 menit
echo  ============================================================
echo.

:: Cek Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Python tidak ditemukan!
    pause
    exit /b 1
)

:: Install PyInstaller
echo  [1/4] Install PyInstaller...
pip install pyinstaller pystray Pillow >nul
if %errorlevel% neq 0 (
    echo  ERROR: Gagal install PyInstaller.
    pause
    exit /b 1
)
echo  OK

:: Bersihkan build lama
echo.
echo  [2/4] Bersihkan build lama...
if exist build   rmdir /s /q build
if exist dist    rmdir /s /q dist
if exist SyncAgent.spec del /q SyncAgent.spec
echo  OK

:: Build .exe
echo.
echo  [3/4] Build SyncAgent.exe (mohon tunggu)...
echo.

pyinstaller ^
  --onefile ^
  --windowed ^
  --name SyncAgent ^
  --add-data "sync_agent.py;." ^
  --add-data "config.py;." ^
  --hidden-import pystray._win32 ^
  --hidden-import PIL._tkinter_finder ^
  --hidden-import psycopg2 ^
  --hidden-import schedule ^
  sync_tray.py

if %errorlevel% neq 0 (
    echo.
    echo  ============================================================
    echo   BUILD GAGAL! Lihat pesan error di atas.
    echo  ============================================================
    echo.
    pause
    exit /b 1
)

:: Siapkan folder distribusi
echo.
echo  [4/4] Siapkan folder distribusi...

if not exist "dist\SyncAgent-App" mkdir "dist\SyncAgent-App"

:: Copy .exe hasil build
copy "dist\SyncAgent.exe" "dist\SyncAgent-App\SyncAgent.exe" >nul

:: Copy .env (konfigurasi)
copy ".env" "dist\SyncAgent-App\.env" >nul 2>&1
if %errorlevel% neq 0 (
    copy ".env.example" "dist\SyncAgent-App\.env" >nul 2>&1
)

:: Buat catatan di folder distribusi
(
echo File .env wajib ada di folder yang sama dengan SyncAgent.exe
echo.
echo Yang perlu ada dalam 1 folder:
echo   SyncAgent.exe    ^<-- aplikasi utama
echo   .env             ^<-- konfigurasi ^(sudah terisi^)
echo.
echo Cara pakai:
echo   Double-click SyncAgent.exe
echo   Icon akan muncul di system tray ^(pojok kanan bawah^)
echo   Klik kanan icon untuk menu
) > "dist\SyncAgent-App\CARA PAKAI.txt"

echo.
echo  ============================================================
echo   BUILD BERHASIL!
echo.
echo   File aplikasi ada di:
echo   %~dp0dist\SyncAgent-App\
echo.
echo   Isi folder:
echo     SyncAgent.exe    ^<-- double-click untuk jalankan
echo     .env             ^<-- konfigurasi ^(jangan dihapus^)
echo     CARA PAKAI.txt
echo.
echo   Untuk distribusi ke PC lain:
echo   Copy SELURUH isi folder SyncAgent-App ke PC tujuan.
echo   Pastikan .env sudah terisi dengan benar.
echo  ============================================================
echo.

:: Buka folder hasil
explorer "dist\SyncAgent-App"

pause
