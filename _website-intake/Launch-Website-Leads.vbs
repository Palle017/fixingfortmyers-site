Option Explicit
Dim shell, fso, folder, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & folder & "\Start-Website-Leads.ps1"""
shell.Run command, 0, False
