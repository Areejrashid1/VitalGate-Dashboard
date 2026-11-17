<#
VitalGate console launcher (multi-page web app in this folder).
It runs the new console (server.py here) on top of the existing VitalGate product, whose pipeline
(soc/replay.py or soc/live.py and the Docker test bed) produces the data.

  .\vitalgate.ps1 start              console + replay of recorded traffic (no Docker needed)
  .\vitalgate.ps1 start -Mode live   console + Docker test bed + live detector driving the gateway
  .\vitalgate.ps1 stop               stop everything this launcher started (and the test bed, if it started it)
  .\vitalgate.ps1 status             what is running
  .\vitalgate.ps1 logs               last lines of each log
  .\vitalgate.ps1 adduser            add an account / reset a password
  .\vitalgate.ps1 requests           list pending account requests (from the sign-up page)
  .\vitalgate.ps1 approve            approve a pending request

Double-click start.cmd / stop.cmd for the same thing without typing.
The product folder is read from config.json ("product"), default ..\VitalGate Project Code\product.
#>
param(
  [ValidateSet("start", "stop", "status", "logs", "adduser", "requests", "approve")][string]$Action = "start",
  [ValidateSet("replay", "live")][string]$Mode = "replay",
  [int]$Port = 8090,
  [double]$Speed = 30,
  [switch]$NoBrowser
)
$ErrorActionPreference = "Stop"
$Root  = $PSScriptRoot
$Data  = Join-Path $Root "data"
$Logs  = Join-Path $Data "logs"
$State = Join-Path $Data "run.json"
$Url   = "http://localhost:$Port"
New-Item -ItemType Directory -Force $Logs | Out-Null

$Prod = Join-Path (Split-Path $Root -Parent) "VitalGate Project Code\product"
$cfg = Join-Path $Root "config.json"
if (Test-Path $cfg) {
  $p = (Get-Content $cfg -Raw | ConvertFrom-Json).product
  if ($p) { $Prod = if ([IO.Path]::IsPathRooted($p)) { $p } else { [IO.Path]::GetFullPath((Join-Path $Root $p)) } }
}
$Testbed = Join-Path $Prod "testbed"

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }
function Listening { [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }
function Python {
  foreach ($c in "python", "py") { if (Get-Command $c -ErrorAction SilentlyContinue) { return $c } }
  throw "Python was not found. Install Python 3 and tick 'Add python.exe to PATH'."
}
function Run-Native([string]$cmd, [string]$log = $null) {
  # Docker prints progress on stderr; Windows PowerShell 5.1 turns that into an error under "Stop".
  $dest = if ($log) { "`"$log`"" } else { "nul" }
  cmd /c "$cmd > $dest 2>&1"
  return $LASTEXITCODE
}
function Ours {   # this console's server, the product's pipeline scripts, and the product's old dashboard (same port)
  $me = [regex]::Escape((Join-Path $Root "server.py"))
  Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='py.exe'" |
    Where-Object { $_.CommandLine -match 'soc[\\/](server|replay|live)\.py' -or $_.CommandLine -match $me -or
                   ($_.CommandLine -match '\bserver\.py' -and $_.CommandLine -match '--product') }
}
function Label($p) {
  if ($p.CommandLine -match 'soc[\\/](\w+)\.py') { if ($matches[1] -eq "server") { return "old-dashboard" } return $matches[1] }
  return "console"
}
function Launch($name, [string]$dir, [string[]]$scriptArgs) {
  $py = Python
  $p = Start-Process $py -ArgumentList (@("-u") + $scriptArgs) -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
         -RedirectStandardOutput (Join-Path $Logs "$name.log") -RedirectStandardError (Join-Path $Logs "$name.err.log")
  Say ("  {0,-8} started (pid {1})" -f $name, $p.Id) "DarkGray"
  return $p.Id
}
function Server-Args { return @("`"$(Join-Path $Root 'server.py')`"", "--port", "$Port", "--product", "`"$Prod`"") }

function Stop-VitalGate {
  $run = if (Test-Path $State) { Get-Content $State -Raw | ConvertFrom-Json } else { $null }
  $procs = @(Ours)
  if ($procs.Count) {
    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                              Say ("  stopped {0} (pid {1})" -f (Label $_), $_.ProcessId) "DarkGray" }
  } else { Say "No VitalGate processes were running." }
  if ($run -and $run.docker) {
    Say "Stopping the test bed..."
    Push-Location $Testbed; try { Run-Native "docker compose down" | Out-Null } finally { Pop-Location }
  }
  Remove-Item $State -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $Prod "soc\data\live.lock") -ErrorAction SilentlyContinue
  $t = 0; while ((Listening) -and $t -lt 20) { Start-Sleep -Milliseconds 250; $t++ }
  Say "VitalGate stopped." "Green"
}

if (-not (Test-Path (Join-Path $Prod "soc\replay.py"))) {
  Say "VitalGate product not found at: $Prod" "Red"
  Say "Put the path in config.json, e.g.  { `"product`": `"..\\VitalGate Project Code\\product`" }" "Yellow"
  if ($Action -ne "stop") { exit 1 }
}

switch ($Action) {

  "adduser"  { $name = Read-Host "Username"; & (Python) (Join-Path $Root "server.py") --product $Prod --add-user $name }
  "requests" { & (Python) (Join-Path $Root "server.py") --product $Prod --requests }
  "approve"  { & (Python) (Join-Path $Root "server.py") --product $Prod --requests; $name = Read-Host "Approve which username"; & (Python) (Join-Path $Root "server.py") --product $Prod --approve $name }

  "start" {
    Say "`nVitalGate SOC console  ($Mode mode)" "Cyan"
    Say "Product: $Prod" "DarkGray"
    if (Listening) {
      $cur = if (Test-Path $State) { (Get-Content $State -Raw | ConvertFrom-Json).mode } else { $null }
      $feedUp = [bool](@(Ours) | Where-Object { $_.CommandLine -match "soc[\\/]$Mode\.py" })
      $consoleUp = [bool](@(Ours) | Where-Object { (Label $_) -eq "console" })
      if ($cur -eq $Mode -and $feedUp -and $consoleUp) {
        Say "Already running in $Mode mode on $Url" "Yellow"
        if (-not $NoBrowser) { Start-Process $Url }
        return
      }
      Say "Something else is using port $Port (mode: $(if ($cur) { $cur } else { 'unknown / old dashboard / started by hand' })). Switching..." "Yellow"
      Stop-VitalGate
    }
    $py = Python
    # 1. first account (asked here, because the server runs hidden)
    $hasUsers = (Test-Path (Join-Path $Data "users.json")) -or (Test-Path (Join-Path $Prod "soc\data\users.json"))
    if (-not $hasUsers) {
      Say "No accounts yet - create the first (administrator) account." "Yellow"
      $name = Read-Host "Username"
      & $py (Join-Path $Root "server.py") --product $Prod --add-user $name
      if ($LASTEXITCODE) { throw "Account was not created." }
    }
    $run = @{ mode = $Mode; port = $Port; started = (Get-Date).ToString("s"); pids = @(); docker = $false; product = $Prod }

    # 2. live mode needs the Docker test bed
    if ($Mode -eq "live") {
      if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is not installed or not on PATH." }
      if (Run-Native "docker info") { throw "Docker Desktop is not running. Start it and try again." }
      Say "Starting the test bed (first time can take a few minutes)..."
      Push-Location $Testbed
      try { if (Run-Native "docker compose up -d --build" (Join-Path $Logs "docker.log")) { Get-Content (Join-Path $Logs "docker.log") -Tail 15; throw "docker compose failed - see $Logs\docker.log" } }
      finally { Pop-Location }
      $run.docker = $true
    }

    # 3. console server
    $run.pids += Launch "console" $Root (Server-Args)
    $t = 0; while (-not (Listening) -and $t -lt 40) { Start-Sleep -Milliseconds 250; $t++ }
    if (-not (Listening)) {
      Say "The console did not start. Last log lines:" "Red"
      Get-Content (Join-Path $Logs "console.err.log"), (Join-Path $Logs "console.log") -Tail 15 -ErrorAction SilentlyContinue
      return
    }

    # 4. data feed: the product's own pipeline, unchanged
    if ($Mode -eq "live") { $run.pids += Launch "live"   $Prod @("soc/live.py") }
    else                  { $run.pids += Launch "replay" $Prod @("soc/replay.py", "--speed", "$Speed") }

    $run | ConvertTo-Json | Set-Content $State -Encoding UTF8
    Say "`nRunning:  $Url" "Green"
    Say "Stop with:  .\vitalgate.ps1 stop   (or double-click stop.cmd)" "DarkGray"
    Say "Logs in:    $Logs`n" "DarkGray"
    if (-not $NoBrowser) { Start-Process $Url }
  }

  "stop" { Stop-VitalGate }

  "status" {
    $run = if (Test-Path $State) { Get-Content $State -Raw | ConvertFrom-Json } else { $null }
    if (Listening) { Say "Console:  running on $Url" "Green" } else { Say "Console:  stopped" "Yellow" }
    foreach ($p in @(Ours)) { Say ("  {0,-13} pid {1}" -f (Label $p), $p.ProcessId) }
    if ($run) { Say "Mode: $($run.mode), started $($run.started)" "DarkGray" }
    if ($run -and $run.docker) { Push-Location $Testbed; try { cmd /c "docker compose ps 2>&1" } finally { Pop-Location } }
  }

  "logs" {
    Get-ChildItem $Logs -Filter *.log | Where-Object Length -gt 0 | ForEach-Object {
      Say "`n== $($_.Name) ==" "Cyan"; Get-Content $_.FullName -Tail 12
    }
  }
}
