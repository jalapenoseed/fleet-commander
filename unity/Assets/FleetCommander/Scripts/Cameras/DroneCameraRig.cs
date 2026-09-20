using FleetCommander.Core;
using FleetCommander.Systems;
using FleetCommander.UI;
using UnityEngine;
namespace FleetCommander.Cameras
{
    public enum CameraMode { Orbit, Top, Front, Follow, FPV, Shoulder, Mounted, Ground, Free, Cinematic, Action, BestFight, Survivor }
    public sealed class DroneCameraRig : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public CommanderUI UI;
        public DronePilot Pilot;
        public CameraMode Mode;
        public float Distance=160,Yaw=25,Pitch=24;
        public Vector3 Focus=new Vector3(0,30,0);
        Vector3 previousMouse;bool initialized,dragging;
        public bool TrackFleet=true;
        public void SetMode(CameraMode mode){if(mode==CameraMode.Free||mode==CameraMode.Ground){var angles=transform.eulerAngles;Yaw=angles.y;Pitch=angles.x>180?angles.x-360:angles.x;}Mode=mode;}
        public void ResetView(){if(Pilot!=null)Pilot.LeavePilot();TrackFleet=true;Mode=CameraMode.Orbit;Yaw=25;Pitch=24;Distance=160;Focus=new Vector3(0,30,0);initialized=false;previousMouse=Input.mousePosition;}
        public void SetDrone(int index){if(Simulator)Simulator.Selected=Mathf.Clamp(index,0,Mathf.Max(0,Simulator.Active.Count-1));}
        public void Fit()
        {
            if(!Simulator)return;var states=Simulator.Active.States;
            var bounds=new Bounds(states.Length>0?states[0].position:new Vector3(0,25,0),Vector3.one*12);
            foreach(var state in states)bounds.Encapsulate(state.position);
            Focus=bounds.center;Distance=Mathf.Clamp(bounds.extents.magnitude*3.3f,80,850);
            if(Simulator.Sports!=null){Focus=new Vector3(0,2,0);Distance=145;}
            Yaw=0;Pitch=Simulator.Sports!=null?58:32;TrackFleet=true;Mode=CameraMode.Orbit;initialized=false;dragging=false;
        }
        void LateUpdate()
        {
            if(!Simulator)return;
            if(Pilot!=null && Pilot.CameraPose(out var pilotPosition,out var pilotRotation))
            {transform.SetPositionAndRotation(pilotPosition,pilotRotation);previousMouse=Input.mousePosition;initialized=true;return;}
            Vector3 mouse=Input.mousePosition,delta=mouse-previousMouse;previousMouse=mouse;
            bool blocked=RuntimeSmoke.Running||UI!=null&&(UI.PointerBlocked||UI.Typing);
            if(!blocked)
            {
                if(Input.GetMouseButtonDown(0)||Input.GetMouseButtonDown(1)||Input.GetMouseButtonDown(2))dragging=true;
                if(dragging&&(Input.GetMouseButton(0)||Input.GetMouseButton(1)||Input.GetMouseButton(2)))
                {
                    if(Input.GetMouseButton(2)||Input.GetKey(KeyCode.LeftShift))
                    {TrackFleet=false;var right=Quaternion.Euler(0,Yaw,0)*Vector3.right;var forward=Quaternion.Euler(0,Yaw,0)*Vector3.forward;Focus+=(-right*delta.x-forward*delta.y)*Distance*.0015f;}
                    else {Yaw+=delta.x*.18f;Pitch=Mathf.Clamp(Pitch-delta.y*.18f,-75,88);}
                }
                Distance=Mathf.Clamp(Distance*Mathf.Exp(-Input.mouseScrollDelta.y*.1f),2,1200);
                if(Input.touchCount==2){var a=Input.GetTouch(0);var b=Input.GetTouch(1);float now=(a.position-b.position).magnitude,old=(a.position-a.deltaPosition-b.position+b.deltaPosition).magnitude;Distance=Mathf.Clamp(Distance*Mathf.Exp((old-now)*.003f),2,1200);}
            }
            if(!Input.GetMouseButton(0)&&!Input.GetMouseButton(1)&&!Input.GetMouseButton(2))dragging=false;
            var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;
            int selected=Mathf.Clamp(Simulator.Selected,0,Mathf.Max(0,states.Length-1));
            Vector3 center=Vector3.zero;int sample=0;
            for(int i=0;i<states.Length;i+=Mathf.Max(1,states.Length/64))if(!states[i].disabled){center+=states[i].position;sample++;}
            center=sample==0?new Vector3(0,25,0):center/sample;if(TrackFleet)Focus=Simulator.Sports!=null?new Vector3(0,2,0):Vector3.Lerp(Focus,center,1-Mathf.Exp(-Time.unscaledDeltaTime*2));
            var s=states.Length>0?states[selected]:DroneState.Create(0,0,new Vector3(0,25,0));
            CameraMode effective=Mode;
            if(Mode==CameraMode.Cinematic)effective=new[]{CameraMode.Orbit,CameraMode.Follow,CameraMode.Top,CameraMode.Shoulder}[(int)(Time.unscaledTime/7)%4];
            if(Mode==CameraMode.Action||Mode==CameraMode.BestFight)
            {
                float best=float.MaxValue;
                for(int i=0;i<states.Length;i+=Mathf.Max(1,states.Length/128))if(!states[i].disabled&&states[i].airborne)
                    for(int j=i+1;j<states.Length;j+=Mathf.Max(1,states.Length/128))if(states[j].fleetId!=states[i].fleetId&&!states[j].disabled)
                    {float d=(states[i].position-states[j].position).sqrMagnitude;if(d<best){best=d;s=states[i];selected=i;}}
                effective=CameraMode.Shoulder;
            }
            if(Mode==CameraMode.Survivor){float best=-1;for(int i=0;i<states.Length;i++)if(!states[i].disabled&&states[i].health>best){best=states[i].health;s=states[i];selected=i;}effective=CameraMode.Follow;}
            if(Mode==CameraMode.Action||Mode==CameraMode.BestFight||Mode==CameraMode.Survivor)Simulator.Selected=selected;
            Vector3 p,look;Quaternion orientation=Quaternion.Euler(Pitch,Yaw,0);bool mounted=false;
            switch(effective)
            {
                case CameraMode.Top:p=Focus+Vector3.up*Distance;look=Focus+Vector3.forward*.01f;break;
                case CameraMode.Front:p=Focus+new Vector3(0,5,-Distance);look=Focus;break;
                case CameraMode.Follow:p=s.position+s.rotation*new Vector3(0,4,-10);look=s.position+s.velocity*.2f;break;
                case CameraMode.FPV:p=s.position+s.rotation*new Vector3(0,.08f,.55f);look=p+s.rotation*Vector3.forward*50;mounted=true;break;
                case CameraMode.Mounted:p=s.position+s.rotation*new Vector3(0,.7f,-.9f);look=p+s.rotation*new Vector3(0,-.1f,1)*50;mounted=true;break;
                case CameraMode.Shoulder:p=s.position+s.rotation*new Vector3(3,2.7f,-5);look=s.position+s.rotation*Vector3.forward*7;break;
                case CameraMode.Ground:case CameraMode.Free:
                    p=transform.position;if(!initialized)p=new Vector3(0,3,100);
                    if(!blocked){Vector3 movement=Vector3.zero;if(Input.GetKey(KeyCode.W)||Input.GetKey(KeyCode.UpArrow))movement.z++;if(Input.GetKey(KeyCode.S)||Input.GetKey(KeyCode.DownArrow))movement.z--;if(Input.GetKey(KeyCode.A)||Input.GetKey(KeyCode.LeftArrow))movement.x--;if(Input.GetKey(KeyCode.D)||Input.GetKey(KeyCode.RightArrow))movement.x++;if(Input.GetKey(KeyCode.E))movement.y++;if(Input.GetKey(KeyCode.Q))movement.y--;p+=orientation*movement*Time.unscaledDeltaTime*(Input.GetKey(KeyCode.LeftShift)?65:20);}
                    float terrain=SceneryTerrain.Height(Simulator.DisplayConfig,p.x,p.z);if(effective==CameraMode.Ground)p.y=terrain+1.8f;else p.y=Mathf.Max(terrain+.8f,p.y);look=p+orientation*Vector3.forward*50;break;
                default:float yaw=Mode==CameraMode.Cinematic?Yaw+Time.unscaledTime*3:Yaw;p=Focus+Quaternion.Euler(Pitch,yaw,0)*new Vector3(0,0,-Distance);look=Focus;break;
            }
            if(effective==CameraMode.Orbit||effective==CameraMode.Top||effective==CameraMode.Front)
            {var right=Quaternion.LookRotation(look-p)*Vector3.right;Vector3 offset=UI!=null&&!UI.MenusHidden?-right*Distance*.13f:Vector3.zero;p+=offset;look+=offset;}
            if(effective!=CameraMode.Ground)p.y=Mathf.Max(.8f,p.y);
            float blend=mounted||!initialized?1:1-Mathf.Exp(-Time.unscaledDeltaTime*7);
            transform.position=Vector3.Lerp(transform.position,p,blend);
            if((look-transform.position).sqrMagnitude>.001f)transform.rotation=Quaternion.Slerp(transform.rotation,Quaternion.LookRotation(look-transform.position),blend);
            initialized=true;
        }
    }
}
