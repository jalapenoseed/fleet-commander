using FleetCommander.Cameras;
using FleetCommander.Core;
using FleetCommander.UI;
using UnityEngine;

namespace FleetCommander.Systems
{
    // Poll controls before the fixed simulation consumes them. Mouse capture is always an explicit viewport click.
    [DefaultExecutionOrder(-20)]
    public sealed class DronePilot : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public DroneCameraRig Rig;
        public CommanderUI UI;
        public float MouseSensitivity=2;
        public int DroneIndex {get;private set;}=-1;
        public bool InputCaptured {get;private set;}
        public bool IsPiloting => world!=null && Simulator!=null && Simulator.Arena==world &&
            !Simulator.Replay.Playing && !(Simulator.Sports?.Finished??false) && !(Simulator.Range?.Finished??false) && !world.RoundEnded && DroneIndex>=0 && DroneIndex<world.Count &&
            !world.States[DroneIndex].disabled && world.States[DroneIndex].phase==FlightPhase.Flying &&
            world.ControlledDrone==DroneIndex;
        public Quaternion AimRotation => Quaternion.Euler(pitch,yaw,0);
        public Vector3 AimDirection => AimRotation*Vector3.forward;
        public string Status => !IsPiloting ? "Spectating · Join Blue / Red to fly" : InputCaptured ?
            "PILOT · WASD move · Space / Ctrl altitude · Shift boost · Mouse aim / fire · Q pulse · C view · Esc cursor" :
            "PILOT · Click the open viewport to fly · Escape releases cursor · Leave Pilot returns to AI";

        FleetWorld world;
        CameraMode previousMode;
        float yaw,pitch;
        int joinedFrame;
        static bool GameInputFocused
        {
            get
            {
#if UNITY_EDITOR
                var focused=UnityEditor.EditorWindow.focusedWindow;
                if(focused==null||focused.GetType().Name!="GameView")return false;
#endif
                return Application.isFocused;
            }
        }

        public bool JoinBlue()=>JoinTeam(0);
        public bool JoinRed()=>JoinTeam(1);
        public bool JoinSelected()=>Simulator!=null && Join(Simulator.Selected);
        public bool JoinTeam(int team)
        {
            if(!ReadyToJoin())return false;
            int selected=Simulator.Selected;
            if(selected>=0 && selected<Simulator.Arena.Count && Simulator.Arena.States[selected].fleetId==team && Available(selected))return Join(selected);
            for(int i=0;i<Simulator.Arena.Count;i++)if(Simulator.Arena.States[i].fleetId==team && Available(i))return Join(i);
            Simulator.Notice="No airborne drone remains on that team. Start a rematch to rejoin.";return false;
        }
        bool ReadyToJoin()
        {
            if(Simulator==null)return false;
            if(Simulator.Replay.Playing){Simulator.Notice="Return to live flight before joining.";return false;}
            if(Simulator.Arena==null){Simulator.Notice="Start an arena round, then choose a team to join.";return false;}
            if(Simulator.Arena.RoundEnded){Simulator.Notice="The round is over. Rematch to join a fresh fight.";return false;}
            return true;
        }
        bool Available(int index)
        {
            var state=Simulator.Arena.States[index];return !state.disabled && state.phase==FlightPhase.Flying;
        }
        public bool Join(int index)
        {
            if(!ReadyToJoin())return false;
            if(index<0||index>=Simulator.Arena.Count||!Available(index))
            {Simulator.Notice="Choose a living, flying arena drone.";return false;}
            bool wasJoined=world!=null;
            if(world!=null && world!=Simulator.Arena)world.ClearControl();
            if(!Simulator.Arena.SetControlledDrone(index))return false;
            if(!wasJoined && Rig!=null)previousMode=Rig.Mode;
            ReleaseCursor();world=Simulator.Arena;DroneIndex=index;Simulator.Selected=index;Simulator.Paused=false;
            if(Rig!=null)Rig.Mode=CameraMode.Shoulder;
            var state=world.States[index];Vector3 direction=state.rotation*Vector3.forward;float nearest=float.MaxValue;
            foreach(var target in world.States)if(target.fleetId!=state.fleetId && !target.disabled && target.airborne)
            {float d=(target.position-state.position).sqrMagnitude;if(d<nearest){nearest=d;direction=target.position-state.position;}}
            direction=direction.sqrMagnitude>.0001f?direction.normalized:Vector3.forward;
            yaw=Mathf.Atan2(direction.x,direction.z)*Mathf.Rad2Deg;
            pitch=Mathf.Clamp(-Mathf.Asin(Mathf.Clamp(direction.y,-1,1))*Mathf.Rad2Deg,-80,80);
            world.SetPilotInput(Vector3.zero,AimDirection,false);joinedFrame=Time.frameCount;
            if(UI!=null && UI.Document!=null)UI.Root.panel?.focusController?.focusedElement?.Blur();
            Simulator.Notice="Joined "+(state.fleetId==0?"Blue":"Red")+" drone "+(index+1)+". Click the open viewport to take control; Escape releases the cursor.";
            return true;
        }
        public void LeavePilot()
        {
            bool wasJoined=world!=null;
            ClearJoin();if(Rig!=null && wasJoined)Rig.Mode=previousMode;
            if(wasJoined && Simulator!=null)Simulator.Notice="Pilot control ended. AI has resumed flying the drone.";
        }
        void ClearJoin()
        {
            ReleaseCursor();world?.ClearControl();world=null;DroneIndex=-1;
        }
        public void CycleView()
        {
            if(!IsPiloting||Rig==null)return;
            Rig.Mode=Rig.Mode==CameraMode.Shoulder?CameraMode.FPV:Rig.Mode==CameraMode.FPV?CameraMode.Mounted:CameraMode.Shoulder;
        }
        public void ReleaseCursor()
        {
            if(InputCaptured){Cursor.lockState=CursorLockMode.None;Cursor.visible=true;}
            InputCaptured=false;world?.SetPilotInput(Vector3.zero,AimDirection,false);
        }
        void Update()
        {
            if(world==null)return;
            if(!IsPiloting)
            {
                bool ended=world.RoundEnded;
                bool dead=DroneIndex>=0 && DroneIndex<world.Count && world.States[DroneIndex].disabled;
                bool recalled=DroneIndex>=0 && DroneIndex<world.Count && world.States[DroneIndex].phase==FlightPhase.Returning;
                bool replay=Simulator!=null && Simulator.Replay.Playing;
                ClearJoin();
                if(Rig!=null)Rig.Mode=dead?CameraMode.Survivor:previousMode;
                if(Simulator!=null && !ended && !replay)
                    Simulator.Notice=dead?"Your drone was destroyed. Spectating survivors; join another living drone or rematch.":
                        recalled?"Low battery: your drone is returning to its pad. Choose another drone to rejoin.":"Pilot control ended.";
                return;
            }
            Simulator.Selected=DroneIndex;
            if(RuntimeSmoke.Running||!GameInputFocused||Simulator.Paused||UI!=null&&UI.Typing)
            {ReleaseCursor();return;}
            if(Input.GetKeyDown(KeyCode.Escape)){ReleaseCursor();Simulator.Notice="Cursor released. Click the open viewport to resume flying, or Leave Pilot in Arena.";return;}
            if(InputCaptured && Cursor.lockState!=CursorLockMode.Locked){ReleaseCursor();return;}
            if(!InputCaptured)
            {
                world.SetPilotInput(Vector3.zero,AimDirection,false);
                if(Time.frameCount>joinedFrame && Input.GetMouseButtonDown(0) && (UI==null||!UI.PointerBlocked))
                {
                    Cursor.lockState=CursorLockMode.Locked;Cursor.visible=false;InputCaptured=true;
                    Simulator.Notice="Flying drone "+(DroneIndex+1)+" · Escape releases cursor.";
                }
                return;
            }
            yaw+=Input.GetAxisRaw("Mouse X")*MouseSensitivity;
            pitch=Mathf.Clamp(pitch-Input.GetAxisRaw("Mouse Y")*MouseSensitivity,-80,80);
            Vector3 move=Vector3.zero;
            if(Input.GetKey(KeyCode.W)||Input.GetKey(KeyCode.UpArrow))move.z++;
            if(Input.GetKey(KeyCode.S)||Input.GetKey(KeyCode.DownArrow))move.z--;
            if(Input.GetKey(KeyCode.D)||Input.GetKey(KeyCode.RightArrow))move.x++;
            if(Input.GetKey(KeyCode.A)||Input.GetKey(KeyCode.LeftArrow))move.x--;
            if(Input.GetKey(KeyCode.Space))move.y++;
            if(Input.GetKey(KeyCode.LeftControl)||Input.GetKey(KeyCode.RightControl))move.y--;
            move=Quaternion.Euler(0,yaw,0)*Vector3.ClampMagnitude(move,1);
            if(!Input.GetKey(KeyCode.LeftShift)&&!Input.GetKey(KeyCode.RightShift))move*=.65f;
            world.SetPilotInput(move,AimDirection,Simulator.Sports==null&&Simulator.Range==null&&Input.GetMouseButton(0));
            if(Simulator.Range!=null&&Input.GetMouseButton(0))Simulator.Range.Fire(world.States[DroneIndex].position,AimDirection);
            if(Simulator.Sports!=null&&Input.GetMouseButton(0))Simulator.Sports.Act(DroneIndex,true);
            if(Simulator.Sports==null&&Simulator.Range==null){if(Input.GetKeyDown(KeyCode.R))world.Reload(DroneIndex);if(Input.GetMouseButtonDown(1))world.UseAbility(DroneIndex,DroneAbility.Guard,AimDirection);if(Input.GetKeyDown(KeyCode.E))world.UseAbility(DroneIndex,DroneAbility.Dodge,AimRotation*Vector3.right);if(Input.GetKeyDown(KeyCode.LeftShift))world.UseAbility(DroneIndex,DroneAbility.Boost,AimDirection);}
            if(Input.GetKeyDown(KeyCode.Q))Simulator.Payload();
            if(Input.GetKeyDown(KeyCode.C))CycleView();
        }
        public bool CameraPose(out Vector3 position,out Quaternion rotation)
        {
            position=Vector3.zero;rotation=Quaternion.identity;if(!IsPiloting)return false;
            var state=world.States[DroneIndex];rotation=AimRotation;
            Vector3 offset=Rig!=null && Rig.Mode==CameraMode.FPV?new Vector3(0,.15f,.65f):
                Rig!=null && Rig.Mode==CameraMode.Mounted?new Vector3(0,.85f,-1.05f):new Vector3(1.7f,1.4f,-4.8f);
            position=state.position+rotation*offset;position.y=Mathf.Max(.8f,position.y);
            Vector3 toCamera=position-state.position;float distance=toCamera.magnitude;
            if(distance>.01f&&world.Config.obstacles)foreach(var envelope in FleetWorld.Obstacles)
            {
                var box=envelope;box.Expand(.4f);
                if(box.IntersectRay(new Ray(state.position,toCamera/distance),out float hit) && hit<distance)
                {distance=Mathf.Max(.1f,hit-.2f);position=state.position+toCamera.normalized*distance;}
            }
            // Converge the shoulder / mounted view with the firing direction at a 60-meter aim point.
            Vector3 aimPoint=state.position+AimDirection*60;
            rotation=Quaternion.LookRotation(aimPoint-position);
            return true;
        }
        void OnApplicationFocus(bool focused){if(!focused)ReleaseCursor();}
        void OnApplicationPause(bool paused){if(paused)ReleaseCursor();}
        void OnDisable(){ClearJoin();}
    }
}
