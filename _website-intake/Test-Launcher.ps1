$ErrorActionPreference = 'Stop'
$taskDraftRoot = $PSScriptRoot
$taskTestRoot = Join-Path $taskDraftRoot ('test-data\launcher-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskTestRoot -Force | Out-Null
foreach ($taskFile in @('Start-Website-Leads.ps1','widget.js','inbox.html','inbox.css','inbox.js')) { Copy-Item -LiteralPath (Join-Path $taskDraftRoot $taskFile) -Destination (Join-Path $taskTestRoot $taskFile) }
Copy-Item -LiteralPath (Join-Path $taskDraftRoot 'server.mjs') -Destination (Join-Path $taskTestRoot 'receiver.mjs')
@'
import { createLeadServers } from './receiver.mjs';
const app = createLeadServers();
app.start().then(() => setTimeout(() => app.close(), 6000));
'@ | Set-Content -LiteralPath (Join-Path $taskTestRoot 'server.mjs') -Encoding utf8
$taskPublicSocket = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$taskInboxSocket = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
$taskPublicSocket.Start()
$taskInboxSocket.Start()
$taskPublicPort = $taskPublicSocket.LocalEndpoint.Port
$taskInboxPort = $taskInboxSocket.LocalEndpoint.Port
$taskPublicSocket.Stop()
$taskInboxSocket.Stop()
$taskConfig = @{nodePath=(Get-Command node.exe).Source;publicPort=$taskPublicPort;inboxPort=$taskInboxPort;devOrigins=@('http://127.0.0.1:18906')}
$taskConfig | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskTestRoot 'runtime.json') -Encoding utf8
$taskPowerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskArguments = '-NoLogo -NoProfile -NonInteractive -File "' + (Join-Path $taskTestRoot 'Start-Website-Leads.ps1') + '" -Once'
$taskLauncherProcess = Start-Process -FilePath $taskPowerShell -ArgumentList $taskArguments -WindowStyle Hidden -PassThru
$taskHealthy = $false
for ($taskAttempt=0; $taskAttempt -lt 25; $taskAttempt++) {
  try { $taskHealth = Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:' + $taskPublicPort + '/healthz') -TimeoutSec 1; if ($taskHealth.StatusCode -eq 200) { $taskHealthy = $true; break } } catch {}
  Start-Sleep -Milliseconds 200
}
$taskInboxStatus = if ($taskHealthy) { (Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:' + $taskInboxPort + '/api/leads') -TimeoutSec 2).StatusCode } else { 0 }
$taskLauncherProcess.WaitForExit(9000) | Out-Null
$taskResult = [ordered]@{PowerShell='Windows PowerShell 5.1';healthy=$taskHealthy;inboxStatus=$taskInboxStatus;testRoot=$taskTestRoot;launcherExited=$taskLauncherProcess.HasExited}
$taskResult | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDraftRoot 'launcher-verification.json') -Encoding utf8
$taskResult | ConvertTo-Json -Compress
if (-not $taskHealthy -or $taskInboxStatus -ne 200 -or -not $taskLauncherProcess.HasExited) { exit 1 }
