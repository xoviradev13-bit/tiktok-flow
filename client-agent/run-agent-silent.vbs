Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
' Run completely hidden with no command prompt window (0 = SW_HIDE)
WshShell.Run Chr(34) & scriptDir & "\run-agent.bat" & Chr(34) & " --daemon", 0, False
