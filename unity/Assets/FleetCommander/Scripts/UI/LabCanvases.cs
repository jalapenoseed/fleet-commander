using System;
using System.Collections.Generic;
using FleetCommander.Labs;
using FleetCommander.Rendering;
using UnityEngine;
using UnityEngine.UIElements;
namespace FleetCommander.UI
{
    public sealed class PegCanvas : VisualElement
    {
        readonly LightBoard board;readonly Func<int> ink;readonly Action changed;bool painting;
        public PegCanvas(LightBoard board,Func<int> ink,Action changed)
        {
            this.board=board;this.ink=ink;this.changed=changed;style.flexGrow=1;style.minHeight=240;style.backgroundColor=new Color(.007f,.014f,.025f);generateVisualContent+=Draw;
            RegisterCallback<PointerDownEvent>(e=>{painting=true;this.CapturePointer(e.pointerId);Paint(e.localPosition,e.button==1);e.StopPropagation();});
            RegisterCallback<PointerMoveEvent>(e=>{if(painting){Paint(e.localPosition,(e.pressedButtons&2)!=0);e.StopPropagation();}});RegisterCallback<PointerUpEvent>(e=>{painting=false;this.ReleasePointer(e.pointerId);});RegisterCallback<PointerCaptureOutEvent>(e=>painting=false);
        }
        void Paint(Vector2 p,bool erase){int x=Mathf.FloorToInt(p.x/contentRect.width*32),y=Mathf.FloorToInt(p.y/contentRect.height*24);board.Set(x,y,erase?0:ink());MarkDirtyRepaint();changed?.Invoke();}
        void Draw(MeshGenerationContext ctx)
        {
            var p=ctx.painter2D;float w=contentRect.width/32,h=contentRect.height/24,r=Mathf.Min(w,h)*.31f;
            for(int y=0;y<24;y++)for(int x=0;x<32;x++){int color=board.pegs[y*32+x];var center=new Vector2((x+.5f)*w,(y+.5f)*h);if(color>0){p.fillColor=new Color(DroneRenderer.Palette[color-1].r,DroneRenderer.Palette[color-1].g,DroneRenderer.Palette[color-1].b,.17f);Circle(p,center,r*1.5f);}p.fillColor=color==0?new Color(.07f,.1f,.13f):DroneRenderer.Palette[color-1];Circle(p,center,r);}
        }
        static void Circle(Painter2D p,Vector2 center,float r){p.BeginPath();for(int i=0;i<16;i++){float a=i*Mathf.PI/8;var v=center+new Vector2(Mathf.Cos(a),Mathf.Sin(a))*r;if(i==0)p.MoveTo(v);else p.LineTo(v);}p.ClosePath();p.Fill();}
    }
    public sealed class CircuitCanvas : VisualElement
    {
        readonly LogicCircuit circuit;readonly Action<int> selected;readonly List<Button> boxes=new List<Button>();bool[] values;
        static Vector2 NodePosition(int i)=>new Vector2(24+i%3*238,30+i/3*112);
        public CircuitCanvas(LogicCircuit circuit,Action<int> selected)
        {
            this.circuit=circuit;this.selected=selected;style.width=740;style.height=Mathf.Max(320,((circuit.nodes.Count+2)/3)*112+40);generateVisualContent+=Draw;
            for(int i=0;i<circuit.nodes.Count;i++){int id=i;var b=new Button(()=>{if(circuit.nodes[id].kind==GateKind.Input){circuit.nodes[id].input=!circuit.nodes[id].input;Refresh();}else selected(id);});var pos=NodePosition(i);b.style.position=Position.Absolute;b.style.left=pos.x;b.style.top=pos.y;b.style.width=174;b.style.height=58;b.style.whiteSpace=WhiteSpace.Normal;Add(b);boxes.Add(b);}Refresh();
        }
        public void Refresh(){values=circuit.Evaluate();for(int i=0;i<boxes.Count;i++){var n=circuit.nodes[i];boxes[i].text=i+" · "+n.name+"\n"+n.kind+"  →  "+(values[i]?"1 / ON":"0 / OFF");boxes[i].style.borderBottomColor=values[i]?Color.cyan:Color.gray;boxes[i].style.borderBottomWidth=3;}MarkDirtyRepaint();}
        void Draw(MeshGenerationContext ctx){var p=ctx.painter2D;p.lineWidth=2;for(int i=0;i<circuit.nodes.Count;i++){var n=circuit.nodes[i];for(int socket=0;socket<LogicCircuit.Arity(n.kind);socket++){int from=socket==0?n.a:n.b;var a=NodePosition(from)+new Vector2(174,29);var b=NodePosition(i)+new Vector2(0,20+socket*19);p.strokeColor=values[from]?Color.cyan:new Color(.25f,.35f,.4f);p.BeginPath();p.MoveTo(a);float bend=a.x+18+socket*8;p.LineTo(new Vector2(bend,a.y));p.LineTo(new Vector2(bend,b.y-24));p.LineTo(new Vector2(b.x-14,b.y-24));p.LineTo(new Vector2(b.x-14,b.y));p.LineTo(b);p.Stroke();}}}
    }
    public sealed class ScienceCanvas : VisualElement
    {
        public Vector3[] Points=Array.Empty<Vector3>();
        public ScienceCanvas(){style.minHeight=160;style.height=200;style.flexShrink=0;generateVisualContent+=Draw;}
        void Draw(MeshGenerationContext ctx)
        {
            var p=ctx.painter2D;float w=contentRect.width,h=contentRect.height;p.fillColor=new Color(.015f,.04f,.055f);p.BeginPath();p.MoveTo(Vector2.zero);p.LineTo(new Vector2(w,0));p.LineTo(new Vector2(w,h));p.LineTo(new Vector2(0,h));p.ClosePath();p.Fill();if(Points.Length<2)return;
            float range=1;foreach(var v in Points)range=Mathf.Max(range,Mathf.Abs(v.x),Mathf.Abs(v.y));range*=1.1f;Func<Vector3,Vector2> map=v=>new Vector2(w*.5f+v.x/range*w*.45f,h*.5f-v.y/range*h*.45f);
            p.lineWidth=1;p.strokeColor=new Color(.2f,.35f,.42f);p.BeginPath();p.MoveTo(new Vector2(0,h/2));p.LineTo(new Vector2(w,h/2));p.MoveTo(new Vector2(w/2,0));p.LineTo(new Vector2(w/2,h));p.Stroke();p.lineWidth=1.8f;p.strokeColor=Color.cyan;p.BeginPath();p.MoveTo(map(Points[0]));for(int i=1;i<Points.Length;i++)p.LineTo(map(Points[i]));p.Stroke();
        }
    }
}
