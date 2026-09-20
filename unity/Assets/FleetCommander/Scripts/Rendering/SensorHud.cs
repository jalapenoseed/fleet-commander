using FleetCommander.Cameras;
using FleetCommander.Core;
using FleetCommander.Systems;
using UnityEngine;

namespace FleetCommander.Rendering
{
    // FPV-only situational overlay. YOLO is simulated as noisy labeled detections until a real inference backend is connected.
    public sealed class SensorHud : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public DroneCameraRig Rig;
        public DronePilot Pilot;
        GUIStyle small,large;
        public SensorKind ActiveSensors {get;private set;}
        public int TrackedTarget {get;private set;}=-1;

        void LateUpdate()
        {
            ActiveSensors=SensorKind.None;TrackedTarget=-1;
            if(Simulator==null||Rig==null||Rig.Mode!=CameraMode.FPV||Simulator.Arena==null||Simulator.Replay.Playing)return;
            var world=Simulator.Arena;int observer=Pilot!=null&&Pilot.IsPiloting?Pilot.DroneIndex:Simulator.Selected;if(observer<0||observer>=world.Count||world.Battle?.lab?.enabled!=true)return;
            var self=world.States[observer];float best=float.MaxValue;
            for(int i=0;i<world.Count;i++)if(world.States[i].fleetId!=self.fleetId&&world.AdaptiveLab.TryGetObservation(observer,i,out var observed))
            {float d=(observed.position-self.position).sqrMagnitude;if(d<best){best=d;TrackedTarget=i;ActiveSensors=observed.sensors;}}
        }

        bool LowLight()
        {
            var c=Simulator.Config;
            return c.sky==SkyKind.Night||c.sky==SkyKind.Dusk||c.weather==WeatherKind.Storm;
        }

        void OnGUI()
        {
            if(Rig&&Rig.UI&&Rig.UI.MenusHidden)return;
            if(ActiveSensors==SensorKind.None||TrackedTarget<0||Simulator?.Arena==null||Rig?.Mode!=CameraMode.FPV)return;
            var cam=Camera.main;if(cam==null)return;
            var world=Simulator.Arena;
            int observer=Pilot!=null&&Pilot.IsPiloting?Pilot.DroneIndex:Simulator.Selected;
            if(observer<0||observer>=world.Count||TrackedTarget>=world.Count)return;
            var self=world.States[observer];var target=world.States[TrackedTarget];
            if(small==null)
            {
                small=new GUIStyle(GUI.skin.label){fontSize=12,fontStyle=FontStyle.Bold};
                small.normal.textColor=new Color(.75f,1f,.9f,.95f);
                large=new GUIStyle(small){fontSize=14};
            }

            GUI.color=new Color(0,.08f,.06f,.72f);
            float panelX=Screen.width-355,panelY=Screen.height-175;
            GUI.DrawTexture(new Rect(panelX,panelY,330,70),Texture2D.whiteTexture);
            GUI.color=Color.white;
            GUI.Label(new Rect(panelX+10,panelY+6,310,22),"SENSOR FUSION  "+SensorText(ActiveSensors),large);

            float distance=Vector3.Distance(self.position,target.position);
            string trackText="TARGET #"+target.id+"  "+distance.ToString("F1")+"m";
            if(world.AdaptiveLab.TryGetTrack(observer,TrackedTarget,out var track))
                trackText+="  ±"+track.Uncertainty.ToString("F1")+"m";
            GUI.Label(new Rect(panelX+10,panelY+34,310,20),trackText,small);

            if(!world.AdaptiveLab.TryGetTrack(observer,TrackedTarget,out var estimate))return;
            Vector3 screen=cam.WorldToScreenPoint(estimate.position);
            if(screen.z>0)
            {
                float x=screen.x,y=Screen.height-screen.y;
                float size=Mathf.Clamp(900f/Mathf.Max(10,distance),34,100);
                if((ActiveSensors&SensorKind.Yolo)!=0)
                {
                    GUI.color=new Color(.3f,1f,.65f,.9f);
                    DrawBox(new Rect(x-size*.5f,y-size*.5f,size,size),2);
                    float confidence=world.AdaptiveLab.TryGetTrack(observer,TrackedTarget,out track)?1f/(1f+track.Uncertainty*.18f):.25f;
                    GUI.Label(new Rect(x-size*.5f,y-size*.5f-22,180,20),"VISION SIM "+confidence.ToString("P0"),small);
                }
                Vector3 aim=world.AdaptiveLab.AimPoint(self,target,world.Time);
                Vector3 lead=cam.WorldToScreenPoint(aim);
                if(lead.z>0)
                {
                    float lx=lead.x,ly=Screen.height-lead.y;
                    GUI.color=new Color(1f,.9f,.25f,.95f);
                    GUI.DrawTexture(new Rect(lx-7,ly-1,14,2),Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(lx-1,ly-7,2,14),Texture2D.whiteTexture);
                    GUI.Label(new Rect(lx+10,ly-10,120,20),"PREDICT",small);
                }
            }
            GUI.color=Color.white;
        }

        static string SensorText(SensorKind sensors)
        {
            string s="";
            foreach(SensorKind k in System.Enum.GetValues(typeof(SensorKind)))
            {
                if(k==SensorKind.None||(sensors&k)==0)continue;
                if(s.Length>0)s+=" · ";
                s+=k==SensorKind.Yolo?"YOLO":k.ToString().ToUpperInvariant();
            }
            return s;
        }

        static void DrawBox(Rect r,float t)
        {
            GUI.DrawTexture(new Rect(r.x,r.y,r.width,t),Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(r.x,r.yMax-t,r.width,t),Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(r.x,r.y,t,r.height),Texture2D.whiteTexture);
            GUI.DrawTexture(new Rect(r.xMax-t,r.y,t,r.height),Texture2D.whiteTexture);
        }
    }
}
