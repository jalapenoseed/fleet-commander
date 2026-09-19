[CmdletBinding()]
param([string]$EditorData='C:\Program Files\Unity\Hub\Editor\6000.2.1f1\Editor\Data')
$ErrorActionPreference='Stop'
$fleetRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$fleetOut=Join-Path $fleetRoot 'Logs\Portable'
New-Item -ItemType Directory -Force $fleetOut | Out-Null
$fleetNunit=Get-ChildItem (Join-Path $fleetRoot 'Library\PackageCache') -Recurse -Filter 'nunit.framework.dll' | Select-Object -First 1
if(-not $fleetNunit){throw 'Import the project packages first to obtain NUnit.'}
$fleetRefs=Join-Path $EditorData 'UnityReferenceAssemblies\unity-4.8-api'
$fleetArgs=@('-noconfig','-nostdlib+','-target:exe','-langversion:9','-define:FLEET_PORTABLE',('-out:"'+(Join-Path $fleetOut 'FleetPortableTests.exe')+'"'))
foreach($fleetDll in @('mscorlib.dll','System.dll','System.Core.dll','System.Numerics.dll','System.Web.Extensions.dll','Facades\netstandard.dll')){$fleetArgs+=('-r:"'+(Join-Path $fleetRefs $fleetDll)+'"')}
$fleetArgs+=('-r:"'+$fleetNunit.FullName+'"')
$fleetSources=@('Core\BehaviorStack.cs','Core\DroneState.cs','Core\SwarmSettings.cs','Core\FormationMath.cs','Core\SpatialHash.cs','Core\FleetWorld.cs','Systems\ArtStudio.cs','Systems\ReplayBuffer.cs','Systems\FleetStorage.cs','Systems\CueProgram.cs')
foreach($fleetSource in $fleetSources){$fleetArgs+='"'+(Join-Path $fleetRoot ('Assets\FleetCommander\Scripts\'+$fleetSource))+'"'}
$fleetArgs+='"'+(Join-Path $PSScriptRoot 'Portable\MathAdapter.cs')+'"'
$fleetArgs+='"'+(Join-Path $PSScriptRoot 'Portable\TestMain.cs')+'"'
Get-ChildItem (Join-Path $fleetRoot 'Assets\FleetCommander\Tests\EditMode') -Filter '*.cs' | ForEach-Object {$fleetArgs+='"'+$_.FullName+'"'}
$fleetRsp=Join-Path $fleetOut 'portable.rsp'
[IO.File]::WriteAllLines($fleetRsp,$fleetArgs)
& (Join-Path $EditorData 'NetCoreRuntime\dotnet.exe') (Join-Path $EditorData 'DotNetSdkRoslyn\csc.dll') ('@'+$fleetRsp)
if($LASTEXITCODE -ne 0){throw 'Portable test compilation failed.'}
Copy-Item $fleetNunit.FullName (Join-Path $fleetOut 'nunit.framework.dll') -Force
& (Join-Path $fleetOut 'FleetPortableTests.exe') | Tee-Object (Join-Path $fleetOut 'results.txt')
if($LASTEXITCODE -ne 0){throw 'Portable CPU checks failed.'}
Write-Host 'Portable checks do not validate Unity serialization, graphics, UI, sound, or player exports.'
