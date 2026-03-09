' run_silent_tray.vbs
' Fallback launcher: jalankan sync_tray.py tanpa jendela CMD
' Dipanggil otomatis oleh JALANKAN_TRAY.bat jika pythonw tidak tersedia

Dim objShell, strDir
Set objShell = CreateObject("WScript.Shell")
strDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Jalankan pythonw (tanpa window) — fallback ke python jika perlu
objShell.Run "pythonw """ & strDir & "\sync_tray.py""", 0, False

Set objShell = Nothing
