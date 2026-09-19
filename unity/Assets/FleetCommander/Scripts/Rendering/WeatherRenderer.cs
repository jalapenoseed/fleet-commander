using FleetCommander.Core;
using UnityEngine;
namespace FleetCommander.Rendering
{
    public sealed class WeatherRenderer : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        Material material;
        void Start(){material=new Material(Resources.Load<Shader>("FleetLines"));material.SetInt("_SrcBlend",5);material.SetInt("_DstBlend",10);}
        void OnRenderObject()
        {
            if(!material||!Simulator||Camera.current!=Camera.main)return;
            var c=Simulator.Replay.Playing?Simulator.Replay.DisplayConfig:Simulator.Config;
            if(c.planet!=PlanetKind.Earth||c.weather==WeatherKind.Clear)return;
            float time=Simulator.Replay.Playing?Simulator.Replay.Cursor:Simulator.Active.Time;
            bool snow=c.weather==WeatherKind.Snow;float speed=snow?2:24;
            Vector3 camera=Camera.current.transform.position;material.SetPass(0);GL.Begin(GL.LINES);GL.Color(snow?new Color(.85f,.93f,1,.5f):new Color(.55f,.75f,.9f,.22f));
            for(int i=0;i<700;i++)
            {
                float x=FormationMath.Hash(i*3)*100-50,z=FormationMath.Hash(i*3+1)*100-50,y=Mathf.Repeat(FormationMath.Hash(i*3+2)*80-time*speed,80)-30;
                Vector3 p=camera+new Vector3(x+Mathf.Sin(time*.7f+i)*c.wind*.2f,y,z);
                GL.Vertex(p);GL.Vertex(p+new Vector3(snow?.15f:.15f*c.wind,snow?.15f:1.8f,0));
            }
            GL.End();
        }
        void OnDestroy(){if(material)Destroy(material);}
    }
}
