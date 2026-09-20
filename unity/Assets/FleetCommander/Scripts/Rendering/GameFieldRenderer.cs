using System.Collections.Generic;
using FleetCommander.Core;
using FleetCommander.Games;
using UnityEngine;
namespace FleetCommander.Rendering
{
    public sealed class GameFieldRenderer : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public bool HasField=>field!=null;
        GameObject field,ball;Transform firstDownMarker,scrimmageMarker;readonly GameObject[] flags=new GameObject[2];SceneGeometry geometry;SportKind? previous;
        readonly List<Material> materials=new List<Material>();TextMesh board;
        Mesh projectileMesh;Material dartMaterial,waterMaterial,netMaterial;
        Material Mat(string name,Color c,float glow=0){var m=new Material(Resources.Load<Shader>("FleetScenery")){name=name};m.SetColor("_Color",c);m.SetFloat("_Noise",.13f);m.SetFloat("_Glow",glow);materials.Add(m);return m;}
        void Update()
        {
            var match=Simulator.Sports;if(match==null){if(field)Clear();previous=null;return;}
            if(previous!=match.Kind||!field){Clear();previous=match.Kind;Build(match.Kind);}
            if(firstDownMarker){firstDownMarker.localPosition=new Vector3(match.FirstDownLine,.09f,0);scrimmageMarker.localPosition=new Vector3(match.Scrimmage,.08f,0);}
            if(ball){ball.transform.position=match.Ball;ball.transform.Rotate(new Vector3(match.BallVelocity.z,0,-match.BallVelocity.x)*Time.deltaTime*60,Space.World);}
            for(int f=0;f<2;f++)if(flags[f]){flags[f].transform.position=match.Flags[f]+Vector3.down*2.9f;flags[f].transform.localRotation=Quaternion.Euler(0,Mathf.Sin(Time.time*2)*12,0);}
            if(match.Toy!=null)
            {
                if(!projectileMesh)projectileMesh=DroneRenderer.Primitive(PrimitiveType.Sphere);
                foreach(var shot in match.Toy.Projectiles){float size=shot.kind==ToyEffectorKind.Net?1.8f:shot.kind==ToyEffectorKind.Water?.24f:.3f;var mat=shot.kind==ToyEffectorKind.Net?netMaterial:shot.kind==ToyEffectorKind.Water?waterMaterial:dartMaterial;Graphics.DrawMesh(projectileMesh,Matrix4x4.TRS(shot.position,Quaternion.LookRotation(shot.velocity),new Vector3(size,size,size*2)),mat,0);}
            }
            int seconds=Mathf.CeilToInt(match.Remaining);
            if(board)board.text=match.Title+"\n"+match.ScoreText+"\n"+(seconds/60).ToString("00")+":"+(seconds%60).ToString("00")+"   "+match.Status;
        }
        void Build(SportKind kind)
        {
            field=new GameObject(kind+" field and equipment");field.transform.SetParent(transform);geometry=new SceneGeometry();
            var white=Mat("Pitch chalk",new Color(.94f,.95f,.89f));var turf=Mat("Pitch turf",new Color(.17f,.36f,.075f));var stripe=Mat("Mown stripes",new Color(.23f,.44f,.1f));var blue=Mat("Blue team",new Color(.05f,.33f,.82f));var red=Mat("Red team",new Color(.78f,.08f,.08f));var steel=Mat("Goal frame",new Color(.8f,.85f,.84f));var net=Mat("Goal net",new Color(.69f,.74f,.68f));
            geometry.Box(new Vector3(0,.016f,0),new Vector3(114,.02f,68),turf);for(int x=-5;x<5;x+=2)geometry.Box(new Vector3(x*10+5,.031f,0),new Vector3(10,.01f,60),stripe);
            Line(-50,-30,50,-30,white);Line(-50,30,50,30,white);Line(-50,-30,-50,30,white);Line(50,-30,50,30,white);Line(0,-30,0,30,white);
            if(kind==SportKind.Soccer)
            {
                geometry.Ring(Vector3.zero,9.15f,9.15f,.16f,white);geometry.Cylinder(new Vector3(0,.05f,0),.3f,.02f,white);
                for(int side=-1;side<=1;side+=2)
                {
                    float x=side*50,inside=side*34;Line(inside,-18,inside,18,white);Line(x,-18,inside,-18,white);Line(x,18,inside,18,white);Line(side*44,-10,side*44,10,white);Line(x,-10,side*44,-10,white);Line(x,10,side*44,10,white);
                    geometry.Beam(new Vector3(x,0,-7),new Vector3(x,5,-7),.22f,steel);geometry.Beam(new Vector3(x,0,7),new Vector3(x,5,7),.22f,steel);geometry.Beam(new Vector3(x,5,-7),new Vector3(x,5,7),.22f,steel);
                    for(float z=-7;z<=7;z+=.7f){geometry.Beam(new Vector3(x+side*4,0,z),new Vector3(x+side*4,5,z),.035f,net);geometry.Beam(new Vector3(x,5,z),new Vector3(x+side*4,5,z),.035f,net);}
                    for(float y=.1f;y<=5;y+=.7f){geometry.Beam(new Vector3(x+side*4,y,-7),new Vector3(x+side*4,y,7),.035f,net);geometry.Beam(new Vector3(x,y,-7),new Vector3(x+side*4,y,-7),.035f,net);geometry.Beam(new Vector3(x,y,7),new Vector3(x+side*4,y,7),.035f,net);}
                    for(int z=-1;z<=1;z+=2){geometry.Cylinder(new Vector3(x,1.5f,z*30),.06f,3,steel);geometry.Box(new Vector3(x+.6f,2.6f,z*30),new Vector3(1.2f,.65f,.05f),side<0?blue:red);}
                }
                ball=new GameObject("Soccer ball · stitched panels");ball.transform.SetParent(field.transform);var g=new SceneGeometry();var black=Mat("Ball panels",new Color(.025f,.04f,.05f));g.Ball(Vector3.zero,Vector3.one*1.3f,white);
                for(int i=0;i<12;i++){float y=1-(i+.5f)/6f,a=i*2.39996f,r=Mathf.Sqrt(1-y*y);g.Ball(new Vector3(Mathf.Cos(a)*r,y,Mathf.Sin(a)*r)*.58f,Vector3.one*.36f,black);}g.Build(ball.transform,"Ball");geometry.Owned.AddRange(g.Owned);
            }
            else if(kind==SportKind.FlagFootball)
            {
                firstDownMarker=FieldMarker("First down line · yellow",Mat("First down",new Color(1,.85f,.05f)));
                scrimmageMarker=FieldMarker("Line of scrimmage · blue",blue);
                for(int side=-1;side<=1;side+=2)
                {
                    geometry.Box(new Vector3(side*53,.04f,0),new Vector3(6,.03f,60),side<0?blue:red);
                    for(int x=10;x<50;x+=10){Line(side*x,-30,side*x,30,white);for(int z=-20;z<=20;z+=40)Text((50-x).ToString(),new Vector3(side*x,.08f,z),2,Quaternion.Euler(90,0,0),field.transform);}
                    var yellow=Mat("Goalpost gold",new Color(1,.72f,.04f));geometry.Beam(new Vector3(side*57,0,0),new Vector3(side*57,6,0),.25f,yellow);geometry.Beam(new Vector3(side*57,6,-6),new Vector3(side*57,6,6),.2f,yellow);for(int z=-1;z<=1;z+=2)geometry.Beam(new Vector3(side*57,6,z*6),new Vector3(side*57,13,z*6),.2f,yellow);
                    Text(side<0?"BLUE":"RED",new Vector3(side*53,.09f,0),2.3f,Quaternion.Euler(90,side<0?90:-90,0),field.transform);
                }
                for(int x=-48;x<50;x+=2)for(int z=-1;z<=1;z+=2)Line(x,z*10,x,z*10+1,white);
                ball=new GameObject("Football · laced leather");ball.transform.SetParent(field.transform);var g=new SceneGeometry();g.Ball(Vector3.zero,new Vector3(1.7f,.95f,.95f),Mat("Football leather",new Color(.42f,.19f,.07f)));for(int i=-3;i<=3;i++)g.Box(new Vector3(i*.12f,.46f,0),new Vector3(.05f,.035f,.25f),white);g.Build(ball.transform,"Football");geometry.Owned.AddRange(g.Owned);
            }
            else if(kind==SportKind.CaptureTheFlag)
            {
                for(int f=0;f<2;f++)
                {
                    Vector3 p=SportsMatch.Base(f);p.y=0;geometry.Ring(p,5,5,.25f,f==0?blue:red);geometry.Ring(p,7,7,.1f,white);
                    flags[f]=new GameObject((f==0?"Blue":"Red")+" flag");flags[f].transform.SetParent(field.transform);var g=new SceneGeometry();g.Cylinder(new Vector3(0,1.7f,0),.07f,3.4f,steel);g.Box(new Vector3(.9f,2.85f,0),new Vector3(1.8f,.9f,.05f),f==0?blue:red);g.Ball(new Vector3(0,3.45f,0),Vector3.one*.2f,white);g.Build(flags[f].transform,"Flag");geometry.Owned.AddRange(g.Owned);
                    Text(f==0?"BLUE BASE":"RED BASE",p+new Vector3(0,.08f,10),1.7f,Quaternion.Euler(90,0,0),field.transform);
                }
            }
            if(kind==SportKind.TagDuel||kind==SportKind.KingOfHill)
            {
                geometry.Ring(Vector3.zero,10,10,.25f,kind==SportKind.KingOfHill?Mat("Hill zone",new Color(1,.75f,.06f)):white);
                for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2){geometry.Cylinder(new Vector3(x*50,4,z*30),.35f,8,steel);geometry.Ball(new Vector3(x*50,8,z*30),Vector3.one*1.2f,x<0?blue:red);}
                dartMaterial=Mat("Foam darts",new Color(1,.45f,.05f),.2f);waterMaterial=Mat("Water stream",new Color(.15f,.65f,1),.3f);netMaterial=Mat("Soft net",new Color(.65f,.9f,.6f));
            }
            geometry.Build(field.transform,"Pitch");board=Text("",new Vector3(0,15,65),1.4f,Quaternion.identity,field.transform);board.name="Live match scoreboard";
        }
        Transform FieldMarker(string name,Material material)
        {var go=new GameObject(name);go.transform.SetParent(field.transform,false);var g=new SceneGeometry();g.Box(Vector3.zero,new Vector3(.3f,.025f,60),material);g.Build(go.transform,name);geometry.Owned.AddRange(g.Owned);return go.transform;}
        void Line(float x,float z,float x2,float z2,Material m)=>geometry.Line(new Vector3(x,0,z),new Vector3(x2,0,z2),.16f,m);
        public static TextMesh Text(string text,Vector3 p,float size,Quaternion q,Transform parent)
        {var go=new GameObject(text,typeof(TextMesh));go.transform.SetParent(parent,false);go.transform.localPosition=p;go.transform.localRotation=q;var t=go.GetComponent<TextMesh>();t.text=text;t.anchor=TextAnchor.MiddleCenter;t.alignment=TextAlignment.Center;t.fontSize=64;t.characterSize=size/10;t.color=new Color(.93f,.96f,.89f);return t;}
        void Clear(){if(field)Destroy(field);field=null;ball=null;board=null;firstDownMarker=scrimmageMarker=null;flags[0]=flags[1]=null;geometry?.Dispose();foreach(var m in materials)if(m)Destroy(m);materials.Clear();}
        void OnDestroy()=>Clear();
    }
}
