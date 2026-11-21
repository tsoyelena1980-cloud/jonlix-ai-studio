$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'apps\server\data'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'bot.log'

$mutex = New-Object System.Threading.Mutex($false, 'Global\JonlixBotForever')
if (-not $mutex.WaitOne(0, $false)) {
  Add-Content -Path $log -Value "$(Get-Date -Format o) supervisor already running"
  exit 0
}

$server = Join-Path $root 'apps\server'
$tsx = Join-Path $server 'node_modules\tsx\dist\cli.mjs'
Set-Location $server

function Write-Log([string]$message) {
  Add-Content -Path $log -Value "$(Get-Date -Format o) $message" -Encoding utf8
}

Write-Log 'supervisor started'
while ($true) {
  Write-Log 'starting server'
  & node $tsx src/index.ts >> $log 2>&1
  Write-Log "server exited code $LASTEXITCODE"
  Start-Sleep -Seconds 5
}
