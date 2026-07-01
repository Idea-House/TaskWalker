$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$temporaryOutput = Join-Path $env:TEMP ('task-walker-package-' + [guid]::NewGuid().ToString('N'))
$releaseDirectory = Join-Path $root 'release'
$destination = Join-Path $releaseDirectory ("Task-Walker-{0}-portable.exe" -f $package.version)
$builder = Join-Path $root 'node_modules\.bin\electron-builder.cmd'

try {
    & $builder --win portable --x64 "--config.directories.output=$temporaryOutput"
    if ($LASTEXITCODE -ne 0) {
        throw "electron-builder failed with exit code $LASTEXITCODE."
    }

    $artifact = Get-ChildItem -LiteralPath $temporaryOutput -Filter 'Task-Walker-*-portable.exe' | Select-Object -First 1
    if (-not $artifact) {
        throw 'Portable artifact was not generated.'
    }

    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    Copy-Item -LiteralPath $artifact.FullName -Destination $destination -Force
    $hash = Get-FileHash -LiteralPath $destination -Algorithm SHA256
    Write-Output "Portable app: $destination"
    Write-Output "SHA256: $($hash.Hash)"
}
finally {
    if (Test-Path -LiteralPath $temporaryOutput) {
        $resolvedTemp = (Resolve-Path -LiteralPath $env:TEMP).Path
        $resolvedTarget = (Resolve-Path -LiteralPath $temporaryOutput).Path
        if ($resolvedTarget.StartsWith($resolvedTemp + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
        }
    }
}
