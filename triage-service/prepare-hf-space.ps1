param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $sourceRoot '..')).Path
$destination = [System.IO.Path]::GetFullPath($OutputDir)
$repoPrefix = $repoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if ($destination.Equals($repoRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $destination.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputDir harus berada di luar repo Pasokin agar paket Space tidak ikut masuk ke repo.'
}
if (Test-Path -LiteralPath $destination) {
    throw "OutputDir sudah ada: $destination. Pilih folder baru yang kosong."
}

$template = Join-Path $sourceRoot 'hf-space'
$adapter = Join-Path $sourceRoot 'adapter_v2'
$requiredFiles = @(
    (Join-Path $sourceRoot 'main.py'),
    (Join-Path $template 'Dockerfile'),
    (Join-Path $template 'README.md'),
    (Join-Path $template 'requirements.txt'),
    (Join-Path $adapter 'adapter_config.json'),
    (Join-Path $adapter 'adapter_model.safetensors')
)
foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Berkas tidak ditemukan: $file" }
}

New-Item -ItemType Directory -Path $destination | Out-Null
New-Item -ItemType Directory -Path (Join-Path $destination 'adapter') | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'main.py') -Destination $destination
foreach ($name in @('Dockerfile', 'README.md', 'requirements.txt')) {
    Copy-Item -LiteralPath (Join-Path $template $name) -Destination $destination
}
foreach ($name in @('adapter_config.json', 'adapter_model.safetensors')) {
    Copy-Item -LiteralPath (Join-Path $adapter $name) -Destination (Join-Path $destination 'adapter')
}
Write-Output "Paket Hugging Face Space siap di: $destination"
