<#
Optional Beside session keep-alive (default OFF).
If no Chrome window or tab named "Beside" exists, opens https://app.beside.com/chats in a dedicated
Chrome profile. It never types, reads or stores passwords, cookies or tokens: if Beside shows a
sign-in page, a person signs in once in that profile and Chrome keeps the session.
Enable with "beside_keepalive_enabled": true and "beside_chrome_profile_dir" in the refresh settings.
#>
param([Parameter(Mandatory=$true)][string]$SettingsPath,[string]$ChromePath)
$ErrorActionPreference='Stop'
$settings=Get-Content $SettingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
if($settings.beside_keepalive_enabled -ne $true){[pscustomobject]@{ok=$true;enabled=$false}|ConvertTo-Json -Compress;exit 0}
$profileDir=[string]$settings.beside_chrome_profile_dir
if(-not $profileDir -or -not [IO.Path]::IsPathRooted($profileDir)){throw 'beside_chrome_profile_dir must be an absolute path'}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$tc=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem)
$found=$false
foreach($w in [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)){
 if($w.Current.ClassName -ne 'Chrome_WidgetWin_1'){continue}
 if($w.Current.Name -match 'Beside'){$found=$true;break}
 foreach($tab in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants,$tc)){if($tab.Current.Name -match 'Beside'){$found=$true;break}}
 if($found){break}
}
if($found){[pscustomobject]@{ok=$true;enabled=$true;action='none'}|ConvertTo-Json -Compress;exit 0}
if(-not $ChromePath){
 foreach($c in @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")){if(Test-Path $c){$ChromePath=$c;break}}
}
if(-not $ChromePath){throw 'Chrome not found'}
Start-Process -FilePath $ChromePath -ArgumentList ('--user-data-dir="'+$profileDir+'"'),'--new-window','https://app.beside.com/chats'
[pscustomobject]@{ok=$true;enabled=$true;action='opened'}|ConvertTo-Json -Compress
