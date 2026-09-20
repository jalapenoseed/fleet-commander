using FleetCommander.Core;
using FleetCommander.UI;
using UnityEngine;
namespace FleetCommander.Systems
{
    public sealed class DroneSelection:MonoBehaviour
    {
        public SwarmSimulator Simulator;public CommanderUI UI;public DronePilot Pilot;Vector3 down;bool pressed;Texture2D pixel;
        public static int Pick(Camera camera,DroneState[] states,Vector2 point)
        {
            if(!camera)return -1;int found=-1;float closest=float.MaxValue;
            for(int i=0;i<states.Length;i++){var p=camera.WorldToScreenPoint(states[i].position);if(p.z<camera.nearClipPlane||p.z>camera.farClipPlane)continue;float pixels=Mathf.Clamp(camera.pixelHeight*(states[i].frame==FrameKind.Cargo?1.5f:1f)/(2*Mathf.Tan(camera.fieldOfView*Mathf.Deg2Rad*.5f)*p.z),9,80);float d=Vector2.Distance(point,new Vector2(p.x,p.y));if(d<=pixels&&p.z<closest){found=i;closest=p.z;}}
            return found;
        }
        public bool SelectAt(Vector2 point){if(Simulator.Chess!=null||Pilot&&Pilot.IsPiloting)return false;var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;int i=Pick(Camera.main,states,point);if(i<0)return false;Simulator.Selected=i;Simulator.Notice="Selected drone #"+(i+1)+" · F focuses camera · Arena → Pilot selected / Manual tracking";if(UI.Page=="Arena")UI.OpenPage("Arena");return true;}
        void Update()
        {
            if(RuntimeSmoke.Running||!Simulator||Simulator.Chess!=null||Pilot&&Pilot.IsPiloting)return;
            if(Input.GetMouseButtonDown(0)){pressed=!UI.PointerBlocked&&!UI.Typing;down=Input.mousePosition;}
            if(Input.GetMouseButtonUp(0)){if(pressed&&!UI.PointerBlocked&&(Input.mousePosition-down).sqrMagnitude<36)SelectAt(Input.mousePosition);pressed=false;}
        }
        void OnGUI()
        {
            if(!Simulator||!UI||UI.WorkspaceOpen||UI.MenusHidden||Simulator.Chess!=null||UI.ResultOpen)return;var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;int i=Simulator.Selected;if(i<0||i>=states.Length||!Camera.main||Pilot&&Pilot.IsPiloting)return;
            var p=Camera.main.WorldToScreenPoint(states[i].position);if(p.z<=0)return;float size=Mathf.Clamp(Screen.height*2/(Mathf.Tan(Camera.main.fieldOfView*Mathf.Deg2Rad*.5f)*p.z),28,160),x=p.x-size/2,y=Screen.height-p.y-size/2;
            if(!pixel){pixel=new Texture2D(1,1);pixel.SetPixel(0,0,Color.white);pixel.Apply();}GUI.color=new Color(.3f,1,.75f,.95f);
            float k=Mathf.Min(14,size*.3f);foreach(float dx in new[]{0f,size-k}){GUI.DrawTexture(new Rect(x+dx,y,k,2),pixel);GUI.DrawTexture(new Rect(x+dx,y+size,k,2),pixel);}foreach(float dy in new[]{0f,size-k}){GUI.DrawTexture(new Rect(x,y+dy,2,k),pixel);GUI.DrawTexture(new Rect(x+size,y+dy,2,k),pixel);}GUI.color=Color.white;
        }
        void OnDestroy(){if(pixel)Destroy(pixel);}
    }
}
