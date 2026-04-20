' run_silent.vbs
' Jalankan Sync Agent di background tanpa jendela CMD.
' Dipanggil otomatis oleh Windows Registry saat PC menyala.
' Delay 60 detik agar iPOS dan database sempat siap lebih dulu.

WScript.Sleep 60000

Dim objShell, strDir
Set objShell = CreateObject("WScript.Shell")
strDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

objShell.Run "pythonw """ & strDir & "\sync_tray.py""", 0, False

Set objShell = Nothing
