<#
  Creates desktop shortcuts for the EGIC platform (icon included).
  POWERED BY DELMON & DEV SMART X
#>
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Bat = Join-Path $Root 'EGIC Platform.bat'
$Icon = Join-Path $Root 'assets\icon.ico'
$Desk = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell

$items = @(
  @{ Name = 'EGIC Platform'; Args = 'console'; Desc = 'EGIC AI Safety & Smart Access Platform - POWERED BY DELMON & DEV SMART X' },
  @{ Name = 'EGIC Executive Briefing'; Args = 'briefing'; Desc = 'EGIC Executive Briefing - POWERED BY DELMON & DEV SMART X' }
)
foreach ($it in $items) {
  $lnk = $ws.CreateShortcut((Join-Path $Desk ($it.Name + '.lnk')))
  $lnk.TargetPath = $Bat
  $lnk.Arguments = $it.Args
  $lnk.WorkingDirectory = $Root
  $lnk.IconLocation = "$Icon,0"
  $lnk.Description = $it.Desc
  $lnk.WindowStyle = 7
  $lnk.Save()
  Write-Host ("  + " + $it.Name) -ForegroundColor Green
}
# Start-menu entry too
$sm = Join-Path ([Environment]::GetFolderPath('Programs')) 'EGIC Platform.lnk'
$l2 = $ws.CreateShortcut($sm); $l2.TargetPath = $Bat; $l2.Arguments = 'console'; $l2.WorkingDirectory = $Root; $l2.IconLocation = "$Icon,0"; $l2.WindowStyle = 7; $l2.Save()
Write-Host ''
Write-Host '  Shortcuts created on the Desktop and in the Start menu.' -ForegroundColor Gray
Write-Host '  POWERED BY DELMON & DEV SMART X' -ForegroundColor DarkYellow
