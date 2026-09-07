param([switch]$Once)
$ErrorActionPreference = 'Stop'
$taskServiceRoot = $PSScriptRoot
$taskConfigPath = Join-Path $taskServiceRoot 'runtime.json'
$taskConfig = if (Test-Path -LiteralPath $taskConfigPath) { Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json } else { $null }
$taskNodePath = if ($taskConfig -and $taskConfig.nodePath) { [string]$taskConfig.nodePath } else { (Get-Command node.exe -ErrorAction Stop).Source }
$taskDataRoot = if ($taskConfig -and $taskConfig.dataDir) { [string]$taskConfig.dataDir } else { Join-Path $taskServiceRoot 'data' }
$taskLogRoot = Join-Path $taskServiceRoot 'logs'
New-Item -ItemType Directory -Path $taskLogRoot -Force | Out-Null
$env:LEAD_DATA_DIR = $taskDataRoot
$env:LEAD_PUBLIC_PORT = if ($taskConfig -and $taskConfig.publicPort) { [string]$taskConfig.publicPort } else { '18795' }
$env:LEAD_INBOX_PORT = if ($taskConfig -and $taskConfig.inboxPort) { [string]$taskConfig.inboxPort } else { '18798' }
if ($taskConfig -and $taskConfig.devOrigins) { $env:LEAD_DEV_ORIGINS = [string]::Join(',', $taskConfig.devOrigins) } else { $env:LEAD_DEV_ORIGINS = '' }
$taskMutex = [System.Threading.Mutex]::new($false, 'Local\PerfectTimingWebsiteLeads')
if (-not $taskMutex.WaitOne(0)) { exit 0 }
try {
  do {
    $taskDateStamp = (Get-Date -Format 'yyyy-MM-dd_HHmmss_fff') + '_' + [guid]::NewGuid().ToString('N').Substring(0,8)
    $taskStdout = Join-Path $taskLogRoot ($taskDateStamp + '.out.log')
    $taskStderr = Join-Path $taskLogRoot ($taskDateStamp + '.error.log')
    $taskServerArgument = '"' + (Join-Path $taskServiceRoot 'server.mjs') + '"'
    $taskNodeProcess = Start-Process -FilePath $taskNodePath -ArgumentList $taskServerArgument -WorkingDirectory $taskServiceRoot -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput $taskStdout -RedirectStandardError $taskStderr
    if ($Once) { break }
    Start-Sleep -Seconds 5
  } while ($true)
} finally {
  $taskMutex.ReleaseMutex()
  $taskMutex.Dispose()
}
