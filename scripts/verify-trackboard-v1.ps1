$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $root "apps/api")
try {
  python -m pytest -q
}
finally {
  Pop-Location
}

Push-Location (Join-Path $root "apps/cli")
try {
  npm test
  node dist/src/index.js validate --contract ../../examples/contracts/web-analytics.v1.json --event ../../examples/events/signup.valid.json
  node dist/src/index.js diff ../../examples/contracts/web-analytics.v1.json ../../examples/contracts/web-analytics.v1.json
}
finally {
  Pop-Location
}

Push-Location (Join-Path $root "apps/guard")
try {
  go test ./...
}
finally {
  Pop-Location
}

Write-Host "Trackboard v1 checks passed"
