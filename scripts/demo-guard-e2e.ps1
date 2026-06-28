$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$guardDb = Join-Path $root "examples/guard/guard.db"
$fakeLog = Join-Path $env:TEMP "trackboard-fake-destination.log"
$fakeErr = Join-Path $env:TEMP "trackboard-fake-destination.err.log"
$guardLog = Join-Path $env:TEMP "trackboard-guard.log"
$guardErr = Join-Path $env:TEMP "trackboard-guard.err.log"
$fake = $null
$guard = $null

function Wait-Json {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Uri,
    [int] $TimeoutSeconds = 10
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      return Invoke-RestMethod -Uri $Uri -Method Get
    }
    catch {
      Start-Sleep -Milliseconds 250
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Uri"
}

function Stop-DemoPort {
  param(
    [Parameter(Mandatory = $true)]
    [int] $Port
  )

  $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if ($process -and ($process.ProcessName -eq "trackboard-guard" -or $process.ProcessName -eq "node")) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  if (Test-Path $guardDb) {
    Remove-Item -LiteralPath $guardDb -Force
  }

  $fake = Start-Process -FilePath "node" `
    -ArgumentList @("examples/fake-destination/server.js") `
    -WorkingDirectory $root `
    -RedirectStandardOutput $fakeLog `
    -RedirectStandardError $fakeErr `
    -WindowStyle Hidden `
    -PassThru

  Wait-Json "http://localhost:9000/health" | Out-Null

  $guard = Start-Process -FilePath "go" `
    -ArgumentList @("run", "./cmd/trackboard-guard", "--config", "../../examples/guard/guard.local.yaml") `
    -WorkingDirectory (Join-Path $root "apps/guard") `
    -RedirectStandardOutput $guardLog `
    -RedirectStandardError $guardErr `
    -WindowStyle Hidden `
    -PassThru

  Wait-Json "http://localhost:8080/health/ready" | Out-Null

  $valid = Invoke-RestMethod `
    -Uri "http://localhost:8080/v1/track" `
    -Method Post `
    -ContentType "application/json" `
    -InFile (Join-Path $root "examples/events/signup.valid.json")

  if (-not $valid.valid) {
    throw "Expected valid event to pass Guard validation"
  }

  $deadline = (Get-Date).AddSeconds(10)
  do {
    $events = Invoke-RestMethod -Uri "http://localhost:9000/events" -Method Get
    if ($events.events.Count -ge 1) {
      break
    }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)

  if ($events.events.Count -lt 1) {
    throw "Expected fake destination to receive the valid event"
  }

  $invalid = Invoke-RestMethod `
    -Uri "http://localhost:8080/v1/track" `
    -Method Post `
    -ContentType "application/json" `
    -InFile (Join-Path $root "examples/events/signup.invalid.json")

  if ($invalid.valid) {
    throw "Expected invalid event to fail Guard validation"
  }

  $metrics = Invoke-RestMethod -Uri "http://localhost:8080/metrics" -Method Get
  if ($metrics -notmatch "trackboard_guard_events_blocked_total 1") {
    throw "Expected blocked metric after invalid event"
  }

  Write-Host "Guard E2E demo passed: valid event forwarded, invalid event blocked"
}
finally {
  if ($guard -and -not $guard.HasExited) {
    Stop-Process -Id $guard.Id -Force
  }
  if ($fake -and -not $fake.HasExited) {
    Stop-Process -Id $fake.Id -Force
  }
  Stop-DemoPort 8080
  Stop-DemoPort 9000
  Start-Sleep -Milliseconds 250
  if (Test-Path $guardDb) {
    Remove-Item -LiteralPath $guardDb -Force -ErrorAction SilentlyContinue
  }
}
