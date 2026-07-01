$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'native\TaskWalkerHook\Program.cs'
$outputDirectory = Join-Path $root 'resources\native'
$output = Join-Path $outputDirectory 'TaskWalkerHook.exe'
$compilerCandidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $compiler) {
    throw 'Windows .NET Framework C# compiler was not found.'
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll /reference:System.Drawing.dll "/out:$output" $source
if ($LASTEXITCODE -ne 0) {
    throw "Native helper compilation failed with exit code $LASTEXITCODE."
}

Write-Output "Built native helper: $output"
