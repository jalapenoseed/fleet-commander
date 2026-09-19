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
        public float gameDamage = 9, fireInterval = .8f, roundSeconds = 180;
        public FrameKind blueFrame = FrameKind.Scout, redFrame = FrameKind.Utility;
        public SkinKind blueSkin = SkinKind.Cobalt, redSkin = SkinKind.Crimson;
        public WeaponKind blueWeapon = WeaponKind.Pulse, redWeapon = WeaponKind.RapidFire;
        public int blueWins, redWins, draws;
        public Vector3 blueWaypoint = new Vector3(-20, 25, 0), redWaypoint = new Vector3(20, 25, 0);
        public BattleSettings Clone() => (BattleSettings)MemberwiseClone();
        public void ResetDefaults()
        {
            blue=BattleStyle.Balanced; red=BattleStyle.Evasive; engage=adaptive=true;
            gameDamage=9; fireInterval=.8f; roundSeconds=180;
            blueFrame=FrameKind.Scout; redFrame=FrameKind.Utility;
            blueSkin=SkinKind.Cobalt; redSkin=SkinKind.Crimson;
            blueWeapon=WeaponKind.Pulse; redWeapon=WeaponKind.RapidFire;
            blueWaypoint=new Vector3(-20,25,0); redWaypoint=new Vector3(20,25,0);
        }
        public void ResetScores() { blueWins=redWins=draws=0; }
        public void Validate()
        {
            if(!Enum.IsDefined(typeof(BattleStyle),blue)||!Enum.IsDefined(typeof(BattleStyle),red)||
                !Enum.IsDefined(typeof(FrameKind),blueFrame)||!Enum.IsDefined(typeof(FrameKind),redFrame)||
                !Enum.IsDefined(typeof(SkinKind),blueSkin)||!Enum.IsDefined(typeof(SkinKind),redSkin)||
                !Enum.IsDefined(typeof(WeaponKind),blueWeapon)||!Enum.IsDefined(typeof(WeaponKind),redWeapon)||
                !FleetConfig.Finite(blueWaypoint)||!FleetConfig.Finite(redWaypoint)||blueWaypoint.magnitude>800||redWaypoint.magnitude>800||
                !FleetConfig.Finite(new Vector3(gameDamage,fireInterval,roundSeconds))||gameDamage<0||fireInterval<=0||roundSeconds<0||
                blueWins<0||redWins<0||draws<0) throw new ArgumentException("Invalid arena settings.");
            gameDamage=Mathf.Clamp(gameDamage,0,100); fireInterval=Mathf.Clamp(fireInterval,.08f,5);
            // A zero limit is the missing-field value in saves made before timed rounds existed.
            roundSeconds=roundSeconds==0?180:Mathf.Clamp(roundSeconds,5,1800);
        }
    }
    [Serializable] public struct BattleEvent
    {
        public Vector3 from, to;
        public int team, source, victim;
        public WeaponKind weapon;
        public float damage;
        public bool destruction, payload, impact;
    }
    [Serializable] public sealed class BattleRoundSnapshot
    {
        public bool started;
        public float elapsed, blueDamage, redDamage;
        public int winner=-1, blueKills, redKills;
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
        public bool RoundEnded => Winner >= 0;
        public bool RoundStarted { get; private set; }
        public float RoundTime { get; private set; }
        public float TimeRemaining => IsBattle ? Mathf.Max(0,Battle.roundSeconds-RoundTime) : 0;
        public int BlueKills { get; private set; }
        public int RedKills { get; private set; }
        public float BlueDamage { get; private set; }
        public float RedDamage { get; private set; }
        public int ControlledDrone { get; private set; } = -1;
        Vector3 pilotMove, pilotAim=Vector3.forward;
        bool pilotFire;
        DroneState[] next = Array.Empty<DroneState>();
        float[] damage = Array.Empty<float>(), strongestHit = Array.Empty<float>();
        int[] damageSources=Array.Empty<int>();
        WeaponKind[] damageWeapons=Array.Empty<WeaponKind>();
        int[] groupIndices=Array.Empty<int>();readonly int[] groupCounts=new int[4];
        public FleetWorld(FleetConfig config, int count, BattleSettings battle = null) { Config = config; Battle = battle; Battle?.Validate(); Resize(count); }

        public void Resize(int count)
        {
            count = Mathf.Clamp(count, 0, IsBattle ? MaxBattleDrones : MaxDrones);
            States = new DroneState[count]; next = new DroneState[count]; damage = new float[count]; strongestHit=new float[count];
            damageSources=new int[count]; damageWeapons=new WeaponKind[count]; groupIndices=new int[count];
            Time = RoundTime = BlueDamage = RedDamage = 0; BlueKills=RedKills=0; Winner = -1; RoundStarted=false; ClearControl(); Events.Clear();
            for (int i = 0; i < count; i++)
            {
                Vector3 home = FormationMath.Grid(i, count, 2.5f) + new Vector3(0, .65f, 130);
                if (IsBattle) home = new Vector3(i % 2 == 0 ? -65 : 65, .65f, (i / 2 - count / 4f) * 2.5f);
                foreach (var box in Obstacles) if (Mathf.Abs(home.x-box.center.x) < box.extents.x+2 && Mathf.Abs(home.z-box.center.z) < box.extents.z+2) home.y = box.max.y + .7f;
                States[i] = DroneState.Create(i, IsBattle ? i % 2 : i % 4, home);
                if(IsBattle)
                {
                    bool blue=i%2==0;
                    States[i].frame=blue?Battle.blueFrame:Battle.redFrame;
                    States[i].skin=blue?Battle.blueSkin:Battle.redSkin;
                    States[i].weapon=blue?Battle.blueWeapon:Battle.redWeapon;
                }
            }
            IndexGroups();
        }
        void IndexGroups(){Array.Clear(groupCounts,0,4);for(int i=0;i<Count;i++)groupIndices[i]=groupCounts[States[i].fleetId]++;}
        public void Launch(int group = -1)
        {
            if(IsBattle && RoundEnded) return;
            for (int i = 0; i < Count; i++) if ((group < 0 || States[i].fleetId == group) && States[i].phase == FlightPhase.Grounded && States[i].battery01 >= .2f && !States[i].disabled)
                States[i].phase = FlightPhase.Flying;
            if(IsBattle && !RoundStarted && Alive(0)+Alive(1)>0) RoundStarted=true;
        }
        public void Recall(int group = -1)
        {
            for (int i = 0; i < Count; i++) if ((group < 0 || States[i].fleetId == group) && States[i].phase == FlightPhase.Flying) States[i].phase = FlightPhase.Returning;
        }
        public void Recharge() { for (int i = 0; i < Count; i++) if (States[i].phase == FlightPhase.Grounded && !States[i].disabled) States[i].battery01 = 1; }
        public void SetCharge(float value) { for (int i = 0; i < Count; i++) States[i].battery01 = Mathf.Clamp01(value); }
        public int Alive(int team)
        {
            int n = 0; foreach (var d in States) if (d.fleetId == team && !d.disabled && (d.phase==FlightPhase.Flying || d.phase==FlightPhase.Returning) && d.battery01>0) n++; return n;
        }
        public float AverageBattery { get { float v = 0; foreach (var s in States) v += s.battery01; return v / Mathf.Max(1, Count); } }
        public float FormationError { get { float v=0; int n=0; foreach(var s in States) if(s.phase == FlightPhase.Flying) {v += Vector3.Distance(s.position,s.target);n++;} return n==0 ? 1000 : v/n; } }

        // Two buffers make every drone read the same instant; update order cannot bias the flock.
        public void Step(float dt)
        {
            if (dt <= 0 || float.IsNaN(dt) || float.IsInfinity(dt)) return;
            dt = Mathf.Min(dt, .05f); Time += dt; Events.Clear(); Array.Clear(damage,0,damage.Length); Array.Clear(strongestHit,0,strongestHit.Length);
            if(IsBattle && RoundStarted && !RoundEnded && Battle.engage) RoundTime+=dt;
            if(ControlledDrone>=0 && (RoundEnded || States[ControlledDrone].phase!=FlightPhase.Flying || States[ControlledDrone].disabled)) ClearControl();
            if (Config.boids) Neighbors.Build(States, Config.neighborRadius);
            for (int i = 0; i < Count; i++)
            {
                var s = States[i]; var profile=DroneCatalog.Profile(s.frame);
                s.cooldown = Mathf.Max(0, s.cooldown-dt); s.massKg = PlanetModel.Mass(Config)*profile.mass;
                if(s.disabled) s.destructionAge+=dt;
                if (s.phase == FlightPhase.Grounded)
                {
                    if (!s.disabled && Vector3.Distance(s.position,s.home) < 1) s.battery01 = Mathf.Min(1,s.battery01+dt/90);
                    next[i] = s; continue;
                }
                if (s.phase == FlightPhase.Wreck) { next[i] = s; continue; }
                if (s.battery01 <= 0 || !PlanetModel.CanFly(Config) || s.health <= 0) s.phase = FlightPhase.Falling;
                if (s.phase == FlightPhase.Falling)
                {
                    if(i==ControlledDrone) ClearControl();
                    s.velocity += Vector3.down * PlanetModel.Gravity(Config.planet) * dt;
                    s.position += s.velocity * dt;
                    if(s.disabled) s.rotation=s.rotation*Quaternion.Euler((110+s.id%7*13)*dt,(47+s.id%5*17)*dt,157*dt);
                    float floor=.65f;
                    if(Config.obstacles) foreach(var box in Obstacles)
                        if(Mathf.Abs(s.position.x-box.center.x)<=box.extents.x && Mathf.Abs(s.position.z-box.center.z)<=box.extents.z && States[i].position.y>=box.max.y) floor=Mathf.Max(floor,box.max.y+.65f);
                    if (s.position.y <= floor)
                    {
                        s.position.y = floor; s.velocity = Vector3.zero; s.phase = s.health <= 0 ? FlightPhase.Wreck : FlightPhase.Grounded;
                        if(s.disabled) s.rotation=Quaternion.Euler(22+s.id%4*5,s.id*137.5f,52+s.id%3*11);
                    }
                    next[i] = s; continue;
                }
                float watts = PlanetModel.Power(Config, s.velocity.magnitude)*profile.energy;
                float reserve = Mathf.Clamp(.06f + Vector3.Distance(s.position,s.home) / Mathf.Max(1,Config.speed*.6f) * watts / (Config.batteryWh*3600), .08f,.5f);
                if (!Config.unlimited && s.battery01 < reserve) s.phase = FlightPhase.Returning;
                if (s.phase == FlightPhase.Returning)
                {
                    Vector3 aboveHome = s.home + Vector3.up * Mathf.Max(6,Config.height*.4f);
                    s.target = Vector2.Distance(new Vector2(s.position.x,s.position.z),new Vector2(s.home.x,s.home.z)) < 1.2f ? s.home : aboveHome;
                }
                else if(i==ControlledDrone) s.target=s.position+pilotMove*20;
                else s.target = IsBattle ? BattleTarget(i, ref s) : FormationMath.Target(Config,i,Count,Time,s.fleetId,groupIndices[i],groupCounts[s.fleetId]);
                bool controlled=i==ControlledDrone && s.phase==FlightPhase.Flying;
                if(i==ControlledDrone && !controlled) ClearControl();
                if(controlled && pilotFire) FireWeapon(i,ref s,pilotAim,false);
                float maxSpeed=Config.speed*profile.speed;
                Vector3 desired = controlled ? pilotMove*maxSpeed : Vector3.ClampMagnitude((s.target-s.position)*1.3f,maxSpeed);
                Vector3 force = (desired-s.velocity)*(2.6f*profile.agility);
                if (Config.boids && !controlled && s.phase == FlightPhase.Flying) force += Neighbors.Steering(States,i,Config);
                if (Config.obstacles && s.phase == FlightPhase.Flying)
                    foreach (var box in Obstacles)
                    {
                        Vector3 d = s.position - box.ClosestPoint(s.position);
                        if(d.sqrMagnitude < 36) force += d.sqrMagnitude < .01f ? Vector3.up * 35 : d.normalized * (6-d.magnitude)*8;
                    }
                if (Config.planet == PlanetKind.Earth && s.phase == FlightPhase.Flying) force += new Vector3(Mathf.Sin(Time*.4f+s.position.z*.01f),0,Mathf.Cos(Time*.31f))*Config.wind;
                s.acceleration = Vector3.ClampMagnitude(force,Config.acceleration*profile.agility);
                s.velocity = Vector3.ClampMagnitude(s.velocity+s.acceleration*dt,maxSpeed);
                s.position += s.velocity*dt;
                s.position.x = Mathf.Clamp(s.position.x,-1000,1000); s.position.z = Mathf.Clamp(s.position.z,-1000,1000); s.position.y = Mathf.Clamp(s.position.y,.65f,320);
                if (Config.obstacles) foreach (var box in Obstacles) if (box.Contains(s.position)) { s.position.y = box.max.y+.7f; s.velocity.y = Mathf.Max(0,s.velocity.y); }
                if (s.phase == FlightPhase.Returning && Vector3.Distance(s.position,s.home) < .25f && s.velocity.magnitude < 1) { s.position=s.home; s.velocity=Vector3.zero; s.phase=FlightPhase.Grounded; }
                var flat = new Vector3(s.velocity.x,0,s.velocity.z);
                Quaternion yaw = controlled ? Quaternion.LookRotation(pilotAim) : flat.sqrMagnitude>.04f ? Quaternion.LookRotation(flat) : s.rotation;
                s.rotation = Quaternion.Slerp(s.rotation,yaw*Quaternion.Euler(Mathf.Clamp(s.acceleration.z,-18,18),0,Mathf.Clamp(-s.acceleration.x,-18,18)),1-Mathf.Exp(-6*dt));
                if(!Config.unlimited) s.battery01 = Mathf.Max(0,s.battery01-watts*dt/(Config.batteryWh*3600));
                next[i] = s;
            }
            var old=States; States=next; next=old;
            ResolveDroneCollisions();
            for(int i=0;i<Count;i++) if(damage[i]>0) ApplyDamage(i,damage[i],damageSources[i],damageWeapons[i]);
            EvaluateRound();
        }
        void EvaluateRound()
        {
            if(!IsBattle || !RoundStarted || RoundEnded || !Battle.engage) return;
            int blue=Alive(0),red=Alive(1);
            if(blue==0 || red==0) FinishRound(blue==red?2:blue>0?0:1);
            else if(RoundTime>=Battle.roundSeconds)
            {
                if(blue!=red) FinishRound(blue>red?0:1);
                else
                {
                    float bh=0,rh=0;
                    foreach(var s in States) if(!s.disabled && (s.phase==FlightPhase.Flying || s.phase==FlightPhase.Returning) && s.battery01>0) {if(s.fleetId==0)bh+=s.health;else if(s.fleetId==1)rh+=s.health;}
                    FinishRound(Mathf.Abs(bh-rh)<.01f?2:bh>rh?0:1);
                }
            }
        }
        void FinishRound(int winner)
        {
            if(RoundEnded) return;
            Winner=winner; ClearControl();
            if(winner==0) Battle.blueWins++; else if(winner==1) Battle.redWins++; else Battle.draws++;
        }
        Vector3 BattleTarget(int i, ref DroneState s)
        {
            BattleStyle style=s.fleetId==0 ? Battle.blue : Battle.red;
            int enemy=-1; float nearest=float.MaxValue;
            for(int j=0;j<Count;j++) if(States[j].fleetId!=s.fleetId && States[j].phase==FlightPhase.Flying && !States[j].disabled)
            {float d=(States[j].position-s.position).sqrMagnitude;if(d<nearest){nearest=d;enemy=j;}}
            Vector3 waypoint=s.fleetId==0 ? Battle.blueWaypoint : Battle.redWaypoint;
            if(!Battle.engage || RoundEnded || enemy<0) return waypoint+FormationMath.Ring(i/2,Mathf.Max(1,Count/2),12);
            var other=States[enemy];
            if(Battle.adaptive && s.health<40) style=BattleStyle.Evasive;
            Vector3 away=(s.position-other.position).normalized;
            Vector3 target=other.position + away*(style==BattleStyle.Pursuit ? 3 : 13);
            if(style==BattleStyle.Evasive) target+=new Vector3(Mathf.Sin(Time*1.7f+i),Mathf.Sin(Time+i)*.4f,Mathf.Cos(Time*1.7f+i))*12;
            if(style==BattleStyle.Guardian) target=Vector3.Lerp(target,waypoint,.65f);
            if(s.cooldown<=0 && nearest<=DroneCatalog.Weapon(s.weapon).range*DroneCatalog.Weapon(s.weapon).range)
                FireWeapon(i,ref s,other.position-s.position,false);
            target.y=Mathf.Clamp(target.y,8,90); return target;
        }
        void ResolveDroneCollisions()
        {
            if(!IsBattle || RoundEnded) return;
            for(int i=0;i<Count;i++)
            {
                if(States[i].disabled || States[i].phase!=FlightPhase.Flying)continue;
                for(int j=i+1;j<Count;j++)
                {
                    if(States[j].disabled || States[j].phase!=FlightPhase.Flying)continue;
                    Vector3 separation=States[i].position-States[j].position;
                    if(separation.sqrMagnitude>=1.44f)continue;
                    Vector3 normal=separation.sqrMagnitude>.001f?separation.normalized:Vector3.forward;
                    States[i].velocity+=normal*2;States[j].velocity-=normal*2;
                    if(Battle.engage && States[i].fleetId!=States[j].fleetId)
                    {QueueDamage(i,4,j,States[j].weapon);QueueDamage(j,4,i,States[i].weapon);}
                }
            }
        }
        public bool SetControlledDrone(int index)
        {
            if(!IsBattle || RoundEnded || index<0 || index>=Count || States[index].disabled || States[index].phase!=FlightPhase.Flying) return false;
            ClearControl(); ControlledDrone=index; pilotAim=States[index].rotation*Vector3.forward; return true;
        }
        public void ClearControl() { ControlledDrone=-1; pilotMove=Vector3.zero; pilotAim=Vector3.forward; pilotFire=false; }
        public void SetPilotInput(Vector3 moveWorld, Vector3 aimWorld, bool fire)
        {
            if(!FleetConfig.Finite(moveWorld)||!FleetConfig.Finite(aimWorld)) {pilotMove=Vector3.zero;pilotFire=false;return;}
            pilotMove=Vector3.ClampMagnitude(moveWorld,1);
            if(aimWorld.sqrMagnitude>.0001f) pilotAim=aimWorld.normalized;
            pilotFire=fire;
        }
        public bool FireControlled()
        {
            if(ControlledDrone<0 || ControlledDrone>=Count) return false;
            int index=ControlledDrone;var s=States[index];
            bool fired=FireWeapon(index,ref s,pilotAim,true); s.kills=States[index].kills; States[index]=s; return fired;
        }
        bool FireWeapon(int index, ref DroneState s, Vector3 aim, bool immediate)
        {
            if(!IsBattle || !Battle.engage || RoundEnded || s.disabled || s.phase!=FlightPhase.Flying || s.cooldown>0) return false;
            var weapon=DroneCatalog.Weapon(s.weapon); aim=aim.normalized;
            if(aim.sqrMagnitude<.1f) aim=Vector3.forward;
            s.cooldown=Battle.fireInterval*weapon.interval;
            int hits=0; float nearest=float.MaxValue; int closest=-1;
            for(int j=0;j<Count;j++)
            {
                var target=States[j]; if(target.fleetId==s.fleetId || target.disabled || !target.airborne) continue;
                var offset=target.position-s.position;float distance=offset.magnitude;
                if(distance>weapon.range)continue;
                float dot=distance<.001f?1:(offset.x*aim.x+offset.y*aim.y+offset.z*aim.z)/distance;
                if(s.weapon!=WeaponKind.Shockwave && dot<weapon.cone)continue;
                if(weapon.targets==1) {if(distance<nearest){nearest=distance;closest=j;}continue;}
                Hit(index,j,s.position,s.weapon,immediate);hits++; if(hits>=weapon.targets)break;
            }
            if(closest>=0) {Hit(index,closest,s.position,s.weapon,immediate);hits++;}
            if(hits==0) Events.Add(new BattleEvent{from=s.position,to=s.position+aim*weapon.range,team=s.fleetId,source=index,victim=-1,weapon=s.weapon});
            return true;
        }
        void Hit(int source,int victim,Vector3 from,WeaponKind weapon,bool immediate)
        {
            float amount=Battle.gameDamage*DroneCatalog.Weapon(weapon).damage;
            Events.Add(new BattleEvent{from=from,to=States[victim].position,team=States[source].fleetId,source=source,victim=victim,weapon=weapon,impact=true,damage=amount});
            if(immediate) ApplyDamage(victim,amount,source,weapon); else QueueDamage(victim,amount,source,weapon);
        }
        void QueueDamage(int index,float amount,int source,WeaponKind weapon)
        {
            damage[index]+=amount;
            if(amount>strongestHit[index]){strongestHit[index]=amount;damageSources[index]=source;damageWeapons[index]=weapon;}
        }
        public void ApplyDamage(int index,float amount,int source=-1,WeaponKind weapon=WeaponKind.Pulse)
        {
            if(index<0 || index>=Count || States[index].disabled || (IsBattle && RoundEnded) || float.IsNaN(amount) || float.IsInfinity(amount) || amount<=0) return;
            bool credited=source>=0 && source<Count && States[source].fleetId!=States[index].fleetId;
            float actual=Mathf.Min(States[index].health,amount/DroneCatalog.Profile(States[index].frame).armor);
            States[index].health=Mathf.Max(0,States[index].health-actual);
            if(IsBattle && credited){if(States[source].fleetId==0)BlueDamage+=actual;else if(States[source].fleetId==1)RedDamage+=actual;}
            if(States[index].health==0)
            {
                States[index].phase=FlightPhase.Falling; States[index].destructionAge=0;
                if(IsBattle){if(States[index].fleetId==0)RedKills++;else if(States[index].fleetId==1)BlueKills++;}
                if(credited)States[source].kills++;
                if(ControlledDrone==index) ClearControl();
                Events.Add(new BattleEvent{from=States[index].position,to=States[index].position,team=States[index].fleetId,source=source,victim=index,weapon=weapon,destruction=true,impact=true,damage=actual});
            }
        }
        public bool DropPayload(int index)
        {
            if(!IsBattle || !Battle.engage || RoundEnded || index<0 || index>=Count || States[index].disabled || States[index].phase!=FlightPhase.Flying || States[index].payloads==0) return false;
            States[index].payloads--;
            Vector3 p=States[index].position;
            Events.Add(new BattleEvent{from=p,to=new Vector3(p.x,.7f,p.z),team=States[index].fleetId,source=index,victim=-1,weapon=WeaponKind.Shockwave,payload=true});
            // A deliberately abstract arcade pulse; no physical ballistics or real weapon model.
            for(int i=0;i<Count;i++) if(States[i].fleetId!=States[index].fleetId && Vector3.Distance(States[i].position,p)<18) ApplyDamage(i,35,index,WeaponKind.Shockwave);
            return true;
        }
        public BattleRoundSnapshot CaptureRound() => new BattleRoundSnapshot{started=RoundStarted,elapsed=RoundTime,winner=Winner,blueKills=BlueKills,redKills=RedKills,blueDamage=BlueDamage,redDamage=RedDamage};
        public void RestoreRound(BattleRoundSnapshot round)
        {
            if(round==null) {RoundStarted=IsBattle && Alive(0)+Alive(1)>0; return;}
            if(!IsBattle || round.winner< -1 || round.winner>2 || round.blueKills<0 || round.redKills<0 || round.blueKills>Count || round.redKills>Count ||
                !FleetConfig.Finite(new Vector3(round.elapsed,round.blueDamage,round.redDamage)) || round.elapsed<0 || round.elapsed>1801 || round.blueDamage<0 || round.redDamage<0)
                throw new ArgumentException("Invalid arena round.");
            RoundStarted=round.started;RoundTime=round.elapsed;Winner=round.winner;BlueKills=round.blueKills;RedKills=round.redKills;BlueDamage=round.blueDamage;RedDamage=round.redDamage;ClearControl();
        }
        public void Restore(DroneState[] states,float time)
        {
            if(states==null || states.Length>(IsBattle?MaxBattleDrones:MaxDrones)||float.IsNaN(time)||float.IsInfinity(time)||time<0)throw new ArgumentException("Invalid roster.");
            foreach(var s in states) if(!FleetConfig.Finite(s.position)||!FleetConfig.Finite(s.velocity)||!FleetConfig.Finite(s.home)||
                !FleetConfig.Finite(s.target)||!FleetConfig.Finite(s.acceleration)||!FleetConfig.Finite(new Vector3(s.rotation.x,s.rotation.y,s.rotation.z))||float.IsNaN(s.rotation.w)||float.IsInfinity(s.rotation.w)||
                !Enum.IsDefined(typeof(FlightPhase),s.phase)||!Enum.IsDefined(typeof(FrameKind),s.frame)||!Enum.IsDefined(typeof(SkinKind),s.skin)||!Enum.IsDefined(typeof(WeaponKind),s.weapon)||s.fleetId<0||s.fleetId>(IsBattle?1:3)||
                float.IsNaN(s.battery01)||s.battery01<0||s.battery01>1||float.IsNaN(s.health)||s.health<0||s.health>100||s.position.magnitude>2000||s.home.magnitude>2000||s.target.magnitude>2000||
                float.IsNaN(s.cooldown)||float.IsInfinity(s.cooldown)||s.cooldown<0||s.cooldown>20||s.payloads<0||s.payloads>3||s.id<0||s.palette<0||s.palette>8||s.kills<0||s.kills>MaxBattleDrones||float.IsNaN(s.destructionAge)||float.IsInfinity(s.destructionAge)||s.destructionAge<0)
                throw new ArgumentException("Invalid drone state.");
            Resize(states.Length); Array.Copy(states,States,states.Length);IndexGroups(); Time=time; RoundStarted=IsBattle && Alive(0)+Alive(1)>0;
        }
    }
}
