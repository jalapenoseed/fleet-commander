using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using FleetCommander.Core;
using FleetCommander.Cameras;
using FleetCommander.Rendering;
using FleetCommander.UI;
using UnityEngine;
using UnityEngine.UIElements;
using Cursor = UnityEngine.Cursor;

namespace FleetCommander.Systems
{
    // Opt-in executable QA: exercises the assembled player, captures real GPU frames, then exits.
    public sealed class RuntimeSmoke : MonoBehaviour
    {
        public static bool Running {get;private set;}
        [Serializable] sealed class CheckResult {public string name;public bool passed;public string details;}
        [Serializable] sealed class Report
        {
            public int errors,failedChecks,drones,loadedModelAssets,battleEvents,destructionEvents,width,height;
            public long sixtySimulationStepsMs;
            public float meanRenderFrameMs,maximumRenderFrameMs;
            public string unityVersion,graphicsDevice,graphicsApi,graphicsDriver;
            public CheckResult[] checks;public string[] errorMessages,captures;
        }
        readonly List<CheckResult> checks=new List<CheckResult>();
        readonly List<string> errorMessages=new List<string>(),captures=new List<string>();
        readonly Report report=new Report();
        int errors;string output;bool enabledByCommand;
        SwarmSimulator sim;CommanderUI ui;DroneCameraRig rig;DronePilot pilot;DroneRenderer drones;
        void OnEnable(){enabledByCommand=Array.IndexOf(Environment.GetCommandLineArgs(),"-fleetSmoke")>=0;if(enabledByCommand){Running=true;Application.logMessageReceived+=Log;}}
        void OnDisable(){if(enabledByCommand){Running=false;Application.logMessageReceived-=Log;}}
        void Log(string text,string trace,LogType type)
        {
            if(type!=LogType.Exception&&type!=LogType.Error&&type!=LogType.Assert)return;
            errors++;if(errorMessages.Count<30)errorMessages.Add(text+"\n"+trace);
        }
        void Check(string name,bool passed,string details="")
        {
            checks.Add(new CheckResult{name=name,passed=passed,details=details});
            if(!passed){report.failedChecks++;Debug.LogError("FLEET_SMOKE_CHECK_FAILED "+name+" "+details);}
        }
        IEnumerator Start()
        {
            if(!enabledByCommand)yield break;
            output=Argument("-fleetQA",Path.Combine(Application.persistentDataPath,"QA"));Directory.CreateDirectory(output);
            yield return null;yield return null;
            sim=GetComponent<SwarmSimulator>();ui=GetComponent<CommanderUI>();rig=FindFirstObjectByType<DroneCameraRig>();
            pilot=GetComponent<DronePilot>();drones=GetComponent<DroneRenderer>();
            Check("runtime-components",sim!=null&&ui!=null&&rig!=null&&pilot!=null&&drones!=null);
            if(sim!=null&&ui!=null&&rig!=null&&pilot!=null&&drones!=null)
            {
                var scenario=Scenario();
                while(true)
                {
                    object next;
                    try{if(!scenario.MoveNext())break;next=scenario.Current;}
                    catch(Exception e){Debug.LogException(e);break;}
                    yield return next;
                }
            }
            report.errors=errors;report.checks=checks.ToArray();report.errorMessages=errorMessages.ToArray();report.captures=captures.ToArray();
            report.unityVersion=Application.unityVersion;report.graphicsDevice=SystemInfo.graphicsDeviceName;
            report.graphicsApi=SystemInfo.graphicsDeviceType.ToString();report.graphicsDriver=SystemInfo.graphicsDeviceVersion;
            report.width=Screen.width;report.height=Screen.height;
            File.WriteAllText(Path.Combine(output,"runtime-smoke.json"),JsonUtility.ToJson(report,true));
            Debug.Log("FLEET_RUNTIME_SMOKE errors="+errors+" checks="+checks.Count+" failed="+report.failedChecks+" 2000-drone-60-steps-ms="+report.sixtySimulationStepsMs);
            Application.Quit(errors==0&&report.failedChecks==0?0:1);
        }
        IEnumerator Scenario()
        {
            sim.OnBattleEvent+=e=>{report.battleEvents++;if(e.destruction)report.destructionEvents++;};
            report.loadedModelAssets=drones.LoadedModelAssets;
            Check("imported-models-and-lods",drones.LoadedModelAssets==8,"Loaded "+drones.LoadedModelAssets+" of 8 assets");
            foreach(string page in "Fleet,Squads,Fields,Arena,Sports,Chess,Director,Art Studio,Program,Physics,Nerd Lab,Replays,Journal,Saves,Help".Split(','))
            {ui.OpenPage(page);Check("page-"+page,ui.Page==page);yield return null;}
            sim.Paused=true;sim.Show.Config.speed=42;sim.Show.Config.layers[0].kind=InfluenceKind.Vortex;
            ui.ResetPage("Fields");Check("field-reset-isolated",sim.Show.Config.layers[0].kind==InfluenceKind.None&&sim.Show.Config.speed==42);
            ui.ResetPage("Physics");Check("physics-reset",Mathf.Approximately(sim.Show.Config.speed,new FleetConfig().speed));
            sim.BattleSession.blueWins=3;sim.BattleSession.blueWeapon=WeaponKind.Scatter;ui.ResetPage("Arena");
            Check("arena-reset-retains-score",sim.BattleSession.blueWins==3&&sim.BattleSession.blueWeapon==new BattleSettings().blueWeapon);
            sim.ResetBattleScore();Check("explicit-score-reset",sim.BattleSession.blueWins==0&&sim.BattleSession.redWins==0&&sim.BattleSession.draws==0);
            ui.OpenPage("Fleet");for(int i=0;i<720;i++)sim.Tick(SwarmSimulator.FixedStep);
            rig.Fit();yield return new WaitForSecondsRealtime(1.5f);yield return Capture("show.png");
            foreach(CameraMode mode in Enum.GetValues(typeof(CameraMode)))
            {rig.Mode=mode;yield return null;Check("camera-"+mode,FleetConfig.Finite(rig.transform.position));}
            rig.Mode=CameraMode.Mounted;yield return new WaitForSecondsRealtime(.3f);yield return Capture("mounted.png");

            sim.Resize(4);sim.Paused=true;sim.Show.Config.sky=SkyKind.Day;sim.Show.Config.weather=WeatherKind.Clear;
            for(int i=0;i<4;i++)
            {
                var state=DroneState.Create(i,i,new Vector3((i-1.5f)*4,5,0));state.frame=(FrameKind)i;state.skin=(SkinKind)(i+1);
                state.phase=FlightPhase.Flying;state.rotation=Quaternion.Euler(0,-15,0);sim.Show.States[i]=state;
            }
            ui.Root.style.display=DisplayStyle.None;drones.ShowHealth=false;
            // Use a fixed showcase camera so user mouse input and the previous follow
            // camera's smoothing cannot push aircraft outside the 20 m detail range.
            rig.Mode=CameraMode.Orbit;rig.enabled=false;
            rig.transform.SetPositionAndRotation(new Vector3(0,8,15),Quaternion.LookRotation(new Vector3(0,-3,-15)));
            yield return new WaitForSecondsRealtime(.8f);yield return Capture("drone-models.png");
            Check("model-showcase-detailed",drones.LastDetailedDrones==4,"Detailed aircraft: "+drones.LastDetailedDrones);
            rig.enabled=true;ui.Root.style.display=DisplayStyle.Flex;drones.ShowHealth=true;

            sim.StartBattle(4);sim.Paused=true;sim.Config.wind=0;sim.Config.boids=false;sim.Config.obstacles=false;sim.Config.unlimited=true;
            sim.BattleSession.gameDamage=5;sim.BattleSession.fireInterval=.45f;
            StageArena(10,12);
            for(int i=0;i<90;i++)sim.Tick(SwarmSimulator.FixedStep);
            // Stop immediately after a genuine simulation firing event so the frozen frame has visible tracers.
            for(int i=0;i<60;i++){sim.Tick(SwarmSimulator.FixedStep);if(sim.Active.Events.Count>0)break;}
            Check("arena-produces-fire-and-damage",report.battleEvents>0&&sim.Arena.BlueDamage+sim.Arena.RedDamage>0);
            ui.OpenPage("Arena");rig.Mode=CameraMode.Orbit;rig.Focus=new Vector3(0,12,0);rig.Distance=46;rig.Yaw=35;rig.Pitch=23;
            yield return new WaitForSecondsRealtime(.35f);yield return Capture("arena.png");
            int victim=Living(1);Check("live-enemy-for-destruction",victim>=0);
            if(victim>=0)
            {
                EmitDamage(victim,10000,Living(0));for(int i=0;i<15;i++)sim.Tick(SwarmSimulator.FixedStep);
                Check("destruction-event-and-falling",report.destructionEvents>0&&sim.Arena.States[victim].disabled&&sim.Arena.States[victim].destructionAge>0);
                yield return new WaitForSecondsRealtime(.2f);yield return Capture("destruction.png");
            }

            sim.StartBattle(4);sim.Paused=true;sim.Config.wind=0;sim.Config.boids=false;sim.Config.obstacles=false;sim.Config.unlimited=true;
            StageArena(6,12);sim.BattleSession.engage=false;
            Check("join-blue",pilot.JoinBlue()&&pilot.IsPiloting&&sim.Arena.States[pilot.DroneIndex].fleetId==0);
            sim.Paused=true;int controlled=pilot.DroneIndex;Vector3 before=sim.Arena.States[controlled].position;
            sim.Arena.SetPilotInput(Vector3.forward,Vector3.right,false);
            for(int i=0;i<60;i++)sim.Tick(SwarmSimulator.FixedStep);
            Check("pilot-movement-controls-state",sim.Arena.States[controlled].position.z>before.z+4&&Mathf.Abs(sim.Arena.States[controlled].position.x-before.x)<1);
            sim.BattleSession.engage=true;int ammo=sim.Arena.States[controlled].payloads;sim.Payload();
            Check("paused-payload-does-not-fire",sim.Arena.States[controlled].payloads==ammo);
            sim.BattleSession.engage=true;sim.Arena.States[1].position=sim.Arena.States[controlled].position+Vector3.right*10;
            sim.Arena.States[1].health=100;sim.Arena.States[controlled].cooldown=0;
            sim.Arena.SetPilotInput(Vector3.zero,Vector3.right,true);sim.Tick(SwarmSimulator.FixedStep);
            bool pilotHit=false;foreach(var e in sim.Arena.Events)if(e.source==controlled&&e.victim==1&&e.impact)pilotHit=true;
            Check("pilot-fire-damages-enemy",pilotHit&&sim.Arena.States[1].health<100);
            sim.Arena.SetPilotInput(Vector3.zero,Vector3.right,false);
            pilot.CycleView();Check("pilot-fpv-view",rig.Mode==CameraMode.FPV);pilot.CycleView();Check("pilot-mounted-view",rig.Mode==CameraMode.Mounted);
            pilot.CycleView();Check("pilot-shoulder-view",rig.Mode==CameraMode.Shoulder);
            ui.OpenPage("Arena");yield return new WaitForSecondsRealtime(.25f);yield return Capture("pilot-shoulder.png");
            pilot.CycleView();yield return new WaitForSecondsRealtime(.2f);yield return Capture("pilot-fpv.png");
            Check("pilot-camera-finite",pilot.CameraPose(out var cameraPosition,out var cameraRotation)&&FleetConfig.Finite(cameraPosition));
            Check("replay-starts",sim.Replay.Play());ui.OpenPage("Replays");yield return null;yield return null;
            Check("replay-releases-pilot",!pilot.IsPiloting&&!pilot.InputCaptured&&sim.Arena.ControlledDrone==-1);
            yield return new WaitForSecondsRealtime(.2f);yield return Capture("replay.png");sim.ExitReplay();sim.Selected=0;
            Check("join-selected-after-replay",pilot.JoinSelected()&&pilot.IsPiloting);sim.Paused=true;
            pilot.ReleaseCursor();Check("cursor-release-keeps-joined",pilot.IsPiloting&&!pilot.InputCaptured&&Cursor.lockState!=CursorLockMode.Locked);
            pilot.LeavePilot();Check("leave-restores-ai",!pilot.IsPiloting&&sim.Arena.ControlledDrone==-1);
            Check("join-red",pilot.JoinRed()&&sim.Arena.States[pilot.DroneIndex].fleetId==1);sim.Paused=true;
            EmitDamage(pilot.DroneIndex,10000,Living(0));sim.Tick(SwarmSimulator.FixedStep);yield return null;yield return null;
            Check("death-releases-pilot-and-spectates",!pilot.IsPiloting&&!pilot.InputCaptured&&sim.Arena.ControlledDrone==-1&&rig.Mode==CameraMode.Survivor,
                "piloting="+pilot.IsPiloting+" captured="+pilot.InputCaptured+" controlled="+sim.Arena.ControlledDrone+" camera="+rig.Mode);

            sim.ResetBattleScore();sim.StartBattle(4);sim.Paused=true;StageArena(10,12);
            int rounds=0;Action<FleetWorld> finished=w=>rounds++;sim.OnRoundFinished+=finished;
            for(int i=0;i<sim.Arena.Count;i++)if(sim.Arena.States[i].fleetId==1)EmitDamage(i,10000,0);
            sim.Tick(SwarmSimulator.FixedStep);for(int i=0;i<15;i++)sim.Tick(SwarmSimulator.FixedStep);
            Check("winner-and-score-once",sim.Arena.Winner==0&&sim.Arena.BlueKills==4&&sim.BattleSession.blueWins==1&&rounds==1);
            ui.OpenPage("Arena");rig.Mode=CameraMode.Orbit;rig.Focus=new Vector3(0,10,0);rig.Distance=44;rig.Yaw=35;rig.Pitch=23;
            yield return new WaitForSecondsRealtime(.3f);
            var winnerBanner=ui.Root.Q<Label>(className:"round-banner");
            Check("winner-hud-visible",winnerBanner!=null&&winnerBanner.text.Contains("BLUE WINS")&&winnerBanner.worldBound.width>0);
            yield return Capture("winner.png");
            sim.Rematch();sim.Paused=true;
            Check("rematch-preserves-series-clears-round",sim.BattleSession.blueWins==1&&sim.Arena.Winner==-1&&sim.Arena.BlueKills==0&&sim.Arena.RedKills==0);
            float showSpeed=sim.Show.Config.speed;sim.Arena.Config.speed=showSpeed+2;
            Check("arena-config-isolated",!ReferenceEquals(sim.Arena.Config,sim.Show.Config)&&Mathf.Approximately(sim.Show.Config.speed,showSpeed));
            sim.OnRoundFinished-=finished;

            sim.EndBattle();
            foreach(SportKind sport in Enum.GetValues(typeof(SportKind)))
            {
                ui.SportsSetup=new SportsSettings{sport=sport,seconds=30,targetScore=99};ui.StartSports();sim.Paused=true;
                for(int tick=0;tick<600;tick++)sim.Tick(SwarmSimulator.FixedStep);
                yield return new WaitForSecondsRealtime(.6f);yield return Capture("sports-"+sport+".png");
                Check("sports-"+sport,sim.Sports.World.Count==10&&!sim.Sports.World.IsBattle);
                for(int tick=0;tick<1300;tick++)sim.Tick(SwarmSimulator.FixedStep);
                Check("sports-end-"+sport,sim.Sports.Ended&&sim.Sports.Remaining==0);
            }
            sim.EndBattle();ui.OpenPage("Chess");yield return null;
            ui.ClickChess(12);ui.ClickChess(28);yield return new WaitForSecondsRealtime(.8f);
            Check("chess-board-64-squares",ui.Root.Query<Button>().ToList().FindAll(b=>b.name!=null&&b.name.StartsWith("square-")).Count==64);
            Check("chess-player-and-ai",ui.Chess.History.Count==2&&ui.Chess.Turn==1);
            Check("chess-board-inside-window",ui.Root.Q<Button>("square-a1").worldBound.yMax<ui.Root.resolvedStyle.height-72);
            yield return Capture("chess.png");
            Screen.SetResolution(1280,720,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.6f);
            Check("chess-board-small-window",ui.Root.Q<Button>("square-a1").worldBound.yMax<ui.Root.resolvedStyle.height-72);
            yield return Capture("chess-1280.png");Screen.SetResolution(1600,900,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.5f);
            ui.OpenPage("Fleet");ui.ToggleUI();yield return null;
            Check("menu-restore-button",ui.MenusHidden&&ui.Root.Q<Button>("restore-menus").resolvedStyle.display==DisplayStyle.Flex);
            ui.ToggleUI();Check("menus-restored",!ui.MenusHidden);
            foreach(SceneryKind scenery in new[]{SceneryKind.Alpine,SceneryKind.Meadow,SceneryKind.River,SceneryKind.Coast})
            {sim.Config.scenery=scenery;sim.Config.sky=SkyKind.Day;rig.Fit();rig.Distance=240;rig.Pitch=12;rig.Yaw=scenery==SceneryKind.Coast?90:0;yield return new WaitForSecondsRealtime(.4f);yield return Capture("scenery-"+scenery+".png");}
            sim.Config.scenery=SceneryKind.Stadium;
            sim.EndBattle();sim.Resize(2000);sim.LaunchAll();sim.Paused=true;
            var watch=System.Diagnostics.Stopwatch.StartNew();for(int i=0;i<60;i++)sim.Tick(SwarmSimulator.FixedStep);watch.Stop();
            report.sixtySimulationStepsMs=watch.ElapsedMilliseconds;report.drones=sim.Active.Count;
            bool finite=true;foreach(var state in sim.Active.States)finite&=FleetConfig.Finite(state.position)&&FleetConfig.Finite(state.velocity);
            Check("2000-drone-finite-state",sim.Active.Count==2000&&finite);
            ui.OpenPage("Fleet");rig.Fit();yield return new WaitForSecondsRealtime(.5f);
            float total=0,maximum=0;for(int i=0;i<60;i++){yield return null;float ms=Time.unscaledDeltaTime*1000;total+=ms;maximum=Mathf.Max(maximum,ms);}
            report.meanRenderFrameMs=total/60;report.maximumRenderFrameMs=maximum;
            yield return Capture("2000-drones.png");
            Check("all-captures-saved",captures.Count==19,"Captured "+captures.Count+" frames");
        }
        void StageArena(float spread,float height)
        {
            for(int i=0;i<sim.Arena.Count;i++)
            {
                ref var state=ref sim.Arena.States[i];state.position=new Vector3(state.fleetId==0?-spread:spread,height,(i/2-1.5f)*4);
                state.velocity=Vector3.zero;state.rotation=Quaternion.LookRotation(state.fleetId==0?Vector3.right:Vector3.left);
            }
        }
        int Living(int team)
        {for(int i=0;i<sim.Arena.Count;i++)if(sim.Arena.States[i].fleetId==team&&!sim.Arena.States[i].disabled&&sim.Arena.States[i].phase==FlightPhase.Flying)return i;return -1;}
        void EmitDamage(int target,float amount,int source)
        {
            int first=sim.Active.Events.Count;sim.Active.ApplyDamage(target,amount,source);
            for(int i=first;i<sim.Active.Events.Count;i++){var e=sim.Active.Events[i];sim.OnBattleEvent?.Invoke(e);sim.Replay.AddEvent(e);}
        }
        IEnumerator Capture(string name)
        {
            yield return new WaitForEndOfFrame();Texture2D texture=null;
            try
            {
                texture=ScreenCapture.CaptureScreenshotAsTexture();
                if(texture==null||texture.width<320||texture.height<200)Check("capture-"+name,false,"No usable rendered frame");
                else {File.WriteAllBytes(Path.Combine(output,name),texture.EncodeToPNG());captures.Add(name);}
            }
            catch(Exception e){Debug.LogException(e);}
            finally{if(texture!=null)Destroy(texture);}
        }
        public static string Argument(string key,string fallback){var a=Environment.GetCommandLineArgs();int i=Array.IndexOf(a,key);return i>=0&&i+1<a.Length?a[i+1]:fallback;}
    }
}
