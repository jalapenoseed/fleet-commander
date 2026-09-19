[CmdletBinding()]
param(
    [string]$Unity = '',
    [switch]$RunSmoke
)
$ErrorActionPreference = 'Stop'
$fleetProject = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$fleetLogs = Join-Path $fleetProject 'Logs'
New-Item -ItemType Directory -Force $fleetLogs | Out-Null
if (-not $Unity) {
    $fleetVersion = ((Get-Content (Join-Path $fleetProject 'ProjectSettings\ProjectVersion.txt') | Select-Object -First 1) -split ': ')[1]
    $fleetCandidates = @($env:UNITY_EDITOR_PATH, ('D:\Unity\Hub\Editor\'+$fleetVersion+'\Editor\Unity.exe'), (Join-Path $env:ProgramFiles ('Unity\Hub\Editor\'+$fleetVersion+'\Editor\Unity.exe')))
    $Unity = $fleetCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $Unity -or -not (Test-Path $Unity)) { throw "Unity Editor not found at $Unity. Pass -Unity with its installed path." }
# Remote process hosts sometimes omit these ordinary Windows path variables.
# Restore only missing paths for this process and its child; do not change user/machine settings.
if (-not $env:PROGRAMDATA) { $env:PROGRAMDATA = [Environment]::GetFolderPath('CommonApplicationData') }
if (-not $env:ALLUSERSPROFILE) { $env:ALLUSERSPROFILE = [Environment]::GetFolderPath('CommonApplicationData') }
function Invoke-FleetUnity([string[]]$FleetArguments) {
    $fleetProcess = Start-Process -FilePath $Unity -ArgumentList $FleetArguments -PassThru -Wait
    if ($fleetProcess.ExitCode -ne 0) {
        throw "Unity exited with code $($fleetProcess.ExitCode). Read $fleetLogs. If Unity reports no valid Editor license, activate your license in Unity Hub and rerun."
    }
}
$fleetResults = Join-Path $fleetLogs 'test-results.xml'
Invoke-FleetUnity @('-batchmode', '-nographics', '-projectPath', "`"$fleetProject`"", '-runTests', '-testPlatform', 'EditMode', '-testResults', "`"$fleetResults`"", '-logFile', "`"$(Join-Path $fleetLogs 'test.log')`"")
if (-not (Test-Path $fleetResults)) { throw 'Unity produced no test result file.' }
[xml]$fleetXml = Get-Content -Raw $fleetResults
if ($fleetXml.'test-run'.result -ne 'Passed') { throw "Unity tests did not pass. See $fleetResults" }
Invoke-FleetUnity @('-batchmode', '-projectPath', "`"$fleetProject`"", '-executeMethod', 'FleetCommander.Editor.FleetBuild.BuildWindows', '-quit', '-logFile', "`"$(Join-Path $fleetLogs 'build.log')`"")
$fleetPlayer = Join-Path $fleetProject 'Builds\Windows\FleetCommander.exe'
if (-not (Test-Path $fleetPlayer)) { throw 'Build did not produce FleetCommander.exe.' }
if ($RunSmoke) {
    $fleetQa = Join-Path $fleetLogs 'PlayerQA'
    $fleetProcess = Start-Process $fleetPlayer -ArgumentList @('-window-mode','windowed','-screen-width','1600','-screen-height','900','-fleetSmoke','-fleetQA',"`"$fleetQa`"",'-logFile',"`"$(Join-Path $fleetLogs 'player.log')`"") -PassThru -Wait
    if ($fleetProcess.ExitCode -ne 0) { throw "Player smoke failed. See $fleetLogs" }
    if (-not (Test-Path (Join-Path $fleetQa 'runtime-smoke.json'))) { throw 'Player did not finish its smoke checks.' }
}
Write-Host "Built: $fleetPlayer"
