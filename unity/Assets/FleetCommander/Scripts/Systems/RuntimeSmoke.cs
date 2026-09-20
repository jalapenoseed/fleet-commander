using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using FleetCommander.Core;
using FleetCommander.Games;
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
            Check("imported-models-and-lods",drones.LoadedModelAssets==12,"Loaded "+drones.LoadedModelAssets+" of 12 assets");
            foreach(string page in "Fleet,Squads,Fields,Arena,Sports,Drone Range,Chess,Director,Cameras,Art Studio,Night Brite,Program,Physics,Nerd Lab,Logic Lab,Systems,Settings,Replays,Journal,Saves,Help".Split(','))
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

            // Integrated games, clean-screen controls and all reference landscapes.
            sim.EndBattle();ui.SetMenusVisible(false);yield return null;Check("hide-menus-restorable",ui.MenusHidden&&ui.Root.Q<Button>(className:"restore-menus").resolvedStyle.display==DisplayStyle.Flex);ui.SetMenusVisible(true);Check("restore-menus",!ui.MenusHidden);
            sim.BattleSession.bluePlan.Preset(0,"Balanced wings");sim.StartBattle(8);sim.Paused=true;rig.Overview();yield return null;Check("arena-opening-wide-and-stable",rig.Mode==CameraMode.Orbit&&!rig.AutoFocus&&rig.Distance>=200&&rig.transform.position.y>80);var focus=rig.Focus;rig.Pan(10,5);Check("manual-camera-pan",Vector3.Distance(focus,rig.Focus)>10);yield return Capture("arena-overview.png");
            foreach(SportKind sport in Enum.GetValues(typeof(SportKind)))
            {
                var sportsSetup=new SportsSettings{sport=sport,seconds=30,targetScore=24};sportsSetup.blue.frames[1]=FrameKind.Cargo;sim.StartSports(sport,30,sportsSetup);sim.Paused=true;for(int tick=0;tick<240;tick++)sim.Tick(1f/60);ui.OpenPage("Sports");rig.Overview(true);yield return new WaitForSecondsRealtime(.4f);
                Check("field-"+sport,GetComponent<GameFieldRenderer>().HasField);if(!sim.Sports.IsToy)Check("sports-roster-"+sport,sim.Sports.Settings!=null&&sim.Active.States[2].frame==FrameKind.Cargo);if(sport==SportKind.FlagFootball)Check("football-first-down-marker",GameObject.Find("First down line · yellow")!=null);yield return Capture("game-"+sport+".png");
                for(int tick=0;tick<1900;tick++)sim.Tick(1f/60);Check("ending-"+sport,sim.Sports.Finished&&sim.Sports.Winner>=0);
            }
            sim.StartChess(false);sim.Paused=false;ui.OpenPage("Chess");ui.ChessSquare(12);ui.ChessSquare(28);yield return new WaitForSecondsRealtime(.4f);Check("chess-click-move",sim.Chess.Board[28]==ChessGame.Pawn&&sim.Chess.Side==-1);Check("chess-modeled-pieces",GetComponent<ChessBoardRenderer>().PieceCount==32);yield return Capture("chess.png");ui.ChessFlipped=true;yield return new WaitForSecondsRealtime(.15f);Check("chess-flip-board",rig.transform.position.z>0);ui.ChessFlipped=false;
            sim.StartChess(true,-1);ui.OpenPage("Chess");float aiWait=0;while(sim.Chess.Side==1&&aiWait<15){yield return null;aiWait+=Time.unscaledDeltaTime;}Check("chess-computer-turn",sim.Chess.History.Count>=1&&sim.Chess.Side==-1);sim.EndBattle();
            sim.StartRange();sim.Paused=true;ui.OpenPage("Drone Range");pilot.JoinBlue();sim.Paused=true;rig.Mode=CameraMode.FPV;yield return new WaitForSecondsRealtime(.3f);Check("range-field",GetComponent<RangeRenderer>().HasRange);var rt=sim.Range.Targets[0];sim.Range.Fire(sim.Active.States[0].position,rt.position-sim.Active.States[0].position);Check("range-hit-scores",sim.Range.Hits==1&&sim.Range.Score>0);for(int tick=0;tick<180;tick++)sim.Tick(1f/60);yield return new WaitForSecondsRealtime(.25f);yield return Capture("drone-range.png");for(int k=0;k<5500;k++)sim.Tick(1f/60);Check("range-result-frozen",sim.Range.Finished);sim.EndBattle();
            sim.Circuit=FleetCommander.Labs.LogicCircuit.Example("Full adder");sim.Circuit.nodes[0].input=sim.Circuit.nodes[1].input=true;ui.OpenPage("Logic Lab");yield return new WaitForSecondsRealtime(.2f);Check("circuit-canvas",ui.Root.Q<CircuitCanvas>()!=null&&sim.Circuit.Evaluate()[7]);yield return Capture("logic-circuit.png");
            sim.Board.Example("Heart");ui.OpenPage("Night Brite");yield return new WaitForSecondsRealtime(.2f);Check("light-board",ui.Root.Q<PegCanvas>()!=null&&sim.Board.Points().Length>100);yield return Capture("night-brite.png");
            sim.Config.layers[0].kind=InfluenceKind.Wave;sim.Science.vectors=true;sim.Science.view=FleetCommander.Labs.ScienceView.LorenzAttractor;ui.OpenPage("Nerd Lab");rig.Mode=CameraMode.Orbit;rig.AutoFocus=false;rig.Focus=sim.Config.origin+Vector3.up*sim.Config.height;rig.Yaw=25;rig.Pitch=25;rig.Distance=160;rig.Snap();yield return new WaitForSecondsRealtime(.2f);string exported=sim.Science.Export(sim.Config,Path.Combine(output,"Science"));Check("python-export",File.Exists(exported)&&!File.ReadAllText(exported).Contains("__CONFIG_JSON__"));yield return Capture("science-lab.png");sim.Science.vectors=false;
            ui.OpenPage("Cameras");sim.Paused=true;var multi=GetComponent<MultiCameraRig>();multi.FeedCount=3;yield return new WaitForSecondsRealtime(.5f);bool feeds=true;foreach(var camera in multi.Cameras)feeds&=camera.enabled&&camera.targetTexture.IsCreated();Check("three-independent-camera-feeds",feeds);yield return Capture("multicamera.png");multi.FeedCount=0;rig.AudienceView();yield return new WaitForSecondsRealtime(.3f);Check("stadium-audience-seat",rig.Mode==CameraMode.Audience&&rig.transform.position.y>4);yield return Capture("audience-seat.png");
            sim.EndBattle();sim.StartBattle(8);sim.Paused=true;StageArena(8,22);ui.OpenPage("Arena");rig.Overview();yield return new WaitForSecondsRealtime(.2f);
            var selection=GetComponent<DroneSelection>();var pickPoint=Camera.main.WorldToScreenPoint(sim.Active.States[3].position);Check("click-selects-drone",selection.SelectAt(pickPoint)&&sim.Selected>=0);Check("selection-detail-policy",DroneRenderer.DetailLevel(5,1,true)==0);yield return new WaitForSecondsRealtime(.2f);yield return Capture("selected-drone.png");
            Check("live-control-labels",ui.Root.Query<Slider>().ToList().Exists(slider=>slider.label.Contains("[LIVE]")));Check("active-stack-visible",ui.Root.Q<Label>(className:"active-stack").text.Contains("Blue"));
            rig.Mode=CameraMode.Cinematic;yield return new WaitForSecondsRealtime(4.3f);Check("broadcast-director-finite",FleetConfig.Finite(rig.transform.position)&&!string.IsNullOrEmpty(rig.Director.Shot));yield return Capture("broadcast-camera.png");
            sim.StopSeries();sim.BattleSession.roundCount=2;sim.StartSeries(1);sim.Paused=true;sim.Active.ApplyDamage(1,500,0);sim.Tick(.02f);Check("series-keeps-configured-round-count",sim.SeriesCompleted==1&&sim.SeriesRoundLimit==2&&sim.SeriesRunning);yield return new WaitForSecondsRealtime(.25f);Check("victory-overlay",ui.ResultOpen);yield return Capture("victory-overlay.png");sim.StopSeries();sim.EndBattle();
            var audio=GetComponent<FleetAudio>();int sounds=audio.EffectsPlayed;audio.PlayFx("goal");Check("sound-effects-loaded-and-triggered",audio.LoadedEffects==11&&audio.EffectsPlayed>sounds);
            sim.Resize(4);sim.Paused=true;ui.SetMenusVisible(false);rig.Mode=CameraMode.Orbit;rig.AutoFocus=false;rig.Focus=new Vector3(0,20,0);rig.Distance=350;rig.Pitch=22;rig.Yaw=30;
            Check("imported-scene-assets",Resources.LoadAll<GameObject>("ScenePacks").Length==73);
            foreach(SceneryKind scene in Enum.GetValues(typeof(SceneryKind))){ui.ApplySceneryPreset(scene,scene==SceneryKind.Coast?SkyKind.Moonlit:scene==SceneryKind.Overlook?SkyKind.Golden:SkyKind.Day);yield return new WaitForSecondsRealtime(.3f);yield return Capture("scenery-"+scene+".png");}
            sim.Config.sky=SkyKind.MilkyWay;rig.Mode=CameraMode.Free;rig.Pitch=-30;rig.Yaw=0;rig.transform.position=new Vector3(0,8,0);yield return new WaitForSecondsRealtime(.4f);yield return Capture("milky-way.png");ui.SetMenusVisible(true);sim.Config.scenery=SceneryKind.Stadium;sim.Config.sky=SkyKind.Day;
            sim.EndBattle();sim.Resize(2000);sim.LaunchAll();sim.Paused=true;
            var watch=System.Diagnostics.Stopwatch.StartNew();for(int i=0;i<60;i++)sim.Tick(SwarmSimulator.FixedStep);watch.Stop();
            report.sixtySimulationStepsMs=watch.ElapsedMilliseconds;report.drones=sim.Active.Count;
            bool finite=true;foreach(var state in sim.Active.States)finite&=FleetConfig.Finite(state.position)&&FleetConfig.Finite(state.velocity);
            Check("2000-drone-finite-state",sim.Active.Count==2000&&finite);
            ui.OpenPage("Fleet");rig.Fit();yield return new WaitForSecondsRealtime(.5f);Check("fit-recovers-from-sky-camera",rig.Pitch>25&&rig.transform.position.y>100);
            float total=0,maximum=0;for(int i=0;i<60;i++){yield return null;float ms=Time.unscaledDeltaTime*1000;total+=ms;maximum=Mathf.Max(maximum,ms);}
            report.meanRenderFrameMs=total/60;report.maximumRenderFrameMs=maximum;
            yield return Capture("2000-drones.png");
            Check("all-captures-saved",captures.Count==39,"Captured "+captures.Count+" frames");
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
