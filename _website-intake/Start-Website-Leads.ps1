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
# Optional non-secret chat settings (e.g. BAYONE_PROVIDER, OLLAMA_MODEL). Never put API keys in runtime.json.
# Alert routing (non-secret). SMTP_PASS, TWILIO_AUTH_TOKEN and BESIDE_WEBHOOK_TOKEN come from user environment variables only.
$allowedChatEnv = @('BAYONE_PROVIDER','OLLAMA_MODEL','OLLAMA_HOST','OLLAMA_KEEP_ALIVE','OLLAMA_TIMEOUT_MS','CHAT_TIMEOUT_MS','CHAT_MAX_CONCURRENT','OLLAMA_FORMAT','NTFY_TOPIC','NTFY_SERVER','LEAD_ALERT_EMAILS','LEAD_DESKTOP_ALERTS','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_FROM')
if ($taskConfig -and $taskConfig.env) { foreach ($p in $taskConfig.env.PSObject.Properties) { if ($allowedChatEnv -contains $p.Name) { Set-Item -Path ("env:" + $p.Name) -Value ([string]$p.Value) } } }
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
