using System.Collections.Generic;
using FleetCommander.Core;
using FleetCommander.Labs;
using UnityEngine;
namespace FleetCommander.Rendering
{
    public sealed class LabRenderer : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public bool ShowTarget=true;
        Mesh lines;Material lineMaterial;GameObject boardObject;SceneGeometry boardMesh;readonly List<Material> boardMaterials=new List<Material>();
        readonly List<Vector3> points=new List<Vector3>();readonly List<Color> colors=new List<Color>();readonly List<int> indices=new List<int>();
        readonly Queue<Vector3> history=new Queue<Vector3>();FleetWorld lastWorld;int lastSelected=-1,boardRevision=-1;LightBoard lastBoard;float clock;
        void Start(){lines=new Mesh{name="Science vectors and target trajectory"};lineMaterial=new Material(Resources.Load<Shader>("FleetLines"));}
        void Segment(Vector3 a,Vector3 b,Color color){indices.Add(points.Count);indices.Add(points.Count+1);points.Add(a);points.Add(b);colors.Add(color);colors.Add(color);}
        void Arrow(Vector3 a,Vector3 b,Color color){Segment(a,b,color);var d=b-a;if(d.sqrMagnitude<.001f)return;var side=Vector3.Cross(d.normalized,Vector3.up);if(side.sqrMagnitude<.01f)side=Vector3.right;var back=-d.normalized*Mathf.Min(2,d.magnitude*.3f);Segment(b,b+back+side,color);Segment(b,b+back-side,color);}
        void LateUpdate()
        {
            if(!Simulator||!lines)return;var lab=Simulator.Science;var world=Simulator.Active;var c=Simulator.DisplayConfig;
            if(!lab.paused)lab.previewTime=Simulator.Replay.Playing?Simulator.Replay.Cursor:world.Time;
            if(lastWorld!=world||lastSelected!=Simulator.Selected){history.Clear();lastWorld=world;lastSelected=Simulator.Selected;}
            clock+=Time.unscaledDeltaTime;if(clock>=.08f){clock=0;points.Clear();colors.Clear();indices.Clear();
                Vector3 origin=c.origin+Vector3.up*c.height;
                if(lab.vectors&&Simulator.Chess==null){if(lab.axes){for(int k=-6;k<=6;k++){float q=k*10;Segment(origin+new Vector3(q,0,-60),origin+new Vector3(q,0,60),new Color(.2f,.5f,.6f,.3f));Segment(origin+new Vector3(-60,0,q),origin+new Vector3(60,0,q),new Color(.2f,.5f,.6f,.3f));}Arrow(origin,origin+Vector3.right*65,Color.red);Arrow(origin,origin+Vector3.up*65,Color.green);Arrow(origin,origin+Vector3.forward*65,Color.cyan);}
                    if(lab.view==ScienceView.InfluenceField){int i=0;for(int z=-5;z<=5;z++)for(int x=-5;x<=5;x++){var p=new Vector3(x*10,0,z*10);Arrow(origin+p,origin+p+ScienceLab.Field(c,p,i++,lab.previewTime),new Color(.3f,1,.8f,.8f));}}
                    else{var curve=lab.Curve();for(int i=1;i<curve.Length;i++)Segment(origin+curve[i-1],origin+curve[i],Color.Lerp(Color.cyan,Color.magenta,i/(float)curve.Length));int cursor=Mathf.FloorToInt(Mathf.Repeat(lab.previewTime,curve.Length*.03f)/.03f);var marker=origin+curve[Mathf.Clamp(cursor,0,curve.Length-1)];Arrow(marker+Vector3.up*4,marker,Color.yellow);}
                }
                if(world.Count>0&&Simulator.Chess==null){int i=Mathf.Clamp(Simulator.Selected,0,world.Count-1);var s=world.States[i];if(!Simulator.Paused&&!Simulator.Replay.Playing){history.Enqueue(s.position);while(history.Count>200)history.Dequeue();}if(lab.vectors&&lab.trace){bool first=true;Vector3 prev=default;foreach(var p in history){if(!first)Segment(prev,p,Color.yellow);prev=p;first=false;}}
                    var ui=GetComponent<UI.CommanderUI>();if(ShowTarget&&ui&&!ui.MenusHidden&&!Simulator.Replay.Playing){Vector3 target=s.target;if(i<world.TargetIds.Length&&world.TargetIds[i]>=0)target=world.AimPoints[i];if(Simulator.Sports!=null&&!Simulator.Sports.IsToy)target=Simulator.Sports.Ball;Arrow(s.position,target,new Color(1,.72f,.18f,.65f));}}
                lines.Clear();lines.SetVertices(points);lines.SetColors(colors);lines.SetIndices(indices.ToArray(),MeshTopology.Lines,0);lines.RecalculateBounds();
            }
            if(points.Count>0)Graphics.DrawMesh(lines,Matrix4x4.identity,lineMaterial,0);
            if(!Simulator.BoardInWorld){if(boardObject)boardObject.SetActive(false);return;}
            if(lastBoard!=Simulator.Board||boardRevision!=Simulator.Board.revision)BuildBoard();if(boardObject)boardObject.SetActive(Simulator.Chess==null);
        }
        void ClearBoard(){if(boardObject)Destroy(boardObject);boardMesh?.Dispose();foreach(var m in boardMaterials)Destroy(m);boardMaterials.Clear();}
        Material PegMaterial(Color c,float glow){var m=new Material(Resources.Load<Shader>("FleetScenery"));m.SetColor("_Color",c);m.SetFloat("_Glow",glow);m.SetFloat("_Noise",0);boardMaterials.Add(m);return m;}
        void BuildBoard()
        {
            ClearBoard();lastBoard=Simulator.Board;boardRevision=lastBoard.revision;boardObject=new GameObject("Night Brite illuminated board");boardObject.transform.SetParent(transform);boardMesh=new SceneGeometry();var black=PegMaterial(new Color(.006f,.01f,.015f),0);var off=PegMaterial(new Color(.05f,.07f,.08f),0);var lit=new Material[9];for(int i=0;i<9;i++)lit[i]=PegMaterial(DroneRenderer.Palette[i],1.8f);
            boardMesh.Box(new Vector3(0,43,60),new Vector3(45,35,1),black);
            for(int y=0;y<LightBoard.Height;y++)for(int x=0;x<LightBoard.Width;x++){int peg=lastBoard.pegs[y*32+x];boardMesh.Ball(new Vector3((x-15.5f)*1.3f,43+(11.5f-y)*1.3f,59.3f),new Vector3(.8f,.8f,.45f),peg==0?off:lit[peg-1]);}boardMesh.Build(boardObject.transform,"Peg board");
        }
        void OnDestroy(){if(lines)Destroy(lines);if(lineMaterial)Destroy(lineMaterial);ClearBoard();}
    }
}
