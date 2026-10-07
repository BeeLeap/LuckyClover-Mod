[CmdletBinding()]
param(
    [string]$OutputDirectory = "",
    [string]$ReleaseName = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $Root "dist\release"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $Root $OutputDirectory
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

if ([string]::IsNullOrWhiteSpace($ReleaseName)) {
    $ReleaseName = Get-Date -Format "yyyyMMdd"
}

$PluginNames = @(
    "LuckyClover-Plugin",
    "LuckyClover-ShoppingMall",
    "LuckyClover-Panel",
    "LuckyClover-VIP",
    "LuckyClover-TPA",
    "LuckyClover-Seat",
    "LuckyClover-Sidebar",
    "LuckyClover-Vote",
    "LuckyClover-WhiteList",
    "LuckyClover-InventoryViewer",
    "LuckyClover-Wave"
)
$BehaviorPackNames = @(
    "LuckyClover-Hood-BP",
    "LuckyClover-Seat-BP",
    "LuckyClover-Wave-AI"
)
$ResourcePackNames = @(
    "LuckyClover-Hood-RP"
)

$ExcludedFileNames = @(
    "config.json", "panel.json", "passwords.json", "checkins.json",
    "shops.json", "official.json", "forbidden.json", "logs.json",
    "ranking.json", "tax.json", "warehouse.json", "requests.json",
    "notifications.json", "migrated.flag", "migration-report.json",
    "floattexts.json", "vote.json"
)
$ExcludedDirectoryNames = @("node_modules", ".git", ".idea", ".claude", ".agents", ".mimocode", ".reasonix", "tools")

function Get-PackageVersion([string]$ManifestPath) {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.version) { return (($manifest.version -join ".").Trim(".")) }
    if ($manifest.header -and $manifest.header.version) { return (($manifest.header.version -join ".").Trim(".")) }
    return "unknown"
}

function Copy-PackageFiles([string]$Source, [string]$Destination) {
    $sourceRoot = (Resolve-Path $Source).Path.TrimEnd("\")
    foreach ($file in (Get-ChildItem -LiteralPath $sourceRoot -Recurse -File)) {
        $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart("\")
        $parts = $relative -split "[\\/]"
        if ($ExcludedFileNames -contains $file.Name) { continue }
        if ($parts | Where-Object { $ExcludedDirectoryNames -contains $_ }) { continue }
        $target = Join-Path $Destination $relative
        $parent = Split-Path -Parent $target
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }
}

function New-Zip([string]$StageRoot, [string]$ArchivePath, [switch]$IncludeRoot) {
    if (Test-Path -LiteralPath $ArchivePath) { Remove-Item -LiteralPath $ArchivePath -Force }
    if ($IncludeRoot) {
        Compress-Archive -Path $StageRoot -DestinationPath $ArchivePath -CompressionLevel Optimal
    } else {
        Compress-Archive -Path (Join-Path $StageRoot "*") -DestinationPath $ArchivePath -CompressionLevel Optimal
    }
}

$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("luckyclover-release-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stageRoot, $OutputDirectory | Out-Null
$artifacts = [System.Collections.Generic.List[string]]::new()

try {
    foreach ($name in $PluginNames) {
        $source = Join-Path $Root $name
        $manifest = Join-Path $source "manifest.json"
        if (-not (Test-Path -LiteralPath $manifest)) { throw "缺少插件 manifest.json: $name" }
        $version = Get-PackageVersion $manifest
        $stage = Join-Path $stageRoot "plugins\$name"
        Copy-PackageFiles $source $stage
        $archive = Join-Path $OutputDirectory ("$name-v$version.zip")
        New-Zip $stage $archive -IncludeRoot
        $artifacts.Add($archive)
    }

    foreach ($name in ($BehaviorPackNames + $ResourcePackNames)) {
        $source = Join-Path $Root $name
        $manifest = Join-Path $source "manifest.json"
        if (-not (Test-Path -LiteralPath $manifest)) { throw "缺少资源包 manifest.json: $name" }
        $version = Get-PackageVersion $manifest
        $stage = Join-Path $stageRoot "packs\$name"
        Copy-PackageFiles $source $stage
        $archive = Join-Path $OutputDirectory ("$name-v$version.zip")
        New-Zip $stage $archive -IncludeRoot
        $artifacts.Add($archive)
    }

    $bundleStage = Join-Path $stageRoot "bundle"
    $bundlePlugins = Join-Path $bundleStage "plugins"
    $bundleBehaviorPacks = Join-Path $bundleStage "behavior_packs"
    $bundleResourcePacks = Join-Path $bundleStage "resource_packs"
    foreach ($name in $PluginNames) { Copy-PackageFiles (Join-Path $Root $name) (Join-Path $bundlePlugins $name) }
    foreach ($name in $BehaviorPackNames) { Copy-PackageFiles (Join-Path $Root $name) (Join-Path $bundleBehaviorPacks $name) }
    foreach ($name in $ResourcePackNames) { Copy-PackageFiles (Join-Path $Root $name) (Join-Path $bundleResourcePacks $name) }
    Copy-Item -LiteralPath (Join-Path $Root "README.md") -Destination $bundleStage -Force
    Copy-Item -LiteralPath (Join-Path $Root "LICENSE") -Destination $bundleStage -Force
    $bundleArchive = Join-Path $OutputDirectory ("LuckyClover-Release-$ReleaseName.zip")
    New-Zip $bundleStage $bundleArchive
    $artifacts.Add($bundleArchive)

    $hashLines = foreach ($artifact in $artifacts) {
        $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
        "{0}  {1}" -f $hash, (Split-Path -Leaf $artifact)
    }
    Set-Content -LiteralPath (Join-Path $OutputDirectory "SHA256SUMS.txt") -Value $hashLines -Encoding UTF8
    Write-Output "发行包已生成: $OutputDirectory"
    $artifacts | ForEach-Object { Write-Output (" - " + (Split-Path -Leaf $_)) }
    Write-Output " - SHA256SUMS.txt"
} finally {
    if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
}
