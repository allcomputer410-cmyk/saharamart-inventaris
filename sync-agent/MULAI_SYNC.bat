@echo off
title Sync iPOS - SAHARAMART
color 0A

echo.
echo  ============================================================
echo    SYNC iPOS ke SUPABASE — SAHARAMART
echo    Double-click file ini untuk sync semua data sekaligus
echo  ============================================================
echo.

:: Pindah ke folder script ini
cd /d "%~dp0"

:: Jalankan script Python
python jalankan_semua.py

echo.
echo  ============================================================
echo  Selesai. Tekan tombol apa saja untuk menutup jendela ini.
echo  ============================================================
pause >nul
