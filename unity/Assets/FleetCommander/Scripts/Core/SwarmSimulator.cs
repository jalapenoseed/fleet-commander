using System.Collections.Generic;
using UnityEngine;
using FleetCommander.Systems;
namespace FleetCommander.Core
{
    public sealed class SwarmSimulator : MonoBehaviour
    {
        public FleetWorld Show {get;private set;}
        public FleetWorld Arena {get;private set;}
        public FleetWorld Active => Arena ?? Show;
        public FleetConfig Config => Show.Config;
        public IReadOnlyList<DroneState> States => Active.States;
        public readonly ReplayBuffer Replay = new ReplayBuffer();
        public readonly CueProgram Program = new CueProgram();
        public bool Paused;
        public int Selected;
        public BehaviorStack Behaviors;
        public string Notice = "Fleet ready. Launch a show or open the battle arena.";
        public System.Action<BattleEvent> OnBattleEvent;
        float accumulator;
        public float DroppedSimulationSeconds {get;private set;}
        public const float FixedStep=1f/60;
        void Awake(){Show=new FleetWorld(new FleetConfig(),256); Show.Launch(); Behaviors.SetOnly(SwarmBehavior.Formation);}
        void Update()
        {
            if(Replay.Playing){Replay.Update(Time.unscaledDeltaTime);return;}
            if(Paused)return;
            accumulator+=Mathf.Min(Time.deltaTime,.2f); int steps=0;
            while(accumulator>=FixedStep && steps++<6){Tick(FixedStep);accumulator-=FixedStep;}
            if(accumulator>=FixedStep){DroppedSimulationSeconds+=accumulator;accumulator=0;}
        }
        public void Tick(float dt)
        {
            if(Arena==null)Program.Step(dt,Show);
            Active.Step(dt);
            Replay.Record(Active,dt);
            foreach(var e in Active.Events){OnBattleEvent?.Invoke(e);if(e.destruction)Replay.Mark("Drone down",Active.Time);}
        }
        public void Resize(int count){ExitReplay();EndBattle();Program.Stop();Show.Resize(count);Replay.Clear();Notice=count+" aircraft ready on the pads.";}
        public void LaunchAll(){ExitReplay();Active.Launch();Paused=false;Notice="Launch ordered.";}
        public void LandAll(){ExitReplay();Program.Stop();Active.Recall();Notice="Returning to reserved landing pads.";}
        public void ClearBehaviors(){Behaviors.Clear();Config.ResetInfluences();Config.boids=false;Program.Stop();Notice="Motion patterns, fields, Boids and program stopped.";}
        public void StartBattle(int perTeam)
        {
            ExitReplay();Program.Stop();Arena=new FleetWorld(Config,Mathf.Clamp(perTeam,1,128)*2,new BattleSettings());Arena.Launch();Replay.Clear();Selected=0;Paused=false;Notice="Arcade skirmish started.";
        }
        public void EndBattle(){Arena=null;Replay.Clear();Selected=0;}
        public void ExitReplay(){Replay.Stop();}
        public void Payload(){if(Replay.Playing)return;if(Active.DropPayload(Selected)){foreach(var e in Active.Events){OnBattleEvent?.Invoke(e);Replay.AddEvent(e);}Replay.Mark("Payload",Active.Time);}else Notice="Select an airborne arena drone with a payload remaining.";}
        public void Load(FleetSave save)
        {
            FleetStorage.Validate(save); ExitReplay();EndBattle();Program.Stop();Show=new FleetWorld(save.config,0);Show.Restore(save.drones,save.elapsed);Paused=true;Selected=0;Notice="Fleet loaded. Resume when ready.";
        }
    }
}
