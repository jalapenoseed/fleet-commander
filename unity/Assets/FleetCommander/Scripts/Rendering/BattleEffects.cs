using System.Collections.Generic;
using FleetCommander.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace FleetCommander.Rendering
{
    // All motion samples simulation time (or the replay cursor), so pause and scrubbing are stable.
    public sealed class BattleEffects : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        struct Effect {public BattleEvent hit;public float born;}
        const int MaxShots=256,MaxBursts=80,MaxInstances=1023;
        readonly List<Effect> shots=new List<Effect>(MaxShots),bursts=new List<Effect>(MaxBursts);
        readonly List<Effect> replayShots=new List<Effect>(MaxShots),replayBursts=new List<Effect>(MaxBursts);
        readonly Matrix4x4[] matrices=new Matrix4x4[MaxInstances];
        readonly Vector4[] colors=new Vector4[MaxInstances];
        Material lines,debrisMaterial,smokeMaterial,fireMaterial;
        Mesh fragment,quad;MaterialPropertyBlock properties;FleetWorld world;float lastWorldTime;
        List<Effect> VisibleShots=>Simulator.Replay.Playing?replayShots:shots;
        List<Effect> VisibleBursts=>Simulator.Replay.Playing?replayBursts:bursts;
        float Clock=>Simulator.Replay.Playing?Simulator.Replay.Cursor:Simulator.Active.Time;
        void Start()
        {
            lines=new Material(Resources.Load<Shader>("FleetLines"));
            lines.SetInt("_SrcBlend",(int)BlendMode.SrcAlpha);lines.SetInt("_DstBlend",(int)BlendMode.One);
            debrisMaterial=new Material(Resources.Load<Shader>("FleetSurface")){enableInstancing=true};
            debrisMaterial.SetFloat("_Metallic",.65f);debrisMaterial.SetFloat("_Smoothness",.25f);
            smokeMaterial=new Material(Resources.Load<Shader>("FleetSmoke")){enableInstancing=true};
            fireMaterial=new Material(Resources.Load<Shader>("FleetBeacon")){enableInstancing=true};
            fragment=DroneRenderer.Primitive(PrimitiveType.Cube);quad=DroneRenderer.Primitive(PrimitiveType.Quad);
            properties=new MaterialPropertyBlock();Simulator.OnBattleEvent+=Add;world=Simulator.Active;
        }
        void ResetForWorld()
        {
            if(world!=Simulator.Active||Simulator.Active.Time<lastWorldTime){world=Simulator.Active;shots.Clear();bursts.Clear();}
            lastWorldTime=Simulator.Active.Time;
        }
        static void Insert(List<Effect> list,Effect e,int limit)
        {if(list.Count>=limit)list.RemoveAt(0);list.Add(e);}
        void Add(BattleEvent e)
        {
            ResetForWorld();var effect=new Effect{hit=e,born=Simulator.Active.Time};
            if(e.destruction||e.payload)Insert(bursts,effect,MaxBursts);else Insert(shots,effect,MaxShots);
        }
        static float Lifetime(BattleEvent e)=>e.weapon==WeaponKind.Shockwave?.7f:e.weapon==WeaponKind.RapidFire?.12f:.23f;
        void LateUpdate()
        {
            if(Simulator==null||properties==null)return;ResetForWorld();
            float now=Clock;
            if(Simulator.Replay.Playing)
            {
                replayShots.Clear();replayBursts.Clear();
                foreach(var frame in Simulator.Replay.Frames)
                {
                    float age=now-frame.time;if(age<0||age>6||frame.events==null)continue;
                    foreach(var hit in frame.events)
                    {
                        var e=new Effect{hit=hit,born=frame.time};
                        if(hit.destruction||hit.payload)Insert(replayBursts,e,MaxBursts);
                        else if(age<Lifetime(hit))Insert(replayShots,e,MaxShots);
                    }
                }
            }
            else
            {
                for(int i=shots.Count-1;i>=0;i--)if(now-shots[i].born>Lifetime(shots[i].hit))shots.RemoveAt(i);
                for(int i=bursts.Count-1;i>=0;i--)if(now-bursts[i].born>6)bursts.RemoveAt(i);
            }
            var cam=Camera.main;if(!cam)return;
            var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;
            DrawFragments(now);
            DrawWrecks(states,cam,false);DrawWrecks(states,cam,true);
            DrawFire(states,cam,now);
        }
        void Flush(Mesh mesh,Material material,int count,bool shadows=false)
        {
            if(count==0)return;properties.SetVectorArray("_Color",colors);
            Graphics.DrawMeshInstanced(mesh,0,material,matrices,count,properties,shadows?ShadowCastingMode.On:ShadowCastingMode.Off,false,0,null,LightProbeUsage.Off);
        }
        void DrawFragments(float now)
        {
            int n=0;
            foreach(var effect in VisibleBursts)
            {
                if(!effect.hit.destruction)continue;float age=now-effect.born;if(age<0||age>6)continue;
                for(int k=0;k<10;k++)
                {
                    int seed=effect.hit.victim*31+k+17;
                    Vector3 direction=new Vector3(Hash(seed)*2-1,.4f+Hash(seed+9),Hash(seed+37)*2-1).normalized;
                    Vector3 p=effect.hit.to+direction*(2.2f+Hash(seed+4)*4.5f)*age+Vector3.down*4.9f*age*age;
                    float ground=.07f+(k%3)*.03f;bool resting=p.y<ground;p.y=Mathf.Max(ground,p.y);
                    var spin=Quaternion.Euler((resting?84:age*193)+seed,age*(resting?0:151)+seed*3,resting?12:age*227);
                    Vector3 scale=k%3==0?new Vector3(.45f,.025f,.075f):k%3==1?new Vector3(.17f,.09f,.24f):new Vector3(.1f,.14f,.1f);
                    matrices[n]=Matrix4x4.TRS(p,spin,scale);
                    colors[n++]=new Color(.13f,.15f,.16f,.55f);
                    if(n==MaxInstances){Flush(fragment,debrisMaterial,n,true);n=0;}
                }
            }
            Flush(fragment,debrisMaterial,n,true);
        }
        void DrawWrecks(DroneState[] states,Camera cam,bool smoke)
        {
            int n=0;
            foreach(var s in states)
            {
                if(!s.disabled||s.health>0)continue;
                float age=s.destructionAge;
                if(smoke)
                {
                    if(age>16)continue;
                    for(int k=0;k<4;k++)
                    {
                        float phase=(age*.7f+k*.58f)%2.3f;
                        float life=Mathf.Clamp01(age*.9f)*Mathf.Clamp01((16-age)/5);
                        Vector3 p=s.position+new Vector3(Mathf.Sin(s.id+phase)*phase*.45f,phase*2.2f+.3f,Mathf.Cos(s.id+phase)*phase*.35f);
                        float scale=.7f+phase*1.7f;
                        matrices[n]=Matrix4x4.TRS(p,cam.transform.rotation,Vector3.one*scale);
                        colors[n++]=new Color(.075f,.073f,.07f,life*(1-phase/2.3f)*.52f);
                        if(n==MaxInstances){Flush(quad,smokeMaterial,n);n=0;}
                    }
                }
                else if(s.phase==FlightPhase.Wreck)
                {
                    float scale=s.frame==FrameKind.Cargo?3:1.65f;
                    matrices[n]=Matrix4x4.TRS(new Vector3(s.position.x,Mathf.Max(.025f,s.position.y-.62f),s.position.z),Quaternion.Euler(90,0,s.id*37),new Vector3(scale,scale,1));
                    colors[n++]=new Color(.025f,.021f,.018f,.82f);
                    if(n==MaxInstances){Flush(quad,smokeMaterial,n);n=0;}
                }
            }
            Flush(quad,smokeMaterial,n);
        }
        void DrawFire(DroneState[] states,Camera cam,float now)
        {
            int n=0;
            foreach(var effect in VisibleBursts)
            {
                float age=now-effect.born;if(age<0||age>1.2f)continue;
                float size=(effect.hit.destruction?5:7)*Mathf.Sin(Mathf.Clamp01(age/1.2f)*Mathf.PI);
                matrices[n]=Matrix4x4.TRS(effect.hit.to,cam.transform.rotation,Vector3.one*size);
                colors[n++]=new Color(4,1.3f,.14f,1)*(1-age/1.2f);
                if(n==MaxInstances){Flush(quad,fireMaterial,n);n=0;}
            }
            foreach(var s in states)
            {
                if(!s.disabled||s.health>0||s.destructionAge>7)continue;
                float age=s.destructionAge;float fade=Mathf.Clamp01((7-age)/3);
                float flicker=.8f+Mathf.Sin(age*29+s.id)*.2f;
                for(int k=0;k<2;k++)
                {
                    matrices[n]=Matrix4x4.TRS(s.position+Vector3.up*(.25f+k*.4f),cam.transform.rotation,new Vector3(.95f-k*.3f,1.3f-k*.1f,1)*flicker);
                    colors[n++]=new Color(3.2f,1.05f-k*.3f,.08f,1)*fade;
                    if(n==MaxInstances){Flush(quad,fireMaterial,n);n=0;}
                }
            }
            Flush(quad,fireMaterial,n);
        }
        void OnRenderObject()
        {
            if(lines==null||Simulator==null)return;var cam=Camera.current;if(!cam)return;
            float now=Clock;lines.SetPass(0);GL.Begin(GL.LINES);
            foreach(var effect in VisibleShots)
            {
                var e=effect.hit;float age=now-effect.born,life=Lifetime(e);if(age<0||age>life)continue;
                Color c=e.team==0?new Color(.2f,.9f,1):new Color(1,.23f,.14f);c.a=1-age/life;GL.Color(c);
                Vector3 direction=(e.to-e.from).normalized;
                Vector3 side=Vector3.Cross(direction,Vector3.up).normalized;
                switch(e.weapon)
                {
                    case WeaponKind.RapidFire:
                        GL.Color(new Color(1,.85f,.32f,c.a));
                        for(int k=0;k<3;k++){float t=Mathf.Repeat(age/life+k*.3f,1);Line(Vector3.Lerp(e.from,e.to,Mathf.Max(0,t-.13f)),Vector3.Lerp(e.from,e.to,t));}break;
                    case WeaponKind.Scatter:
                        for(int k=-2;k<=2;k++)Line(e.from,e.to+side*k*.55f+Vector3.up*((k*k)%3)*.27f);break;
                    case WeaponKind.Shockwave:
                        Ring(e.from,age/life*10,32);Ring(e.to,age/life*3,24);break;
                    default:
                        Line(e.from,e.to);Line(e.from+side*.05f,e.to+side*.05f);break;
                }
                if(e.impact)for(int k=0;k<7;k++)
                {Vector3 dir=FormationMath.Sphere(k,7,.25f+age*5);Line(e.to+dir*.3f,e.to+dir);}
            }
            foreach(var effect in VisibleBursts)
            {
                var e=effect.hit;float age=now-effect.born;if(age<0||age>1.4f)continue;
                GL.Color(new Color(1,.48f,.08f,1-age/1.4f));
                for(int k=0;k<24;k++){var dir=FormationMath.Sphere(k,24,.5f+age*10);Line(e.to+dir*.6f,e.to+dir);}
                if(e.payload)Ring(e.to+Vector3.up*.08f,age*15,48);
            }
            GL.End();
        }
        static float Hash(int value)=>FormationMath.Hash(value);
        static void Line(Vector3 a,Vector3 b){GL.Vertex(a);GL.Vertex(b);}
        static void Ring(Vector3 p,float radius,int segments)
        {
            for(int k=0;k<segments;k++)
            {float a=k*Mathf.PI*2/segments,b=(k+1)*Mathf.PI*2/segments;Line(p+new Vector3(Mathf.Cos(a),0,Mathf.Sin(a))*radius,p+new Vector3(Mathf.Cos(b),0,Mathf.Sin(b))*radius);}
        }
        void OnDestroy()
        {
            if(Simulator)Simulator.OnBattleEvent-=Add;
            foreach(var m in new[]{lines,debrisMaterial,smokeMaterial,fireMaterial})if(m)Destroy(m);
        }
    }
}
