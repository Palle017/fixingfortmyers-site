param([string]$ServiceRoot)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ServiceRoot)) { $ServiceRoot = $PSScriptRoot }
$taskServiceRoot = (Resolve-Path -LiteralPath $ServiceRoot).Path
$taskLauncher = Join-Path $taskServiceRoot 'Launch-Website-Leads.vbs'
if (-not (Test-Path -LiteralPath $taskLauncher -PathType Leaf)) { throw 'The website lead launcher is missing.' }
$taskShell = New-Object -ComObject WScript.Shell
$taskStartupDir = [Environment]::GetFolderPath('Startup')
$taskShortcut = $taskShell.CreateShortcut((Join-Path $taskStartupDir 'Perfect Timing Website Requests.lnk'))
$taskShortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$taskShortcut.Arguments = '"' + $taskLauncher + '"'
$taskShortcut.WorkingDirectory = $taskServiceRoot
$taskShortcut.Description = 'Receives Perfect Timing website requests and opens no command window.'
$taskShortcut.WindowStyle = 7
$taskShortcut.Save()
$taskDesktopDir = [Environment]::GetFolderPath('Desktop')
$taskInboxShortcut = Join-Path $taskDesktopDir 'Perfect Timing Website Requests.url'
if (-not (Test-Path -LiteralPath $taskInboxShortcut)) {
  @('[InternetShortcut]', 'URL=http://127.0.0.1:18798/') | Set-Content -LiteralPath $taskInboxShortcut -Encoding ascii
}
Write-Output 'Hidden startup shortcut and local inbox desktop shortcut created. The service has not been started and no public routing was changed.'
