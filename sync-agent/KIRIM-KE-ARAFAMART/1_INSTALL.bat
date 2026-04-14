@echo off
title [LANGKAH 1] Install Sync Agent - ARAFAMART
color 0A
cd /d "%~dp0"

echo.
echo  ============================================================
echo    SYNC AGENT iPOS - ARAFAMART
echo    Langkah 1: Install library Python
echo    (Cukup dijalankan SEKALI saja)
echo  ============================================================
echo.

:: Cek Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ============================================================
    echo   PYTHON BELUM TERINSTALL!
    echo.
    echo   Download dari: https://www.python.org/downloads/
    echo   Pilih versi terbaru, lalu install.
    echo.
    echo   PENTING saat install:
    echo   [X] Centang "Add Python to PATH"  ^<-- wajib!
    echo.
    echo   Setelah install Python, jalankan file ini lagi.
    echo  ============================================================
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo  OK: %PYVER% ditemukan
echo.

echo  Menginstall semua library yang dibutuhkan...
echo  (Memerlukan koneksi internet, tunggu sebentar)
echo.

pip install -r requirements.txt
pip install pystray Pillow

if %errorlevel% neq 0 (
    echo.
    echo  ============================================================
    echo   GAGAL! Coba klik kanan file ini - "Run as administrator"
    echo  ============================================================
    pause
    exit /b 1
)

echo.
echo  ============================================================
echo   INSTALL SELESAI!
echo.
echo   Lanjut ke langkah berikutnya:
echo   Double-click: 2_JALANKAN.bat
echo  ============================================================
echo.
pause
