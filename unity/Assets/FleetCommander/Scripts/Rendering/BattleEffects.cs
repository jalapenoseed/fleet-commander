using System.Collections.Generic;
using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Rendering
{
    public sealed class BattleEffects : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        struct Effect { public Vector3 a,b;public float life;public Color color;public bool burst; }
        readonly List<Effect> effects=new List<Effect>(256);Material material;
        void Start(){material=new Material(Resources.Load<Shader>("FleetLines"));material.SetInt("_SrcBlend",(int)UnityEngine.Rendering.BlendMode.SrcAlpha);material.SetInt("_DstBlend",(int)UnityEngine.Rendering.BlendMode.One);Simulator.OnBattleEvent+=Add;}
        void Add(BattleEvent e)
        {
            if(effects.Count>=256)effects.RemoveAt(0);
            effects.Add(new Effect{a=e.from,b=e.to,life=e.destruction||e.payload?1:.2f,color=e.destruction?new Color(1,.55f,.15f):e.team==0?Color.cyan:new Color(1,.2f,.2f),burst=e.destruction||e.payload});
        }
        void Update()
        {
            if(Simulator.Replay.Playing)
            {
                effects.Clear();
                foreach(var frame in Simulator.Replay.Frames)
                {
                    float age=Simulator.Replay.Cursor-frame.time;if(age<0||age>1||frame.events==null)continue;
                    foreach(var hit in frame.events)
                    {
                        float life=(hit.destruction||hit.payload?1:.2f)-age;if(life<=0)continue;Add(hit);int last=effects.Count-1;var e=effects[last];e.life=life;effects[last]=e;
                    }
                }
                return;
            }
            if(Simulator.Paused)return;for(int i=effects.Count-1;i>=0;i--){var e=effects[i];e.life-=Time.deltaTime;if(e.life<=0)effects.RemoveAt(i);else effects[i]=e;}
        }
        void OnRenderObject()
        {
            if(material==null)return;material.SetPass(0);GL.Begin(GL.LINES);
            foreach(var e in effects){Color c=e.color;c.a=Mathf.Clamp01(e.life*4);GL.Color(c);if(e.burst){for(int i=0;i<18;i++){var dir=FormationMath.Sphere(i,18,(1-e.life)*12);GL.Vertex(e.a+dir*.65f);GL.Vertex(e.a+dir);}}else{GL.Vertex(e.a);GL.Vertex(e.b);}}
            GL.End();
        }
        void OnDestroy(){if(Simulator)Simulator.OnBattleEvent-=Add;if(material)Destroy(material);}
    }
}
