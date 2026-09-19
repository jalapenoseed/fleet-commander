using System;
using System.Collections.Generic;
using System.IO;
using FleetCommander.Core;
using FleetCommander.Cameras;
using FleetCommander.Systems;
using FleetCommander.Rendering;
using UnityEngine;
using UnityEngine.UIElements;
namespace FleetCommander.UI
{
    public sealed class CommanderUI : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public DroneCameraRig Rig;
        public FleetAudio Audio;
        public readonly SessionJournal Journal=new SessionJournal();
        public string ProgramSource="select all\nformation ring\nheight 40\npattern orbit\nwait 12\nformation heart\npattern wave\nwait 12\nformation sphere\npattern pulse\nrepeat 36";
        public string Page {get;private set;}="Fleet";
        public UIDocument Document {get;private set;}
        public VisualElement Root => Document.rootVisualElement;
        VisualElement header,nav,sidebar,bottom,reticle;ScrollView content;Label stats,status,telemetry;TextField search;
        PanelSettings panel;float clock,challengeClock,challengeDwell;int challengeStage,challengeScore;bool challenge;
        bool hidden;int rosterSize=256,perTeam=16;string saveName="My fleet",savePath="",imagePath="",musicPath="",imageMode="RGB";float threshold=.18f;
        const string Pages="Fleet,Squads,Fields,Arena,Director,Art Studio,Program,Physics,Nerd Lab,Replays,Journal,Saves,Help";
        public bool PointerBlocked
        {
            get
            {
                if(!Document||Root.panel==null||hidden)return false;
                var p=RuntimePanelUtils.ScreenToPanel(Root.panel,new Vector2(Input.mousePosition.x,Screen.height-Input.mousePosition.y));
                return header.worldBound.Contains(p)||nav.worldBound.Contains(p)||sidebar.worldBound.Contains(p)||bottom.worldBound.Contains(p);
            }
        }
        public bool Typing
        {
            get
            {
                VisualElement e=Root?.panel?.focusController?.focusedElement as VisualElement;
                while(e!=null){if(e is TextField||e is IntegerField||e is FloatField)return true;e=e.parent;}return false;
            }
        }
        void Start()
        {
            panel=ScriptableObject.CreateInstance<PanelSettings>();panel.scaleMode=PanelScaleMode.ScaleWithScreenSize;panel.referenceResolution=new Vector2Int(1600,900);panel.match=.5f;
            panel.themeStyleSheet=Resources.Load<ThemeStyleSheet>("CommanderTheme");
            Document=gameObject.AddComponent<UIDocument>();Document.panelSettings=panel;
            Root.styleSheets.Add(Resources.Load<StyleSheet>("Commander"));Root.pickingMode=PickingMode.Ignore;
            Root.style.unityFontDefinition=FontDefinition.FromFont(Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"));
            header=Element(Root,"header");var brand=Element(header,"brand");Label(brand,"FLEET COMMANDER","brand-title");Label(brand,"SWARM DIRECTOR  /  UNITY EDITION","eyebrow");
            stats=Label(header,"","stats");Button(header,"LAUNCH",()=>Simulator.LaunchAll(),"primary");Button(header,"PAUSE",TogglePause);Button(header,"LAND",()=>Simulator.LandAll());Button(header,"HIDE  [H]",()=>ToggleUI());
            nav=Element(Root,"nav");foreach(string p in Pages.Split(',')){string page=p;var button=Button(nav,page,()=>OpenPage(page));button.name="nav-"+page;}
            sidebar=Element(Root,"sidebar");search=new TextField{label="Find controls",name="control-search"};sidebar.Add(search);search.RegisterValueChangedCallback(e=>Filter(e.newValue));
            content=new ScrollView();content.AddToClassList("page");sidebar.Add(content);
            bottom=Element(Root,"bottom");status=Label(bottom,"","status");Button(bottom,"CAMERA",()=>{Rig.Mode=(CameraMode)(((int)Rig.Mode+1)%13);});Button(bottom,"NEXT DRONE",NextDrone);Button(bottom,"FIT",()=>Rig.Fit());
            telemetry=Label(Root,"","telemetry");telemetry.pickingMode=PickingMode.Ignore;reticle=Element(Root,"reticle");reticle.pickingMode=PickingMode.Ignore;Label(reticle,"+","crosshair");
            try{Journal.Load();}catch(Exception e){Simulator.Notice=e.Message;}
            savePath=Path.Combine(Application.persistentDataPath,"fleet.json");OpenPage("Fleet");
        }
        public void OpenPage(string page)
        {
            Page=page;content.Clear();search.SetValueWithoutNotify("");
            foreach(var b in nav.Children())b.EnableInClassList("selected",b.name=="nav-"+page);
            Label(content,"COMMAND CENTER / "+page.ToUpperInvariant(),"eyebrow");Label(content,page,"page-title");
            switch(page)
            {
                case "Fleet":FleetPage();break;case "Squads":SquadsPage();break;case "Fields":FieldsPage();break;
                case "Arena":ArenaPage();break;case "Director":DirectorPage();break;case "Art Studio":ArtPage();break;
                case "Program":ProgramPage();break;case "Physics":PhysicsPage();break;case "Nerd Lab":LabPage();break;
                case "Replays":ReplayPage();break;case "Journal":JournalPage();break;case "Saves":SavesPage();break;default:HelpPage();break;
            }
        }
        void Filter(string query)
        {
            query=(query??"").Trim().ToLowerInvariant();
            foreach(var c in content.contentContainer.Children()){string text=c is TextElement t?t.text:c is BaseField<float> f?f.label:c.tooltip;bool match=string.IsNullOrEmpty(query)||(text??"").ToLowerInvariant().Contains(query);c.style.display=match?DisplayStyle.Flex:DisplayStyle.None;}
        }
        void FleetPage()
        {
            Note("Direct a light show. Shape the fleet, launch from the pads, and explore through any camera.");
            var count=new IntegerField("Aircraft count"){value=rosterSize};content.Add(count);count.RegisterValueChangedCallback(e=>rosterSize=Mathf.Clamp(e.newValue,0,10000));
            Button(content,"BUILD FLEET",()=>{Simulator.Resize(rosterSize);Rig.Fit();});
            Note("0–2,000 for everyday choreography. Up to 10,000 as a stress test; replay records fleets of 2,000 or fewer.");
            EnumField("Formation",Simulator.Config.formation,v=>Simulator.Config.formation=v);
            EnumField("Motion pattern",Simulator.Config.pattern,v=>Simulator.Config.pattern=v);
            Slider("Altitude · m",Simulator.Config.height,3,180,v=>Simulator.Config.height=v);
            Slider("Spacing · m",Simulator.Config.spacing,.5f,12,v=>Simulator.Config.spacing=v);
            Slider("Scale",Simulator.Config.scale,.1f,4,v=>Simulator.Config.scale=v);
            Slider("Rotation · degrees",Simulator.Config.rotation,-180,180,v=>Simulator.Config.rotation=v);
            Toggle("Boids steering",Simulator.Config.boids,v=>Simulator.Config.boids=v);
            Button(content,"NONE / RESET MOTION",()=>{Simulator.ClearBehaviors();OpenPage(Page);});
            Section("Battery operations");Toggle("Unlimited energy",Simulator.Config.unlimited,v=>Simulator.Config.unlimited=v);
            Button(content,"RECHARGE PARKED AIRCRAFT",()=>Simulator.Active.Recharge());
            Button(content,"TEST 10% RESERVE",()=>Simulator.Active.SetCharge(.1f));
            Section("Formation challenge");Note("Settle within 4 m of ring, grid, heart and sphere targets for 3 seconds each. 90 seconds, four rounds.");
            Button(content,"START CHALLENGE",StartChallenge);
        }
        void SquadsPage()
        {
            Note("Four independent show groups. Formation and offset overrides compose with the global fields.");
            string[] names={"Alpha","Bravo","Charlie","Delta"};
            for(int i=0;i<4;i++)
            {
                int slot=i;var g=Simulator.Config.groups[i];Section(names[i]);
                Toggle(names[i]+" override",g.enabled,v=>g.enabled=v);EnumField(names[i]+" formation",g.formation,v=>g.formation=v);
                Slider(names[i]+" X offset",g.offset.x,-100,100,v=>g.offset.x=v);Slider(names[i]+" height offset",g.offset.y,-30,80,v=>g.offset.y=v);
                var row=Row();Button(row,"LAUNCH",()=>Simulator.Show.Launch(slot));Button(row,"RECALL",()=>Simulator.Show.Recall(slot));
            }
        }
        void FieldsPage()
        {
            var c=Simulator.Config;Note("Four independent mathematical fields. None disables a layer immediately.");
            for(int i=0;i<4;i++){var layer=c.layers[i];Section("Layer "+(i+1));EnumField("Field "+(i+1),layer.kind,v=>layer.kind=v);Slider("Strength "+(i+1),layer.strength,0,24,v=>layer.strength=v);Slider("Frequency "+(i+1),layer.frequency,.05f,3,v=>layer.frequency=v);Slider("Blend "+(i+1),layer.blend,0,1,v=>layer.blend=v);}
            Section("Local flocking");Toggle("Boids",c.boids,v=>c.boids=v);Slider("Separation",c.separation,0,5,v=>c.separation=v);Slider("Alignment",c.alignment,0,5,v=>c.alignment=v);Slider("Cohesion",c.cohesion,0,3,v=>c.cohesion=v);Slider("Neighbor radius",c.neighborRadius,2,30,v=>c.neighborRadius=v);
            Button(content,"RESET FIELDS",()=>{c.ResetInfluences();OpenPage(Page);});
        }
        void ArenaPage()
        {
            Note("Two-team arcade skirmishes with abstract pulse attacks, evasive movement, health, payload effects and automatic highlights.");
            var n=new IntegerField("Drones per team"){value=perTeam};content.Add(n);n.RegisterValueChangedCallback(e=>perTeam=Mathf.Clamp(e.newValue,1,128));
            Button(content,"START / RESET SKIRMISH",()=>{Simulator.StartBattle(perTeam);Rig.Mode=CameraMode.Action;OpenPage(Page);Journal.Add("Started "+perTeam+" v "+perTeam+" arcade skirmish.");},"primary");
            if(Simulator.Arena!=null)
            {
                var b=Simulator.Arena.Battle;EnumField("Blue behavior",b.blue,v=>b.blue=v);EnumField("Red behavior",b.red,v=>b.red=v);
                Toggle("Engage",b.engage,v=>b.engage=v);Toggle("Adaptive game behavior",b.adaptive,v=>b.adaptive=v);
                Slider("Game damage",b.gameDamage,1,20,v=>b.gameDamage=v);Slider("Attack interval · s",b.fireInterval,.2f,3,v=>b.fireInterval=v);
                Slider("Blue waypoint X",b.blueWaypoint.x,-100,100,v=>b.blueWaypoint.x=v);Slider("Blue waypoint Z",b.blueWaypoint.z,-100,100,v=>b.blueWaypoint.z=v);
                Slider("Red waypoint X",b.redWaypoint.x,-100,100,v=>b.redWaypoint.x=v);Slider("Red waypoint Z",b.redWaypoint.z,-100,100,v=>b.redWaypoint.z=v);
                Button(content,"DROP SELECTED PAYLOAD  [B]",()=>Simulator.Payload());
                Button(content,"SAVE BATTLE SETUP",()=>{File.WriteAllText(Path.Combine(Application.persistentDataPath,"battle.json"),JsonUtility.ToJson(b,true));Simulator.Notice="Battle setup and win counters saved.";});
                Button(content,"LOAD BATTLE SETUP",()=>{string p=Path.Combine(Application.persistentDataPath,"battle.json");if(!File.Exists(p))throw new FileNotFoundException("No battle setup saved yet.");JsonUtility.FromJsonOverwrite(File.ReadAllText(p),b);b.gameDamage=Mathf.Clamp(b.gameDamage,1,20);b.fireInterval=Mathf.Clamp(b.fireInterval,.2f,3);OpenPage(Page);});
            }
            Button(content,"RETURN TO SHOW FLEET",()=>{Simulator.EndBattle();Rig.Fit();OpenPage(Page);});
        }
        void DirectorPage()
        {
            Note("Light-show presets, scenic settings and camera direction.");
            foreach(string show in new[]{"fireworks","halftime","aurora","galaxy"}){string s=show;Button(content,s.ToUpperInvariant(),()=>{Simulator.EndBattle();Simulator.Program.Compile("show "+s+"\nwait 24\nshow galaxy\nwait 24\nshow fireworks\nrepeat 72");Simulator.Program.Start();Simulator.LaunchAll();Rig.Mode=CameraMode.Cinematic;});}
            EnumField("Camera",Rig.Mode,v=>Rig.Mode=v);Slider("Camera distance",Rig.Distance,3,650,v=>Rig.Distance=v);
            EnumField("Scenery",Simulator.Config.scenery,v=>Simulator.Config.scenery=v);EnumField("Sky",Simulator.Config.sky,v=>Simulator.Config.sky=v);EnumField("Weather",Simulator.Config.weather,v=>Simulator.Config.weather=v);
            Slider("Wind",Simulator.Config.wind,0,15,v=>Simulator.Config.wind=v);Slider("Beacon size",Simulator.Config.beaconSize,.25f,3,v=>Simulator.Config.beaconSize=v);
            Section("Audio & beat studio");Toggle("Enable sound",!Audio.Muted,v=>Audio.Muted=!v);Slider("Volume",Audio.Volume,0,1,v=>Audio.Volume=v);Slider("Tempo · BPM",Simulator.Config.bpm,40,240,v=>Simulator.Config.bpm=v);Toggle("Play step sequencer",Audio.Sequencer,v=>Audio.Sequencer=v);
            var steps=Row();steps.style.flexWrap=Wrap.Wrap;for(int i=0;i<16;i++){int j=i;var t=new Toggle((i+1).ToString()){value=Audio.Steps[i]};t.style.width=72;steps.Add(t);t.RegisterValueChangedCallback(e=>Audio.Steps[j]=e.newValue);}
            Text("Audio file path",musicPath,v=>musicPath=v);Button(content,"LOAD WAV / OGG / MP3",()=>StartCoroutine(Audio.LoadMusic(musicPath,s=>Simulator.Notice=s)));Button(content,"STOP MUSIC",()=>Audio.StopMusic());
            Button(content,"SAVE SCREENSHOT",()=>{string p=Path.Combine(Application.persistentDataPath,"fleet-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+".png");ScreenCapture.CaptureScreenshot(p);Simulator.Notice="Screenshot: "+p;});
        }
        void ArtPage()
        {
            Note("Turn text, pixels and pictures into formation targets. Assigning artwork preserves the current fleet size.");
            string text="HELLO";Text("Text or symbol",text,v=>text=v);Button(content,"DRAW TEXT / SYMBOL",()=>ApplyArt(ArtStudio.Text(text)));
            Note("A–Z, 0–9, punctuation; heart, star, smile and robot symbols are supported.");
            Text("PNG / JPG file path",imagePath,v=>imagePath=v);Choice("Image mode",new[]{"RGB","Outline","Silhouette"},imageMode,v=>imageMode=v);Slider("Threshold",threshold,0,1,v=>threshold=v);
            Button(content,"IMPORT IMAGE",()=>ApplyArt(ArtStudio.Image(imagePath,imageMode,threshold)));
            Section("Pixel & free-draw canvas");Note("Drag to paint. Right-click to erase. Select a color, then send the canvas to the fleet.");
            Color ink=Color.cyan;var palette=Row();for(int i=0;i<DroneRenderer.Palette.Length;i++){Color color=DroneRenderer.Palette[i];var b=Button(palette,"",()=>ink=color);b.style.backgroundColor=color;b.style.width=24;b.style.minWidth=24;}
            var canvas=new PixelCanvas(()=>ink);canvas.style.height=240;content.Add(canvas);
            var row=Row();Button(row,"CLEAR",()=>canvas.ClearPixels());Button(row,"FLY CANVAS",()=>ApplyArt(canvas.Points()));
        }
        void ApplyArt(ArtPoint[] points)
        {
            if(points.Length==0)throw new ArgumentException("Draw at least one pixel.");Simulator.EndBattle();Simulator.Program.Stop();Simulator.Config.ResetInfluences();foreach(var g in Simulator.Config.groups)g.enabled=false;
            Simulator.Config.art=points;Simulator.Config.formation=FormationKind.Art;Simulator.Config.height=80;Simulator.Config.boids=false;Simulator.LaunchAll();Rig.Mode=CameraMode.Front;Rig.Distance=180;Simulator.Notice=points.Length+" art points assigned to "+Simulator.Show.Count+" drones.";
        }
        void ProgramPage()
        {
            Note("Write timed commands. The full program is checked before it starts. Select scopes formation, height, launch and land to a squad.");
            var field=new TextField{multiline=true,value=ProgramSource,name="program-source"};field.AddToClassList("code");content.Add(field);field.RegisterValueChangedCallback(e=>ProgramSource=e.newValue);
            Button(content,"VALIDATE & RUN",()=>{Simulator.EndBattle();Simulator.Program.Compile(ProgramSource);Simulator.Program.Start();Simulator.LaunchAll();Simulator.Notice="Program running.";},"primary");
            Button(content,"STOP PROGRAM",()=>Simulator.Program.Stop());
            Note("select all|alpha|bravo|charlie|delta\nformation ring\nheight 40\nspacing 3\nscale 1\nspeed 24\npattern none|orbit|wave|pulse|dance\nboids on|off\ninfluence wave 8 0.6\nlayer 2 braid 6 0.5\nword HELLO\nshow fireworks|halftime|aurora|galaxy\nbpm 120\nwait 12\nlaunch / land / reset\nrepeat 36");
            Note("A repeat duration must be later than the last cue. Changes to pattern, fields, spacing, scale, speed and tempo apply to the whole show.");
        }
        void PhysicsPage()
        {
            var c=Simulator.Config;Note("A readable game energy model in kg, Wh, watts, meters and seconds.");EnumField("Planet",c.planet,v=>c.planet=v);Toggle("Arcade lift",c.arcadeLift,v=>c.arcadeLift=v);
            Note("Constrained Earth-style rotors cannot sustain flight on the Moon or Mars. Arcade lift keeps those scenes playable.");
            Choice("Frame material",new[]{"Composite","Aluminum","Polymer"},new[]{"Composite","Aluminum","Polymer"}[c.material],v=>c.material=Array.IndexOf(new[]{"Composite","Aluminum","Polymer"},v));
            Slider("Battery energy · Wh",c.batteryWh,1,200,v=>c.batteryWh=v);Slider("Battery mass · kg",c.batteryMass,.05f,3,v=>c.batteryMass=v);Slider("Cargo mass · kg",c.cargoMass,0,5,v=>c.cargoMass=v);
            Slider("Reference flight draw · W",c.flightWatts,10,1000,v=>c.flightWatts=v);Slider("Electronics · W",c.electronicsWatts,0,100,v=>c.electronicsWatts=v);Slider("Drain multiplier",c.drainScale,.25f,10,v=>c.drainScale=v);
            Toggle("Obstacle avoidance",c.obstacles,v=>c.obstacles=v);Slider("Max speed · m/s",c.speed,1,60,v=>c.speed=v);
            Label(content,"Airframe: 0.18 / 0.32 / 0.24 kg\nMotors, electronics, hardware: 0.23 kg\nBattery and cargo: adjustable","note");
        }
        void LabPage()
        {
            Note("Math & Science / Nerd Lab");
            Label(content,"Energy\nΔWh = watts × Δseconds / 3600\nHover draw scales with mass^1.35\n\nSteering\na = clamp((desired velocity − velocity) × 2.6 + Boids + wind)\nv(next) = clamp(v + a × dt)\nx(next) = x + v(next) × dt\n\nFields\nFour bounded vector fields add to formation slots.\n\nIntegration\nFixed 60 Hz; six catch-up steps per frame.\n\nBoids\nSpatial cells, at most 64 candidates and 24 neighbors per drone.","note");
            Section("Logic lab");var input=new IntegerField("Integer"){value=1337};content.Add(input);var binary=Label(content,"","note");
            Action<int> update=n=>binary.text="Decimal: "+n+"\nBinary: "+Convert.ToString(n,2)+"\nHex: 0x"+n.ToString("X")+"\nLow-byte popcount: "+PopCount(n&255);input.RegisterValueChangedCallback(e=>update(e.newValue));update(1337);
            var row=Row();Button(row,"1337",()=>input.value=1337);Button(row,"80085",()=>input.value=80085);
            bool a=false,b=false;var gates=Label(content,"","note");Action show=()=>gates.text="AND "+(a&&b?1:0)+"   OR "+(a||b?1:0)+"   XOR "+(a^b?1:0)+"\nHalf adder: carry "+(a&&b?1:0)+", sum "+(a^b?1:0);Toggle("Input A",false,v=>{a=v;show();});Toggle("Input B",false,v=>{b=v;show();});show();
        }
        static int PopCount(int n){int count=0;while(n!=0){count+=n&1;n>>=1;}return count;}
        void ReplayPage()
        {
            Note("An 18-second rolling buffer captures 10 snapshots per second. Playback freezes the live session and interpolates copies.");
            Button(content,"REPLAY LAST 8 SECONDS",()=>{if(!Simulator.Replay.Play())throw new InvalidOperationException("Record at least two frames first; fleets above 2,000 are not recorded.");});
            Slider("Replay speed",Simulator.Replay.Rate,.125f,2,v=>Simulator.Replay.Rate=v);Slider("Timeline",Simulator.Replay.Normalized,0,1,v=>Simulator.Replay.Seek(v));
            Button(content,"PAUSE / RESUME REPLAY",()=>Simulator.Replay.Paused=!Simulator.Replay.Paused);Button(content,"RETURN LIVE",()=>Simulator.ExitReplay());
            Button(content,"SAVE REPLAY DATA",()=>{string p=Path.Combine(Application.persistentDataPath,"replay.json");Simulator.Replay.Export(p);Simulator.Notice="Replay data saved: "+p;});
            Section("Highlights");for(int i=0;i<Simulator.Replay.Highlights.Count;i++){float t=Simulator.Replay.HighlightTimes[i];Button(content,Simulator.Replay.Highlights[i],()=>Simulator.Replay.Play(t));}
            Button(content,"REFRESH HIGHLIGHTS",()=>OpenPage(Page));Note("Screen captures are in Director. Replay data is JSON; encoded video capture uses your desktop recorder.");
        }
        void JournalPage()
        {
            string note="";Text("Session note",note,v=>note=v);Button(content,"SAVE NOTE",()=>{if(!string.IsNullOrWhiteSpace(note))Journal.Add(note);OpenPage(Page);});
            for(int i=Journal.entries.Count-1;i>=0;i--)Note(Journal.entries[i]);
        }
        void SavesPage()
        {
            Note("Save the show fleet's aircraft, battery, positions, groups, fields, artwork and environment. Loading pauses the restored session.");
            Text("Fleet name",saveName,v=>saveName=v);Text("JSON file path",savePath,v=>savePath=v);
            Button(content,"SAVE FLEET",()=>{FleetStorage.Write(savePath,FleetStorage.Capture(Simulator.Show,saveName,ProgramSource));Simulator.Notice="Fleet saved: "+savePath;});
            Button(content,"LOAD FLEET",()=>{var save=FleetStorage.Parse(File.ReadAllText(savePath));Simulator.Load(save);ProgramSource=save.source??"";rosterSize=save.drones.Length;saveName=save.name;OpenPage(Page);});
            Button(content,"COPY FLEET JSON",()=>{GUIUtility.systemCopyBuffer=FleetStorage.ToJson(FleetStorage.Capture(Simulator.Show,saveName,ProgramSource));Simulator.Notice="Fleet JSON copied.";});
            Button(content,"LOAD CLIPBOARD JSON",()=>{var save=FleetStorage.Parse(GUIUtility.systemCopyBuffer);Simulator.Load(save);ProgramSource=save.source??"";rosterSize=save.drones.Length;});
            Note("Browser version-1 fleet JSON imports roster, teams, colors, formation, common fields, and energy options. Review imported scripts in Program before running.");
            Button(content,"OPEN SAVE FOLDER",()=>Application.OpenURL(new Uri(Application.persistentDataPath).AbsoluteUri));
        }
        void HelpPage()
        {
            Note("1. Fleet → Build → Launch.\n2. Choose a formation and motion.\n3. Fields adds Boids and layered math.\n4. Director changes shows, sky, camera and sound.\n5. Art Studio draws text, pixels and images.\n6. Arena starts a separate arcade skirmish.\n7. Replays watches recent flight without altering it.\n8. Saves stores your setup and current aircraft.");
            Note("Drag: orbit/look\nWheel or pinch: zoom\nWASD / arrows: ground/free camera\nQ / E: descend/ascend\nShift: move faster\nSpace: pause/resume\nTab: next drone\nC: next camera\nF8: cinematic\nB: arena payload\nH: hide/show interface\nEscape: exit replay\n/: search controls on this page");
            Note("Low battery recalls aircraft. Empty batteries descend under local gravity. Recharge works on parked aircraft. None/reset stops old fields and patterns.");
        }
        void StartChallenge()
        {
            Simulator.EndBattle();Simulator.Program.Stop();Simulator.Config.ResetInfluences();foreach(var g in Simulator.Config.groups)g.enabled=false;
            if(Simulator.Show.Count==0)throw new InvalidOperationException("Build at least one aircraft.");Simulator.Config.formation=FormationKind.Ring;Simulator.Config.boids=false;Simulator.LaunchAll();challenge=true;challengeClock=challengeDwell=0;challengeStage=challengeScore=0;
        }
        void Update()
        {
            if(!Document||Simulator==null)return;
            if(!Typing)
            {
                if(Input.GetKeyDown(KeyCode.Space))TogglePause();if(Input.GetKeyDown(KeyCode.Tab))NextDrone();if(Input.GetKeyDown(KeyCode.C))Rig.Mode=(CameraMode)(((int)Rig.Mode+1)%13);
                if(Input.GetKeyDown(KeyCode.F8))Rig.Mode=CameraMode.Cinematic;if(Input.GetKeyDown(KeyCode.B))Simulator.Payload();if(Input.GetKeyDown(KeyCode.H))ToggleUI();if(Input.GetKeyDown(KeyCode.Escape))Simulator.ExitReplay();if(Input.GetKeyDown(KeyCode.Slash))search.Focus();
            }
            if(challenge&&!Simulator.Paused&&!Simulator.Replay.Playing)
            {
                challengeClock+=Time.deltaTime;challengeDwell=Simulator.Show.FormationError<4?challengeDwell+Time.deltaTime:0;
                if(challengeDwell>=3){challengeDwell=0;challengeScore+=100;challengeStage++;if(challengeStage<4)Simulator.Config.formation=new[]{FormationKind.Ring,FormationKind.Grid,FormationKind.Heart,FormationKind.Sphere}[challengeStage];}
                Simulator.Notice="Formation challenge: "+challengeScore+" points · "+Mathf.Max(0,90-challengeClock).ToString("F0")+"s left";
                if(challengeClock>=90||challengeStage>=4){challenge=false;Journal.Add("Formation challenge: "+challengeScore+" points in "+challengeClock.ToString("F1")+"s.");}
            }
            clock+=Time.unscaledDeltaTime;if(clock<.15f)return;clock=0;
            var w=Simulator.Active;
            status.text=Simulator.Notice;
            var states=Simulator.Replay.Playing?Simulator.Replay.Display:w.States;int i=Mathf.Clamp(Simulator.Selected,0,Mathf.Max(0,states.Length-1));
            int blue=0,red=0;float charge=0;foreach(var d in states){charge+=d.battery01;if(!d.disabled&&d.airborne){if(d.fleetId==0)blue++;if(d.fleetId==1)red++;}}
            stats.text=(Simulator.Replay.Playing?"REPLAY":Simulator.Paused?"PAUSED":"LIVE")+"   /   "+states.Length.ToString("N0")+" DRONES"+(Simulator.Arena!=null?"   BLUE "+blue+" : "+red+" RED":"   /   "+(charge/Mathf.Max(1,states.Length)*100).ToString("F0")+"% ENERGY");
            string details=states.Length==0?"NO AIRCRAFT":$"DRONE {i+1:0000}   {states[i].frame.ToString().ToUpperInvariant()}\nALT {states[i].position.y:F1} m   SPD {states[i].velocity.magnitude:F1} m/s\nBAT {states[i].battery01*100:F0}%   HP {states[i].health:F0}   {states[i].phase}";
            var c=Simulator.Replay.Playing?Simulator.Replay.DisplayConfig:Simulator.Config;
            telemetry.text=Rig.Mode.ToString().ToUpperInvariant()+" / "+c.planet.ToString().ToUpperInvariant()+"\n"+details+$"\nMASS {PlanetModel.Mass(c):F2} kg   HOVER {PlanetModel.Power(c,0):F0} W\nEST. {PlanetModel.EnduranceMinutes(c):F1} min   NEIGHBOR CHECKS {w.Neighbors.LastChecks:N0}";
            reticle.style.display=Rig.Mode==CameraMode.FPV||Rig.Mode==CameraMode.Mounted?DisplayStyle.Flex:DisplayStyle.None;
            // Keep desktop controls reachable on narrower windows through horizontal scrolling/wrapping.
            sidebar.style.width=Root.resolvedStyle.width<900?290:340;
            float pageTop=Mathf.Max(155,nav.layout.y+nav.resolvedStyle.height+12);sidebar.style.top=pageTop;telemetry.style.top=pageTop;
        }
        void TogglePause(){if(Simulator.Replay.Playing)Simulator.Replay.Paused=!Simulator.Replay.Paused;else Simulator.Paused=!Simulator.Paused;}
        void NextDrone(){Simulator.Selected=(Simulator.Selected+1)%Mathf.Max(1,Simulator.Active.Count);}
        void ToggleUI(){hidden=!hidden;foreach(var e in new[]{header,nav,sidebar,bottom})e.style.display=hidden?DisplayStyle.None:DisplayStyle.Flex;}
        void Section(string text)=>Label(content,text,"section");void Note(string text)=>Label(content,text,"note");
        VisualElement Row(){var row=Element(content,"row");return row;}
        static VisualElement Element(VisualElement parent,string css){var e=new VisualElement();e.AddToClassList(css);parent.Add(e);return e;}
        static Label Label(VisualElement parent,string text,string css){var e=new Label(text);e.AddToClassList(css);e.tooltip=text;parent.Add(e);return e;}
        Button Button(VisualElement parent,string text,Action action,string css="")
        {
            var b=new Button(()=>{try{action();}catch(Exception e){Simulator.Notice=e.Message;Debug.LogWarning(e.Message);}}){text=text,tooltip=text};if(css.Length>0)b.AddToClassList(css);parent.Add(b);return b;
        }
        void Slider(string label,float value,float min,float max,Action<float> changed){var s=new Slider(label,min,max){value=value,showInputField=true,tooltip=label};content.Add(s);s.RegisterValueChangedCallback(e=>changed(e.newValue));}
        void Toggle(string label,bool value,Action<bool> changed){var t=new Toggle(label){value=value,tooltip=label};content.Add(t);t.RegisterValueChangedCallback(e=>changed(e.newValue));}
        void Text(string label,string value,Action<string> changed){var f=new TextField(label){value=value,tooltip=label};content.Add(f);f.RegisterValueChangedCallback(e=>changed(e.newValue));}
        void Choice(string label,string[] choices,string value,Action<string> changed){var d=new DropdownField(label,new List<string>(choices),Mathf.Max(0,Array.IndexOf(choices,value))){tooltip=label};content.Add(d);d.RegisterValueChangedCallback(e=>changed(e.newValue));}
        void EnumField<T>(string label,T value,Action<T> changed) where T:struct,Enum {var d=new EnumField(label,(Enum)(object)value){tooltip=label};content.Add(d);d.RegisterValueChangedCallback(e=>changed((T)(object)e.newValue));}
        void OnDestroy(){if(panel)Destroy(panel);}
    }
    public sealed class PixelCanvas : VisualElement
    {
        const int W=32,H=24;readonly Color[] pixels=new Color[W*H];readonly Func<Color> ink;bool painting;
        public PixelCanvas(Func<Color> ink)
        {
            this.ink=ink;AddToClassList("pixel-canvas");generateVisualContent+=Draw;
            RegisterCallback<PointerDownEvent>(e=>{painting=true;this.CapturePointer(e.pointerId);Paint(e.localPosition,e.button==1);e.StopPropagation();});
            RegisterCallback<PointerMoveEvent>(e=>{if(painting){Paint(e.localPosition,(e.pressedButtons&2)!=0);e.StopPropagation();}});
            RegisterCallback<PointerUpEvent>(e=>{painting=false;this.ReleasePointer(e.pointerId);});
            RegisterCallback<PointerCaptureOutEvent>(e=>painting=false);
        }
        void Paint(Vector2 p,bool erase){int x=Mathf.Clamp((int)(p.x/contentRect.width*W),0,W-1),y=Mathf.Clamp((int)(p.y/contentRect.height*H),0,H-1);pixels[y*W+x]=erase?Color.clear:ink();MarkDirtyRepaint();}
        void Draw(MeshGenerationContext context)
        {
            var p=context.painter2D;float w=contentRect.width/W,h=contentRect.height/H;
            for(int y=0;y<H;y++)for(int x=0;x<W;x++){p.fillColor=pixels[y*W+x].a>0?pixels[y*W+x]:new Color(.06f,.1f,.13f);p.BeginPath();p.MoveTo(new Vector2(x*w,y*h));p.LineTo(new Vector2((x+1)*w-1,y*h));p.LineTo(new Vector2((x+1)*w-1,(y+1)*h-1));p.LineTo(new Vector2(x*w,(y+1)*h-1));p.ClosePath();p.Fill();}
        }
        public void ClearPixels(){Array.Clear(pixels,0,pixels.Length);MarkDirtyRepaint();}
        public ArtPoint[] Points(){var p=new List<ArtPoint>();for(int y=0;y<H;y++)for(int x=0;x<W;x++)if(pixels[y*W+x].a>0)p.Add(new ArtPoint{position=new Vector3((x-(W-1)*.5f)*2,((H-1)*.5f-y)*2,0),color=pixels[y*W+x]});return p.ToArray();}
    }
}
