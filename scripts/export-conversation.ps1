param(
    [Parameter(Mandatory = $true)][string]$SessionFile
)
$ErrorActionPreference = 'Stop'
$archiveDir = Join-Path (Split-Path $PSScriptRoot -Parent) '对话'
$messages = @()
foreach ($line in Get-Content -LiteralPath $SessionFile -Encoding utf8) {
    $entry = $line | ConvertFrom-Json
    if ($entry.type -ne 'response_item' -or $entry.payload.type -ne 'message' -or $entry.payload.role -notin @('user', 'assistant')) { continue }
    $parts = @()
    foreach ($part in $entry.payload.content) {
        if ($part.type -notin @('input_text', 'output_text')) { continue }
        $body = $part.text
        foreach ($tag in @('in-app-browser-context', 'environment_context', 'external_codex_apps_open_page')) {
            $body = [regex]::Replace($body, "(?s)<$tag\b.*?</$tag>", '')
        }
        $body = $body.Trim()
        if ($body -match '^# AGENTS\.md instructions') { continue }
        if ($body) { $parts += $body }
    }
    if ($parts.Count) { $messages += [pscustomobject]@{timestamp=$entry.timestamp; role=$entry.payload.role; text=($parts -join "`n`n")} }
}
if (-not $messages.Count) { throw 'No user or assistant messages found; existing archive preserved.' }
$jsonPath = Join-Path $archiveDir '2026-10-26-项目恢复与备份.json'
$mdPath = Join-Path $archiveDir '2026-10-26-项目恢复与备份.md'
$messages | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $jsonPath -Encoding utf8
$markdown = "# 项目恢复与仓库备份对话`n`n归档日期：2026-10-26（北京时间）。包含截至本次导出时已写入会话文件的用户与助手可见文字。排除自动环境元数据、系统指令、工具日志及内部推理。导出之后的消息需再次导出和推送。`n"
foreach ($message in $messages) {
    $label = if ($message.role -eq 'user') { '用户' } else { '助手' }
    $markdown += "`n## $label`n`n$($message.text)`n"
}
Set-Content -LiteralPath $mdPath -Value $markdown -Encoding utf8
Write-Output "Exported $($messages.Count) messages."
