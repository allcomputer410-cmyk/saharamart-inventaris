' run_silent.vbs
' Jalankan sync agent di BACKGROUND — tidak ada jendela CMD yang muncul.
' File ini dipanggil oleh Task Scheduler saat Windows boot.

Dim objShell, strDir
Set objShell = CreateObject("WScript.Shell")

' Tentukan folder script ini berada
strDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Jalankan python sync_agent.py --daemon secara tersembunyi (window=0)
objShell.Run "cmd /c cd /d """ & strDir & """ && python sync_agent.py --daemon >> sync_agent.log 2>&1", 0, False

Set objShell = Nothing
