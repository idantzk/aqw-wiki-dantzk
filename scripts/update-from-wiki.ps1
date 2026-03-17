param(
  [switch]$FullRescan,
  [int]$MaxItems = 250,
  [int]$RetryCount = 3,
  [int]$RequestTimeoutSec = 25
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $projectRoot "data"
$targetFile = Join-Path $dataDir "WikiItems.json"
$backupDir = Join-Path $dataDir "backups"
$configPath = Join-Path $PSScriptRoot "crawl-config.json"

function Get-JsonConfig {
  param([string]$Path)

  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-ExistingJsonRaw {
  param([string]$Path)

  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
}

function Get-ExistingKeys {
  param([string]$JsonText)

  $matches = [regex]::Matches($JsonText, '"((?:\\.|[^"\\])+)":\s*\[')
  $set = New-Object System.Collections.Generic.HashSet[string]

  foreach ($match in $matches) {
    $rawKey = $match.Groups[1].Value
    $key = [System.Text.RegularExpressions.Regex]::Unescape($rawKey)
    [void]$set.Add((Normalize-ItemName -Name $key))
  }

  return $set
}

function Convert-EntryToJsonFragment {
  param(
    [string]$Name,
    [object]$Entry
  )

  Add-Type -AssemblyName System.Web
  $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $keyJson = $serializer.Serialize($Name)
  $valueJson = $serializer.Serialize($Entry)
  return ($keyJson + ":" + $valueJson)
}

function Append-NewEntriesToJson {
  param(
    [string]$OriginalJson,
    [System.Collections.Generic.List[string]]$Fragments
  )

  if ($Fragments.Count -eq 0) {
    return $OriginalJson
  }

  $trimmed = $OriginalJson.TrimEnd()
  if ($trimmed.EndsWith("}")) {
    $trimmed = $trimmed.Substring(0, $trimmed.Length - 1).TrimEnd()
  }

  if ($trimmed.EndsWith("{")) {
    return $trimmed + [Environment]::NewLine + ($Fragments -join "," + [Environment]::NewLine) + [Environment]::NewLine + "}"
  }

  return $trimmed + "," + [Environment]::NewLine + ($Fragments -join "," + [Environment]::NewLine) + [Environment]::NewLine + "}"
}

function Backup-TargetFile {
  if (-not (Test-Path -LiteralPath $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
  }

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupFile = Join-Path $backupDir "WikiItems-$timestamp.json"
  Copy-Item -LiteralPath $targetFile -Destination $backupFile -Force
  return $backupFile
}

function Get-PageHtml {
  param(
    [string]$Url
  )

  $headers = @{
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AQW-Wiki-Dantzk-Updater"
    "Accept-Language" = "en-US,en;q=0.9,pt-BR;q=0.8"
  }

  for ($attempt = 1; $attempt -le $RetryCount; $attempt += 1) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -Headers $headers -TimeoutSec $RequestTimeoutSec
      return [string]$response.Content
    }
    catch {
      if ($attempt -ge $RetryCount) {
        throw
      }

      Start-Sleep -Seconds ([Math]::Min(2 * $attempt, 5))
    }
  }
}

function Normalize-ItemName {
  param([string]$Name)

  if (-not $Name) { return "" }

  return ($Name `
    -replace '\s+x\d+$', '' `
    -replace '\s*\((Class|Armor|Helm|Cape|Weapon|Pet|Misc|Necklace|Sword|Dagger|Axe|Mace|Polearm|Staff|Wand|Bow|Gun|0 AC|AC|Legend|Non-Legend|Merge|Rare|VIP|Monster|Quest Item)\)', '' `
    -replace '\s*\(Rank\s+\d+\)', '' `
    -replace '\s+', ' ').Trim().ToLower()
}

function Get-CategoryLabel {
  param(
    [string[]]$Breadcrumbs,
    [string]$Slug
  )

  $joined = (($Breadcrumbs -join " ") + " " + $Slug).ToLower()

  if ($joined -match 'class') { return 'classes' }
  if ($joined -match 'armor|armors') { return 'armors' }
  if ($joined -match 'helm|helms') { return 'helms' }
  if ($joined -match 'back item|back-items|cape|cloak') { return 'capes' }
  if ($joined -match 'pet|pets') { return 'pets' }
  if ($joined -match 'sword|axe|dagger|mace|staff|stave|wand|bow|gun|polearm|weapon|weapons') { return 'weapons' }
  if ($joined -match 'quest item|resource|house item|floor item|wall item|misc|items') { return 'items' }

  return 'items'
}

function Is-BlacklistedPageName {
  param([string]$Name)

  $value = ($Name -replace '\s+', ' ').Trim().ToLower()
  if (-not $value) { return $true }

  $exactBlocked = @(
    "search items by tag",
    "commands & canned chat",
    "commands and canned chat",
    "wars",
    "hair shops",
    "merge shops",
    "quests",
    "the story",
    "monsters",
    "factions",
    "locations",
    "items",
    "capes & back items",
    "classes",
    "enhancements",
    "helmets & hoods",
    "grounds",
    "housing",
    "misc. items",
    "misc items",
    "necklaces",
    "weapons",
    "aqworlds wiki",
    "new releases",
    "chaos",
    "cutscene scripts",
    "events",
    "game menu",
    "maps",
    "mini-games",
    "npcs",
    "houses",
    "shields"
  )

  if ($exactBlocked -contains $value) {
    return $true
  }

  if ($value -match 'canned chat') { return $true }
  if ($value -match '^commands\b') { return $true }
  if ($value -match '(^| )map$') { return $true }
  if ($value -match '^book of monsters:') { return $true }
  if ($value -match '^chapter \d+') { return $true }
  if ($value -match ' shops$') { return $true }
  if ($value -match ' maps?$') { return $true }

  return $false
}

function Is-ValidItemPage {
  param(
    [string]$Name,
    [string]$Slug,
    [string]$PageText,
    [string[]]$Breadcrumbs
  )

  if (Is-BlacklistedPageName -Name $Name) {
    return $false
  }

  $slugValue = ($Slug -replace '^/', '').ToLower()
  if ($slugValue -match '^(search-items-by-tag|wars|locations|monsters|quests|factions|new-releases|world|maps|npcs|houses)$') {
    return $false
  }

  $crumbText = (($Breadcrumbs -join " ") -replace '\s+', ' ').Trim().ToLower()
  if ($crumbText -match '\b(other info|locations|monsters|quests|factions|world|homepage|new releases)\b') {
    return $false
  }

  $hasItemSignals =
    $PageText -match '\bPrice:' -or
    $PageText -match '\bSellback:' -or
    $PageText -match '\bRarity:' -or
    $PageText -match '\bDescription:'

  return [bool]$hasItemSignals
}

function Get-BoolFlag {
  param(
    [string]$Text,
    [string]$Pattern
  )

  return [bool]($Text -match $Pattern)
}

function Convert-PriceValue {
  param([string]$Value)

  $clean = ($Value -replace '\s+', ' ').Trim()
  if (-not $clean) { return @("Unknown", "Desconhecido") }

  if ($clean -match '(\d[\d,\.]*)\s*AC') {
    return @("AC", " $($matches[1])")
  }

  if ($clean -match '(\d[\d,\.]*)\s*Gold') {
    return @("GOLD", " $($matches[1])")
  }

  return @("Unknown", $clean)
}

function Extract-FieldText {
  param(
    [string]$Html,
    [string]$FieldName
  )

  $pattern = [regex]::Escape($FieldName) + ':\s*(.+?)(?:\r?\n\r?\n|Image:|Thanks to|Notes?:|Also see|<)'
  $match = [regex]::Match($Html, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $match.Success) {
    return ""
  }

  $value = $match.Groups[1].Value
  $value = [regex]::Replace($value, '<[^>]+>', ' ')
  $value = [System.Net.WebUtility]::HtmlDecode($value)
  return ($value -replace '\s+', ' ').Trim()
}

function Parse-ItemPage {
  param(
    [string]$BaseUrl,
    [string]$Slug
  )

  $url = "$BaseUrl$Slug"
  $html = Get-PageHtml -Url $url

  $titleMatch = [regex]::Match($html, '<title>\s*(.*?)\s*- AQW', 'IgnoreCase')
  if (-not $titleMatch.Success) {
    return $null
  }

  $title = [System.Net.WebUtility]::HtmlDecode($titleMatch.Groups[1].Value).Trim()
  $pageText = [regex]::Replace($html, '<[^>]+>', ' ')
  $pageText = [System.Net.WebUtility]::HtmlDecode($pageText)
  $pageText = $pageText -replace '\s+', ' '

  $breadcrumbMatches = [regex]::Matches($html, 'AQWorlds Wiki\s*&raquo;\s*(.*?)</div>', 'IgnoreCase')
  $breadcrumbs = @()
  if ($breadcrumbMatches.Count -gt 0) {
    $crumbText = [regex]::Replace($breadcrumbMatches[0].Groups[1].Value, '<[^>]+>', ' ')
    $crumbText = [System.Net.WebUtility]::HtmlDecode($crumbText) -replace '\s+', ' '
    $breadcrumbs = $crumbText.Split('»') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  }

  if (-not (Is-ValidItemPage -Name $title -Slug $Slug -PageText $pageText -Breadcrumbs $breadcrumbs)) {
    return $null
  }

  $description = Extract-FieldText -Html $html -FieldName "Description"
  if (-not $description) {
    $description = "N/A"
  }

  $priceText = Extract-FieldText -Html $html -FieldName "Price"
  $sellbackText = Extract-FieldText -Html $html -FieldName "Sellback"
  if (-not $sellbackText) {
    $sellbackText = "N/A"
  }

  $category = Get-CategoryLabel -Breadcrumbs $breadcrumbs -Slug $Slug
  $ac = Get-BoolFlag -Text $pageText -Pattern '\bAC\b'
  $legend = Get-BoolFlag -Text $pageText -Pattern '\bLegend\b'
  $rare = Get-BoolFlag -Text $pageText -Pattern '\bRare Rarity\b|\bRare\b'
  $seasonal = Get-BoolFlag -Text $pageText -Pattern '\bSeasonal\b'

  return @{
    Name = $title
    Entry = @(
      $Slug,
      @("Price", (Convert-PriceValue -Value $priceText)),
      @("Sellback", $sellbackText),
      @("Description", $description),
      @("AC", $ac),
      @("Legend", $legend),
      @("Rare", $rare),
      @("Seasonal", $seasonal),
      $category
    )
  }
}

function Get-SeedLinks {
  param(
    [string]$BaseUrl,
    [string]$SeedPath,
    [string]$Html = ""
  )

  if (-not $Html) {
    $url = "$BaseUrl$SeedPath"
    $Html = Get-PageHtml -Url $url
  }
  $matches = [regex]::Matches($Html, 'href="(/[^"#:\?]+)"')
  $links = New-Object System.Collections.Generic.HashSet[string]

  foreach ($match in $matches) {
    $slug = $match.Groups[1].Value
    if (-not $slug.StartsWith("/")) { continue }
    if ($slug.Length -le 1) { continue }
    if ($slug -match '^/(system:|admin:|search:|forum:|recent-changes|random:|feed:)') { continue }
    if ($slug -match '/(css|js|png|jpg|jpeg|gif|svg|ico|txt|xml)$') { continue }
    if ($slug -eq $SeedPath) { continue }

    [void]$links.Add($slug)
  }

  return $links
}

function Get-PageContext {
  param(
    [string]$BaseUrl,
    [string]$Slug
  )

  $url = "$BaseUrl$Slug"
  $html = Get-PageHtml -Url $url

  $titleMatch = [regex]::Match($html, '<title>\s*(.*?)\s*- AQW', 'IgnoreCase')
  $title = ""
  if ($titleMatch.Success) {
    $title = [System.Net.WebUtility]::HtmlDecode($titleMatch.Groups[1].Value).Trim()
  }

  $pageText = [regex]::Replace($html, '<[^>]+>', ' ')
  $pageText = [System.Net.WebUtility]::HtmlDecode($pageText)
  $pageText = $pageText -replace '\s+', ' '

  $breadcrumbMatches = [regex]::Matches($html, 'AQWorlds Wiki\s*&raquo;\s*(.*?)</div>', 'IgnoreCase')
  $breadcrumbs = @()
  if ($breadcrumbMatches.Count -gt 0) {
    $crumbText = [regex]::Replace($breadcrumbMatches[0].Groups[1].Value, '<[^>]+>', ' ')
    $crumbText = [System.Net.WebUtility]::HtmlDecode($crumbText) -replace '\s+', ' '
    $breadcrumbs = $crumbText.Split('Â»') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  }

  return @{
    Html = $html
    Title = $title
    PageText = $pageText
    Breadcrumbs = $breadcrumbs
  }
}

function Should-ExpandContainerPage {
  param(
    [string]$Slug,
    [string]$Title,
    [string[]]$Breadcrumbs,
    [string]$PageText
  )

  $joined = (($Breadcrumbs -join " ") + " " + $Title + " " + $Slug).ToLower()

  if ($joined -match 'list of all') { return $true }
  if ($joined -match '\bshop\b|\bshops\b') { return $true }
  if ($joined -match '\bmerge\b') { return $true }
  if ($joined -match 'birthday shop') { return $true }
  if ($joined -match 'house item shop') { return $true }
  if ($joined -match 'dark birthday shop') { return $true }
  if ($joined -match 'featured gear') { return $true }
  if ($joined -match 'collection chest') { return $true }

  if ($PageText -match '\bWeapons\b' -and $PageText -match '\bClasses / Armors\b') {
    return $true
  }

  return $false
}

if (-not (Test-Path -LiteralPath $targetFile)) {
  throw "Nao encontrei o arquivo: $targetFile"
}

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "Nao encontrei a configuracao: $configPath"
}

$config = Get-JsonConfig -Path $configPath
$baseUrl = [string]$config.baseUrl
$seedPages = @($config.seedPages)

if (-not $baseUrl -or $seedPages.Count -eq 0) {
  throw "A configuracao do crawler esta incompleta."
}

Write-Host ""
Write-Host "Lendo base atual..."
$existingJson = Get-ExistingJsonRaw -Path $targetFile
$knownNames = Get-ExistingKeys -JsonText $existingJson

$candidateSlugs = New-Object System.Collections.Generic.HashSet[string]
$failedSeeds = New-Object System.Collections.Generic.List[string]

Write-Host "Varrendo paginas-base da Wiki..."
foreach ($seed in $seedPages) {
  try {
    $seedLinks = Get-SeedLinks -BaseUrl $baseUrl -SeedPath $seed
    foreach ($slug in $seedLinks) {
      [void]$candidateSlugs.Add($slug)
    }
    Write-Host "OK $seed -> $($seedLinks.Count) links"
  }
  catch {
    Write-Host "Falha ao ler $seed"
    $failedSeeds.Add($seed) | Out-Null
  }
}

$newEntries = New-Object System.Collections.Generic.List[string]
$newEntryCount = 0
$checked = 0

Write-Host ""
Write-Host "Analisando itens encontrados..."
foreach ($slug in $candidateSlugs) {
  $checked += 1

  if (-not $FullRescan -and $MaxItems -gt 0 -and $checked -gt $MaxItems) {
    Write-Host "Limite da atualizacao rapida atingido ($MaxItems paginas)."
    break
  }

  if (($checked % 25) -eq 0) {
    Write-Host "Progresso: $checked / $($candidateSlugs.Count)"
  }

  try {
    $parsed = Parse-ItemPage -BaseUrl $baseUrl -Slug $slug
    if (-not $parsed) {
      try {
        $pageContext = Get-PageContext -BaseUrl $baseUrl -Slug $slug
        if (Should-ExpandContainerPage -Slug $slug -Title $pageContext.Title -Breadcrumbs $pageContext.Breadcrumbs -PageText $pageContext.PageText) {
          $nestedLinks = Get-SeedLinks -BaseUrl $baseUrl -SeedPath $slug -Html $pageContext.Html
          foreach ($nestedSlug in $nestedLinks) {
            [void]$candidateSlugs.Add($nestedSlug)
          }
        }
      }
      catch {
      }

      continue
    }

    $normalized = Normalize-ItemName -Name $parsed.Name
    if (-not $normalized) { continue }

    if (-not $FullRescan -and $knownNames.Contains($normalized)) {
      continue
    }

    $newEntries.Add((Convert-EntryToJsonFragment -Name $parsed.Name -Entry $parsed.Entry))
    $newEntryCount += 1
    [void]$knownNames.Add($normalized)
    Write-Host "Novo item: $($parsed.Name)"
  }
  catch {
    continue
  }
}

if ($newEntryCount -eq 0) {
  Write-Host ""
  Write-Host "Nenhum item novo encontrado."
  exit 0
}

$backupFile = Backup-TargetFile
$updatedJson = Append-NewEntriesToJson -OriginalJson $existingJson -Fragments $newEntries
Set-Content -LiteralPath $targetFile -Value $updatedJson -Encoding UTF8

Write-Host ""
Write-Host "Atualizacao concluida."
Write-Host "Itens novos adicionados: $newEntryCount"
Write-Host "Paginas verificadas: $checked"
if (-not $FullRescan) {
  if ($MaxItems -gt 0) {
    Write-Host "Modo usado: Atualizacao rapida"
  } else {
    Write-Host "Modo usado: Atualizacao completa"
  }
} else {
  Write-Host "Modo usado: Varredura completa"
}
Write-Host "Backup salvo em: $backupFile"
if ($failedSeeds.Count -gt 0) {
  Write-Host "Seeds com falha: $($failedSeeds -join ', ')"
}
