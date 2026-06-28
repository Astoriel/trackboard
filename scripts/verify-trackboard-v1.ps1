$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE"
  }
}

Push-Location (Join-Path $root "apps/api")
try {
  Invoke-Native python -m pytest -q
}
finally {
  Pop-Location
}

Push-Location (Join-Path $root "apps/cli")
try {
  Invoke-Native npm ci
  Invoke-Native npm audit --audit-level=moderate
  Invoke-Native npm test
  Invoke-Native node dist/src/index.js validate --contract ../../examples/contracts/web-analytics.v1.json --event ../../examples/events/signup.valid.json
  Invoke-Native node dist/src/index.js diff ../../examples/contracts/web-analytics.v1.json ../../examples/contracts/web-analytics.v1.json
}
finally {
  Pop-Location
}

Push-Location (Join-Path $root "apps/web")
try {
  Invoke-Native npm ci
  Invoke-Native npm audit --audit-level=moderate
  Invoke-Native npm run build
}
finally {
  Pop-Location
}

Push-Location (Join-Path $root "apps/mcp")
try {
  Invoke-Native npm ci
  Invoke-Native npm audit --audit-level=moderate
  Invoke-Native npm test
}
finally {
  Pop-Location
}

Push-Location (Join-Path $root "apps/guard")
try {
  Invoke-Native go test ./...
}
finally {
  Pop-Location
}

Write-Host "Trackboard v1 checks passed"
