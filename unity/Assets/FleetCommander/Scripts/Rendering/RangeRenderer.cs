using System.Collections.Generic;
using FleetCommander.Core;
using FleetCommander.Games;
using UnityEngine;
namespace FleetCommander.Rendering
{
    public sealed class RangeRenderer : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public bool HasRange=>root!=null;
        DroneRangeGame game;GameObject root;SceneGeometry geometry;readonly List<Material> materials=new List<Material>();readonly Transform[] targets=new Transform[8];readonly Renderer[] faces=new Renderer[8];Material blue,amber;LineRenderer shot;float shotUntil;
        Material Mat(string name,Color color,float glow=0){var m=new Material(Resources.Load<Shader>("FleetScenery")){name=name};m.SetColor("_Color",color);m.SetFloat("_Noise",.1f);m.SetFloat("_Glow",glow);materials.Add(m);return m;}
        void Clear(){if(game!=null)game.OnEvent-=Event;if(root)Destroy(root);geometry?.Dispose();foreach(var m in materials)Destroy(m);materials.Clear();}
        void Build()
        {
            root=new GameObject("Drone reflex range");root.transform.SetParent(transform);geometry=new SceneGeometry();var dark=Mat("Range deck",new Color(.035f,.065f,.085f));var rail=Mat("Range steel",new Color(.2f,.24f,.27f));var white=Mat("Range line",new Color(.8f,.85f,.7f));blue=Mat("Score target",new Color(.1f,.7f,1),.7f);amber=Mat("Avoid target",new Color(1,.54f,.08f),.5f);
            geometry.Box(new Vector3(0,.03f,0),new Vector3(70,.04f,100),dark);geometry.Box(new Vector3(0,14,43),new Vector3(70,28,1),rail);
            for(int x=-1;x<=1;x+=2)geometry.Box(new Vector3(x*35,10,0),new Vector3(.4f,20,100),dark);
            for(int i=-3;i<=3;i++)geometry.Line(new Vector3(i*10,0,-45),new Vector3(i*10,0,40),.08f,white);for(int z=-4;z<=4;z++)geometry.Line(new Vector3(-35,0,z*10),new Vector3(35,0,z*10),.07f,white);geometry.Build(root.transform,"Range equipment");
            for(int i=0;i<targets.Length;i++){var target=GameObject.CreatePrimitive(PrimitiveType.Cylinder);target.name="Reflex target "+(i+1);target.transform.SetParent(root.transform);target.transform.rotation=Quaternion.Euler(90,0,0);Destroy(target.GetComponent<Collider>());targets[i]=target.transform;faces[i]=target.GetComponent<Renderer>();var center=GameObject.CreatePrimitive(PrimitiveType.Cylinder);Destroy(center.GetComponent<Collider>());center.transform.SetParent(target.transform,false);center.transform.localPosition=new Vector3(0,-.6f,0);center.transform.localScale=new Vector3(.4f,.4f,.4f);center.GetComponent<Renderer>().sharedMaterial=white;}
            shot=new GameObject("Range tag beam").AddComponent<LineRenderer>();shot.transform.SetParent(root.transform);shot.sharedMaterial=blue;shot.positionCount=2;shot.startWidth=.035f;shot.endWidth=.012f;shot.enabled=false;game.OnEvent+=Event;
        }
        void Event(RangeEvent e,Vector3 from,Vector3 to){if(e!=RangeEvent.Shot)return;shot.SetPosition(0,from+(to-from).normalized*1.2f);shot.SetPosition(1,to);shotUntil=Time.unscaledTime+.08f;shot.enabled=true;}
        void LateUpdate(){if(game!=Simulator.Range){Clear();game=Simulator.Range;if(game!=null)Build();}if(game==null)return;for(int i=0;i<targets.Length;i++){var t=game.Targets[i];targets[i].gameObject.SetActive(t.active);targets[i].position=t.position;targets[i].localScale=new Vector3(t.radius*2,.15f,t.radius*2);faces[i].sharedMaterial=t.avoid?amber:blue;}shot.enabled=Time.unscaledTime<shotUntil;}
        void OnDestroy(){Clear();}
    }
}
