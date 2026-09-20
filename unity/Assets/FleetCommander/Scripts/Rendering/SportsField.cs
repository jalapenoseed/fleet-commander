using FleetCommander.Core;
using UnityEngine;

namespace FleetCommander.Rendering
{
    public sealed class SportsField : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        GameObject field;SportsMatch shown;Transform ball;readonly Transform[] flags=new Transform[2];
        readonly System.Collections.Generic.List<Material> materials=new System.Collections.Generic.List<Material>();
        Material Paint(Color c){var m=new Material(Resources.Load<Shader>("FleetInstanced"));m.SetColor("_Color",c);m.SetFloat("_Glow",.08f);materials.Add(m);return m;}
        GameObject Shape(string name,PrimitiveType type,Vector3 p,Vector3 size,Material material)
        {
            var obj=GameObject.CreatePrimitive(type);obj.name=name;obj.transform.SetParent(field.transform);obj.transform.localPosition=p;obj.transform.localScale=size;obj.GetComponent<Renderer>().sharedMaterial=material;Destroy(obj.GetComponent<Collider>());return obj;
        }
        void Line(string name,Vector3 a,Vector3 b,float width,Material material)
        {
            var g=Shape(name,PrimitiveType.Cube,(a+b)*.5f,new Vector3(width,.04f,Vector3.Distance(a,b)),material);g.transform.rotation=Quaternion.LookRotation(b-a);
        }
        void Clear(){if(field)Destroy(field);foreach(var m in materials)if(m)Destroy(m);materials.Clear();ball=null;flags[0]=flags[1]=null;}
        void Update()
        {
            if(!Simulator)return;var match=Simulator.Sports;
            if(shown!=match){shown=match;Clear();if(match!=null)Build(match.Settings.sport);}
            if(match==null)return;
            if(ball)ball.position=match.Ball;
            for(int i=0;i<2;i++)if(flags[i])flags[i].position=match.FlagCarrier[i]<0?SportsMatch.Base(i):match.World.States[match.FlagCarrier[i]].position+Vector3.up*2;
            if(match.Settings.sport==SportKind.FlagFootball)
            {
                var line=field.transform.Find("Line of scrimmage");if(line)line.localPosition=new Vector3(match.Scrimmage,.57f,0);
                var first=field.transform.Find("First down line");if(first)first.localPosition=new Vector3(match.FirstDownLine,.57f,0);
            }
        }
        void Build(SportKind sport)
        {
            field=new GameObject("Sports field · "+sport);field.transform.SetParent(transform);
            var dark=Paint(new Color(.025f,.095f,.10f));var turf=Paint(new Color(.08f,.26f,.16f));var stripe=Paint(new Color(.10f,.32f,.19f));
            var white=Paint(new Color(.88f,.95f,.9f));var blue=Paint(new Color(.06f,.46f,.8f));var red=Paint(new Color(.83f,.16f,.2f));var gold=Paint(new Color(1,.72f,.16f));
            Shape("Pitch foundation",PrimitiveType.Cube,new Vector3(0,.16f,0),new Vector3(128,.3f,82),dark);
            Shape("Grass pitch",PrimitiveType.Cube,new Vector3(0,.36f,0),new Vector3(120,.2f,64),turf);
            for(int x=-5;x<6;x+=2)Shape("Mown grass stripe",PrimitiveType.Cube,new Vector3(x*10,.47f,0),new Vector3(10,.03f,60),stripe);
            Line("Touchline north",new Vector3(-50,.53f,30),new Vector3(50,.53f,30),.25f,white);Line("Touchline south",new Vector3(-50,.53f,-30),new Vector3(50,.53f,-30),.25f,white);
            foreach(int sign in new[]{-1,1})Line("Goal line",new Vector3(sign*50,.53f,-30),new Vector3(sign*50,.53f,30),.25f,white);
            Line("Halfway",new Vector3(0,.54f,-30),new Vector3(0,.54f,30),.22f,white);
            for(int side=-1;side<=1;side+=2)
            {
                var color=side<0?blue:red;
                for(int tier=0;tier<4;tier++)Shape("Pitch grandstand",PrimitiveType.Cube,new Vector3(0,1+tier*1.2f,side*(38+tier*2)),new Vector3(118,1.4f,2),tier%2==0?dark:color);
                Shape("Team end zone",PrimitiveType.Cube,new Vector3(side*55,.51f,0),new Vector3(9,.04f,60),color);
                Shape("Team bench",PrimitiveType.Cube,new Vector3(side*30,1,-35),new Vector3(16,1.5f,2),color);
                if(sport==SportKind.Soccer)
                {
                    for(int z=-1;z<=1;z+=2)Shape("Goal post",PrimitiveType.Cylinder,new Vector3(side*50,3.1f,z*8),new Vector3(.28f,2.6f,.28f),white);
                    Shape("Crossbar",PrimitiveType.Cube,new Vector3(side*50,5.7f,0),new Vector3(.28f,.28f,16.4f),white);
                    for(int z=-8;z<=8;z+=2)Line("Goal net",new Vector3(side*53,.6f,z),new Vector3(side*53,5.6f,z),.05f,white);
                    for(int y=1;y<6;y++)Shape("Net weave",PrimitiveType.Cube,new Vector3(side*53,y,0),new Vector3(.05f,.05f,16),white);
                    Line("Penalty box",new Vector3(side*34,.54f,-18),new Vector3(side*34,.54f,18),.2f,white);
                    foreach(int z in new[]{-18,18})Line("Penalty box end",new Vector3(side*34,.54f,z),new Vector3(side*50,.54f,z),.2f,white);
                }
            }
            if(sport==SportKind.Soccer)
            {
                for(int i=0;i<48;i++){float a=i*Mathf.PI/24,b=(i+1)*Mathf.PI/24;Line("Center circle",new Vector3(Mathf.Cos(a)*9,.55f,Mathf.Sin(a)*9),new Vector3(Mathf.Cos(b)*9,.55f,Mathf.Sin(b)*9),.2f,white);}
                ball=Shape("Soccer ball",PrimitiveType.Sphere,new Vector3(0,1.2f,0),Vector3.one*1.25f,white).transform;
                var seam=GameObject.CreatePrimitive(PrimitiveType.Cube);seam.name="Ball stripe";seam.transform.SetParent(ball,false);seam.transform.localScale=new Vector3(.16f,1.015f,.5f);seam.GetComponent<Renderer>().sharedMaterial=dark;Destroy(seam.GetComponent<Collider>());
            }
            else if(sport==SportKind.CaptureTheFlag)
            {
                for(int i=0;i<2;i++)
                {
                    var flag=new GameObject(i==0?"Blue flag":"Red flag");flag.transform.SetParent(field.transform);flags[i]=flag.transform;
                    var pole=Shape("Flag pole",PrimitiveType.Cylinder,Vector3.zero,new Vector3(.18f,2.5f,.18f),white);pole.transform.SetParent(flag.transform,false);
                    var cloth=Shape("Flag cloth",PrimitiveType.Cube,new Vector3(1.5f,1.8f,0),new Vector3(3,1.7f,.12f),i==0?blue:red);cloth.transform.SetParent(flag.transform,false);
                    Shape("Flag base",PrimitiveType.Cylinder,new Vector3(i==0?-46:46,.6f,0),new Vector3(7,.12f,7),i==0?blue:red);
                }
            }
            else
            {
                for(int x=-40;x<=40;x+=10)Line("Yard line",new Vector3(x,.54f,-30),new Vector3(x,.54f,30),.18f,white);
                Shape("Line of scrimmage",PrimitiveType.Cube,new Vector3(0,.57f,0),new Vector3(.3f,.03f,60),blue);
                Shape("First down line",PrimitiveType.Cube,new Vector3(20,.57f,0),new Vector3(.3f,.03f,60),gold);
                ball=Shape("Football",PrimitiveType.Sphere,Vector3.zero,new Vector3(.8f,.8f,1.5f),gold).transform;
            }
        }
        void OnDestroy()=>Clear();
    }
}
