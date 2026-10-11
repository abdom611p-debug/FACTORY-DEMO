<#
  EGIC - AI Safety & Smart Access Platform - Desktop launcher (Windows)
  POWERED BY DELMON & DEV SMART X

  * If Node.js is installed  -> runs the full backend (REST API + live stream + evidence storage on this PC).
  * If Node.js is not found  -> runs a built-in local web server (no install, no admin rights);
                               the platform engine then runs inside the browser and saves to the browser's storage.
  Either way the AI models run 100% on this computer (no cloud) and the app opens in its own window.
#>
param(
  [ValidateSet('console', 'briefing')] [string] $Page = 'console',
  [int] $Port = 8080
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
try { $Host.UI.RawUI.WindowTitle = 'EGIC Platform - POWERED BY DELMON & DEV SMART X' } catch { }

function Banner {
  Write-Host ''
  Write-Host '   EGIC  -  AI Safety & Smart Access Platform' -ForegroundColor Green
  Write-Host '   POWERED BY DELMON & DEV SMART X' -ForegroundColor DarkYellow
  Write-Host ''
}

function Test-Egic([int] $p) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "http://127.0.0.1:$p/console.html"
    return ($r.StatusCode -eq 200 -and $r.Content -match 'EGIC')
  } catch { return $false }
}
function Test-PortFree([int] $p) {
  try { $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p); $l.Start(); $l.Stop(); return $true } catch { return $false }
}

function Open-App([string] $url) {
  $edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  $browser = if ($edge) { $edge } elseif ($chrome) { $chrome } else { $null }
  try {
    if ($browser) { Start-Process -FilePath $browser -ArgumentList @("--app=$url", '--start-maximized', '--autoplay-policy=no-user-gesture-required') }
    else { Start-Process $url }
  } catch {
    Write-Host "   Open this address in Edge or Chrome:  $url" -ForegroundColor Yellow
  }
}

$target = if ($Page -eq 'briefing') { 'index.html' } else { 'console.html' }

Banner

# ---------------------------------------------------------------- model packs (delivered as separate zips)
function Install-ModelPacks {
  $home2 = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
  $places = @($Root, (Split-Path $Root -Parent), (Join-Path $home2 'Downloads'), (Join-Path $home2 'Desktop')) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  foreach ($dir in $places) {
    foreach ($z in (Get-ChildItem -Path $dir -Filter 'EGIC-Platform-*models*.zip' -File -ErrorAction SilentlyContinue)) {
      $marker = Join-Path $Root ('assets/models/.installed-' + $z.BaseName)
      if (Test-Path $marker) { continue }
      Write-Host ("   Installing AI model pack: " + $z.Name) -ForegroundColor Gray
      try {
        Expand-Archive -Path $z.FullName -DestinationPath $Root -Force
        New-Item -ItemType File -Path $marker -Force | Out-Null
      } catch { Write-Host ("   Could not extract " + $z.Name + ": " + $_.Exception.Message) -ForegroundColor Yellow }
    }
  }
  if (-not (Test-Path (Join-Path $Root 'assets/models/ppe_s/model.json'))) {
    Write-Host '   PPE model pack not found. Put EGIC-Platform-2-models-ppe.zip in Downloads (or next to this folder) and start again.' -ForegroundColor Yellow
  }
}
Install-ModelPacks

# Already running (e.g. the second shortcut)? just open another window.
if (Test-Egic $Port) {
  Write-Host "   Platform already running on http://localhost:$Port/  - opening window..." -ForegroundColor Gray
  Open-App "http://localhost:$Port/$target"
  Start-Sleep -Seconds 1
  exit 0
}
if (-not (Test-PortFree $Port)) {
  foreach ($p in 8081..8099) { if (Test-PortFree $p) { $Port = $p; break } }
}
$url = "http://localhost:$Port/$target"

# ---------------------------------------------------------------- Node.js backend (preferred)
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  Write-Host "   Starting EGIC backend (Node.js $((& node -v) 2>$null)) on port $Port ..." -ForegroundColor Gray
  $env:PORT = "$Port"; $env:HOST = '127.0.0.1'
  Start-Process -FilePath $node.Source -ArgumentList @('server\server.js') -WorkingDirectory $Root -WindowStyle Minimized
  for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 250; if (Test-Egic $Port) { break } }
  Write-Host "   Backend online  ->  $url" -ForegroundColor Green
  Write-Host '   (The backend keeps running in a minimized window. Close it to stop the platform.)' -ForegroundColor DarkGray
  Open-App $url
  Start-Sleep -Seconds 2
  exit 0
}

# ---------------------------------------------------------------- Built-in local server (no install needed)
$Mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.bin' = 'application/octet-stream'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'; '.svg' = 'image/svg+xml'
  '.ico' = 'image/x-icon'; '.webp' = 'image/webp'; '.woff2' = 'font/woff2'; '.woff' = 'font/woff'; '.mp4' = 'video/mp4'; '.wasm' = 'application/wasm'; '.onnx' = 'application/octet-stream'; '.mjs' = 'text/javascript; charset=utf-8'
  '.webm' = 'video/webm'; '.webmanifest' = 'application/manifest+json'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
}
$Sep = [System.IO.Path]::DirectorySeparatorChar
$RootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd($Sep) + $Sep

function Send([System.Net.Sockets.NetworkStream] $s, [int] $code, [string] $status, [string] $type, [byte[]] $body, [int] $offset, [int] $length, [string] $extra, [bool] $head) {
  $hdr = "HTTP/1.1 $code $status`r`nContent-Type: $type`r`nContent-Length: $length`r`nCache-Control: no-cache`r`nAccept-Ranges: bytes`r`nX-Powered-By: DELMON & DEV SMART X`r`nConnection: close`r`n$extra`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($hdr)
  $s.Write($hb, 0, $hb.Length)
  if (-not $head -and $length -gt 0) { $s.Write($body, $offset, $length) }
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "   Local server online  ->  $url" -ForegroundColor Green
Write-Host '   Node.js not found: the platform engine runs inside the app window (demo data + your live AI captures).' -ForegroundColor DarkGray
Write-Host '   Keep this window open while presenting. Close it to stop the platform.' -ForegroundColor Yellow
Write-Host ''
Open-App $url

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 5000
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)
    $line = $reader.ReadLine()
    if ([string]::IsNullOrEmpty($line)) { continue }
    $headers = @{}
    while ($true) {
      $h = $reader.ReadLine()
      if ([string]::IsNullOrEmpty($h)) { break }
      $i = $h.IndexOf(':'); if ($i -gt 0) { $headers[$h.Substring(0, $i).Trim().ToLower()] = $h.Substring($i + 1).Trim() }
    }
    $parts = $line.Split(' ')
    $method = $parts[0]; $head = ($method -eq 'HEAD')
    $raw = ($parts[1] -split '\?')[0]
    $path = [Uri]::UnescapeDataString($raw)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $rel = $path.TrimStart('/').Replace('/', $Sep)
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
    $blocked = (-not $full.StartsWith($RootFull, [System.StringComparison]::OrdinalIgnoreCase)) -or ($rel -match '^(server|launcher|data)[\\/]')
    if ($blocked -or -not [System.IO.File]::Exists($full)) {
      $b = [System.Text.Encoding]::UTF8.GetBytes('{"error":"not_found"}')
      Send $stream 404 'Not Found' 'application/json' $b 0 $b.Length '' $head
      continue
    }
    $ext = [System.IO.Path]::GetExtension($full).ToLower()
    $type = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $range = $headers['range']
    if ($range -and $range -match 'bytes=(\d*)-(\d*)') {
      $start = if ($Matches[1]) { [int64]$Matches[1] } else { 0 }
      $end = if ($Matches[2]) { [int64]$Matches[2] } else { $bytes.Length - 1 }
      if ($end -ge $bytes.Length) { $end = $bytes.Length - 1 }
      $len = [int]($end - $start + 1)
      Send $stream 206 'Partial Content' $type $bytes ([int]$start) $len ("Content-Range: bytes $start-$end/$($bytes.Length)`r`n") $head
    } else {
      Send $stream 200 'OK' $type $bytes 0 $bytes.Length '' $head
    }
  } catch {
    # client went away - ignore
  } finally {
    $client.Close()
  }
}
