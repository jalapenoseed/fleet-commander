using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using FleetCommander.Core;
using FleetCommander.Games;
using FleetCommander.Rendering;
using UnityEngine;
using UnityEngine.UIElements;
namespace FleetCommander.UI
{
    public sealed partial class CommanderUI
    {
        string timingOverride;Label stackText,resultTitle,resultScore,resultDetails;VisualElement resultPanel;object outcomeWorld,observedWorld;int humanTeam=-1;
        ProgressBar healthBar,energyBar;VisualElement attributes;float expansionClock;
        bool experimentRunning,experimentCancel;int experimentCount=10;float experimentSeconds=60;Label experimentStatus;
        public bool ResultOpen=>resultPanel!=null&&resultPanel.style.display==DisplayStyle.Flex;
        string TimedLabel(string label)
        {
            if(label.Contains("["))return label;string timing=timingOverride;
            if(timing==null){timing="LIVE";
                if(Page=="Fleet"&&(label=="Aircraft model"||label=="Body skin"))timing="APPLY";
                if(Page=="Fleet"||Page=="Fields"||Page=="Squads")if(Simulator.Arena!=null&&timing=="LIVE")timing="SHOW LIVE";
                if(Page=="Arena"&&(label=="Frame"||label=="Skin"||label=="Game weapon"||label=="Toy effector"||label=="Use mixed role roster"||label=="Resource capacity"||label.StartsWith("Blue ")||label.StartsWith("Red ")))timing="NEXT ROUND";
                if(label=="Game"||label=="Match time · s"||label=="Play against computer"||label=="Your side: White"||label=="Use toy lab rules in Arena"||label=="Lab activity"||label=="Toy drones per team"||label=="Tags / hill seconds to win")timing="NEW GAME";
                if(label=="Window")timing="APPLY WINDOW";
                if(Page=="Art Studio"||Page=="Program"||Page=="Saves"||label=="New gate"||label=="Board text"||label=="Batch matches"||label.StartsWith("Experiment "))timing="BUTTON";
                if(label=="Seat row"||label=="Seating side")timing=Rig.Mode==Cameras.CameraMode.Audience?"LIVE":"TAKE SEAT";
            }
            return label+" ["+timing+"]";
        }
        public static string ResourceText(DroneState d)=>"AMMO "+d.ammo+" / "+d.reserveAmmo+"   BAT "+(d.battery01*100).ToString("F0")+"%   ENERGY "+d.stamina.ToString("F0")+"\nHEAT "+(d.heat*100).ToString("F0")+"%   "+(d.reloadTime>0?"RELOAD "+d.reloadTime.ToString("F1")+"s":d.stunTime>0?"STUN "+d.stunTime.ToString("F1")+"s":d.guarding?"GUARD":d.aiState)+"   ABILITY "+(d.abilityCooldown>0?d.abilityCooldown.ToString("F1")+"s":"READY")+(d.combo>1?"   COMBO ×"+d.combo:"");
        void InitializeExpansion()
        {
            attributes=Element(Root,"attribute-hud");healthBar=new ProgressBar{lowValue=0,highValue=100,title="HEALTH"};energyBar=new ProgressBar{lowValue=0,highValue=100,title="ABILITY ENERGY"};attributes.Add(healthBar);attributes.Add(energyBar);
            stackText=Label(Root,"","active-stack");stackText.pickingMode=PickingMode.Ignore;
            resultPanel=Element(Root,"result-panel");resultPanel.style.display=DisplayStyle.None;
            Label(resultPanel,"FLEET COMMANDER / RESULT","eyebrow");resultTitle=Label(resultPanel,"","result-title");resultScore=Label(resultPanel,"","result-score");resultDetails=Label(resultPanel,"","note");
            var row=Element(resultPanel,"row");Button(row,"CONTINUE VIEWING",()=>resultPanel.style.display=DisplayStyle.None);Button(row,"PLAY AGAIN",()=>{resultPanel.style.display=DisplayStyle.None;if(Simulator.Range!=null){Simulator.StartRange();Pilot.JoinBlue();}else if(Simulator.Chess!=null)Simulator.StartChess(Simulator.ChessAI,-Simulator.ChessAISide);else if(Simulator.Sports!=null){var g=Simulator.Sports;Simulator.StartSports(g.Kind,g.Duration,g.Settings);}else if(Simulator.Arena!=null)Simulator.Rematch();else StartChallenge();});
        }
        public void ShowOutcome(string title,string score,string details,string mode)
        {resultTitle.text=title;resultScore.text=score;resultDetails.text=mode+"\n"+details;resultPanel.style.display=DisplayStyle.Flex;Audio.PlayFx(title.Contains("WIN")?"win":"goal");Pilot?.ReleaseCursor();}
        public string ActiveStack()
        {
            var c=Simulator.DisplayConfig;var s=new StringBuilder("ACTIVE STACK\n");
            if(Simulator.Sports?.Settings!=null){var g=Simulator.Sports;s.Append(g.Title).Append(" · score target ").Append(g.TargetScore).Append("\nBlue ").Append(g.Settings.blue.formation).Append(" / Red ").Append(g.Settings.red.formation).Append("\nSports roles and lanes applied at kickoff\n");}
            else if(Simulator.Arena!=null&&Simulator.Sports==null&&Simulator.Range==null){var w=Simulator.Arena;s.Append("Blue ").Append(w.CurrentFormations[0]).Append(" / Red ").Append(w.CurrentFormations[1]).Append('\n');for(int t=0;t<2;t++){var p=t==0?w.Battle.bluePlan:w.Battle.redPlan;s.Append(t==0?"B: ":"R: ").Append(p.automatic?"AUTO":"MANUAL").Append(" · spacing ").Append(p.spacing.ToString("F1")).Append(" · hold ").Append(p.cohesion.ToString("F2")).Append(" · ").Append(w.FormationSwitches[t]).Append(" switches\n");}}
            else{s.Append(c.formation).Append(" → ").Append(c.pattern).Append("\nAltitude ").Append(c.height.ToString("F0")).Append(" · scale ").Append(c.scale.ToString("F1")).Append(" · rotation ").Append(c.rotation.ToString("F0")).Append('\n');for(int g=0;g<c.groups.Length;g++)if(c.groups[g].enabled)s.Append("Squad ").Append(g+1).Append(": ").Append(c.groups[g].formation).Append('\n');}
            for(int i=0;i<c.layers.Length;i++){var l=c.layers[i];if(l.kind!=InfluenceKind.None)s.Append(i+1).Append(". ").Append(l.kind).Append(" · S ").Append(l.strength.ToString("F1")).Append(" · f ").Append(l.frequency.ToString("F2")).Append(" · φ ").Append(l.phase.ToString("F2")).Append(" · mix ").Append(l.blend.ToString("F2")).Append('\n');}
            s.Append("Boids ").Append(c.boids?"ON":"OFF").Append(" · separation ").Append(c.separation.ToString("F1")).Append("\nWind ").Append(c.wind.ToString("F1")).Append(" · obstacles ").Append(c.obstacles?"ON":"OFF");if(Simulator.Arena!=null&&Simulator.Sports==null)s.Append("\nArena uses tactical targets; show fields are inactive.");return s.ToString();
        }
        void UpdateExpansion()
        {
            if(stackText==null)return;expansionClock+=Time.unscaledDeltaTime;
            attributes.style.display=hidden||workspace!=null||Simulator.Arena==null||Simulator.Range!=null?DisplayStyle.None:DisplayStyle.Flex;
            if(Simulator.Active.Count>0){var d=Simulator.Active.States[Mathf.Clamp(Simulator.Selected,0,Simulator.Active.Count-1)];healthBar.value=d.health;healthBar.title="DRONE #"+(Simulator.Selected+1)+" · HEALTH "+d.health.ToString("F0");energyBar.value=d.stamina;energyBar.title="ABILITY ENERGY "+d.stamina.ToString("F0")+" · "+(d.abilityCooldown>0?d.abilityCooldown.ToString("F1")+"s":"READY");}
            stackText.style.display=hidden||workspace!=null||Simulator.Chess!=null||!preferences.stack?DisplayStyle.None:DisplayStyle.Flex;if(expansionClock>=.15f){expansionClock=0;stackText.text=ActiveStack();}
            object current=(object)Simulator.Chess??(object)Simulator.Range??(object)Simulator.Sports??Simulator.Active;
            if(current!=observedWorld){observedWorld=current;humanTeam=-1;resultPanel.style.display=DisplayStyle.None;}
            if(Pilot&&Pilot.IsPiloting)humanTeam=Simulator.Active.States[Pilot.DroneIndex].fleetId;
            if(outcomeWorld==current||Simulator.Replay.Playing)return;
            if(Simulator.Chess!=null&&Simulator.Chess.Finished){var c=Simulator.Chess;outcomeWorld=current;string t=c.Winner==0?"DRAW":Simulator.ChessAI?(c.Winner==-Simulator.ChessAISide?"YOU WIN":"YOU LOSE"):c.Winner==1?"WHITE WINS":"BLACK WINS";ShowOutcome(t,c.Result,c.History.Count+" plies played","CHESS");}
            else if(Simulator.Range!=null&&Simulator.Range.Finished){var r=Simulator.Range;outcomeWorld=current;ShowOutcome("RUN COMPLETE",r.Score+" POINTS",r.Hits+" hits / "+r.Shots+" shots · "+r.Penalties+" penalties","DRONE RANGE");}
            else if(Simulator.Sports!=null&&Simulator.Sports.Finished){var g=Simulator.Sports;outcomeWorld=current;ShowOutcome(WinTitle(g.Winner),g.ScoreText,g.Status,g.Title);}
            else if(Simulator.Arena!=null&&Simulator.Sports==null&&Simulator.Range==null&&Simulator.Arena.RoundEnded){var w=Simulator.Arena;outcomeWorld=current;ShowOutcome(WinTitle(w.Winner),w.BlueKills+" — "+w.RedKills+" ELIMINATIONS","Series "+Simulator.BattleSession.blueWins+" — "+Simulator.BattleSession.redWins+" · "+Simulator.SeriesCompleted+" / "+Simulator.SeriesRoundLimit+" rounds"+(Simulator.SeriesRunning?" · next round in 5 seconds":""),"ARENA");}
        }
        string WinTitle(int winner)=>winner==2?"DRAW":humanTeam>=0?(winner==humanTeam?"YOU WIN":"YOU LOSE"):winner==0?"BLUE WINS":"RED WINS";
        void RoundSeriesControls(BattleSettings b)
        {
            var rounds=new IntegerField("Number of rounds [NEW SERIES]"){value=b.roundCount};Controls.Add(rounds);rounds.RegisterValueChangedCallback(e=>b.roundCount=Mathf.Clamp(e.newValue,1,99));
            Toggle("Advance rounds automatically",b.autoAdvance,v=>b.autoAdvance=v);Button(content,"START NEW SERIES",()=>{Pilot.LeavePilot();Simulator.StartSeries(perTeam);Rig.Overview();},"primary");Button(content,"STOP SERIES",()=>Simulator.StopSeries());
        }
        void SeriesControls(BattleSettings b)
        {
            Toggle("Finite ammunition",b.finiteAmmo,v=>b.finiteAmmo=v);Slider("Resource capacity",b.resourceScale,.25f,4,v=>b.resourceScale=v);Toggle("Guard / dodge / boost abilities",b.abilities,v=>b.abilities=v);
            Note("Right click: guard (first 0.16 s parries front hits) · E: dodge · Shift: boost · R: reload. Abilities cost 25 energy and have cooldowns. Energy regenerates; flight and weapons consume battery. Three-hit chains raise damage modestly. These are arcade rules.");
            var w=Simulator.Arena;if(w!=null&&Simulator.Sports==null&&Simulator.Range==null&&w.Count>0){int id=Mathf.Clamp(Simulator.Selected,0,w.Count-1);Section("Selected drone #"+(id+1));Note(ResourceText(w.States[id]));var choices=new List<string>{"AI chooses target"};var ids=new List<int>{-1};for(int j=0;j<w.Count;j++)if(w.States[j].fleetId!=w.States[id].fleetId&&!w.States[j].disabled){choices.Add("Drone #"+(j+1));ids.Add(j);}int choice=ids.IndexOf(w.ManualTargets[id]);Choice("Manual tracking",choices.ToArray(),choices[Mathf.Max(0,choice)],v=>w.TrackTarget(id,ids[choices.IndexOf(v)]));Button(content,"RELOAD SELECTED",()=>w.Reload(Simulator.Selected));Button(content,"GUARD SELECTED",()=>w.UseAbility(Simulator.Selected,DroneAbility.Guard,Vector3.forward));}
            Note("LIVE controls affect the active world immediately. NEXT ROUND controls deploy with Apply & Rematch. Show controls marked SHOW LIVE change the separate show fleet. Saved settings persist only after Save.");
        }
        void PolishSettings()
        {
            Choice("Drone model detail",new[]{"Performance","High quality","Maximum detail"},new[]{"Performance","High quality","Maximum detail"}[Mathf.Clamp(preferences.modelQuality,0,2)],v=>{preferences.modelQuality=Array.IndexOf(new[]{"Performance","High quality","Maximum detail"},v);ApplyPreferences();});Slider("Impact screen shake",preferences.shake,0,1,v=>{preferences.shake=v;ApplyPreferences();});Slider("Impact hitstop",preferences.hitstop,0,1,v=>{preferences.hitstop=v;ApplyPreferences();});Toggle("Active formation stack",preferences.stack,v=>preferences.stack=v);
        }
        void CombatExperimentControls()
        {
            Section("Swarm experiments");Note(Simulator.Tactics.Summary());Slider("Experiment trials",experimentCount,1,50,v=>experimentCount=Mathf.RoundToInt(v));Slider("Experiment seconds",experimentSeconds,10,300,v=>experimentSeconds=v);
            Button(content,"RUN ARENA EXPERIMENT",()=>{if(!experimentRunning)StartCoroutine(ArenaExperiment());});Button(content,"CANCEL EXPERIMENT",()=>experimentCancel=true);experimentStatus=Label(content,"Seeded trials export settings and outcomes as CSV / JSON. The visible game remains available.","note");
        }
        IEnumerator ArenaExperiment()
        {
            experimentRunning=true;experimentCancel=false;var setup=Simulator.BattleSession.Clone();setup.roundSeconds=experimentSeconds;var config=JsonUtility.FromJson<FleetConfig>(JsonUtility.ToJson(Simulator.Show.Config));int count=experimentCount,roster=perTeam;var csv=new StringBuilder("trial,seed,blue_opening,red_opening,winner,seconds,blue_alive,red_alive,blue_damage,red_damage,shots,hits,battery_mean\n");
            string folder=Path.Combine(Application.persistentDataPath,"Experiments",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss"));Directory.CreateDirectory(folder);File.WriteAllText(Path.Combine(folder,"setup.json"),JsonUtility.ToJson(setup,true));File.WriteAllText(Path.Combine(folder,"trial-settings.txt"),"Drones per team: "+roster+"\nFixed step: 1/60 second\nTrials: "+count);File.WriteAllText(Path.Combine(folder,"initial-tactics.json"),JsonUtility.ToJson(Simulator.Tactics,true));File.WriteAllText(Path.Combine(folder,"initial-knowledge.json"),JsonUtility.ToJson(Simulator.Knowledge,true));File.WriteAllText(Path.Combine(folder,"environment.json"),JsonUtility.ToJson(config,true));
            for(int n=0;n<count&&!experimentCancel;n++){var b=setup.Clone();b.lab.seed=setup.lab.seed+n;var w=new FleetWorld(config,roster*2,b);Simulator.Knowledge.Bind(w.AdaptiveLab,"Arena",b.lab.seed);Simulator.Tactics.Bind(w,b.lab.seed);w.Launch();int ticks=0;while(!w.RoundEnded&&!experimentCancel){w.Step(1f/60);if(++ticks%120==0){if(experimentStatus!=null)experimentStatus.text="Trial "+(n+1)+" / "+count+" · "+w.RoundTime.ToString("F0")+" s";yield return null;}}
                if(!w.RoundEnded)break;Simulator.Tactics.Finish(w);Simulator.Knowledge.Finish(w.AdaptiveLab,w.Winner);int shots=0,hits=0;foreach(var d in w.States){shots+=d.shotsFired;hits+=d.hitsLanded;}csv.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,"{0},{1},{2},{3},{4},{5:F2},{6},{7},{8:F2},{9:F2},{10},{11},{12:F4}\n",n+1,b.lab.seed,w.LearnedOpening[0],w.LearnedOpening[1],w.Winner,w.RoundTime,w.Alive(0),w.Alive(1),w.BlueDamage,w.RedDamage,shots,hits,w.AverageBattery);File.WriteAllText(Path.Combine(folder,"outcomes.csv"),csv.ToString());Simulator.Tactics.Save();yield return null;}
            experimentRunning=false;Simulator.Notice=(experimentCancel?"Experiment cancelled. Completed trials saved: ":"Experiment complete: ")+folder;if(experimentStatus!=null)experimentStatus.text=Simulator.Notice;
        }
    }
}
