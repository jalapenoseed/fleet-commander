using FleetCommander.Core;
using FleetCommander.Systems;
using FleetCommander.UI;
using UnityEngine;
namespace FleetCommander.Cameras
{
    public enum CameraMode { Orbit, Top, Front, Follow, FPV, Shoulder, Mounted, Ground, Free, Cinematic, Action, BestFight, Survivor, Audience }
    public sealed class DroneCameraRig : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public CommanderUI UI;
        public DronePilot Pilot;
        public CameraMode Mode;
        public float Distance=160,Yaw=25,Pitch=24;
        public Vector3 Focus=new Vector3(0,30,0);
        Vector3 previousMouse;bool initialized;
        public bool AutoFocus=true;
        public float MoveSpeed=30;public float ShakeStrength=.3f;float impactShake;bool eventBound;
        public readonly BroadcastDirector Director=new BroadcastDirector();public int DirectorSubject=>(Mode==CameraMode.Cinematic||Mode==CameraMode.Action||Mode==CameraMode.BestFight)?Director.Subject:-1;
        void BattleImpact(BattleEvent e){Director.Event(e);if(e.impact&&(e.victim==Simulator.Selected||e.source==Simulator.Selected||e.source==DirectorSubject||e.victim==DirectorSubject))impactShake=Mathf.Max(impactShake,e.destruction?.8f:.3f);}
        void Shake(){impactShake=Mathf.Max(0,impactShake-Time.unscaledDeltaTime*2);if(impactShake>0&&ShakeStrength>0)transform.rotation*=Quaternion.Euler(Mathf.Sin(Time.unscaledTime*61)*impactShake*ShakeStrength,0,Mathf.Cos(Time.unscaledTime*47)*impactShake*ShakeStrength);}
        void OnDestroy(){if(Simulator&&eventBound)Simulator.OnBattleEvent-=BattleImpact;}
        public int AudienceRow=9,AudienceSide;
        public Vector3 AudiencePosition()
        {
            var c=Simulator.DisplayConfig;if(c.scenery==SceneryKind.Stadium){float a=(-90+AudienceSide*90)*Mathf.Deg2Rad;return new Vector3(Mathf.Cos(a)*(165+AudienceRow*2.3f),4.7f+AudienceRow*1.15f,Mathf.Sin(a)*(136+AudienceRow*2.3f));}
            Vector3 p=c.scenery==SceneryKind.Coast?new Vector3(-155,0,-70):c.scenery==SceneryKind.Creek?new Vector3(210,0,-80):new Vector3(0,0,-125);p.y=SceneryTerrain.Height(c,p.x,p.z)+1.75f;return p;
        }
        public void AudienceView(){Pilot?.LeavePilot();Mode=CameraMode.Audience;AutoFocus=false;Focus=new Vector3(0,Simulator.Sports!=null?4:Simulator.Config.height,0);Pitch=Yaw=0;transform.SetPositionAndRotation(AudiencePosition(),Quaternion.LookRotation(Focus-AudiencePosition()));initialized=true;previousMouse=Input.mousePosition;}
        public void Overview(bool sports=false){Pilot?.LeavePilot();Mode=CameraMode.Orbit;Focus=new Vector3(0,sports?2:22,0);Yaw=0;Pitch=sports?58:38;Distance=sports?125:205;AutoFocus=false;Snap();}
        public void Snap(){transform.position=Focus+Quaternion.Euler(Pitch,Yaw,0)*new Vector3(0,0,-Distance);transform.rotation=Quaternion.LookRotation(Focus-transform.position);initialized=true;previousMouse=Input.mousePosition;}
        public void Pan(float x,float z){AutoFocus=false;Focus+=Quaternion.Euler(0,Yaw,0)*new Vector3(x,0,z);}
        public void FocusSelected(){var states=Simulator.Active.States;if(states.Length==0)return;Pilot?.LeavePilot();Mode=CameraMode.Orbit;AutoFocus=false;Focus=states[Mathf.Clamp(Simulator.Selected,0,states.Length-1)].position;Distance=18;Pitch=22;Snap();}
        public void FreeCamera(){Pilot?.LeavePilot();Mode=CameraMode.Free;AutoFocus=false;var e=transform.eulerAngles;Yaw=e.y;Pitch=e.x>180?e.x-360:e.x;initialized=true;}
        public void ResetView(){if(Pilot!=null)Pilot.LeavePilot();Mode=CameraMode.Orbit;AutoFocus=true;Yaw=25;Pitch=24;Distance=160;Focus=new Vector3(0,30,0);initialized=false;previousMouse=Input.mousePosition;}
        public void SetDrone(int index){if(Simulator)Simulator.Selected=Mathf.Clamp(index,0,Mathf.Max(0,Simulator.Active.Count-1));}
        public void Fit(){if(Simulator.Arena!=null){Overview(Simulator.Sports!=null);return;}AutoFocus=true;Distance=Mathf.Clamp(Mathf.Sqrt(Mathf.Max(1,Simulator.Active.Count))*Simulator.Config.spacing*2.5f,80,650);Mode=CameraMode.Orbit;Pitch=32;Yaw=25;Focus=Vector3.zero;var states=Simulator.Active.States;foreach(var d in states)Focus+=d.position;Focus=states.Length>0?Focus/states.Length:new Vector3(0,25,0);Snap();}
        void LateUpdate()
        {
            if(!Simulator)return;if(!eventBound){Simulator.OnBattleEvent+=BattleImpact;eventBound=true;}
            if(Simulator.Chess!=null){float side=UI!=null&&UI.ChessFlipped?-1:1;transform.SetPositionAndRotation(new Vector3(0,17,-10*side),Quaternion.LookRotation(new Vector3(0,-17,10*side)));previousMouse=Input.mousePosition;return;}
            if(Pilot!=null && Pilot.CameraPose(out var pilotPosition,out var pilotRotation))
            {transform.SetPositionAndRotation(pilotPosition,pilotRotation);Shake();previousMouse=Input.mousePosition;initialized=true;return;}
            Vector3 mouse=Input.mousePosition,delta=mouse-previousMouse;previousMouse=mouse;
            bool blocked=RuntimeSmoke.Running||UI!=null&&(UI.PointerBlocked||UI.Typing);
            if(!blocked)
            {
                if((Mode==CameraMode.Cinematic||Mode==CameraMode.Action||Mode==CameraMode.BestFight)&&((Input.GetMouseButton(0)||Input.GetMouseButton(1))&&delta.sqrMagnitude>9||Input.mouseScrollDelta.y!=0)){Mode=CameraMode.Orbit;AutoFocus=false;Distance=60;Focus=transform.position+transform.forward*Distance;Yaw=transform.eulerAngles.y;Pitch=transform.eulerAngles.x;}
                if((Input.GetMouseButton(0)||Input.GetMouseButton(1))&&!(Input.GetKey(KeyCode.LeftShift)&&Mode!=CameraMode.Free)){Yaw+=delta.x*.18f;Pitch=Mathf.Clamp(Pitch-delta.y*.18f,-75,88);}
                Distance=Mathf.Clamp(Distance*Mathf.Exp(-Input.mouseScrollDelta.y*.1f),2,1200);
                if(Mode==CameraMode.Orbit||Mode==CameraMode.Top||Mode==CameraMode.Front){if(Input.GetMouseButton(2)||Input.GetMouseButton(1)&&Input.GetKey(KeyCode.LeftShift))Pan(-delta.x*Distance*.0015f,-delta.y*Distance*.0015f);float x=(Input.GetKey(KeyCode.D)||Input.GetKey(KeyCode.RightArrow)?1:0)-(Input.GetKey(KeyCode.A)||Input.GetKey(KeyCode.LeftArrow)?1:0);float z=(Input.GetKey(KeyCode.W)||Input.GetKey(KeyCode.UpArrow)?1:0)-(Input.GetKey(KeyCode.S)||Input.GetKey(KeyCode.DownArrow)?1:0);if(x!=0||z!=0)Pan(x*MoveSpeed*Time.unscaledDeltaTime,z*MoveSpeed*Time.unscaledDeltaTime);}
                if(Input.GetKeyDown(KeyCode.Home))Overview(Simulator.Sports!=null);if(Input.GetKeyDown(KeyCode.F))FocusSelected();
                if(Input.touchCount==2){var a=Input.GetTouch(0);var b=Input.GetTouch(1);float now=(a.position-b.position).magnitude,old=(a.position-a.deltaPosition-b.position+b.deltaPosition).magnitude;Distance=Mathf.Clamp(Distance*Mathf.Exp((old-now)*.003f),2,1200);}
            }
            var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;
            int selected=Mathf.Clamp(Simulator.Selected,0,Mathf.Max(0,states.Length-1));
            Vector3 center=Vector3.zero;int sample=0;
            for(int i=0;i<states.Length;i+=Mathf.Max(1,states.Length/64))if(!states[i].disabled){center+=states[i].position;sample++;}
            center=sample==0?new Vector3(0,25,0):center/sample;if(AutoFocus)Focus=Vector3.Lerp(Focus,center,1-Mathf.Exp(-Time.unscaledDeltaTime*2));
            var s=states.Length>0?states[selected]:DroneState.Create(0,0,new Vector3(0,25,0));
            CameraMode effective=Mode;
            if(Mode==CameraMode.Cinematic||Mode==CameraMode.Action||Mode==CameraMode.BestFight)
            {Director.Pose(Simulator,GetComponent<Camera>(),Time.unscaledDeltaTime,out var shotPosition,out var shotLook);float smooth=initialized?1-Mathf.Exp(-Time.unscaledDeltaTime*3):1;transform.position=Vector3.Lerp(transform.position,shotPosition,smooth);if((shotLook-transform.position).sqrMagnitude>.01f)transform.rotation=Quaternion.Slerp(transform.rotation,Quaternion.LookRotation(shotLook-transform.position),smooth);initialized=true;Shake();return;}
            if(Mode==CameraMode.Survivor){float best=-1;for(int i=0;i<states.Length;i++)if(!states[i].disabled&&states[i].health>best){best=states[i].health;s=states[i];selected=i;}effective=CameraMode.Follow;}
            if(Mode==CameraMode.Action||Mode==CameraMode.BestFight||Mode==CameraMode.Survivor)Simulator.Selected=selected;
            Vector3 p,look;Quaternion orientation=Quaternion.Euler(Pitch,Yaw,0);bool mounted=false;
            switch(effective)
            {
                case CameraMode.Audience:p=AudiencePosition();look=p+Quaternion.LookRotation(Focus-p)*orientation*Vector3.forward*100;break;
                case CameraMode.Top:p=Focus+Vector3.up*Distance;look=Focus+Vector3.forward*.01f;break;
                case CameraMode.Front:p=Focus+new Vector3(0,5,-Distance);look=Focus;break;
                case CameraMode.Follow:p=s.position+s.rotation*new Vector3(0,4,-10);look=s.position+s.velocity*.2f;break;
                case CameraMode.FPV:p=s.position+s.rotation*new Vector3(0,.08f,.55f);look=p+s.rotation*Vector3.forward*50;mounted=true;break;
                case CameraMode.Mounted:p=s.position+s.rotation*new Vector3(0,.7f,-.9f);look=p+s.rotation*new Vector3(0,-.1f,1)*50;mounted=true;break;
                case CameraMode.Shoulder:p=s.position+s.rotation*new Vector3(3,2.7f,-5);look=s.position+s.rotation*Vector3.forward*7;break;
                case CameraMode.Ground:case CameraMode.Free:
                    p=transform.position;if(!initialized)p=new Vector3(0,3,100);
                    if(!blocked){Vector3 movement=Vector3.zero;if(Input.GetKey(KeyCode.W)||Input.GetKey(KeyCode.UpArrow))movement.z++;if(Input.GetKey(KeyCode.S)||Input.GetKey(KeyCode.DownArrow))movement.z--;if(Input.GetKey(KeyCode.A)||Input.GetKey(KeyCode.LeftArrow))movement.x--;if(Input.GetKey(KeyCode.D)||Input.GetKey(KeyCode.RightArrow))movement.x++;if(Input.GetKey(KeyCode.E))movement.y++;if(Input.GetKey(KeyCode.Q))movement.y--;p+=orientation*movement*Time.unscaledDeltaTime*(Input.GetKey(KeyCode.LeftShift)?MoveSpeed*2.5f:MoveSpeed);}
                    if(effective==CameraMode.Ground)p.y=SceneryTerrain.Height(Simulator.DisplayConfig,p.x,p.z)+1.8f;else p.y=Mathf.Max(SceneryTerrain.Height(Simulator.DisplayConfig,p.x,p.z)+.8f,p.y);look=p+orientation*Vector3.forward*50;break;
                default:float yaw=Mode==CameraMode.Cinematic?Yaw+Time.unscaledTime*3:Yaw;p=Focus+Quaternion.Euler(Pitch,yaw,0)*new Vector3(0,0,-Distance);look=Focus;break;
            }
            if(effective!=CameraMode.Ground)p.y=Mathf.Max(.8f,p.y);
            float blend=mounted||!initialized?1:1-Mathf.Exp(-Time.unscaledDeltaTime*7);
            transform.position=Vector3.Lerp(transform.position,p,blend);
            if((look-transform.position).sqrMagnitude>.001f)transform.rotation=Quaternion.Slerp(transform.rotation,Quaternion.LookRotation(look-transform.position),blend);
            initialized=true;Shake();
        }
    }
}
