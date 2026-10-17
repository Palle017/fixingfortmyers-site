param(
 [ValidateSet('inventory','thread')][string]$Mode='inventory',
 [string]$ConversationId,
 [Parameter(Mandatory=$true)][string]$OutputPath,
 [string]$InventoryPath,
 [Parameter(Mandatory=$true)][string]$SettingsPath,
 [string]$PythonExecutable="python.exe"
)
$ErrorActionPreference='Stop'
$settings=Get-Content $SettingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
$private=[IO.Path]::GetFullPath($settings.private_archive_root).TrimEnd('\')+'\'
if(-not [IO.Path]::GetFullPath($OutputPath).StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'Private output path required'}
if(Test-Path $OutputPath){throw 'Existing evidence must not be overwritten'}
if($Mode -eq 'thread'){
 if($ConversationId -notmatch '^prv_[A-Z0-9]{26}$'){throw 'Invalid conversation identity'}
 if(-not $InventoryPath -or -not [IO.Path]::GetFullPath($InventoryPath).StartsWith($private,[StringComparison]::OrdinalIgnoreCase)){throw 'Private observed inventory required'}
 $inventory=Get-Content $InventoryPath -Raw -Encoding UTF8 | ConvertFrom-Json
 $observed=@($inventory.records | Where-Object {$_.conversation_id -eq $ConversationId})
 if($observed.Count -ne 1){throw 'Conversation not uniquely observed in inventory'}
 $url=$observed[0].url
 if($url -ne ('https://app.beside.com/chats/'+$ConversationId)){throw 'Unexpected observed conversation URL'}
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$dc=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Document)
$lc=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Hyperlink)
$win=$null;$doc=$null
$tc=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem)
# A user can switch away from Beside; find its observed tab instead of requiring
# the whole window title to remain Beside. No cookie or credential access.
for($round=0;$round -lt 2 -and -not $doc;$round++){
 foreach($w in [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)){
  if($w.Current.ClassName -ne 'Chrome_WidgetWin_1'){continue}
  if($w.Current.Name -notmatch 'Beside'){
   $besideTab=$null
   foreach($tab in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants,$tc)){if($tab.Current.Name -match 'Beside'){$besideTab=$tab;break}}
   if(-not $besideTab){continue}
   try{$besideTab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()}catch{continue}
  }
  for($wait=0;$wait -lt 8 -and -not $doc;$wait++){
   foreach($d in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants,$dc)){if($d.Current.Name -match 'Beside'){$win=$w;$doc=$d;break}}
   if(-not $doc){Start-Sleep -Milliseconds 200}
  }
  if($doc){break}
 }
 if(-not $doc -and $round -eq 0){
  $browser=Get-Process chrome -ErrorAction SilentlyContinue | Select-Object -First 1
  if(-not $browser -or -not $browser.Path){break}
  Start-Process -FilePath $browser.Path -ArgumentList '--new-window','https://app.beside.com/chats'
  Start-Sleep -Milliseconds 1000
 }
}
if(-not $doc){throw 'Beside window unavailable'}
$account=$false;$mailbox=$false
foreach($n in $doc.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)){
 if($n.Current.Name.EndsWith(' '+$settings.expected_account_heading,[StringComparison]::Ordinal)){$account=$true}
 if($n.Current.Name.StartsWith($settings.expected_mailbox_title+' ',[StringComparison]::Ordinal)){$mailbox=$true}
}
if(-not $account -or -not $mailbox){throw 'Expected signed-in Beside account/mailbox unavailable'}
if($doc.Current.Name -notmatch '^Chats - .+ - Beside$'){
 $homeLink=$null
 foreach($a in $doc.FindAll([System.Windows.Automation.TreeScope]::Descendants,$lc)){try{$v=$a.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern);if($v.Current.Value -eq 'https://app.beside.com/chats'){$homeLink=$a;break}}catch{}}
 if(-not $homeLink){throw 'Observed Chats navigation unavailable'}
 $homeLink.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
 $doc=$null
 for($i=0;$i -lt 20 -and -not $doc;$i++){
  Start-Sleep -Milliseconds 200
  foreach($d in $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,$dc)){if($d.Current.Name -match '^Chats - .+ - Beside$'){$doc=$d;break}}
 }
 if(-not $doc){throw 'Chats view did not become ready'}
}
$allFilter=$doc.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'Filter chats: All')))
if(-not $allFilter){throw 'Expected All-conversations filter unavailable'}
if($Mode -eq 'inventory'){
 $records=@();$seen=@{}
 foreach($link in $doc.FindAll([System.Windows.Automation.TreeScope]::Descendants,$lc)){
  try{$value=$link.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value}catch{continue}
  if($value -notmatch '^https://app\.beside\.com/chats/(prv_[A-Z0-9]{26})$'){continue}
  $cid=$Matches[1]
  if($seen.ContainsKey($cid)){throw 'Duplicate visible conversation identity'}
  $seen[$cid]=$true
  $records += [ordered]@{conversation_id=$cid;url=$value;label=$link.Current.Name}
 }
 if($records.Count -lt 1 -or $records.Count -gt 200){throw 'Visible inventory absent or exceeds bound'}
 $payload=[ordered]@{format='beside-uia-inventory/v1';captured_at=[DateTime]::UtcNow.ToString('o');title=$doc.Current.Name;method='authorized_browser';complete=$false;records=$records}
 [IO.File]::WriteAllText($OutputPath,($payload|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
 [pscustomobject]@{ok=$true;mode=$Mode;conversations_read=$records.Count;complete=$false;customer_messages_sent=$false}|ConvertTo-Json -Compress
 exit 0
}
$target=$null
foreach($a in $doc.FindAll([System.Windows.Automation.TreeScope]::Descendants,$lc)){
 try{$v=$a.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern);if($v.Current.Value -eq $url){$target=$a;break}}catch{}
}
if(-not $target){throw 'Observed conversation link not currently present'}
$target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
# Opening an unread conversation may mark it read. No sends, edits or deletions.
$addressCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'Address and search bar')
$walker=[System.Windows.Automation.TreeWalker]::ControlViewWalker
function Get-ObservedUrl {
 $address=$win.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$addressCondition)
 if(-not $address){return ''}
 $value=$address.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
 if($value.StartsWith('app.beside.com/')){return 'https://'+$value}
 return $value
}
function Finite-OrNull($value){
 if([double]::IsInfinity($value) -or [double]::IsNaN($value)){return $null}
 return $value
}
function Read-Node($node,[int]$parent,[int]$depth){
 if($script:captureNodes.Count -ge 2500 -or $depth -gt 45){throw 'Rendered capture exceeded bounds'}
 $id=$script:captureNodes.Count;$c=$node.Current;$role=$c.ControlType.ProgrammaticName;$name=$c.Name;$value=$null
 if($role -eq 'ControlType.Edit'){$name='[editor excluded]'}
 if($role -eq 'ControlType.Hyperlink'){try{$value=$node.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value}catch{}}
 $bounds=$c.BoundingRectangle
 $script:captureNodes.Add([ordered]@{id=$id;parent=$parent;role=$role;name=$name;value=$value;left=(Finite-OrNull $bounds.Left);top=(Finite-OrNull $bounds.Top);width=(Finite-OrNull $bounds.Width);height=(Finite-OrNull $bounds.Height);offscreen=$c.IsOffscreen})
 $child=$walker.GetFirstChild($node)
 while($child){Read-Node $child $id ($depth+1);$child=$walker.GetNextSibling($child)}
}
function Read-Observation {
 $before=Get-ObservedUrl
 if($before -ne $url){return $null}
 $currentDoc=$null
 foreach($d in $win.FindAll([System.Windows.Automation.TreeScope]::Descendants,$dc)){
  if($d.Current.Name -match '^Chats - .+ - Beside$'){$currentDoc=$d;break}
 }
 if(-not $currentDoc){return $null}
 $script:captureNodes=New-Object System.Collections.Generic.List[object]
 Read-Node $currentDoc -1 0
 $after=Get-ObservedUrl
 return [ordered]@{
  observed_at=[DateTime]::UtcNow.ToString('o');observed_url_before=$before;observed_url_after=$after
  title=$currentDoc.Current.Name;nodes=$script:captureNodes.ToArray()
 }
}
function Test-IdentityEvidence($candidate){
 # The same pure Python validator rechecks native target/header identity, duplicate
 # visible names, URL bracketing and three stable raw observations before any save.
 $psi=New-Object System.Diagnostics.ProcessStartInfo
 $psi.FileName=$PythonExecutable
 $psi.Arguments='"'+(Join-Path $PSScriptRoot 'beside_uia.py')+'" --verify-stdin'
 $psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
 $psi.RedirectStandardInput=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
 $process=New-Object System.Diagnostics.Process
 $process.StartInfo=$psi
 try{
  [void]$process.Start()
  $json=$candidate|ConvertTo-Json -Depth 12 -Compress
  $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes($json)
  $process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)
  $process.StandardInput.BaseStream.Flush();$process.StandardInput.Close()
  if(-not $process.WaitForExit(3000)){$process.Kill();throw 'Identity validator timed out'}
  $answer=$process.StandardOutput.ReadToEnd()
  # Never print captured content, private paths or validator exception bodies.
  if($process.ExitCode -ne 0){return $false}
  $verified=$answer|ConvertFrom-Json
  return ($verified.ok -eq $true -and $verified.identity_verified -eq $true)
 }finally{$process.Dispose()}
}
$deadline=[DateTime]::UtcNow.AddSeconds(12)
$samples=@();$payload=$null
while([DateTime]::UtcNow -lt $deadline){
 # This spacing establishes distinct observations, not presumed page readiness.
 Start-Sleep -Milliseconds 300
 try{$sample=Read-Observation}catch{$samples=@();continue}
 if(-not $sample){$samples=@();continue}
 $samples=@($samples|Select-Object -Last 2)+@($sample)
 if($samples.Count -ne 3){continue}
 $candidate=[ordered]@{
  format='beside-uia-thread/v1';identity_format='beside-uia-identity/v1'
  conversation_id=$ConversationId;source_url=$url;inventory_label=$observed[0].label
  observed_at=$sample.observed_at;observed_url_before=$sample.observed_url_before;observed_url_after=$sample.observed_url_after
  title=$sample.title;nodes=$sample.nodes;prior_samples=@($samples[0],$samples[1])
  coverage=@{complete=$false;method='authorized_browser';scope='Three identity-matched stable rendered observations only; no older-history paging or recording downloads.'}
  customer_messages_sent=$false
 }
 if(Test-IdentityEvidence $candidate){$payload=$candidate;break}
}
if(-not $payload){throw 'Selected conversation identity or stable content could not be verified'}
# Create-only: an unverified read cannot replace earlier evidence or advance a checkpoint.
$encoded=(New-Object Text.UTF8Encoding($false)).GetBytes(($payload|ConvertTo-Json -Depth 12))
$stream=[IO.File]::Open($OutputPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$stream.Write($encoded,0,$encoded.Length);$stream.Flush($true)}finally{$stream.Dispose()}
[pscustomobject]@{ok=$true;mode=$Mode;conversation_id=$ConversationId;captured_nodes=$payload.nodes.Count;identity_verified=$true;stable_observations=3;complete=$false;customer_messages_sent=$false}|ConvertTo-Json -Compress
