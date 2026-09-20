using System;
using UnityEngine;
using FleetCommander.Core;
namespace FleetCommander.Games
{
    public enum RangeEvent { Shot, Hit, Penalty, Miss, Complete }
    public sealed class RangeTarget {public Vector3 position;public float radius=1.8f,age,lifetime=4;public bool active,avoid;}
    // Arcade reflex challenges with abstract score targets. No real-world training or ballistics model.
    public sealed class DroneRangeGame
    {
        public readonly FleetWorld World;
        public readonly RangeTarget[] Targets=new RangeTarget[8];
        public event Action<RangeEvent,Vector3,Vector3> OnEvent;
        public float Remaining {get;private set;}=90;
        public int Score {get;private set;}
        public int Hits {get;private set;}
        public int Shots {get;private set;}
        public int Misses {get;private set;}
        public int Penalties {get;private set;}
        public int Combo {get;private set;}
        public bool Finished=>Remaining<=0;
        public int Stage=>Remaining>60?1:Remaining>30?2:3;
        public string StageName=>Stage==1?"ACCURACY":Stage==2?"REFLEX":"TRACKING";
        public string Status=>Finished?"RANGE COMPLETE · "+Score+" points":"STAGE "+Stage+" / 3 · "+StageName+" · "+Mathf.CeilToInt(Remaining)+"s";
        float clock,spawn,cooldown;int sequence;
        public DroneRangeGame(FleetConfig source)
        {
            var c=JsonUtility.FromJson<FleetConfig>(JsonUtility.ToJson(source));c.height=5;c.speed=10;c.boids=false;c.obstacles=false;c.unlimited=true;c.wind=0;c.scenery=SceneryKind.Stadium;c.sky=SkyKind.Day;
            var b=new BattleSettings{engage=false,adaptive=false};World=new FleetWorld(c,1,b);World.Launch();World.States[0]=DroneState.Create(0,0,new Vector3(0,6,-34));World.States[0].phase=FlightPhase.Flying;World.ExternalTargets=new[]{World.States[0].position};
            for(int i=0;i<Targets.Length;i++)Targets[i]=new RangeTarget();Spawn();
        }
        void Spawn()
        {for(int i=0;i<Targets.Length;i++)if(!Targets[i].active){int n=sequence++;var t=Targets[i];t.position=new Vector3((n%5-2)*9,5+(n/5%3)*5,16+n%3*7);t.radius=Stage==1?2.2f:Stage==2?1.7f:1.4f;t.active=true;t.age=0;t.avoid=n%5==4;t.lifetime=Stage==1?4.5f:Stage==2?2.6f:3.5f;return;}}
        public void Tick(float dt)
        {
            if(Finished||dt<=0||float.IsNaN(dt)||float.IsInfinity(dt))return;dt=Mathf.Min(dt,.05f);Remaining=Mathf.Max(0,Remaining-dt);clock+=dt;cooldown=Mathf.Max(0,cooldown-dt);
            if(Finished){World.ClearControl();foreach(var t in Targets)t.active=false;OnEvent?.Invoke(RangeEvent.Complete,Vector3.zero,Vector3.zero);return;}
            World.Step(dt);ref var d=ref World.States[0];d.position=new Vector3(Mathf.Clamp(d.position.x,-26,26),Mathf.Clamp(d.position.y,2,22),Mathf.Clamp(d.position.z,-45,-10));
            spawn-=dt;if(spawn<=0){Spawn();spawn=Stage==1?1.6f:Stage==2?.85f:1.2f;}
            foreach(var t in Targets)if(t.active){t.age+=dt;if(Stage==3)t.position.x+=Mathf.Cos(clock*1.7f+t.position.z)*dt*4;if(t.age>=t.lifetime){t.active=false;if(!t.avoid){Misses++;Combo=0;OnEvent?.Invoke(RangeEvent.Miss,t.position,t.position);}}}
        }
        public int AimTarget(Vector3 origin,Vector3 direction,out float distance)
        {
            int found=-1;distance=150;if(direction.sqrMagnitude<.001f)return -1;direction.Normalize();
            for(int i=0;i<Targets.Length;i++){var t=Targets[i];if(!t.active)continue;var v=t.position-origin;float along=Vector3.Dot(v,direction),disc=t.radius*t.radius-(v.sqrMagnitude-along*along);if(disc<0)continue;float hit=along-Mathf.Sqrt(disc);if(hit>=0&&hit<distance){distance=hit;found=i;}}return found;
        }
        public bool Fire(Vector3 origin,Vector3 direction)
        {
            if(Finished||cooldown>0||!FleetConfig.Finite(direction)||direction.sqrMagnitude<.001f)return false;cooldown=.18f;Shots++;
            int target=AimTarget(origin,direction,out float distance);var end=origin+direction.normalized*distance;OnEvent?.Invoke(RangeEvent.Shot,origin,end);
            if(target<0){Misses++;Combo=0;return true;}var t=Targets[target];t.active=false;
            if(t.avoid){Penalties++;Score=Mathf.Max(0,Score-150);Combo=0;OnEvent?.Invoke(RangeEvent.Penalty,origin,end);}
            else{Hits++;Combo++;Score+=100+Mathf.Min(10,Combo)*10+Mathf.RoundToInt(Mathf.Max(0,t.lifetime-t.age)*10);OnEvent?.Invoke(RangeEvent.Hit,origin,end);}return true;
        }
    }
}
