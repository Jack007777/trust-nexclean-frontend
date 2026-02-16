param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = "frontend update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
}

git -C $repo add .
$hasChanges = git -C $repo diff --cached --name-only
if (-not $hasChanges) {
  Write-Host "No changes to commit."
  exit 0
}

git -C $repo commit -m $Message
git -C $repo push origin main
Write-Host "Pushed to origin/main"
