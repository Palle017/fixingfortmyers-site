[CmdletBinding()]
param(
  [string]$SitemapPath = (Join-Path $PSScriptRoot '..\sitemap.xml'),
  [switch]$Submit
)

$ErrorActionPreference = 'Stop'

$siteHost = 'fixingfortmyers.com'
$indexNowKey = 'a0f8f7f6cad8445382fa07471976bd35'
$keyLocation = "https://$siteHost/$indexNowKey.txt"

if (-not (Test-Path -LiteralPath $SitemapPath)) {
  throw "Sitemap not found: $SitemapPath"
}

[xml]$sitemap = Get-Content -LiteralPath $SitemapPath -Raw
$urls = @($sitemap.urlset.url.loc | ForEach-Object { [string]$_ })

if ($urls.Count -eq 0) {
  throw 'The sitemap did not contain any URLs.'
}

$payload = @{
  host        = $siteHost
  key         = $indexNowKey
  keyLocation = $keyLocation
  urlList     = $urls
}

if (-not $Submit) {
  Write-Host "DRY RUN: $($urls.Count) URLs are ready for IndexNow."
  Write-Host "Key URL: $keyLocation"
  Write-Host 'Publish the site first, confirm the key URL works, then run:'
  Write-Host '.\tools\submit-indexnow.ps1 -Submit'
  return
}

$keyCheck = Invoke-WebRequest -Uri $keyLocation -UseBasicParsing
if ($keyCheck.StatusCode -ne 200 -or $keyCheck.Content.Trim() -ne $indexNowKey) {
  throw "IndexNow key verification failed at $keyLocation. Publish the key file before submitting."
}

$response = Invoke-WebRequest `
  -Uri 'https://api.indexnow.org/indexnow' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Body ($payload | ConvertTo-Json -Depth 5 -Compress) `
  -UseBasicParsing

Write-Host "IndexNow accepted the request with HTTP status $($response.StatusCode)."
