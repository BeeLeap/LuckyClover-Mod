# LuckyClover 旧版（单体 v1.3）→ 拆分版（v1.4）数据迁移脚本
# 用法：
#   .\迁移旧版数据.ps1 -ServerRoot "D:\YourServer"        # 预演（只报告，不写入）
#   .\迁移旧版数据.ps1 -ServerRoot "D:\YourServer" -Apply  # 实际执行
param(
    [Parameter(Mandatory = $true)][string]$ServerRoot,
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
$plugins = Join-Path $ServerRoot "plugins"
$old = Join-Path $plugins "LuckyClover-Plugin"

function ReadJsonFile([string]$path) {
    if (-not (Test-Path $path)) { return $null }
    $raw = [IO.File]::ReadAllText($path)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    return $raw | ConvertFrom-Json
}

function WriteJsonFile([string]$path, $obj) {
    $json = $obj | ConvertTo-Json -Depth 32
    # UTF-8 无 BOM —— 游戏/插件要求
    [IO.File]::WriteAllText($path, $json, [Text.UTF8Encoding]::new($false))
}

$actions = @()

if (-not (Test-Path $old)) {
    Write-Host "未找到旧插件目录: $old" -ForegroundColor Red
    exit 1
}

# ---------- 1. 数据文件搬迁 ----------
# 目标插件 => 源数据文件列表
$dataMap = @{
    "LuckyClover-VIP"  = @("titles.json", "customnames.json", "vips.json", "flight.json")
    "LuckyClover-TPA"  = @("teleports.json")
    "LuckyClover-Seat" = @("seat_prefs.json")
}
# 留在原地（核心继续使用）: daily_tasks.json online_time.json mutes.json cinematics.json config.json

foreach ($target in $dataMap.Keys) {
    $targetDir = Join-Path $plugins $target
    if (-not (Test-Path $targetDir)) {
        $actions += "[创建目录] plugins\$target"
        if ($Apply) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
    }
    foreach ($file in $dataMap[$target]) {
        $src = Join-Path $old $file
        $dst = Join-Path $targetDir $file
        if (-not (Test-Path $src)) {
            $actions += "[跳过] $file（旧目录不存在，可能是全新安装）"
            continue
        }
        if ((Test-Path $dst) -and -not $Apply) {
            $actions += "[冲突] $dst 已存在 —— 加 -Apply 也不会覆盖，如需重置请先删除目标文件"
            continue
        }
        if (Test-Path $dst) {
            $actions += "[跳过] $file（目标已存在，保留现有）"
            continue
        }
        $actions += "[复制] $file -> plugins\$target\"
        if ($Apply) { Copy-Item $src $dst }
    }
}

# ---------- 2. 配置键拆分 ----------
# 目标插件 => 需要抽取的顶层键
$configMap = @{
    "LuckyClover-VIP"  = @("chatFormat", "nametagFormat", "titleWrapper", "emptyTitleFallback", "vip", "fly")
    "LuckyClover-TPA"  = @("teleport")
    "LuckyClover-Seat" = @("seatFeature")
    "LuckyClover-Sidebar" = @("sidebar")
}

$oldConfig = ReadJsonFile (Join-Path $old "config.json")
if (-not $oldConfig) {
    $actions += "[警告] 旧 config.json 缺失，跳过配置拆分（新插件将使用默认配置）"
} else {
    foreach ($target in $configMap.Keys) {
        $targetConfigPath = Join-Path (Join-Path $plugins $target) "config.json"
        if (Test-Path $targetConfigPath) {
            $actions += "[跳过] $target\config.json 已存在（插件可能已首启生成），不覆盖"
            continue
        }
        $extracted = [ordered]@{}
        $found = @()
        foreach ($key in $configMap[$target]) {
            $prop = $oldConfig.PSObject.Properties[$key]
            if ($prop) {
                $extracted[$key] = $prop.Value
                $found += $key
            }
        }
        if ($found.Count -eq 0) {
            $actions += "[跳过] $target（旧配置中无对应键）"
            continue
        }
        $actions += "[生成] plugins\$target\config.json  ← 键: $($found -join ', ')"
        if ($Apply) {
            $targetDir = Join-Path $plugins $target
            if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
            WriteJsonFile $targetConfigPath ([ordered]@{} + $extracted)
        }
    }
}

# ---------- 3. 老目录只读标记（提醒别删） ----------
$actions += "[提醒] 旧 plugins\LuckyClover-Plugin 保留原样（核心 v1.4 原地升级只覆盖 .js/manifest，config.json 与 daily_tasks/online_time/mutes/cinematics 数据必须留着）"
$actions += "[提醒] 若服务器装了 sb3_LuckyCloverMC2QQ，其 titles.json 路径暂不变更（按用户指示保持旧路径读取，QQ 头衔停在迁移快照，需要时改 index.js）"

# ---------- 输出 ----------
Write-Host ""
Write-Host $(if ($Apply) { "==== 实际执行 ====" } else { "==== 预演模式（未写入，确认后加 -Apply） ====" }) -ForegroundColor Cyan
foreach ($a in $actions) {
    if ($a.StartsWith("[警告]") -or $a.StartsWith("[冲突]")) { Write-Host $a -ForegroundColor Yellow }
    elseif ($a.StartsWith("[复制]") -or $a.StartsWith("[生成]") -or $a.StartsWith("[创建]")) { Write-Host $a -ForegroundColor Green }
    else { Write-Host $a }
}
Write-Host ""
