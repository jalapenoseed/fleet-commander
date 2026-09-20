using FleetCommander.Core;
using FleetCommander.UI;
using UnityEngine;
namespace FleetCommander.Cameras
{
    public enum FeedView { SelectedFPV, SelectedShoulder, Overhead, BlueFollow, RedFollow, Audience }
    [DefaultExecutionOrder(-5)] public sealed class MultiCameraRig : MonoBehaviour
    {
        public SwarmSimulator Simulator;public CommanderUI UI;public DroneCameraRig Rig;
        public int FeedCount;
        public readonly Camera[] Cameras=new Camera[3];public readonly RenderTexture[] Textures=new RenderTexture[3];
        public readonly FeedView[] Views={FeedView.SelectedFPV,FeedView.Overhead,FeedView.RedFollow};
        public bool Active=>FeedCount>0&&Simulator.Chess==null;
        void Start(){for(int i=0;i<3;i++){var go=new GameObject("Monitor "+(i+1));go.transform.SetParent(transform);var c=go.AddComponent<Camera>();c.CopyFrom(Camera.main);c.tag="Untagged";c.depth=-5+i;c.fieldOfView=64;c.allowHDR=false;c.allowMSAA=false;Textures[i]=new RenderTexture(512,288,16){name="Live feed "+i};Textures[i].Create();c.targetTexture=Textures[i];Cameras[i]=c;c.enabled=false;}}
        public int Subject(int feed)
        {var states=Simulator.Active.States;if(states.Length==0)return -1;int selected=Mathf.Clamp(Simulator.Selected,0,states.Length-1);if(Views[feed]==FeedView.BlueFollow||Views[feed]==FeedView.RedFollow){int team=Views[feed]==FeedView.BlueFollow?0:1;for(int i=0;i<states.Length;i++)if(states[i].fleetId==team&&!states[i].disabled)return i;}return selected;}
        public int HiddenDrone(Camera camera){for(int i=0;i<3;i++)if(Cameras[i]==camera&&Views[i]==FeedView.SelectedFPV)return Subject(i);return -1;}
        void LateUpdate()
        {
            for(int i=0;i<3;i++){var c=Cameras[i];if(!c)continue;c.enabled=Active&&i<FeedCount&&!(UI&&UI.MenusHidden);if(!c.enabled)continue;int id=Subject(i);var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;if(id<0||id>=states.Length)continue;var d=states[id];Vector3 p,look;
                switch(Views[i]){case FeedView.Overhead:p=new Vector3(0,180,0);look=Vector3.forward*.01f;break;case FeedView.Audience:p=Rig.AudiencePosition();look=Rig.Focus;break;case FeedView.SelectedFPV:p=d.position+d.rotation*new Vector3(0,.2f,.8f);look=p+d.rotation*Vector3.forward*100;break;default:p=d.position+d.rotation*new Vector3(3,3,-8);look=d.position+d.rotation*Vector3.forward*12;break;}
                p.y=Mathf.Max(.8f,p.y);c.transform.SetPositionAndRotation(p,Quaternion.LookRotation(look-p));}
        }
        void OnDestroy(){foreach(var t in Textures)if(t){t.Release();Destroy(t);}}
    }
}
