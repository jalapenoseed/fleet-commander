using System;
using UnityEngine;
namespace FleetCommander.Core
{
    public enum ArenaFormation { Line, Wedge, Grid, Ring, Stack, Echelon, Diamond, DoubleWedge, Box, Sphere, Helix, Arc, Cross, Staggered, Columns, LooseCloud, HighLow, Crescent, Pincer, Escort }
    [Serializable] public sealed class ArenaRole
    {
        public string name="Wing";public int weight=1;
        public FrameKind frame;public SkinKind skin=SkinKind.Cobalt;public WeaponKind weapon;
        public BattleStyle behavior;public ToyEffectorKind effector;public SensorKind sensors=SensorKind.Camera|SensorKind.Yolo|SensorKind.Range|SensorKind.Imu;
        public Vector3 offset;
    }
    [Serializable] public sealed class ArenaTeamPlan
    {
        public bool mixed, automatic=true;
        public float switchSeconds=5;
        public ArenaFormation formation=ArenaFormation.Wedge;
        public float spacing=6,cohesion=.55f;
        public ArenaRole[] roles=new ArenaRole[0];
        public void Validate()
        {
            if(!Enum.IsDefined(typeof(ArenaFormation),formation)||!FleetConfig.Finite(new Vector3(spacing,cohesion,0)))throw new ArgumentException("Invalid team formation.");
            switchSeconds=Mathf.Clamp(switchSeconds,2,20);spacing=Mathf.Clamp(spacing,2,20);cohesion=Mathf.Clamp01(cohesion);roles??=Array.Empty<ArenaRole>();
            if(roles.Length>8)throw new ArgumentException("At most eight roles per team.");
            foreach(var r in roles)if(r==null||!Enum.IsDefined(typeof(FrameKind),r.frame)||!Enum.IsDefined(typeof(SkinKind),r.skin)||!Enum.IsDefined(typeof(WeaponKind),r.weapon)||!Enum.IsDefined(typeof(BattleStyle),r.behavior)||!Enum.IsDefined(typeof(ToyEffectorKind),r.effector)||!FleetConfig.Finite(r.offset)||r.offset.magnitude>150||r.weight<1||r.weight>128)throw new ArgumentException("Invalid role loadout.");
        }
        public ArenaRole Role(int slot,int count)
        {
            if(!mixed||roles==null||roles.Length==0)return null;int total=0;foreach(var r in roles)total+=r.weight;
            float value=(slot+.5f)*total/Mathf.Max(1,count);int running=0;foreach(var r in roles){running+=r.weight;if(value<running)return r;}return roles[roles.Length-1];
        }
        public Vector3 Slot(int slot,int count)=>Slot(slot,count,formation);
        public Vector3 Slot(int slot,int count,ArenaFormation shape)
        {
            float a=slot*Mathf.PI*2/Mathf.Max(1,count),r=Mathf.Max(spacing,count*spacing/6.28f);
            switch(shape)
            {
                case ArenaFormation.Diamond:return new Vector3(Mathf.Cos(a),0,Mathf.Sin(a))*r/(Mathf.Abs(Mathf.Cos(a))+Mathf.Abs(Mathf.Sin(a)));
                case ArenaFormation.DoubleWedge:return new Vector3(-(slot/4)*spacing,0,(slot%4-1.5f)*spacing+(slot%2==0?-1:1)*slot/4f*spacing);
                case ArenaFormation.Box:return new Vector3((slot%4<2?-1:1)*r*.5f,slot/4*spacing,(slot%2==0?-1:1)*r*.5f);
                case ArenaFormation.Sphere:return FormationMath.Sphere(slot,count,Mathf.Max(spacing,r*.65f));
                case ArenaFormation.Helix:return new Vector3(Mathf.Cos(a*2)*r*.5f,(slot-(count-1)*.5f)*spacing*.4f,Mathf.Sin(a*2)*r*.5f);
                case ArenaFormation.Arc:return new Vector3(Mathf.Cos(a*.45f)*r,0,Mathf.Sin(a*.45f)*r-r*.5f);
                case ArenaFormation.Crescent:return new Vector3(Mathf.Cos(a*.7f)*r,Mathf.Sin(a)*spacing,Mathf.Sin(a*.7f)*r);
                case ArenaFormation.Cross:return slot%2==0?new Vector3((slot/2-count*.25f)*spacing,0,0):new Vector3(0,0,(slot/2-count*.25f)*spacing);
                case ArenaFormation.Staggered:return new Vector3(-(slot/2)*spacing,(slot%2)*spacing*.5f,(slot%2==0?-1:1)*spacing);
                case ArenaFormation.Columns:return new Vector3(-(slot/3)*spacing,0,(slot%3-1)*spacing*1.5f);
                case ArenaFormation.LooseCloud:return new Vector3(FormationMath.Hash(slot*3)*2-1,FormationMath.Hash(slot*3+1)-.5f,FormationMath.Hash(slot*3+2)*2-1)*r;
                case ArenaFormation.HighLow:return new Vector3(-(slot/2)*spacing,(slot%2==0?-1:1)*spacing,(slot%2==0?-1:1)*spacing*1.5f);
                case ArenaFormation.Pincer:return new Vector3(-Mathf.Abs(slot-count*.5f)*spacing*.4f,0,(slot<count/2?-1:1)*(spacing*2+slot%Mathf.Max(1,count/2)*spacing));
                case ArenaFormation.Escort:return slot==0?Vector3.zero:FormationMath.Ring(slot-1,Mathf.Max(1,count-1),spacing*2);
                case ArenaFormation.Line:return new Vector3(0,0,(slot-(count-1)*.5f)*spacing);
                case ArenaFormation.Grid:var g=FormationMath.Grid(slot,count,spacing);return new Vector3(g.z,0,g.x);
                case ArenaFormation.Ring:return FormationMath.Ring(slot,count,Mathf.Max(spacing,count*spacing/6.28f));
                case ArenaFormation.Stack:return new Vector3((slot/5)*-spacing,(slot%5)*spacing,0);
                case ArenaFormation.Echelon:return new Vector3(-slot*spacing*.7f,0,(slot-(count-1)*.5f)*spacing*.7f);
                default:float row=Mathf.Ceil(slot/2f);return new Vector3(-row*spacing*.65f,0,(slot%2==0?1:-1)*row*spacing*.65f);
            }
        }
        public void Preset(int team,string preset)
        {
            SkinKind skin=team==0?SkinKind.Cobalt:SkinKind.Crimson;mixed=true;
            formation=preset=="Screen & flank"?ArenaFormation.Line:preset=="Heavy escort"?ArenaFormation.Grid:ArenaFormation.Wedge;
            roles=new[]{
                new ArenaRole{name="Vanguard",weight=2,frame=FrameKind.Scout,skin=skin,weapon=WeaponKind.RapidFire,behavior=BattleStyle.Pursuit,effector=ToyEffectorKind.FoamDart,offset=new Vector3(8,0,0)},
                new ArenaRole{name="Left wing",weight=1,frame=FrameKind.Relay,skin=SkinKind.Arctic,weapon=WeaponKind.Pulse,behavior=BattleStyle.FlankLeft,effector=ToyEffectorKind.LaserTag,offset=new Vector3(-3,6,-12)},
                new ArenaRole{name="Right wing",weight=1,frame=FrameKind.Utility,skin=skin,weapon=WeaponKind.Scatter,behavior=BattleStyle.FlankRight,effector=ToyEffectorKind.Net,offset=new Vector3(-3,3,12)},
                new ArenaRole{name="Anchor",weight=preset=="Heavy escort"?3:1,frame=FrameKind.Cargo,skin=SkinKind.Industrial,weapon=WeaponKind.Shockwave,behavior=BattleStyle.Guardian,effector=ToyEffectorKind.Water,offset=new Vector3(-12,0,0)}
            };
        }
    }
}
