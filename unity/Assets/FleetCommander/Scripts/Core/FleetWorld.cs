using System;
using System.Collections.Generic;
using UnityEngine;
namespace FleetCommander.Core
{
    public enum BattleStyle { Balanced, Pursuit, Evasive, Guardian }
    [Serializable] public sealed class BattleSettings
    {
        public BattleStyle blue, red = BattleStyle.Evasive;
        public bool engage = true, adaptive = true;
        public float gameDamage = 9, fireInterval = .8f;
        public int blueWins, redWins;
        public Vector3 blueWaypoint = new Vector3(-20, 25, 0), redWaypoint = new Vector3(20, 25, 0);
    }
    [Serializable] public struct BattleEvent
    {
        public Vector3 from, to;
        public int team;
        public bool destruction, payload;
    }
    public sealed class FleetWorld
    {
        public const int MaxDrones = 10000, MaxBattleDrones = 256;
        public static readonly Bounds[] Obstacles = {
            new Bounds(new Vector3(-76,8.5f,-32),new Vector3(24,17,32)),
            new Bounds(new Vector3(78,15,-58),new Vector3(20,30,28)),
            new Bounds(new Vector3(62,6.5f,66),new Vector3(26,13,20)) };
        public FleetConfig Config;
        public DroneState[] States { get; private set; } = Array.Empty<DroneState>();
        public readonly SpatialHash Neighbors = new SpatialHash();
        public readonly List<BattleEvent> Events = new List<BattleEvent>(256);
        public readonly BattleSettings Battle;
        public float Time { get; private set; }
        public bool IsBattle => Battle != null;
        public int Count => States.Length;
        public int Winner { get; private set; } = -1;
        DroneState[] next = Array.Empty<DroneState>();
        float[] damage = Array.Empty<float>();
        public FleetWorld(FleetConfig config, int count, BattleSettings battle = null) { Config = config; Battle = battle; Resize(count); }

        public void Resize(int count)
        {
            count = Mathf.Clamp(count, 0, IsBattle ? MaxBattleDrones : MaxDrones);
            States = new DroneState[count]; next = new DroneState[count]; damage = new float[count]; Time = 0; Winner = -1; Events.Clear();
            for (int i = 0; i < count; i++)
            {
                Vector3 home = FormationMath.Grid(i, count, 2.5f) + new Vector3(0, .65f, 130);
                if (IsBattle) home = new Vector3(i % 2 == 0 ? -65 : 65, .65f, (i / 2 - count / 4f) * 2.5f);
                foreach (var box in Obstacles) if (Mathf.Abs(home.x-box.center.x) < box.extents.x+2 && Mathf.Abs(home.z-box.center.z) < box.extents.z+2) home.y = box.max.y + .7f;
                States[i] = DroneState.Create(i, IsBattle ? i % 2 : i % 4, home);
            }
        }
        public void Launch(int group = -1)
        {
            for (int i = 0; i < Count; i++) if ((group < 0 || States[i].fleetId == group) && States[i].phase == FlightPhase.Grounded && States[i].battery01 >= .2f && !States[i].disabled)
                States[i].phase = FlightPhase.Flying;
        }
        public void Recall(int group = -1)
        {
            for (int i = 0; i < Count; i++) if ((group < 0 || States[i].fleetId == group) && States[i].phase == FlightPhase.Flying) States[i].phase = FlightPhase.Returning;
        }
        public void Recharge() { for (int i = 0; i < Count; i++) if (States[i].phase == FlightPhase.Grounded && !States[i].disabled) States[i].battery01 = 1; }
        public void SetCharge(float value) { for (int i = 0; i < Count; i++) States[i].battery01 = Mathf.Clamp01(value); }
        public int Alive(int team)
        {
            int n = 0; foreach (var d in States) if (d.fleetId == team && !d.disabled && d.airborne) n++; return n;
        }
        public float AverageBattery { get { float v = 0; foreach (var s in States) v += s.battery01; return v / Mathf.Max(1, Count); } }
        public float FormationError { get { float v=0; int n=0; foreach(var s in States) if(s.phase == FlightPhase.Flying) {v += Vector3.Distance(s.position,s.target);n++;} return n==0 ? 1000 : v/n; } }

        // Two buffers make every drone read the same instant; update order cannot bias the flock.
        public void Step(float dt)
        {
            if (dt <= 0 || float.IsNaN(dt) || float.IsInfinity(dt)) return;
            dt = Mathf.Min(dt, .05f); Time += dt; Events.Clear(); Array.Clear(damage,0,damage.Length);
            if (Config.boids) Neighbors.Build(States, Config.neighborRadius);
            for (int i = 0; i < Count; i++)
            {
                var s = States[i]; s.cooldown = Mathf.Max(0, s.cooldown-dt); s.massKg = PlanetModel.Mass(Config);
                if (s.phase == FlightPhase.Grounded)
                {
                    if (!s.disabled && Vector3.Distance(s.position,s.home) < 1) s.battery01 = Mathf.Min(1,s.battery01+dt/90);
                    next[i] = s; continue;
                }
                if (s.phase == FlightPhase.Wreck) { next[i] = s; continue; }
                if (s.battery01 <= 0 || !PlanetModel.CanFly(Config) || s.health <= 0) s.phase = FlightPhase.Falling;
                if (s.phase == FlightPhase.Falling)
                {
                    s.velocity += Vector3.down * PlanetModel.Gravity(Config.planet) * dt;
                    s.position += s.velocity * dt;
                    if (s.position.y <= .65f) { s.position.y = .65f; s.velocity = Vector3.zero; s.phase = s.health <= 0 ? FlightPhase.Wreck : FlightPhase.Grounded; }
                    next[i] = s; continue;
                }
                float watts = PlanetModel.Power(Config, s.velocity.magnitude);
                float reserve = Mathf.Clamp(.06f + Vector3.Distance(s.position,s.home) / Mathf.Max(1,Config.speed*.6f) * watts / (Config.batteryWh*3600), .08f,.5f);
                if (!Config.unlimited && s.battery01 < reserve) s.phase = FlightPhase.Returning;
                if (s.phase == FlightPhase.Returning)
                {
                    Vector3 aboveHome = s.home + Vector3.up * Mathf.Max(6,Config.height*.4f);
                    s.target = Vector2.Distance(new Vector2(s.position.x,s.position.z),new Vector2(s.home.x,s.home.z)) < 1.2f ? s.home : aboveHome;
                }
                else s.target = IsBattle ? BattleTarget(i, ref s) : FormationMath.Target(Config,i,Count,Time,s.fleetId);
                Vector3 desired = Vector3.ClampMagnitude((s.target-s.position)*1.3f,Config.speed * (s.frame == FrameKind.Cargo ? .65f : 1));
                Vector3 force = (desired-s.velocity)*2.6f;
                if (Config.boids && s.phase == FlightPhase.Flying) force += Neighbors.Steering(States,i,Config);
                if (Config.obstacles && s.phase == FlightPhase.Flying)
                    foreach (var box in Obstacles)
                    {
                        Vector3 d = s.position - box.ClosestPoint(s.position);
                        if(d.sqrMagnitude < 36) force += d.sqrMagnitude < .01f ? Vector3.up * 35 : d.normalized * (6-d.magnitude)*8;
                    }
                if (Config.planet == PlanetKind.Earth && s.phase == FlightPhase.Flying) force += new Vector3(Mathf.Sin(Time*.4f+s.position.z*.01f),0,Mathf.Cos(Time*.31f))*Config.wind;
                s.acceleration = Vector3.ClampMagnitude(force,Config.acceleration);
                s.velocity = Vector3.ClampMagnitude(s.velocity+s.acceleration*dt,Config.speed);
                s.position += s.velocity*dt;
                s.position.x = Mathf.Clamp(s.position.x,-1000,1000); s.position.z = Mathf.Clamp(s.position.z,-1000,1000); s.position.y = Mathf.Clamp(s.position.y,.65f,320);
                if (Config.obstacles) foreach (var box in Obstacles) if (box.Contains(s.position)) { s.position.y = box.max.y+.7f; s.velocity.y = Mathf.Max(0,s.velocity.y); }
                if (s.phase == FlightPhase.Returning && Vector3.Distance(s.position,s.home) < .25f && s.velocity.magnitude < 1) { s.position=s.home; s.velocity=Vector3.zero; s.phase=FlightPhase.Grounded; }
                var flat = new Vector3(s.velocity.x,0,s.velocity.z);
                Quaternion yaw = flat.sqrMagnitude>.04f ? Quaternion.LookRotation(flat) : s.rotation;
                s.rotation = Quaternion.Slerp(s.rotation,yaw*Quaternion.Euler(Mathf.Clamp(s.acceleration.z,-18,18),0,Mathf.Clamp(-s.acceleration.x,-18,18)),1-Mathf.Exp(-6*dt));
                if(!Config.unlimited) s.battery01 = Mathf.Max(0,s.battery01-watts*dt/(Config.batteryWh*3600));
                next[i] = s;
            }
            var old=States; States=next; next=old;
            for(int i=0;i<Count;i++) if(damage[i]>0) ApplyDamage(i,damage[i]);
            if(IsBattle && Battle.engage && Winner<0 && Time>3)
            {
                int blue=Alive(0),red=Alive(1);
                if(blue==0 || red==0) { Winner=blue==red ? 2 : blue>0 ? 0 : 1; if(Winner==0)Battle.blueWins++;if(Winner==1)Battle.redWins++; }
            }
        }
        Vector3 BattleTarget(int i, ref DroneState s)
        {
            BattleStyle style=s.fleetId==0 ? Battle.blue : Battle.red;
            int enemy=-1; float nearest=float.MaxValue;
            for(int j=0;j<Count;j++) if(States[j].fleetId!=s.fleetId && States[j].phase==FlightPhase.Flying && !States[j].disabled)
            {float d=(States[j].position-s.position).sqrMagnitude;if(d<nearest){nearest=d;enemy=j;}}
            Vector3 waypoint=s.fleetId==0 ? Battle.blueWaypoint : Battle.redWaypoint;
            if(!Battle.engage || enemy<0) return waypoint+FormationMath.Ring(i/2,Mathf.Max(1,Count/2),12);
            var other=States[enemy];
            if(Battle.adaptive && s.health<40) style=BattleStyle.Evasive;
            Vector3 away=(s.position-other.position).normalized;
            Vector3 target=other.position + away*(style==BattleStyle.Pursuit ? 3 : 13);
            if(style==BattleStyle.Evasive) target+=new Vector3(Mathf.Sin(Time*1.7f+i),Mathf.Sin(Time+i)*.4f,Mathf.Cos(Time*1.7f+i))*12;
            if(style==BattleStyle.Guardian) target=Vector3.Lerp(target,waypoint,.65f);
            if(nearest<30*30 && s.cooldown<=0)
            {
                damage[enemy]+=Battle.gameDamage; s.cooldown=Battle.fireInterval+FormationMath.Hash(i)*.3f;
                Events.Add(new BattleEvent{from=s.position,to=other.position,team=s.fleetId});
            }
            if(nearest<1.2f*1.2f){damage[i]+=4;damage[enemy]+=4;}
            target.y=Mathf.Clamp(target.y,8,90); return target;
        }
        public void ApplyDamage(int index,float amount)
        {
            if(index<0 || index>=Count || States[index].disabled) return;
            States[index].health=Mathf.Max(0,States[index].health-Mathf.Max(0,amount));
            if(States[index].health==0)
            {
                States[index].phase=FlightPhase.Falling;
                Events.Add(new BattleEvent{from=States[index].position,to=States[index].position,team=States[index].fleetId,destruction=true});
            }
        }
        public bool DropPayload(int index)
        {
            if(!IsBattle || index<0 || index>=Count || States[index].phase!=FlightPhase.Flying || States[index].payloads==0) return false;
            Events.Clear();
            States[index].payloads--;
            Vector3 p=States[index].position; Events.Add(new BattleEvent{from=p,to=new Vector3(p.x,.7f,p.z),team=States[index].fleetId,payload=true});
            // An intentionally abstract arcade pulse, not a weapon/ballistics model.
            for(int i=0;i<Count;i++) if(States[i].fleetId!=States[index].fleetId && Vector3.Distance(States[i].position,p)<18) ApplyDamage(i,35);
            return true;
        }
        public void Restore(DroneState[] states,float time)
        {
            if(states==null || states.Length>(IsBattle?MaxBattleDrones:MaxDrones)||float.IsNaN(time)||float.IsInfinity(time)||time<0)throw new ArgumentException("Invalid roster.");
            foreach(var s in states) if(!FleetConfig.Finite(s.position)||!FleetConfig.Finite(s.velocity)||!FleetConfig.Finite(s.home)||
                !FleetConfig.Finite(s.target)||!FleetConfig.Finite(s.acceleration)||!FleetConfig.Finite(new Vector3(s.rotation.x,s.rotation.y,s.rotation.z))||float.IsNaN(s.rotation.w)||float.IsInfinity(s.rotation.w)||
                !Enum.IsDefined(typeof(FlightPhase),s.phase)||!Enum.IsDefined(typeof(FrameKind),s.frame)||s.fleetId<0||s.fleetId>3||
                float.IsNaN(s.battery01)||s.battery01<0||s.battery01>1||float.IsNaN(s.health)||s.health<0||s.health>100||s.position.magnitude>2000||s.home.magnitude>2000||s.target.magnitude>2000||
                float.IsNaN(s.cooldown)||float.IsInfinity(s.cooldown)||s.cooldown<0||s.cooldown>20||s.payloads<0||s.payloads>3||s.id<0||s.palette<0||s.palette>8)
                throw new ArgumentException("Invalid drone state.");
            Resize(states.Length); Array.Copy(states,States,states.Length); Time=time;
        }
    }
}
