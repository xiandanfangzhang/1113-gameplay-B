$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) {
    Write-Host 'Node.js 20+ is required. Install Node.js and run this launcher again.'
    Read-Host 'Press Enter to close'
    exit 1
}
Write-Host 'Open http://127.0.0.1:4173/ in your browser. Keep this window open; Ctrl+C stops the server.'
& $nodePath scripts/dev-server.mjs
