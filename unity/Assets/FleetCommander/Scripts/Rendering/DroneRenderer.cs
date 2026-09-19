using System.Collections.Generic;
using FleetCommander.Core;
using UnityEngine;
using UnityEngine.Rendering;
namespace FleetCommander.Rendering
{
    public sealed class DroneRenderer : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public static readonly Color[] Palette={new Color(.1f,1,1),new Color(.2f,.4f,1),new Color(.65f,.3f,1),new Color(1,.3f,.65f),new Color(1,.15f,.12f),new Color(1,.45f,.1f),new Color(1,.9f,.2f),new Color(.3f,1,.3f),Color.white};
        Mesh body,beacon;Material hull,lightMaterial;MaterialPropertyBlock properties;
        readonly Matrix4x4[] matrices=new Matrix4x4[1023];readonly Vector4[] colors=new Vector4[1023];
        public bool ShowHealth=true;
        public static Mesh Primitive(PrimitiveType type)
        {var go=GameObject.CreatePrimitive(type);var m=go.GetComponent<MeshFilter>().sharedMesh;Destroy(go);return m;}
        void Start()
        {
            var cube=Primitive(PrimitiveType.Cube);var parts=new List<CombineInstance>();
            void Box(Vector3 p,Vector3 scale,Quaternion r){parts.Add(new CombineInstance{mesh=cube,transform=Matrix4x4.TRS(p,r,scale)});}
            Box(Vector3.zero,new Vector3(.5f,.2f,.65f),Quaternion.identity);
            Box(Vector3.zero,new Vector3(1.55f,.09f,.12f),Quaternion.Euler(0,42,0));Box(Vector3.zero,new Vector3(1.55f,.09f,.12f),Quaternion.Euler(0,-42,0));
            for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2){Box(new Vector3(x*.53f,.09f,z*.48f),new Vector3(.19f,.12f,.19f),Quaternion.identity);Box(new Vector3(x*.53f,.18f,z*.48f),new Vector3(.57f,.025f,.08f),Quaternion.Euler(0,z*30,0));}
            Box(new Vector3(0,.02f,.38f),new Vector3(.18f,.15f,.17f),Quaternion.identity);
            Box(new Vector3(-.23f,-.17f,0),new Vector3(.06f,.08f,.6f),Quaternion.identity);Box(new Vector3(.23f,-.17f,0),new Vector3(.06f,.08f,.6f),Quaternion.identity);
            body=new Mesh{name="Fleet quad hull"};body.CombineMeshes(parts.ToArray(),true,true);beacon=Primitive(PrimitiveType.Quad);
            var shader=Resources.Load<Shader>("FleetInstanced");hull=new Material(shader);hull.enableInstancing=true;hull.SetFloat("_Glow",0);
            lightMaterial=new Material(Resources.Load<Shader>("FleetBeacon")){enableInstancing=true};properties=new MaterialPropertyBlock();
        }
        void LateUpdate()
        {
            if(!Simulator||!hull)return;
            var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;
            var config=Simulator.Replay.Playing?Simulator.Replay.DisplayConfig:Simulator.Config;
            var cam=Camera.main;if(cam==null)return;
            for(int start=0;start<states.Length;start+=1023)
            {
                int n=Mathf.Min(1023,states.Length-start);
                for(int j=0;j<n;j++)
                {
                    var s=states[start+j];float span=s.frame==FrameKind.Cargo?1.6f:s.frame==FrameKind.Relay?1.2f:1;
                    matrices[j]=Matrix4x4.TRS(s.position,s.rotation,Vector3.one*span);
                    colors[j]=s.disabled?new Color(.05f,.05f,.05f):s.fleetId%2==0?new Color(.17f,.23f,.26f):new Color(.27f,.2f,.18f);
                }
                properties.SetVectorArray("_Color",colors);
                Graphics.DrawMeshInstanced(body,0,hull,matrices,n,properties,states.Length<=2000?ShadowCastingMode.On:ShadowCastingMode.Off,true,0,null,LightProbeUsage.Off);
                for(int j=0;j<n;j++)
                {
                    var s=states[start+j];float distance=Vector3.Distance(cam.transform.position,s.position);
                    float size=Mathf.Clamp(distance*.0025f,.14f,1.4f)*config.beaconSize;
                    matrices[j]=Matrix4x4.TRS(s.position+Vector3.up*.22f,cam.transform.rotation,Vector3.one*size);
                    Color c=Simulator.Arena!=null?(s.fleetId==0?Palette[0]:Palette[4]):Palette[Mathf.Abs(s.palette)%9];
                    if(config.formation==FormationKind.Art&&config.art.Length>0)c=config.art[Mathf.Min(config.art.Length-1,(start+j)%Mathf.Min(states.Length,config.art.Length)*config.art.Length/Mathf.Max(1,Mathf.Min(states.Length,config.art.Length)))].color;
                    if(s.battery01<.15f)c=Palette[5];if(s.disabled)c=Color.black;colors[j]=c*2.5f;
                }
                properties.SetVectorArray("_Color",colors);Graphics.DrawMeshInstanced(beacon,0,lightMaterial,matrices,n,properties,ShadowCastingMode.Off,false,0,null,LightProbeUsage.Off);
            }
        }
        void OnGUI()
        {
            if(!ShowHealth||Simulator==null||Simulator.Arena==null)return;var cam=Camera.main;if(!cam)return;
            var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;
            foreach(var s in states)
            {
                if(s.disabled)continue;Vector3 p=cam.WorldToScreenPoint(s.position+Vector3.up*1.3f);if(p.z<0||p.z>200)continue;
                GUI.color=new Color(0,0,0,.6f);GUI.DrawTexture(new Rect(p.x-14,Screen.height-p.y,28,3),Texture2D.whiteTexture);
                GUI.color=s.fleetId==0?Palette[0]:Palette[4];GUI.DrawTexture(new Rect(p.x-14,Screen.height-p.y,28*s.health/100,3),Texture2D.whiteTexture);
            }
            GUI.color=Color.white;
        }
        void OnDestroy(){if(body)Destroy(body);if(hull)Destroy(hull);if(lightMaterial)Destroy(lightMaterial);}
    }
}
