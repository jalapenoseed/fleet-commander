using System;
using System.Collections;
using System.IO;
using FleetCommander.Core;
using FleetCommander.Games;
using FleetCommander.Cameras;
using UnityEngine;
using UnityEngine.UIElements;
namespace FleetCommander.UI
{
    public sealed partial class CommanderUI
    {
        SportKind sportsKind=SportKind.Soccer;float sportsDuration=180;bool chessVsAI=true,humanWhite=true;
        Label gameScore,chessInfo;VisualElement promotionPanel;int chessSelected=-1,promotionFrom=-1,promotionTo=-1;
        public int ChessSelected=>chessSelected;
        public bool ChessFlipped;
        public SportsSettings SportsSetup=new SportsSettings();
        void SportsPage()
        {
            Note("Five-a-side drone sports, 2–8 player toy duels and King of the Hill. Join either team or watch the AI play. Results are saved automatically.");
            EnumField("Game",sportsKind,v=>{sportsKind=v;SportsSetup.sport=v;SportsSetup.targetScore=v==SportKind.FlagFootball?24:3;OpenPage("Sports");});Slider("Match time · s",sportsDuration,30,600,v=>sportsDuration=v);
            if(sportsKind!=SportKind.TagDuel&&sportsKind!=SportKind.KingOfHill){Slider("Score to win [NEW GAME]",SportsSetup.targetScore,1,99,v=>SportsSetup.targetScore=Mathf.RoundToInt(v));SportsRosterControls();}
            Button(content,"START NEW MATCH",()=>StartSport(),"primary");
            gameScore=Label(content,"","scoreboard");
            if(Simulator.Sports!=null)
            {
                var match=Simulator.Sports;Note(match.Rules);
                var row=Row();Button(row,"JOIN BLUE",()=>Pilot.JoinBlue(),"blue-button");Button(row,"JOIN RED",()=>Pilot.JoinRed(),"red-button");
                Button(content,"PILOT BALL CARRIER",()=>{if(match.Carrier>=0)Pilot.Join(match.Carrier);else Simulator.Notice="The ball is currently free.";});
                Button(content,"LEAVE DRONE TO AI",()=>Pilot.LeavePilot());
                var play=Row();Button(play,"SHOOT",()=>match.Act(Simulator.Selected,true));Button(play,"PASS [Q]",()=>match.Act(Simulator.Selected,false));
                Note("Click flight view to fly. WASD move · Click shoot · Q pass · C view · Escape release cursor. Sports keep drones at field height.");
                Button(content,"REMATCH",()=>{sportsKind=match.Kind;sportsDuration=match.Duration;if(match.Settings!=null)SportsSetup=match.Settings.Clone();StartSport();});
                Button(content,"PAUSE / RESUME",TogglePause);Button(content,"FIELD OVERVIEW",()=>Rig.Overview(true));
            }
            AdaptiveLabControls(Simulator.BattleSession);BatchControls();ResultsList();Button(content,"RETURN TO SHOW FLEET",()=>{Pilot.LeavePilot();Simulator.EndBattle();Rig.ResetView();OpenPage(Page);});UpdateGamesUI();
        }
        void StartSport(){Pilot?.LeavePilot();ResetChallenge();SportsSetup.sport=sportsKind;SportsSetup.seconds=sportsDuration;Simulator.StartSports(sportsKind,sportsDuration,SportsSetup);Rig.Overview(true);OpenPage("Sports");}
        void SportsRosterControls()
        {
            foreach(int team in new[]{0,1})
            {
                var roster=team==0?SportsSetup.blue:SportsSetup.red;string name=team==0?"Blue":"Red";
                var panel=new Foldout{text=name+" · sports roster & formation",value=false};content.Add(panel);controlParent=panel;timingOverride="NEW GAME";
                EnumField("Formation",roster.formation,v=>{roster.formation=v;OpenPage("Sports");});EnumField("Team skin",roster.skin,v=>roster.skin=v);
                for(int i=0;i<5;i++)
                {
                    int slot=i;Section(name+" slot "+(i+1)+(sportsKind==SportKind.Soccer&&i==0?" · goalkeeper":""));
                    EnumField("Frame",roster.frames[i],v=>roster.frames[slot]=v);EnumField("Sports role",roster.roles[i],v=>roster.roles[slot]=v);
                    if(roster.formation==SportFormation.Custom){Slider("Starting depth",-roster.slots[i].x,1,46,v=>roster.slots[slot].x=-v);Slider("Starting lane",roster.slots[i].y,-27,27,v=>roster.slots[slot].y=v);}
                }
                controlParent=null;timingOverride=null;
            }
            Note("Setup edits deploy with Start New Match. Runner, support and defender roles affect movement; soccer slot 1 stays in goal. Football uses formation lanes and depth for passing routes. Toy games use the Adaptive Lab team loadouts.");
            Button(content,"SAVE SPORTS SETUP",()=>{SportsSetup.sport=sportsKind;SportsSetup.seconds=sportsDuration;SportsSetup.Validate();File.WriteAllText(Path.Combine(Application.persistentDataPath,"sports.json"),JsonUtility.ToJson(SportsSetup,true));Simulator.Notice="Sports setup saved.";});
            Button(content,"LOAD SPORTS SETUP",()=>{SportsSetup=SportsSettings.Parse(File.ReadAllText(Path.Combine(Application.persistentDataPath,"sports.json")));sportsKind=SportsSetup.sport;sportsDuration=SportsSetup.seconds;OpenPage("Sports");Simulator.Notice="Sports setup loaded. Start New Match to deploy.";});
        }
        void ChessPage()
        {
            Note("A full chess board with legal moves. Click a piece, then a marked destination. Local two-player shares the same screen.");
            Toggle("Play against computer",chessVsAI,v=>chessVsAI=v);Toggle("Your side: White",humanWhite,v=>humanWhite=v);
            Button(content,"NEW CHESS GAME",()=>{Pilot?.LeavePilot();Simulator.StartChess(chessVsAI,humanWhite?1:-1);chessSelected=promotionFrom=promotionTo=-1;ChessFlipped=!humanWhite;drawOffered=false;OpenPage("Chess");},"primary");
            Button(content,"FLIP BOARD [LIVE]",()=>ChessFlipped=!ChessFlipped);
            gameScore=Label(content,"","scoreboard");chessInfo=Label(content,"","note");
            promotionPanel=Element(content,"row");promotionPanel.style.flexWrap=Wrap.Wrap;
            foreach(int p in new[]{ChessGame.Queen,ChessGame.Rook,ChessGame.Bishop,ChessGame.Knight}){int piece=p;Button(promotionPanel,ChessGame.PieceName(p),()=>{if(Simulator.PlayChess(new ChessMove(promotionFrom,promotionTo,piece))){promotionFrom=promotionTo=chessSelected=-1;UpdateGamesUI();}});}
            Button(content,"CLAIM DRAW",()=>{if(Simulator.Chess==null||!Simulator.Chess.CanClaimDraw)Simulator.Notice="Draw claims require threefold repetition or 50 moves without a pawn move or capture.";else Simulator.Chess.ClaimDraw();});
            Button(content,"RESIGN",()=>{var g=Simulator.Chess;if(g!=null)g.Resign(Simulator.ChessAI?-Simulator.ChessAISide:g.Side);});
            Button(content,"AGREE DRAW · TWO PLAYERS",()=>{if(Simulator.Chess!=null&&!Simulator.ChessAI){drawOffered=!drawOffered;Simulator.Notice=drawOffered?"Draw offered. Other player: click Accept draw below.":"Draw offer withdrawn.";}});
            Button(content,"ACCEPT DRAW",()=>{if(drawOffered&&Simulator.Chess!=null&&!Simulator.ChessAI){Simulator.Chess.AgreeDraw();drawOffered=false;}});
            Note("Castling, en passant and all four promotions are supported. Checkmate, stalemate, dead-material draws, 75-move and fivefold repetition endings are automatic. Threefold repetition and the 50-move rule can be claimed.");
            ResultsList();Button(content,"RETURN TO SHOW FLEET",()=>{Simulator.EndBattle();Rig.ResetView();chessSelected=-1;OpenPage("Fleet");});UpdateGamesUI();
        }
        bool drawOffered;
        public void ChessSquare(int square)
        {
            var game=Simulator.Chess;if(game==null||game.Finished||Simulator.Paused||Simulator.ChessAI&&game.Side==Simulator.ChessAISide||promotionFrom>=0)return;
            if(chessSelected>=0)
            {
                var choices=game.LegalMoves().FindAll(m=>m.From==chessSelected&&m.To==square);
                if(choices.Count>1){promotionFrom=chessSelected;promotionTo=square;SetMenusVisible(true);OpenPage("Chess");Simulator.Notice="Choose Queen, Rook, Bishop or Knight to promote.";return;}
                if(choices.Count==1&&Simulator.PlayChess(choices[0])){chessSelected=-1;drawOffered=false;return;}
            }
            chessSelected=game.Board[square]*game.Side>0?square:-1;
        }
        void UpdateGamesUI()
        {
            if(Page=="Sports"&&gameScore!=null){var m=Simulator.Sports;gameScore.text=m==null?"Choose a game and start a match.":m.Title+"\n"+m.ScoreText+" · "+ClockText(m.Remaining)+"\n"+m.Status+"\n"+Simulator.Results.Tally(m.Title);}
            if(Page=="Chess"&&gameScore!=null)
            {
                var g=Simulator.Chess;gameScore.text=g==null?"Choose computer or two players, then start.":g.TurnText+"\n"+(Simulator.ChessThinking&&!g.Finished?"Computer is thinking…\n":"")+Simulator.Results.Tally("Chess");
                if(chessInfo!=null)chessInfo.text=g==null?"":promotionFrom>=0?"PROMOTION · choose a piece below":g.History.Count==0?"White moves first. Click a piece to see its legal moves.":"Move "+g.FullMove+"\n"+string.Join("  ",g.History.GetRange(Math.Max(0,g.History.Count-12),Math.Min(12,g.History.Count)));
                if(promotionPanel!=null)promotionPanel.style.display=promotionFrom>=0?DisplayStyle.Flex:DisplayStyle.None;
            }
        }
        void ResultsList()
        {Section("Recent completed games");var results=Simulator.Results.matches;for(int i=results.Count-1;i>=Math.Max(0,results.Count-6);i--){var r=results[i];Note(r.mode+" · "+r.blue+"–"+r.red+" · "+r.result+"\n"+r.ended);}}
        void ArenaCameraControls()
        {
            Section("Camera controls");Button(content,"BROADCAST DIRECTOR",()=>{Pilot.LeavePilot();Rig.Mode=CameraMode.Cinematic;});Slider("Shot minimum duration",Rig.Director.MinimumShotSeconds,2,10,v=>Rig.Director.MinimumShotSeconds=v);var row=Row();Button(row,"WIDE OVERVIEW",()=>Rig.Overview());Button(row,"TOP VIEW",()=>{Rig.Overview();Rig.Mode=CameraMode.Top;});
            var row2=Row();Button(row2,"FREE CAMERA",()=>Rig.FreeCamera());Button(row2,"FOCUS DRONE",()=>Rig.FocusSelected());
            var cameraPanel=new Foldout{text="Manual camera settings",value=false};content.Add(cameraPanel);controlParent=cameraPanel;
            EnumField("Camera mode",Rig.Mode,v=>{Pilot?.LeavePilot();if(v==CameraMode.Free)Rig.FreeCamera();else Rig.Mode=v;});
            Toggle("Follow fleet center",Rig.AutoFocus,v=>Rig.AutoFocus=v);Slider("Zoom / distance",Rig.Distance,5,500,v=>Rig.Distance=v);Slider("Yaw",Rig.Yaw,-180,180,v=>Rig.Yaw=v);Slider("Pitch",Rig.Pitch,-65,88,v=>Rig.Pitch=v);Slider("Camera speed",Rig.MoveSpeed,5,100,v=>Rig.MoveSpeed=v);
            var pan=Row();Button(pan,"←",()=>Rig.Pan(-10,0));Button(pan,"↑",()=>Rig.Pan(0,10));Button(pan,"↓",()=>Rig.Pan(0,-10));Button(pan,"→",()=>Rig.Pan(10,0));
            Note("Drag to orbit · Wheel to zoom · Middle-drag or Shift + right-drag to pan · WASD moves the camera · Q/E height in Free · Home overview · F focus selected. Action/Cinematic are optional.");controlParent=null;
        }
        void TeamSetup(BattleSettings b,bool blue)
        {
            string team=blue?"Blue":"Red";var plan=blue?b.bluePlan:b.redPlan;
            var panel=new Foldout{text=team+" · formation and roster",value=false};panel.AddToClassList("team-plan");content.Add(panel);controlParent=panel;
            Toggle("Automatic formations",plan.automatic,v=>plan.automatic=v);Slider("Formation decision interval",plan.switchSeconds,2,20,v=>plan.switchSeconds=v);
            EnumField("Formation",plan.formation,v=>plan.formation=v);Slider("Formation spacing",plan.spacing,2,20,v=>plan.spacing=v);Slider("Keep formation",plan.cohesion,0,1,v=>plan.cohesion=v);
            Toggle("Use mixed role roster",plan.mixed,v=>{plan.mixed=v;if(v&&plan.roles.Length==0)plan.Preset(blue?0:1,"Balanced wings");OpenPage(Page);});
            foreach(string preset in new[]{"Balanced wings","Screen & flank","Heavy escort"}){string p=preset;Button(content,p,()=>{plan.Preset(blue?0:1,p);OpenPage(Page);});}
            if(plan.mixed)
            {
                Button(content,"ADD ROLE (MAX 8)",()=>{if(plan.roles.Length<8){var list=new System.Collections.Generic.List<ArenaRole>(plan.roles);list.Add(new ArenaRole{name="Custom role "+(list.Count+1),skin=blue?SkinKind.Cobalt:SkinKind.Crimson});plan.roles=list.ToArray();OpenPage(Page);}});Button(content,"REMOVE LAST ROLE",()=>{if(plan.roles.Length>1){Array.Resize(ref plan.roles,plan.roles.Length-1);OpenPage(Page);}});
                Note("Weights divide your team proportionally. Each role has its own model, skin, game weapon, play and formation offset. Apply & Rematch deploys changes.");
                foreach(var r in plan.roles)
                {
                    var role=r;Section(role.name);timingOverride="NEXT ROUND";Text("Role name",role.name,v=>role.name=v);Slider("Share / weight",role.weight,1,8,v=>role.weight=Mathf.RoundToInt(v));
                    EnumField("Frame",role.frame,v=>role.frame=v);EnumField("Skin",role.skin,v=>role.skin=v);EnumField("Game weapon",role.weapon,v=>role.weapon=v);EnumField("Play",role.behavior,v=>role.behavior=v);
                    EnumField("Toy effector",role.effector,v=>role.effector=v);Slider("Offset forward",role.offset.x,-40,40,v=>role.offset.x=v);Slider("Offset sideways",role.offset.z,-40,40,v=>role.offset.z=v);Slider("Offset height",role.offset.y,0,35,v=>role.offset.y=v);timingOverride=null;
                }
            }
            else
            {
                EnumField("Frame",blue?b.blueFrame:b.redFrame,v=>{if(blue)b.blueFrame=v;else b.redFrame=v;});EnumField("Skin",blue?b.blueSkin:b.redSkin,v=>{if(blue)b.blueSkin=v;else b.redSkin=v;});EnumField("Game weapon",blue?b.blueWeapon:b.redWeapon,v=>{if(blue)b.blueWeapon=v;else b.redWeapon=v;});EnumField("Play",blue?b.blue:b.red,v=>{if(blue)b.blue=v;else b.red=v;});
            }
            EnumField("Toy effector",blue?b.lab.blueEffector:b.lab.redEffector,v=>{if(blue)b.lab.blueEffector=v;else b.lab.redEffector=v;});
            Section("Sensor loadout");foreach(SensorKind sensor in Enum.GetValues(typeof(SensorKind)))if(sensor!=SensorKind.None)SensorToggle(b,blue,sensor);
            Slider("Anchor X",blue?b.blueWaypoint.x:b.redWaypoint.x,-100,100,v=>{if(blue)b.blueWaypoint.x=v;else b.redWaypoint.x=v;});Slider("Anchor Z",blue?b.blueWaypoint.z:b.redWaypoint.z,-100,100,v=>{if(blue)b.blueWaypoint.z=v;else b.redWaypoint.z=v;});
            ResetButton(team.ToUpperInvariant()+" LOADOUT",()=>ResetArenaTeam(blue));controlParent=null;
        }
        int batchCount=10;bool batchRunning,batchCancel;string batchProgress="";Label batchLabel;
        void AdaptiveLabControls(BattleSettings b)
        {
            var panel=new Foldout{text="Adaptive lab · rules, sensors & learning",value=false};panel.AddToClassList("team-plan");content.Add(panel);controlParent=panel;timingOverride=Page=="Sports"?"NEW GAME":null;
            Toggle("Use toy lab rules in Arena",b.lab.useToyRules,v=>b.lab.useToyRules=v);
            EnumField("Lab activity",b.lab.activity,v=>b.lab.activity=v);
            Slider("Toy drones per team",b.lab.agentsPerTeam,1,4,v=>b.lab.agentsPerTeam=Mathf.RoundToInt(v));Slider("Tags / hill seconds to win",b.lab.targetTags,3,100,v=>b.lab.targetTags=Mathf.RoundToInt(v));
            Toggle("Sensor estimator",b.lab.enabled,v=>b.lab.enabled=v);Toggle("Learn and retain results",b.lab.learn,v=>b.lab.learn=v);Toggle("Automatic FPV sensor selection",b.lab.autoSensors,v=>b.lab.autoSensors=v);
            Slider("Prediction horizon",b.lab.predictionHorizon,.05f,2,v=>b.lab.predictionHorizon=v);Slider("Vision confidence",b.lab.yoloConfidence,.1f,1,v=>b.lab.yoloConfidence=v);Slider("Measurement noise",b.lab.cameraNoise,.05f,4,v=>b.lab.cameraNoise=v);Slider("Filter process noise",b.lab.processNoise,.01f,4,v=>b.lab.processNoise=v);Slider("Learning rate",b.lab.learningRate,.001f,.3f,v=>b.lab.learningRate=v);
            Note("Vision detections are simulated from the game scene, with field of view, obstruction, noise and lost tracks. This build does not run a YOLO neural network. Range, thermal, RF and UV have distinct visibility and uncertainty; IMU and optical flow are navigation sensors.");
            Note("Learning keeps separate blue/red playbook results per game. Four playbooks are explored before the best observed one is favored, with occasional exploration. More wins in these matches do not guarantee a universally best strategy.");
            Button(content,"SAVE LEARNING & EXPORT ENGAGEMENT CSV",()=>{if(Simulator.Arena==null)throw new InvalidOperationException("Start a match first.");Simulator.Knowledge.Export(Simulator.Arena.AdaptiveLab);Simulator.Notice="Learning and adaptive-engagement-log.csv saved in the save folder.";});
            Button(content,"OPEN RESULTS / LEARNING FOLDER",()=>Application.OpenURL(new Uri(Application.persistentDataPath).AbsoluteUri));
            controlParent=null;timingOverride=null;
        }
        void BatchControls()
        {
            Section("Automatic sports / toy matches");Slider("Batch matches",batchCount,1,30,v=>batchCount=Mathf.RoundToInt(v));
            Button(content,"RUN LEARNING BATCH",()=>{if(!batchRunning)StartCoroutine(RunBatch());});Button(content,"STOP AFTER CURRENT MATCH",()=>batchCancel=true);
            batchLabel=Label(content,batchProgress,"note");
        }
        IEnumerator RunBatch()
        {
            batchRunning=true;batchCancel=false;int count=batchCount;var kind=sportsKind;float duration=sportsDuration;var settings=Simulator.BattleSession.Clone();var setup=SportsSetup.Clone();var config=JsonUtility.FromJson<FleetConfig>(JsonUtility.ToJson(Simulator.Show.Config));
            for(int round=0;round<count&&!batchCancel;round++)
            {
                settings.lab.seed=Simulator.BattleSession.lab.seed+round;var match=new SportsMatch(kind,config,duration,settings,setup);Simulator.Knowledge.Bind(match.World.AdaptiveLab,match.Title,settings.lab.seed);
                int ticks=0;while(!match.Finished){match.Tick(1f/60);if(++ticks%180==0){batchProgress="Match "+(round+1)+" / "+count+" · "+match.ScoreText+" · "+ClockText(match.Remaining);if(batchLabel!=null)batchLabel.text=batchProgress;yield return null;}}
                Simulator.Knowledge.Finish(match.World.AdaptiveLab,match.Winner);Simulator.Results.Add(match.Title,match.BlueScore,match.RedScore,match.Winner,match.Status+" · batch");yield return null;
            }
            batchRunning=false;batchProgress=batchCancel?"Batch stopped; completed results and learning saved.":"Batch complete. Results and learning saved.";if(batchLabel!=null)batchLabel.text=batchProgress;Simulator.Notice=batchProgress;
        }
        public void ApplySceneryPreset(SceneryKind scene,SkyKind sky)
        {
            Simulator.Config.scenery=scene;Simulator.Config.sky=sky;Simulator.Config.weather=WeatherKind.Clear;Simulator.Config.planet=PlanetKind.Earth;Simulator.Config.obstacles=scene==SceneryKind.Stadium||scene==SceneryKind.City;Pilot?.LeavePilot();
            Rig.Mode=CameraMode.Orbit;Rig.AutoFocus=false;Rig.Focus=new Vector3(scene==SceneryKind.Creek?170:scene==SceneryKind.Coast?-100:scene==SceneryKind.Meadow?160:0,16,scene==SceneryKind.City||scene==SceneryKind.RuralTown?220:0);
            Rig.Distance=scene==SceneryKind.Stadium?350:scene==SceneryKind.RuralTown||scene==SceneryKind.City?190:260;Rig.Pitch=scene==SceneryKind.Coast?9:16;Rig.Yaw=scene==SceneryKind.Coast?-85:20;Rig.Snap();
        }
        void SceneryPresets()
        {
            Section("Reference scenery");
            foreach(SceneryKind scene in Enum.GetValues(typeof(SceneryKind))){var chosen=scene;var sky=scene==SceneryKind.Coast?SkyKind.Moonlit:scene==SceneryKind.Overlook||scene==SceneryKind.Desert?SkyKind.Golden:SkyKind.Day;string name=scene==SceneryKind.RuralTown?"Juniper Junction · rural town":scene==SceneryKind.Metro?"Northline · city skyline":scene==SceneryKind.Harbor?"Harbor Point · docks":scene==SceneryKind.Desert?"Red Mesa · desert":scene==SceneryKind.ForestLake?"Pine Lake · forest":scene.ToString();Button(content,name,()=>{ApplySceneryPreset(chosen,sky);OpenPage(Page);});}
            Button(content,"MILKY WAY NIGHT",()=>{Simulator.Config.sky=SkyKind.MilkyWay;Simulator.Config.weather=WeatherKind.Clear;OpenPage(Page);});
        }
    }
}
