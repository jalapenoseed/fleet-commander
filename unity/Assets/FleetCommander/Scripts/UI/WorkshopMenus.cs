using System;
using System.IO;
using System.Linq;
using FleetCommander.Core;
using FleetCommander.Cameras;
using FleetCommander.Games;
using FleetCommander.Labs;
using FleetCommander.Rendering;
using FleetCommander.Systems;
using UnityEngine;
using UnityEngine.UIElements;
namespace FleetCommander.UI
{
    public sealed partial class CommanderUI
    {
        public MultiCameraRig Multi;
        public bool WorkspaceOpen=>workspace!=null&&!hidden;
        VisualElement workspace,feedPanel;readonly Image[] feedImages=new Image[3];readonly Label[] feedLabels=new Label[3];
        Label scienceText,systemsText,rangeText,targetText;ScienceCanvas scienceCanvas;CircuitCanvas circuitCanvas;PegCanvas pegCanvas;
        PlayerPreferences preferences;int pegInk=1,logicSelected;GateKind newGate=GateKind.AND;string boardText="HELLO",windowMode="Windowed 1600 × 900";
        bool showTargetDetails=true;
        void InitializeWorkshop()
        {
            Multi=GetComponent<MultiCameraRig>();preferences=PlayerPreferences.Load();ApplyPreferences();
            targetText=Label(Root,"","target-details");targetText.pickingMode=PickingMode.Ignore;
            feedPanel=Element(Root,"camera-feeds");feedPanel.pickingMode=PickingMode.Ignore;
            for(int i=0;i<3;i++){var box=Element(feedPanel,"camera-feed");box.pickingMode=PickingMode.Ignore;feedLabels[i]=Label(box,"","feed-title");feedImages[i]=new Image{scaleMode=ScaleMode.ScaleToFit,pickingMode=PickingMode.Ignore};feedImages[i].style.height=144;feedImages[i].style.width=256;box.Add(feedImages[i]);}
        }
        void ClearWorkspace(){workspace?.RemoveFromHierarchy();workspace=null;scienceText=systemsText=rangeText=null;scienceCanvas=null;circuitCanvas=null;pegCanvas=null;}
        VisualElement WorkArea(string title,bool narrow=false)
        {
            workspace=Element(Root,"work-area");workspace.style.backgroundColor=new Color(.025f,.04f,.065f,.99f);if(narrow){workspace.style.left=StyleKeyword.Auto;workspace.style.width=390;}
            Label(workspace,title,"section");return workspace;
        }
        void UpdateWorkshop()
        {
            if(workspace!=null){workspace.style.display=hidden?DisplayStyle.None:DisplayStyle.Flex;workspace.style.top=Mathf.Max(195,nav.layout.y+nav.resolvedStyle.height+12);}
            if(scienceText!=null){scienceText.text=Simulator.Science.Description(Simulator.Config);UpdateSciencePlot();}
            if(systemsText!=null)systemsText.text=SystemsReadout();
            if(rangeText!=null){var r=Simulator.Range;rangeText.text=r==null?"Ready for a 90-second run.":r.Status+"\nSCORE "+r.Score+" · COMBO ×"+r.Combo+"\nHits "+r.Hits+" / shots "+r.Shots+" · penalties "+r.Penalties+"\nAccuracy "+(r.Shots==0?0:r.Hits/(float)r.Shots).ToString("P0");}
            if(targetText!=null){targetText.style.display=hidden||!showTargetDetails||workspace!=null||Simulator.Chess!=null?DisplayStyle.None:DisplayStyle.Flex;targetText.text=TargetReadout();}
            if(feedPanel!=null){feedPanel.style.display=hidden||workspace!=null||!Multi||!Multi.Active?DisplayStyle.None:DisplayStyle.Flex;for(int i=0;i<3;i++){feedImages[i].parent.style.display=Multi&&i<Multi.FeedCount?DisplayStyle.Flex:DisplayStyle.None;if(Multi){feedImages[i].image=Multi.Textures[i];feedLabels[i].text="LIVE "+(i+1)+" · "+Multi.Views[i];}}}
        }
        string TargetReadout()
        {
            var w=Simulator.Active;if(w.Count==0)return "NO TARGET · empty fleet";int i=Mathf.Clamp(Simulator.Selected,0,w.Count-1);var d=w.States[i];Vector3 p=d.target;string label="Formation / navigation target",equipment="Flight controller";
            if(Simulator.Range!=null){equipment="Arcade tag beam";int id=Simulator.Range.AimTarget(d.position,Pilot&&Pilot.IsPiloting?Pilot.AimDirection:d.rotation*Vector3.forward,out float distance);if(id>=0){var t=Simulator.Range.Targets[id];p=t.position;label="Range target "+(id+1)+(t.avoid?" · AVOID":" · SCORE");}else{p=d.position+(Pilot&&Pilot.IsPiloting?Pilot.AimDirection:d.rotation*Vector3.forward)*100;label="Free aim · no target in reticle";}}
            else if(Simulator.Sports!=null){var sport=Simulator.Sports;if(sport.IsToy){equipment=w.AdaptiveLab.AgentEffector(d).ToString();label="Toy engagement / navigation";}else{equipment=sport.Carrier==i?"Ball possession":"Intercept / support";label=sport.Kind==SportKind.CaptureTheFlag?"Enemy flag":"Ball";p=sport.Kind==SportKind.CaptureTheFlag?sport.Flags[1-d.fleetId]:sport.Ball;}}
            else if(w.IsBattle){equipment=d.weapon.ToString();if(Pilot&&Pilot.IsPiloting){p=d.position+Pilot.AimDirection*60;label="Manual aim point · 60 m";}else if(w.TargetIds[i]>=0){p=w.AimPoints[i];label="Drone #"+(w.TargetIds[i]+1)+" · engagement target";}}
            return "DRONE #"+(i+1)+" TARGET\n"+label+"\nUsing: "+equipment+"\nXYZ "+p.x.ToString("F1")+", "+p.y.ToString("F1")+", "+p.z.ToString("F1")+" m · range "+Vector3.Distance(d.position,p).ToString("F1")+" m";
        }
        void FoldoutControls(string title,bool open,Action build){var parent=controlParent;var panel=new Foldout{text=title,value=open};Controls.Add(panel);controlParent=panel;try{build();}finally{controlParent=parent;}}
        void SciencePage()
        {
            var lab=Simulator.Science;Note("Live equations read the active simulation. The grid arrows are the same bounded target offsets used by the fleet; the yellow trail is the selected drone's history.");
            EnumField("Display",lab.view,v=>{lab.view=v;OpenPage(Page);});Toggle("Show 3D math display",lab.vectors,v=>lab.vectors=v);Toggle("Axes and 10 m grid",lab.axes,v=>lab.axes=v);Toggle("Drone trajectory",lab.trace,v=>lab.trace=v);Toggle("Pause preview time",lab.paused,v=>lab.paused=v);Slider("Preview time · s",lab.previewTime,0,120,v=>{lab.paused=true;lab.previewTime=v;});
            Button(content,"FRAME MATH DISPLAY",()=>{lab.vectors=true;Pilot?.LeavePilot();Rig.Mode=CameraMode.Orbit;Rig.AutoFocus=false;Rig.Focus=Simulator.Config.origin+Vector3.up*Simulator.Config.height;Rig.Yaw=25;Rig.Pitch=25;Rig.Distance=170;Rig.Snap();});
            if(lab.view==ScienceView.InfluenceField){Section("Edit active field layer");for(int i=0;i<Simulator.Config.layers.Length;i++){int id=i;var l=Simulator.Config.layers[i];FoldoutControls("Layer "+(i+1)+" · "+l.kind,false,()=>{EnumField("Function",l.kind,v=>l.kind=v);Slider("Strength · m",l.strength,0,32,v=>l.strength=v);Slider("Blend",l.blend,0,1,v=>l.blend=v);Slider("Frequency",l.frequency,0,5,v=>l.frequency=v);Slider("Phase · rad",l.phase,-Mathf.PI,Mathf.PI,v=>l.phase=v);});}Button(content,"EXAMPLE · WAVE + VORTEX",()=>{Simulator.Config.ResetInfluences();Simulator.Config.layers[0].kind=InfluenceKind.Wave;Simulator.Config.layers[0].strength=10;Simulator.Config.layers[1].kind=InfluenceKind.Vortex;Simulator.Config.layers[1].strength=7;lab.vectors=true;OpenPage(Page);});}
            else if(lab.view==ScienceView.HarmonicOscillator){Slider("Amplitude · m",lab.amplitude,1,40,v=>lab.amplitude=v);Slider("Angular frequency",lab.frequency,.1f,3,v=>lab.frequency=v);}
            else{Slider("Sigma",lab.sigma,1,20,v=>lab.sigma=v);Slider("Rho",lab.rho,1,45,v=>lab.rho=v);Slider("Beta",lab.beta,1,5,v=>lab.beta=v);}
            if(lab.view!=ScienceView.InfluenceField)Button(content,"MAKE CURVE A DRONE FORMATION",()=>{var points=lab.Curve(240).Select(p=>new ArtPoint{position=p,color=Color.cyan}).ToArray();ApplyArt(points);Simulator.Notice="The sampled curve is now an Art formation; flight physics still applies.";});
            Button(content,"EXPORT RUNNABLE PYTHON + FORMULAS",()=>{string path=lab.Export(Simulator.Config,Path.Combine(Application.persistentDataPath,"Science"));GUIUtility.systemCopyBuffer=path;Simulator.Notice="Exported "+path+" · path copied. Run with Python 3.";});
            Button(content,"OPEN SCIENCE EXPORT FOLDER",()=>{string p=Path.Combine(Application.persistentDataPath,"Science");Directory.CreateDirectory(p);Application.OpenURL(new Uri(p).AbsoluteUri);});
            Note("Python exports all active layers and their parameters, field CSV data, a Lorenz RK4 trajectory and a harmonic oscillator. Optional --plot uses matplotlib. The export does not claim to recreate the whole flight solver.");
            var work=WorkArea("LIVE MATH / SCIENCE",true);var scroll=new ScrollView();scroll.style.flexGrow=1;work.Add(scroll);scienceText=Label(scroll,lab.Description(Simulator.Config),"formula-text");scienceCanvas=new ScienceCanvas();scroll.Add(scienceCanvas);Label(scroll,"Plot: selected field sample over time, or the selected curve.\nWorld axes: X red · Y green · Z cyan.","note");UpdateSciencePlot();
        }
        void UpdateSciencePlot(){if(scienceCanvas==null)return;var lab=Simulator.Science;if(lab.view==ScienceView.InfluenceField){var p=new Vector3[200];for(int i=0;i<p.Length;i++)p[i]=new Vector3((i-100)*.25f,ScienceLab.Field(Simulator.Config,new Vector3(20,0,0),0,lab.previewTime+(i-100)*.025f).y,0);scienceCanvas.Points=p;}else scienceCanvas.Points=lab.Curve();scienceCanvas.MarkDirtyRepaint();}
        void LogicPage()
        {
            var c=Simulator.Circuit;c.Validate();Note("Build a combinational circuit. Each gate can read earlier gates. Click an input in the diagram to toggle it; cyan wires carry 1. Feedback loops are rejected.");
            foreach(string name in new[]{"Half adder","Full adder","Multiplexer","Alarm"}){string demo=name;Button(content,demo,()=>{Simulator.Circuit=LogicCircuit.Example(demo);logicSelected=0;OpenPage(Page);});}
            Section("Build gates");EnumField("New gate",newGate,v=>newGate=v);Button(content,"ADD GATE",()=>{int inputs=LogicCircuit.Arity(newGate);logicSelected=c.Add(newGate.ToString()+" "+c.nodes.Count,newGate,inputs>0?0:-1,inputs>1?Mathf.Min(1,c.nodes.Count-1):-1);OpenPage(Page);});Button(content,"REMOVE LAST GATE",()=>{if(c.nodes.Count>1)c.nodes.RemoveAt(c.nodes.Count-1);logicSelected=Mathf.Clamp(logicSelected,0,c.nodes.Count-1);OpenPage(Page);});
            string[] names=c.nodes.Select((n,i)=>i+" · "+n.name).ToArray();logicSelected=Mathf.Clamp(logicSelected,0,c.nodes.Count-1);Choice("Edit gate",names,names[logicSelected],v=>{logicSelected=Array.IndexOf(names,v);OpenPage(Page);});var node=c.nodes[logicSelected];Text("Name",node.name,v=>{node.name=v;circuitCanvas?.Refresh();});
            if(node.kind==GateKind.Input)Toggle("Input value",node.input,v=>{node.input=v;circuitCanvas?.Refresh();});
            int arity=LogicCircuit.Arity(node.kind);if(arity>0){var earlier=names.Take(logicSelected).ToArray();Choice("Wire A",earlier,names[node.a],v=>{node.a=Array.IndexOf(names,v);circuitCanvas?.Refresh();});if(arity>1)Choice("Wire B",earlier,names[node.b],v=>{node.b=Array.IndexOf(names,v);circuitCanvas?.Refresh();});}
            Button(content,"SHOW TRUTH TABLE",()=>{var text=c.TruthTable();GUIUtility.systemCopyBuffer=text;var outFile=Path.Combine(Application.persistentDataPath,"logic-truth-table.csv");File.WriteAllText(outFile,text);Simulator.Notice="All input combinations evaluated; CSV saved and copied.";ShowTruthTable(text);});
            Button(content,"TEST ADDER EXAMPLES",()=>{int passed=0;foreach(string example in new[]{"Half adder","Full adder"}){var circuit=LogicCircuit.Example(example);int count=example=="Half adder"?4:8;for(int n=0;n<count;n++){circuit.nodes[0].input=(n&1)!=0;circuit.nodes[1].input=(n&2)!=0;if(count==8)circuit.nodes[2].input=(n&4)!=0;var v=circuit.Evaluate();int sum=(n&1)+((n>>1)&1)+(count==8?(n>>2)&1:0);int got=(v[count==8?4:2]?1:0)+(v[count==8?7:3]?2:0);if(sum==got)passed++;}}Simulator.Notice=passed+" / 12 independent adder cases passed.";});
            Button(content,"SAVE CIRCUIT",()=>File.WriteAllText(Path.Combine(Application.persistentDataPath,"logic-circuit.json"),JsonUtility.ToJson(c,true)));Button(content,"LOAD CIRCUIT",()=>{var loaded=JsonUtility.FromJson<LogicCircuit>(File.ReadAllText(Path.Combine(Application.persistentDataPath,"logic-circuit.json")));loaded.Validate();if(loaded.nodes.Count==0)throw new ArgumentException("Circuit is empty.");Simulator.Circuit=loaded;logicSelected=0;OpenPage(Page);});
            Section("Integer playground");var number=new IntegerField("Integer"){value=logicValue};Controls.Add(number);var binary=Label(Controls,"","note");Action update=()=>binary.text=logicValue+" = 0b"+Convert.ToString(logicValue,2)+" = 0x"+logicValue.ToString("X");number.RegisterValueChangedCallback(e=>{logicValue=e.newValue;update();});var row=Row();Button(row,"1337",()=>number.value=1337);Button(row,"80085",()=>number.value=80085);update();
            var work=WorkArea("CIRCUIT / LIVE WIRES");var scroll=new ScrollView(ScrollViewMode.VerticalAndHorizontal);scroll.style.flexGrow=1;work.Add(scroll);circuitCanvas=new CircuitCanvas(c,id=>{logicSelected=id;OpenPage(Page);});scroll.Add(circuitCanvas);
        }
        void ShowTruthTable(string text){var old=workspace?.Q<TextField>("truth-table");if(old!=null)old.RemoveFromHierarchy();if(workspace!=null){var table=new TextField{multiline=true,isReadOnly=true,value=text,name="truth-table"};table.style.height=160;workspace.Add(table);}}
        void BoardPage()
        {
            Note("A 32 × 24 luminous peg board. Paint with the left button, erase with the right, choose a color below. The large board is interactive; you can also turn it into a drone show.");
            var row=Row();row.style.flexWrap=Wrap.Wrap;for(int i=0;i<9;i++){int color=i+1;var b=Button(row,color.ToString(),()=>{pegInk=color;OpenPage(Page);});b.style.width=28;b.style.minWidth=28;b.style.backgroundColor=DroneRenderer.Palette[i];b.style.color=Color.black;}Button(content,"ERASER",()=>pegInk=0);
            foreach(string name in new[]{"Heart","Rainbow","Circuit"}){string n=name;Button(content,n,()=>{Simulator.Board.Example(n);pegCanvas?.MarkDirtyRepaint();Audio.PlayFx("ui");});}
            Text("Board text",boardText,v=>boardText=v);Button(content,"STAMP TEXT / SYMBOL",()=>{Simulator.Board.Clear();var points=ArtStudio.Text(boardText);float extent=Mathf.Max(1,points.Max(p=>Mathf.Abs(p.position.x))),scale=Mathf.Min(1,14/extent);foreach(var p in points)Simulator.Board.Set(Mathf.RoundToInt(15.5f+p.position.x*scale),Mathf.RoundToInt(11.5f-p.position.y*scale),Mathf.Max(1,pegInk));pegCanvas?.MarkDirtyRepaint();});
            Button(content,"CLEAR BOARD",()=>{Simulator.Board.Clear();pegCanvas?.MarkDirtyRepaint();});Toggle("Show physical board",Simulator.BoardInWorld,v=>Simulator.BoardInWorld=v);
            Button(content,"VIEW NIGHT BOARD",()=>{Simulator.BoardInWorld=true;Simulator.EndBattle();Simulator.Config.sky=SkyKind.Night;Rig.Mode=CameraMode.Front;Rig.AutoFocus=false;Rig.Focus=new Vector3(0,43,60);Rig.Distance=72;});
            Button(content,"MAKE DRONE LIGHT SHOW",()=>{var points=Simulator.Board.Points();if(points.Length==0)throw new ArgumentException("Light at least one peg.");Simulator.Resize(points.Length);ApplyArt(points);Simulator.Config.sky=SkyKind.Night;Simulator.BoardInWorld=false;});
            Button(content,"SAVE BOARD",()=>File.WriteAllText(Path.Combine(Application.persistentDataPath,"night-brite.json"),JsonUtility.ToJson(Simulator.Board,true)));Button(content,"LOAD BOARD",()=>{var b=JsonUtility.FromJson<LightBoard>(File.ReadAllText(Path.Combine(Application.persistentDataPath,"night-brite.json")));b.Validate();Simulator.Board=b;OpenPage(Page);});
            var work=WorkArea("NIGHT BRITE / PAINT WITH LIGHT");pegCanvas=new PegCanvas(Simulator.Board,()=>pegInk,()=>{});work.Add(pegCanvas);Label(work,"LEFT: place peg     RIGHT: erase     Colors: 1–9 palette above","note");
        }
        void RangePage()
        {
            Note("Arcade reflex shooting from a drone: three 30-second stages—accuracy, reflex and moving targets. Blue targets earn 100 plus combo and speed bonuses; amber targets cost 150. A missed or expired score target breaks your combo.");
            Button(content,"START 90-SECOND RUN",()=>{Simulator.StartRange();Pilot.JoinBlue();Rig.Mode=CameraMode.FPV;OpenPage(Page);},"primary");
            rangeText=Label(content,"","scoreboard");if(Simulator.Range!=null){Button(content,"FLY RANGE DRONE",()=>{Pilot.JoinBlue();Rig.Mode=CameraMode.FPV;});Button(content,"LEAVE PILOT",()=>Pilot.LeavePilot());Button(content,"RETURN TO FLEET",()=>{Pilot.LeavePilot();Simulator.EndBattle();Rig.ResetView();OpenPage(Page);});}
            Note("Click the viewport to capture the mouse. Mouse aims; click shoots; WASD flies; Space / Ctrl change height; Shift boosts; Escape releases the cursor. The run ends at 90 seconds and saves your score.");
            Section("Previous runs");foreach(var result in Simulator.Results.matches.Where(m=>m.mode=="Drone Range").Reverse().Take(8))Note(result.ended+" · "+result.blue+" points");
        }
        void CameraPage()
        {
            Section("Audience point of view");Note("Choose a stadium row and side for the show. Other scenes place a viewer at the shore, creek bank or ground beside the flight area.");Slider("Seat row",Rig.AudienceRow,0,17,v=>Rig.AudienceRow=Mathf.RoundToInt(v));Choice("Seating side",new[]{"Near stand","East stand","Far stand","West stand"},new[]{"Near stand","East stand","Far stand","West stand"}[Rig.AudienceSide],v=>Rig.AudienceSide=Array.IndexOf(new[]{"Near stand","East stand","Far stand","West stand"},v));Button(content,"TAKE AUDIENCE SEAT",()=>Rig.AudienceView(),"primary");Button(content,"TRACK SHOW CENTER",()=>{Rig.Focus=new Vector3(0,Simulator.Config.height,0);});
            ArenaCameraControls();Section("Live multicamera");Choice("Extra live feeds",new[]{"Off","1","2","3"},Multi.FeedCount==0?"Off":Multi.FeedCount.ToString(),v=>Multi.FeedCount=v=="Off"?0:int.Parse(v));for(int i=0;i<3;i++){int feed=i;EnumField("Feed "+(i+1),Multi.Views[i],v=>Multi.Views[feed]=v);}Note("Main view plus up to three live 512 × 288 monitors. Each feed independently renders the drone models from its own viewpoint. Extra views increase GPU work.");
        }
        void ApplyPreferences(){if(preferences==null)return;preferences.Apply(Audio,Pilot,Camera.main,GetComponent<DroneRenderer>(),GetComponent<LabRenderer>());showTargetDetails=preferences.target;}
        void SettingsPage()
        {
            preferences.master=Audio.Volume;preferences.muted=Audio.Muted;
            Note("Sound, camera and quality changes are LIVE. Save keeps them across launches. Window changes require APPLY WINDOW.");PolishSettings();
            Section("Sound");Toggle("Mute all",preferences.muted,v=>{preferences.muted=v;ApplyPreferences();});Slider("Master volume",preferences.master,0,1,v=>{preferences.master=v;ApplyPreferences();});Slider("Sound FX",preferences.effects,0,1,v=>{preferences.effects=v;ApplyPreferences();});Slider("Music / sequencer",preferences.music,0,1,v=>{preferences.music=v;ApplyPreferences();});Slider("Drone motors",preferences.motor,0,1,v=>{preferences.motor=v;ApplyPreferences();});Slider("Water ambience",preferences.ambience,0,1,v=>{preferences.ambience=v;ApplyPreferences();});Button(content,"TEST SOUND FX",()=>Audio.PlayFx("goal"));
            Section("Camera and display");Slider("Field of view",preferences.fov,40,100,v=>{preferences.fov=v;ApplyPreferences();});Slider("Mouse sensitivity",preferences.sensitivity,.2f,5,v=>{preferences.sensitivity=v;ApplyPreferences();});Toggle("Bloom",preferences.bloom,v=>{preferences.bloom=v;ApplyPreferences();});Toggle("Shadows",preferences.shadows,v=>{preferences.shadows=v;ApplyPreferences();});Toggle("Health markers",preferences.health,v=>{preferences.health=v;ApplyPreferences();});Toggle("Target details",preferences.target,v=>{preferences.target=v;ApplyPreferences();});Toggle("Vertical sync",preferences.vsync,v=>{preferences.vsync=v;ApplyPreferences();});Choice("Frame limit",new[]{"30","60","120"},preferences.frameRate.ToString(),v=>{preferences.frameRate=int.Parse(v);ApplyPreferences();});
            Choice("Window",new[]{"Windowed 1600 × 900","Windowed 1920 × 1080","Fullscreen"},windowMode,v=>windowMode=v);Button(content,"APPLY WINDOW",()=>{if(windowMode=="Fullscreen")Screen.SetResolution(Display.main.systemWidth,Display.main.systemHeight,FullScreenMode.FullScreenWindow);else Screen.SetResolution(windowMode.Contains("1920")?1920:1600,windowMode.Contains("1920")?1080:900,FullScreenMode.Windowed);});
            Button(content,"APPLY & SAVE SETTINGS",()=>{ApplyPreferences();preferences.Save();Simulator.Notice="Player settings saved.";},"primary");Button(content,"RESTORE PLAYER DEFAULTS",()=>{preferences=new PlayerPreferences();ApplyPreferences();preferences.Save();OpenPage(Page);});
        }
        string SystemsReadout()
        {
            var w=Simulator.Active;var c=w.Config;return "SIMULATION SYSTEMS\nSolver: 60 Hz · "+w.Count+" aircraft\nWorld time "+w.Time.ToString("F2")+" s · "+(Simulator.Paused?"PAUSED":"RUNNING")+"\nFlight: "+c.planet+" · "+c.scenery+"\nBoids: "+c.boids+" · obstacle avoidance: "+c.obstacles+"\nEnergy: "+(c.unlimited?"unlimited":PlanetModel.EnduranceMinutes(c).ToString("F1")+" min estimated")+"\nAdaptive lab: "+(w.IsBattle&&w.Battle.lab.enabled?"30 Hz simulated sensors":"inactive")+"\nAircraft assets: "+GetComponent<DroneRenderer>().LoadedModelAssets+" / 12\nAudio effects: "+Audio.LoadedEffects+" loaded · "+Audio.EffectsPlayed+" cues played\nLive camera feeds: "+Multi.FeedCount+"\n\n"+TargetReadout()+"\n\nVision boxes use simulated scene observations. No neural detector is installed. Scenery props beyond the three configured avoidance envelopes are visual meshes; this is not a full rigid-body world.";
        }
        void SystemsPage()
        {
            Note("Live diagnostics and switches for the current world. Open Physics or Fields for detailed model parameters.");var c=Simulator.Config;Toggle("Boids steering",c.boids,v=>c.boids=v);Toggle("Obstacle avoidance",c.obstacles,v=>c.obstacles=v);Toggle("Unlimited battery",c.unlimited,v=>c.unlimited=v);Slider("Wind",c.wind,0,5,v=>c.wind=v);Toggle("Show target / aim line",GetComponent<LabRenderer>().ShowTarget,v=>{GetComponent<LabRenderer>().ShowTarget=v;showTargetDetails=v;});
            Button(content,"OPEN PHYSICS",()=>OpenPage("Physics"));Button(content,"OPEN ACTIVE MATH",()=>OpenPage("Nerd Lab"));Button(content,"OPEN CAMERA SYSTEM",()=>OpenPage("Cameras"));Button(content,"OPEN SAVE FOLDER",()=>Application.OpenURL(new Uri(Application.persistentDataPath).AbsoluteUri));
            systemsText=Label(WorkArea("SYSTEMS / LIVE STATE"),SystemsReadout(),"formula-text");
        }
    }
}
