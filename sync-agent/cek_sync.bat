@echo off
:: cek_sync.bat — Lihat 30 baris terakhir log sync, refresh setiap 5 detik
title Monitor Sync iPOS - SAHARAMART
color 0A

:LOOP
cls
echo  ============================================================
echo    MONITOR SYNC iPOS ^> SUPABASE — SAHARAMART
echo    %date% %time%
echo  ============================================================
echo.
echo  [30 aktivitas terakhir:]
echo  ------------------------------------------------------------

:: Tampilkan 30 baris terakhir dari log
powershell -command "Get-Content '%~dp0sync_agent.log' -Tail 30"

echo.
echo  ------------------------------------------------------------
echo  Refresh otomatis tiap 5 detik. Tekan Ctrl+C untuk keluar.
timeout /t 5 /nobreak >nul
goto LOOP
