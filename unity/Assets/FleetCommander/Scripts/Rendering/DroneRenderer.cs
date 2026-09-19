using System;
using System.Collections.Generic;
using FleetCommander.Core;
using FleetCommander.Cameras;
using UnityEngine;
using UnityEngine.Rendering;

namespace FleetCommander.Rendering
{
    // Authored mesh assets stay shared; fleet size never creates a GameObject per aircraft.
    public sealed class DroneRenderer : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public static readonly Color[] Palette={new Color(.1f,1,1),new Color(.2f,.4f,1),new Color(.65f,.3f,1),new Color(1,.3f,.65f),new Color(1,.15f,.12f),new Color(1,.45f,.1f),new Color(1,.9f,.2f),new Color(.3f,1,.3f),Color.white};
        public bool ShowHealth=true;
        public int LoadedModelAssets {get;private set;}
        public int LastDetailedDrones {get;private set;}
        static readonly string[] Surfaces={"Panel","Rubber","OffWhite","Anodized","Galvanized","Optical","MarkingDark","Metal","MarkingLight","Emission","Carbon","Copper","Glass","Trim","Accent","Prop"};
        sealed class Aircraft { public readonly Mesh[] surfaces=new Mesh[16];public Mesh silhouette; }
        readonly Aircraft[,] models=new Aircraft[4,2];
        readonly List<int>[] groups=new List<int>[12];
        readonly List<Mesh> ownedMeshes=new List<Mesh>();
        readonly Matrix4x4[] matrices=new Matrix4x4[1023];
        readonly Vector4[] colors=new Vector4[1023];
        readonly float[] rotorActive=new float[1023];
        static readonly Vector4[] RotorLayout={new Vector4(.533886f,.171366f,.374715f,.23026f),new Vector4(.668705f,-.064628f,.505606f,.28682f),new Vector4(1.000932f,.438691f,.698975f,.43391f),new Vector4(.670051f,.156914f,.491371f,.28566f)};
        readonly Material[] materials=new Material[16];
        Material lightMaterial;Mesh beacon;MaterialPropertyBlock properties;
        GUIStyle selectedLabel;DroneCameraRig rig;
        public static Mesh Primitive(PrimitiveType type)
        {var go=GameObject.CreatePrimitive(type);var m=go.GetComponent<MeshFilter>().sharedMesh;Destroy(go);return m;}

        void Start()
        {
            properties=new MaterialPropertyBlock();beacon=Primitive(PrimitiveType.Quad);rig=FindFirstObjectByType<DroneCameraRig>();
            for(int i=0;i<groups.Length;i++)groups[i]=new List<int>(256);
            for(int f=0;f<4;f++)for(int lod=0;lod<2;lod++)
                models[f,lod]=LoadModel(((FrameKind)f).ToString()+(lod==1?"_LOD":""));
            var shader=Resources.Load<Shader>("FleetSurface");
            for(int p=0;p<materials.Length;p++)
            {
                var m=new Material(shader){name="Fleet / "+Surfaces[p],enableInstancing=true};
                m.SetFloat("_Metallic",p==7||p==4||p==11?.8f:p==3?.5f:.08f);
                m.SetFloat("_Smoothness",p==12?.94f:p==7?.65f:p==1?.12f:.36f);
                m.SetFloat("_Weave",p==10?1:0);m.SetFloat("_Glow",p==9?1.6f:0);
                m.SetFloat("_Rotor",p==15?1:0);BindTextures(m,p);materials[p]=m;
            }
            lightMaterial=new Material(Resources.Load<Shader>("FleetBeacon")){enableInstancing=true};
        }

        Aircraft LoadModel(string name)
        {
            var asset=Resources.Load<GameObject>("DroneModels/"+name);
            if(!asset){Debug.LogError("Fleet model missing: DroneModels/"+name);return null;}
            var parts=new List<CombineInstance>[16];for(int p=0;p<16;p++)parts[p]=new List<CombineInstance>();
            var all=new List<CombineInstance>();
            foreach(var filter in asset.GetComponentsInChildren<MeshFilter>(true))
            {
                var mesh=filter.sharedMesh;if(!mesh)continue;
                if(!mesh.isReadable){Debug.LogError("Enable Read/Write on Fleet model "+name);continue;}
                int surface=0;for(int p=0;p<16;p++)if(filter.name.Equals(Surfaces[p],StringComparison.OrdinalIgnoreCase)||filter.name.StartsWith(Surfaces[p]+"_",StringComparison.OrdinalIgnoreCase)){surface=p;break;}
                for(int sub=0;sub<mesh.subMeshCount;sub++)
                {
                    var part=new CombineInstance{mesh=mesh,subMeshIndex=sub,transform=asset.transform.worldToLocalMatrix*filter.transform.localToWorldMatrix};
                    parts[surface].Add(part);all.Add(part);
                }
            }
            if(all.Count==0)return null;
            var result=new Aircraft();
            for(int p=0;p<16;p++)if(parts[p].Count>0)result.surfaces[p]=Combine(name+" / "+Surfaces[p],parts[p]);
            if(name.EndsWith("_LOD",StringComparison.Ordinal))result.silhouette=Combine(name+" / distance silhouette",all);
            LoadedModelAssets++;return result;
        }
        Mesh Combine(string name,List<CombineInstance> parts)
        {
            if(parts.Count==1&&parts[0].mesh.subMeshCount==1&&parts[0].transform==Matrix4x4.identity)return parts[0].mesh;
            var result=new Mesh{name=name,indexFormat=IndexFormat.UInt32};
            result.CombineMeshes(parts.ToArray(),true,true);ownedMeshes.Add(result);return result;
        }

        void LateUpdate()
        {
            if(!Simulator||materials[0]==null)return;
            var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;
            var config=Simulator.Replay.Playing?Simulator.Replay.DisplayConfig:Simulator.Config;
            var cam=Camera.main;if(cam==null||config==null)return;
            foreach(var g in groups)g.Clear();LastDetailedDrones=0;
            for(int i=0;i<states.Length;i++)
            {
                if(rig&&rig.Mode==CameraMode.FPV&&i==Simulator.Selected)continue;
                float distance=(states[i].position-cam.transform.position).sqrMagnitude;
                int level=distance<20*20&&LastDetailedDrones<15?0:distance<170*170?1:2;
                if(i==Simulator.Selected&&distance<80*80)level=0;
                if(level==0)LastDetailedDrones++;
                groups[Mathf.Clamp((int)states[i].frame,0,3)*3+level].Add(i);
            }
            for(int f=0;f<4;f++)for(int level=0;level<3;level++)
            {
                var asset=models[f,Mathf.Min(level,1)];if(asset==null)continue;
                var group=groups[f*3+level];
                for(int start=0;start<group.Count;start+=1023)
                {
                    int n=Mathf.Min(1023,group.Count-start);
                    for(int j=0;j<n;j++)
                    {
                        var s=states[group[start+j]];
                        matrices[j]=Matrix4x4.TRS(s.position,s.rotation,Vector3.one);
                        rotorActive[j]=s.airborne&&!s.disabled?1:0;
                    }
                    properties.SetFloatArray("_RotorActive",rotorActive);
                    properties.SetFloat("_RotorClock",Simulator.Replay.Playing?Simulator.Replay.Cursor:Simulator.Active.Time);
                    properties.SetVector("_RotorLayout",RotorLayout[f]);
                    int surfaces=level==2?1:16;
                    for(int p=0;p<surfaces;p++)
                    {
                        Mesh mesh=level==2?asset.silhouette:asset.surfaces[p];if(!mesh)continue;
                        for(int j=0;j<n;j++)
                        {
                            var s=states[group[start+j]];Color c=SurfaceColor(p,s);
                            c.a=Mathf.Clamp01(s.health/100);colors[j]=c;
                            // A destroyed aircraft loses its spinning propeller assembly.
                            if(p==15)matrices[j]=Matrix4x4.TRS(s.position,s.rotation,s.disabled?Vector3.zero:Vector3.one);
                            else if(p==0)matrices[j]=Matrix4x4.TRS(s.position,s.rotation,Vector3.one);
                        }
                        properties.SetVectorArray("_Color",colors);
                        Graphics.DrawMeshInstanced(mesh,0,materials[p],matrices,n,properties,level<2&&states.Length<=2000?ShadowCastingMode.On:ShadowCastingMode.Off,true,0,null,LightProbeUsage.Off);
                    }
                }
            }
            for(int start=0;start<states.Length;start+=1023)
            {
                int n=Mathf.Min(1023,states.Length-start);
                for(int j=0;j<n;j++)
                {
                    var s=states[start+j];float distance=Vector3.Distance(cam.transform.position,s.position);
                    float size=Mathf.Clamp(distance*.0025f,.10f,1.4f)*config.beaconSize;
                    matrices[j]=Matrix4x4.TRS(s.position+s.rotation*Vector3.up*.25f,cam.transform.rotation,Vector3.one*size);
                    Color c=Simulator.Arena!=null?(s.fleetId==0?Palette[0]:Palette[4]):Palette[Mathf.Abs(s.palette)%9];
                    if(config.formation==FormationKind.Art&&config.art.Length>0)c=config.art[Mathf.Min(config.art.Length-1,(start+j)%Mathf.Min(states.Length,config.art.Length)*config.art.Length/Mathf.Max(1,Mathf.Min(states.Length,config.art.Length)))].color;
                    if(s.battery01<.15f)c=Palette[5];if(s.disabled||(rig&&rig.Mode==CameraMode.FPV&&start+j==Simulator.Selected))c=Color.black;colors[j]=c*2.5f;
                }
                properties.SetVectorArray("_Color",colors);
                Graphics.DrawMeshInstanced(beacon,0,lightMaterial,matrices,n,properties,ShadowCastingMode.Off,false,0,null,LightProbeUsage.Off);
            }
        }
        static void BindTextures(Material material,int surface)
        {
            string stem=surface==0||surface==2||surface==14?"01_painted_alum":surface==1?"05_rubber":surface==3||surface==15?"03_black_anodized":surface==4?"07_galvanized":surface==7?"02_machined_alum":surface==10?"04_weave":surface==11?"06_aged_copper":surface==12?"09_camera_glass":surface==13?"trim":null;
            if(stem==null)return;
            string albedo=surface==0||surface==2?"paint_offwhite":surface==14?"paint_ochre":stem;
            var color=Resources.Load<Texture2D>("DroneTextures/GR_"+albedo+"_albedo");
            var normal=Resources.Load<Texture2D>("DroneTextures/GR_"+stem+"_normal");
            var rough=Resources.Load<Texture2D>("DroneTextures/GR_"+stem+"_rough");
            var metal=Resources.Load<Texture2D>("DroneTextures/GR_"+stem+"_metal");
            var ao=Resources.Load<Texture2D>("DroneTextures/GR_"+stem+"_ao");
            if(color)material.SetTexture("_MainTex",color);
            if(normal)material.SetTexture("_BumpMap",normal);
            if(rough){material.SetTexture("_RoughMap",rough);material.SetFloat("_MappedRoughness",1);}
            if(metal){material.SetTexture("_MetalMap",metal);material.SetFloat("_MappedMetallic",1);}
            if(ao)material.SetTexture("_OcclusionMap",ao);
        }
        static Color SurfaceColor(int surface,DroneState s)
        {
            switch(surface)
            {
                case 0:return DroneCatalog.SkinColor(s.skin);
                case 2:return Color.Lerp(DroneCatalog.SkinColor(s.skin),Color.white,.2f);
                case 5:return new Color(.025f,.035f,.042f);
                case 6:return new Color(.055f,.06f,.065f);
                case 8:return new Color(.82f,.81f,.74f);
                case 9:return s.disabled?Color.black:(s.fleetId%2==0?Palette[0]:Palette[4]);
                default:return Color.white;
            }
        }
        void OnGUI()
        {
            if(!ShowHealth||Simulator==null)return;var cam=Camera.main;if(!cam)return;
            var states=Simulator.Replay.Playing?Simulator.Replay.Display:Simulator.Active.States;
            for(int i=0;i<states.Length;i++)
            {
                var s=states[i];if(s.disabled||(rig&&rig.Mode==CameraMode.FPV&&i==Simulator.Selected))continue;
                bool selected=i==Simulator.Selected;
                if(Simulator.Arena==null&&!selected)continue;
                Vector3 p=cam.WorldToScreenPoint(s.position+Vector3.up*1.1f);
                if(p.z<2||p.z>200||p.x<0||p.x>Screen.width||p.y<0||p.y>Screen.height)continue;
                float y=Screen.height-p.y;
                GUI.color=new Color(0,0,0,.65f);GUI.DrawTexture(new Rect(p.x-15,y,30,4),Texture2D.whiteTexture);
                GUI.color=s.fleetId%2==0?Palette[0]:Palette[4];GUI.DrawTexture(new Rect(p.x-15,y,30*s.health/100,4),Texture2D.whiteTexture);
                if(selected)
                {
                    GUI.color=new Color(1,1,1,.88f);
                    GUI.DrawTexture(new Rect(p.x-20,y-3,3,11),Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(p.x+17,y-3,3,11),Texture2D.whiteTexture);
                    if(selectedLabel==null)selectedLabel=new GUIStyle(GUI.skin.label){fontSize=11,alignment=TextAnchor.MiddleCenter};
                    GUI.Label(new Rect(p.x-130,y-23,260,20),s.frame+"  /  "+s.weapon+"  /  #"+s.id,selectedLabel);
                }
            }
            GUI.color=Color.white;
        }
        void OnDestroy()
        {
            foreach(var mesh in ownedMeshes)if(mesh)Destroy(mesh);
            foreach(var material in materials)if(material)Destroy(material);
            if(lightMaterial)Destroy(lightMaterial);
        }
    }
}
