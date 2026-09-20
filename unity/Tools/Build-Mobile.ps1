[CmdletBinding()]
param(
    [ValidateSet('Android','iOS')]
    [string]$Platform='Android',
    [string]$Unity=''
)
$ErrorActionPreference='Stop'
$fleetProject=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$fleetLogs=Join-Path $fleetProject 'Logs'
New-Item -ItemType Directory -Force $fleetLogs | Out-Null

if(-not $Unity){
    $fleetVersion=((Get-Content (Join-Path $fleetProject 'ProjectSettings\ProjectVersion.txt') | Select-Object -First 1) -split ': ')[1]
    $fleetCandidates=@(
        $env:UNITY_EDITOR_PATH,
        ('D:\Unity\Hub\Editor\'+$fleetVersion+'\Editor\Unity.exe'),
        (Join-Path $env:ProgramFiles ('Unity\Hub\Editor\'+$fleetVersion+'\Editor\Unity.exe')),
        ('/Applications/Unity/Hub/Editor/'+$fleetVersion+'/Unity.app/Contents/MacOS/Unity')
    )
    $Unity=$fleetCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if(-not $Unity -or -not (Test-Path $Unity)){throw 'Unity Editor not found. Pass -Unity with its installed path.'}

$method=if($Platform -eq 'Android'){'FleetCommander.Editor.FleetBuild.BuildAndroid'}else{'FleetCommander.Editor.FleetBuild.BuildIOS'}
$log=Join-Path $fleetLogs ('build-mobile-'+$Platform.ToLower()+'.log')
$quotedProject='"'+$fleetProject+'"'
$quotedLog='"'+$log+'"'
$process=Start-Process -FilePath $Unity -ArgumentList @(
    '-batchmode',
    '-projectPath',$quotedProject,
    '-executeMethod',$method,
    '-quit',
    '-logFile',$quotedLog
) -PassThru -Wait

if($process.ExitCode -ne 0){throw ('Unity mobile build failed with code '+$process.ExitCode+'. See '+$log)}
Write-Host ('Fleet Commander mobile '+$Platform+' build completed.')