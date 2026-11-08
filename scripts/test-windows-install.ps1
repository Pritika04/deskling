param([string]$Installer = '')
$ErrorActionPreference = 'Stop'
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $workspaceRoot 'package.json') -Raw | ConvertFrom-Json).version
if (-not $Installer) { $Installer = Join-Path $workspaceRoot "dist\Deskling-$version-win-x64.exe" }
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$existing = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*') | ForEach-Object {
  Get-ItemProperty -Path $_ -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^(Deskling|Habit Buddy)(\s|$)' }
}
if ($existing) { throw 'A buddy app is already installed. Use a clean Windows test account for the installer check.' }
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot ('.npm\installer-check-' + [guid]::NewGuid())))
if (-not $testRoot.StartsWith($workspaceRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Test installation must stay inside this workspace.' }

try {
  Write-Output 'Installing a temporary Deskling copy...'
  $installation = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$testRoot") -WindowStyle Hidden -Wait -PassThru
  if ($installation.ExitCode -ne 0) { throw "Installer failed with exit code $($installation.ExitCode)." }
  $installedApp = Join-Path $testRoot 'Deskling.exe'
  if (-not (Test-Path -LiteralPath $installedApp -PathType Leaf)) { throw 'The installer did not create Deskling.exe.' }
  Write-Output 'Checking the installed app with a disposable profile...'
  & node (Join-Path $PSScriptRoot 'smoke-packaged.js') $installedApp
  if ($LASTEXITCODE -ne 0) { throw 'The installed app failed its isolated UI check.' }
  # Exercise the upgrade path while the app is closed.
  Write-Output 'Checking reinstall...'
  $upgrade = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$testRoot") -WindowStyle Hidden -Wait -PassThru
  if ($upgrade.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $installedApp -PathType Leaf)) { throw 'Reinstalling the app failed.' }
  Write-Output 'WINDOWS INSTALLER CHECK PASSED: install, installed app startup, and reinstall.'
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    $uninstaller = Get-ChildItem -LiteralPath $testRoot -Filter 'Uninstall*.exe' -File | Select-Object -First 1
    if ($uninstaller) {
      Write-Output 'Uninstalling the temporary copy...'
      $removed = Start-Process -FilePath $uninstaller.FullName -ArgumentList @('/S', "_?=$testRoot") -WindowStyle Hidden -Wait -PassThru
      if ($removed.ExitCode -ne 0) { throw "Test uninstaller failed with exit code $($removed.ExitCode)." }
    }
    # Only the verified temporary test directory is removed; saved buddy data stays outside it.
    $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
    if ($resolvedTestRoot.StartsWith($workspaceRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedTestRoot).StartsWith('installer-check-')) {
      if (Test-Path -LiteralPath $resolvedTestRoot) { Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force }
    } else { throw 'Refusing to remove a path outside the test installation.' }
    Write-Output 'Temporary test installation removed.'
  }
}
