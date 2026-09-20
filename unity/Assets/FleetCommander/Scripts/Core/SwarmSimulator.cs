using System.Collections.Generic;
using UnityEngine;
using FleetCommander.Systems;
namespace FleetCommander.Core
{
    public sealed class SwarmSimulator : MonoBehaviour
    {
        public FleetWorld Show {get;private set;}
        public FleetWorld Arena {get;private set;}
        public SportsMatch Sports {get;private set;}
        public FleetWorld Active => Sports != null ? Sports.World : Arena ?? Show;
        public FleetConfig Config => Active.Config;
        public FleetConfig DisplayConfig => Replay.Playing ? Replay.DisplayConfig : Active.Config;
        public BattleSettings BattleSession {get;private set;} = new BattleSettings();
        public IReadOnlyList<DroneState> States => Active.States;
        public readonly ReplayBuffer Replay = new ReplayBuffer();
        public readonly CueProgram Program = new CueProgram();
        public bool Paused;
        public int Selected;
        public BehaviorStack Behaviors;
        public string Notice = "Fleet ready. Launch a show or open the battle arena.";
        public System.Action<BattleEvent> OnBattleEvent;
        public System.Action<FleetWorld> OnRoundFinished;
        public System.Action<SportsMatch> OnSportsFinished;bool sportsAnnounced;
        float accumulator;
        int battlePerTeam=16;
        bool roundAnnounced;
        public float DroppedSimulationSeconds {get;private set;}
        public const float FixedStep=1f/60;
        void Awake(){Show=new FleetWorld(new FleetConfig(),256); Show.Launch(); Behaviors.SetOnly(SwarmBehavior.Formation);}
        void Update()
        {
            if(Replay.Playing){Arena?.ClearControl();Replay.Update(Time.unscaledDeltaTime);return;}
            if(Paused)return;
            accumulator+=Mathf.Min(Time.deltaTime,.2f); int steps=0;
            while(accumulator>=FixedStep && steps++<6){Tick(FixedStep);accumulator-=FixedStep;}
            if(accumulator>=FixedStep){DroppedSimulationSeconds+=accumulator;accumulator=0;}
        }
        public void Tick(float dt)
        {
            if(Sports!=null){Sports.Step(dt);if(Sports.Ended&&!sportsAnnounced){sportsAnnounced=true;OnSportsFinished?.Invoke(Sports);}return;}
            if(Arena==null)Program.Step(dt,Show);
            Active.Step(dt);
            Replay.Record(Active,dt);
            foreach(var e in Active.Events){OnBattleEvent?.Invoke(e);if(e.destruction)Replay.Mark("Drone down",Active.Time);}
            if(Arena!=null && Arena.RoundEnded && !roundAnnounced)
            {
                roundAnnounced=true;Arena.ClearControl();
                string result=Arena.Winner==0?"BLUE WINS":Arena.Winner==1?"RED WINS":"DRAW";
                Notice=result+" · Round kills "+Arena.BlueKills+"–"+Arena.RedKills+" · Series "+BattleSession.blueWins+"–"+BattleSession.redWins+" ("+BattleSession.draws+" draws). Rematch to play again.";
                Replay.Mark(result,Arena.Time);OnRoundFinished?.Invoke(Arena);
            }
        }
        public void Resize(int count){ExitReplay();EndBattle();Program.Stop();Show.Resize(count);Replay.Clear();Notice=count+" aircraft ready on the pads.";}
        public void LaunchAll(){if(Sports!=null){Paused=false;return;}ExitReplay();Active.Launch();Paused=false;Notice="Launch ordered.";}
        public void LandAll(){if(Sports!=null){Notice="Use Sports → Return to show fleet to leave the match.";return;}ExitReplay();Program.Stop();Active.Recall();Notice="Returning to reserved landing pads.";}
        public void ClearBehaviors(){Behaviors.Clear();Config.ResetInfluences();Config.boids=false;Program.Stop();Notice="Motion patterns, fields, Boids and program stopped.";}
        public void StartBattle(int perTeam)
        {
            ExitReplay();Sports=null;Program.Stop();Arena?.ClearControl();BattleSession.Validate();
            battlePerTeam=Mathf.Clamp(perTeam,1,128);
            var arenaConfig=JsonUtility.FromJson<FleetConfig>(JsonUtility.ToJson(Show.Config));
            Arena=new FleetWorld(arenaConfig,battlePerTeam*2,BattleSession);Arena.Launch();
            Replay.Clear();Selected=0;Paused=false;accumulator=0;roundAnnounced=false;
            Notice="Arcade round started. Choose Join Blue / Red to fly into the fight.";
        }
        public void Rematch(){StartBattle(battlePerTeam);}
        public void ApplyArenaLoadouts(){Rematch();}
        public void ResetBattleScore()
        {
            BattleSession.blueWins=BattleSession.redWins=BattleSession.draws=0;
            Notice="Series score reset. The current round is unchanged.";
        }
        public void ResetBattleDefaults()
        {
            int blue=BattleSession.blueWins,red=BattleSession.redWins,draws=BattleSession.draws;
            BattleSession.ResetDefaults();BattleSession.blueWins=blue;BattleSession.redWins=red;BattleSession.draws=draws;
            Notice="Arena rules restored; rematch applies default loadouts. Series score retained.";
        }
        public void StartSports(SportsSettings settings){settings.Validate();ExitReplay();EndBattle();Program.Stop();Sports=new SportsMatch(settings);sportsAnnounced=false;Paused=false;Selected=0;Notice="Sports match started.";}
        public void EndBattle(){Sports=null;Arena?.ClearControl();Arena=null;Replay.Clear();Selected=0;accumulator=0;roundAnnounced=false;}
        public void ExitReplay(){Replay.Stop();}
        public void Payload()
        {
            if(Replay.Playing)return;
            if(Paused){Notice="Resume the arena before firing a pulse charge.";return;}
            int firstEvent=Active.Events.Count;
            if(Active.DropPayload(Selected))
            {
                for(int i=firstEvent;i<Active.Events.Count;i++){var e=Active.Events[i];OnBattleEvent?.Invoke(e);Replay.AddEvent(e);}
                Replay.Mark("Payload",Active.Time);
            }
            else Notice="Select an airborne arena drone with a pulse charge remaining.";
        }
        public void Load(FleetSave save)
        {
            FleetStorage.Validate(save); ExitReplay();EndBattle();Program.Stop();Show=new FleetWorld(save.config,0);Show.Restore(save.drones,save.elapsed);Paused=true;Selected=0;Notice="Fleet loaded. Resume when ready.";
        }
    }
}
