using System;
using UnityEngine;
namespace FleetCommander.Core
{
    public enum DroneAbility { Guard, Dodge, Boost }
    public sealed partial class FleetWorld
    {
        ArenaRole[] deployedRoles=Array.Empty<ArenaRole>();
        public int[] ManualTargets {get;private set;}=Array.Empty<int>();
        public readonly ArenaFormation[] CurrentFormations=new ArenaFormation[2];
        public readonly int[] FormationSwitches=new int[2];
        public readonly int[] LearnedOpening=new[]{-1,-1};
        readonly float[] formationClock=new float[2];
        void InitializeCombat(){ManualTargets=new int[Count];deployedRoles=new ArenaRole[Count];for(int i=0;i<Count;i++){ManualTargets[i]=-1;EnsureResources(ref States[i]);if(IsBattle){var role=(i%2==0?Battle.bluePlan:Battle.redPlan).Role(i/2,Count/2);if(role!=null)deployedRoles[i]=JsonUtility.FromJson<ArenaRole>(JsonUtility.ToJson(role));}}if(IsBattle){CurrentFormations[0]=Battle.bluePlan.formation;CurrentFormations[1]=Battle.redPlan.formation;}}
        public void EnsureResources(ref DroneState s)
        {
            if(s.resourcesInitialized)return;var p=DroneCatalog.Weapon(s.weapon);s.ammo=p.magazine;s.ammoCapacity=p.magazine;s.reloadSeconds=p.reload;s.reserveAmmo=Mathf.RoundToInt(p.reserve*(Battle?.resourceScale??1));s.stamina=100;s.resourcesInitialized=true;s.hitAge=10;s.aiState="READY";
        }
        void UpdateResources(ref DroneState s,float dt)
        {
            EnsureResources(ref s);s.abilityCooldown=Mathf.Max(0,s.abilityCooldown-dt);s.stunTime=Mathf.Max(0,s.stunTime-dt);s.hitAge+=dt;s.comboWindow=Mathf.Max(0,s.comboWindow-dt);if(s.comboWindow==0)s.combo=0;s.heat=Mathf.Max(0,s.heat-dt*.22f);
            if(s.guarding){s.guardAge+=dt;s.stamina=Mathf.Max(0,s.stamina-dt*25);if(s.stamina<=0||s.guardAge>1.2f)s.guarding=false;}else s.stamina=Mathf.Min(100,s.stamina+dt*15);
            if(s.reloadTime>0){s.reloadTime=Mathf.Max(0,s.reloadTime-dt);if(s.reloadTime==0){int n=Mathf.Min(s.ammoCapacity-s.ammo,s.reserveAmmo);s.ammo+=n;s.reserveAmmo-=n;}}
            if(IsBattle&&Battle.finiteAmmo&&s.ammo==0&&s.reloadTime==0&&s.id!=ControlledDrone)BeginReload(ref s);
        }
        void BeginReload(ref DroneState s){var p=DroneCatalog.Weapon(s.weapon);if(s.reloadTime<=0&&s.reserveAmmo>0&&s.ammo<s.ammoCapacity)s.reloadTime=s.reloadSeconds;}
        public bool Reload(int index){if(index<0||index>=Count||RoundEnded||States[index].disabled)return false;BeginReload(ref States[index]);return States[index].reloadTime>0;}
        public bool UseAbility(int index,DroneAbility ability,Vector3 direction)
        {
            if(!IsBattle||!Battle.abilities||RoundEnded||index<0||index>=Count||!Enum.IsDefined(typeof(DroneAbility),ability)||!FleetConfig.Finite(direction))return false;
            var s=States[index];EnsureResources(ref s);if(s.disabled||s.phase!=FlightPhase.Flying||s.abilityCooldown>0||s.stunTime>0||s.stamina<25)return false;
            s.stamina-=25;s.abilityCooldown=ability==DroneAbility.Guard?1.6f:3;
            if(ability==DroneAbility.Guard){s.guarding=true;s.guardAge=0;}
            else{s.guarding=false;direction=direction.sqrMagnitude>.01f?direction.normalized:s.rotation*Vector3.forward;s.velocity+=direction*(ability==DroneAbility.Dodge?14:20);s.battery01=Mathf.Max(0,s.battery01-.001f);}
            States[index]=s;return true;
        }
        float DefendDamage(int victim,int source,float amount)
        {
            if(!IsBattle||!Battle.abilities||!States[victim].guarding||source<0||source>=Count)return amount;
            var toSource=(States[source].position-States[victim].position).normalized;
            if(Vector3.Dot(States[victim].rotation*Vector3.forward,toSource)<.3f)return amount;
            bool parry=States[victim].guardAge<=.16f;States[victim].stamina=Mathf.Max(0,States[victim].stamina-8);
            if(parry){States[source].stunTime=Mathf.Max(States[source].stunTime,.35f);States[victim].aiState="PARRY";return 0;}
            return amount*.25f;
        }
        public static bool TraceSphere(Vector3 from,Vector3 aim,Vector3 center,float radius,float range)
        {if(aim.sqrMagnitude<.001f)return false;aim.Normalize();var v=center-from;float t=Vector3.Dot(v,aim);return t>=0&&t<=range&&(v-aim*t).sqrMagnitude<=radius*radius;}
        static bool Blocked(Vector3 from,Vector3 to){float distance=Vector3.Distance(from,to);foreach(var b in Obstacles)if(b.IntersectRay(new Ray(from,(to-from).normalized),out float hit)&&hit<distance)return true;return false;}
        public bool TrackTarget(int drone,int target)
        {if(drone<0||drone>=Count||target>=Count||target< -1||target>=0&&(States[drone].fleetId==States[target].fleetId||States[target].disabled))return false;ManualTargets[drone]=target;return true;}
        void UpdateTactics(float dt)
        {
            if(!RoundStarted||RoundEnded)return;
            for(int team=0;team<2;team++)
            {
                var plan=team==0?Battle.bluePlan:Battle.redPlan;if(!plan.automatic){CurrentFormations[team]=plan.formation;continue;}
                formationClock[team]-=dt;if(formationClock[team]>0)continue;formationClock[team]=plan.switchSeconds;
                int alive=0,foes=0;float health=0;Vector3 ours=Vector3.zero,theirs=Vector3.zero;
                foreach(var s in States)if(!s.disabled){if(s.fleetId==team){alive++;health+=s.health;ours+=s.position;}else{foes++;theirs+=s.position;}}
                float distance=Vector3.Distance(ours/Mathf.Max(1,alive),theirs/Mathf.Max(1,foes));ArenaFormation shape;
                if(RoundTime<plan.switchSeconds)shape=LearnedOpening[team]>=0?(ArenaFormation)LearnedOpening[team]:plan.formation;
                else if(health/Mathf.Max(1,alive)<35)shape=ArenaFormation.LooseCloud;
                else if(alive<foes*.7f)shape=ArenaFormation.Escort;
                else if(distance>55)shape=(int)(RoundTime/plan.switchSeconds)%2==0?ArenaFormation.Wedge:ArenaFormation.Columns;
                else if(distance>25)shape=(int)(RoundTime/plan.switchSeconds)%2==0?ArenaFormation.Pincer:ArenaFormation.HighLow;
                else{ArenaFormation[] close={ArenaFormation.Ring,ArenaFormation.Staggered,ArenaFormation.DoubleWedge,ArenaFormation.Crescent};shape=close[((int)(RoundTime/plan.switchSeconds)+team)%close.Length];}
                if(shape!=CurrentFormations[team]){CurrentFormations[team]=shape;FormationSwitches[team]++;}
            }
        }
        Vector3 BehaviorTarget(int i,ref DroneState s,BattleStyle style,Vector3 target,Vector3 perceived,Vector3 waypoint,Vector3 away)
        {
            float distance=Vector3.Distance(s.position,perceived);s.aiState=distance>DroneCatalog.Weapon(s.weapon).range?"CHASE":"ENGAGE";
            if(style==BattleStyle.Adaptive)style=(BattleStyle)(8+((int)(Time/4)+i)%7);
            var lateral=Vector3.Cross(away,Vector3.up).normalized;
            switch(style)
            {
                case BattleStyle.Weave:target+=lateral*Mathf.Sin(Time*1.8f+i)*15+Vector3.up*Mathf.Cos(Time+i)*6;break;
                case BattleStyle.Strafe:target+=lateral*((i%2==0?1:-1)*16);break;
                case BattleStyle.HitAndRun:target=perceived+away*(Time%6<2?7:30);break;
                case BattleStyle.Screen:target=Vector3.Lerp(waypoint,perceived,.4f)+lateral*((i%3-1)*12);break;
                case BattleStyle.Intercept:target=perceived+States[TargetIds[i]].velocity*.5f+away*9;break;
                case BattleStyle.Ambush:target=distance>30?waypoint+Vector3.up*12:perceived+away*5;break;
                case BattleStyle.Regroup:target=waypoint+away*8;s.aiState="REGROUP";break;
            }
            if(s.reloadTime>0||s.heat>.85f){s.aiState=s.reloadTime>0?"RELOAD":"COOLING";target=perceived+away*35+Vector3.up*5;}
            if(s.ammo==0&&s.reserveAmmo==0&&Battle.finiteAmmo){s.aiState="OUT OF AMMO";target=waypoint;}
            if(s.health<30){s.aiState="EVADE";target+=away*15+lateral*Mathf.Sin(Time*2+i)*8;}
            if(Battle.abilities&&s.abilityCooldown<=0&&s.stamina>=30&&s.hitAge<.25f&&s.id!=ControlledDrone)
            {s.guarding=true;s.guardAge=0;s.stamina-=25;s.abilityCooldown=2;s.aiState="DEFEND";s.rotation=Quaternion.LookRotation(-away);}
            return target;
        }
    }
}
