using System.Collections.Generic;
using FleetCommander.Core;
using FleetCommander.Games;
using FleetCommander.Systems;
using FleetCommander.UI;
using UnityEngine;
namespace FleetCommander.Rendering
{
    public sealed class ChessBoardRenderer : MonoBehaviour
    {
        public SwarmSimulator Simulator;public CommanderUI UI;
        public int PieceCount {get;private set;}
        GameObject board;SceneGeometry geometry;string previous="";readonly List<Material> materials=new List<Material>();
        Material Mat(string name,Color c){var m=new Material(Resources.Load<Shader>("FleetScenery")){name=name};m.SetColor("_Color",c);m.SetFloat("_Noise",.06f);materials.Add(m);return m;}
        public static Vector3 Position(int i)=>new Vector3((i%8-3.5f)*1.5f,.15f,(i/8-3.5f)*1.5f);
        void Update()
        {
            var game=Simulator.Chess;if(game==null){if(board)Clear();previous="";return;}
            string key=game.GetHashCode()+"/"+game.Revision+"/"+UI.ChessSelected;
            if(key!=previous){previous=key;Build(game);}
            if(!RuntimeSmoke.Running&&!Simulator.Paused&&!UI.PointerBlocked&&Input.GetMouseButtonDown(0))
            {
                var ray=Camera.main.ScreenPointToRay(Input.mousePosition);var plane=new Plane(Vector3.up,new Vector3(0,.15f,0));
                if(plane.Raycast(ray,out float distance)){var p=ray.GetPoint(distance);int x=Mathf.FloorToInt(p.x/1.5f+4),y=Mathf.FloorToInt(p.z/1.5f+4);if(x>=0&&x<8&&y>=0&&y<8)UI.ChessSquare(y*8+x);}
            }
        }
        void Build(ChessGame game)
        {
            Clear();board=new GameObject("Chess table · 64 squares and 32 modeled pieces");board.transform.SetParent(transform);geometry=new SceneGeometry();PieceCount=0;
            var dark=Mat("Walnut squares",new Color(.19f,.105f,.06f));var light=Mat("Maple squares",new Color(.76f,.64f,.43f));var ivory=Mat("Ivory pieces",new Color(.91f,.86f,.71f));var ebony=Mat("Ebony pieces",new Color(.065f,.075f,.085f));var brass=Mat("Brass rim",new Color(.62f,.42f,.13f));var selected=Mat("Selected square",new Color(.19f,.57f,.63f));var legal=Mat("Legal destination",new Color(.35f,.65f,.27f));var last=Mat("Last move",new Color(.59f,.48f,.19f));var check=Mat("King in check",new Color(.75f,.15f,.12f));
            geometry.Box(new Vector3(0,-.75f,0),new Vector3(150,.2f,150),Mat("Chess studio floor",new Color(.05f,.07f,.08f)));
            geometry.Box(new Vector3(0,-.2f,0),new Vector3(13.4f,.6f,13.4f),ebony);geometry.Box(new Vector3(0,.105f,0),new Vector3(12.8f,.06f,12.8f),brass);
            var moves=game.LegalMoves();
            for(int i=0;i<64;i++)
            {
                var mat=(i%8+i/8)%2==0?dark:light;
                if(game.LastMove.HasValue&&(game.LastMove.Value.From==i||game.LastMove.Value.To==i))mat=last;
                if(i==UI.ChessSelected)mat=selected;
                if(game.Board[i]==game.Side*ChessGame.King&&game.InCheck)mat=check;
                Vector3 p=Position(i);geometry.Box(p,new Vector3(1.49f,.075f,1.49f),mat);
                if(UI.ChessSelected>=0&&moves.Exists(m=>m.From==UI.ChessSelected&&m.To==i))geometry.Cylinder(p+Vector3.up*.05f,.18f,.025f,legal);
                if(game.Board[i]!=0){Piece(i,game.Board[i],game.Board[i]>0?ivory:ebony,brass);PieceCount++;}
            }
            for(int i=0;i<8;i++){GameFieldRenderer.Text(((char)('a'+i)).ToString(),new Vector3((i-3.5f)*1.5f,.17f,-6.35f),.85f,Quaternion.Euler(90,0,0),board.transform);GameFieldRenderer.Text((i+1).ToString(),new Vector3(-6.35f,.17f,(i-3.5f)*1.5f),.85f,Quaternion.Euler(90,0,0),board.transform);}
            geometry.Build(board.transform,"Chess meshes");
        }
        void Piece(int square,int piece,Material body,Material trim)
        {
            int type=Mathf.Abs(piece);Vector3 p=Position(square)+Vector3.up*.055f;float h=type==1?1: type==6?1.9f:type==5?1.7f:1.45f;
            var profile=new[]{new Vector2(0,0),new Vector2(.49f,0),new Vector2(.5f,.08f),new Vector2(.43f,.16f),new Vector2(.4f,.25f),new Vector2(.31f,.32f),new Vector2(.19f,h*.55f),new Vector2(.27f,h*.65f),new Vector2(.29f,h*.72f),new Vector2(0,h*.73f)};
            var lathe=geometry.Lathe(ChessGame.PieceName(type)+" turned base",profile,36);geometry.Add(lathe,p,Vector3.one,body);geometry.Cylinder(p+Vector3.up*.12f,.455f,.045f,trim);
            if(type==ChessGame.Pawn)geometry.Ball(p+Vector3.up*.92f,Vector3.one*.48f,body);
            if(type==ChessGame.Rook){geometry.Cylinder(p+Vector3.up*1.22f,.37f,.25f,body);for(int j=0;j<6;j++){float a=j*Mathf.PI/3;geometry.Box(p+new Vector3(Mathf.Cos(a)*.28f,1.43f,Mathf.Sin(a)*.28f),new Vector3(.19f,.22f,.19f),body);}}
            if(type==ChessGame.Knight)
            {
                float dir=piece>0?1:-1;geometry.Ball(p+new Vector3(0,1.12f,-.06f*dir),new Vector3(.4f,.8f,.47f),body);geometry.Box(p+new Vector3(0,1.48f,.16f*dir),new Vector3(.38f,.4f,.7f),body,Quaternion.Euler(dir*-17,0,0));
                for(int side=-1;side<=1;side+=2){geometry.Box(p+new Vector3(side*.12f,1.8f,-.09f*dir),new Vector3(.1f,.25f,.12f),body);geometry.Ball(p+new Vector3(side*.197f,1.55f,.15f*dir),Vector3.one*.07f,trim);}
            }
            if(type==ChessGame.Bishop){geometry.Ball(p+Vector3.up*1.36f,new Vector3(.4f,.66f,.4f),body);geometry.Box(p+new Vector3(0,1.45f,-.197f),new Vector3(.055f,.35f,.025f),trim,Quaternion.Euler(0,0,-28));geometry.Ball(p+Vector3.up*1.7f,Vector3.one*.13f,body);}
            if(type==ChessGame.Queen){geometry.Cylinder(p+Vector3.up*1.34f,.33f,.15f,body);for(int j=0;j<7;j++){float a=j*Mathf.PI*2/7;geometry.Beam(p+new Vector3(Mathf.Cos(a)*.22f,1.33f,Mathf.Sin(a)*.22f),p+new Vector3(Mathf.Cos(a)*.38f,1.68f,Mathf.Sin(a)*.38f),.095f,body);geometry.Ball(p+new Vector3(Mathf.Cos(a)*.38f,1.68f,Mathf.Sin(a)*.38f),Vector3.one*.14f,trim);}geometry.Ball(p+Vector3.up*1.55f,Vector3.one*.25f,body);}
            if(type==ChessGame.King){geometry.Cylinder(p+Vector3.up*1.5f,.32f,.2f,body);geometry.Box(p+Vector3.up*1.92f,new Vector3(.13f,.65f,.16f),body);geometry.Box(p+Vector3.up*2.02f,new Vector3(.47f,.14f,.16f),body);}
        }
        void Clear(){if(board)Destroy(board);board=null;geometry?.Dispose();foreach(var m in materials)if(m)Destroy(m);materials.Clear();}
        void OnDestroy()=>Clear();
    }
}
