using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;
using UnityEngine.Rendering;
namespace FleetCommander.Editor
{
    [ScriptedImporter(2,"fleetprop")]
    public sealed class FleetPropImporter:ScriptedImporter
    {
        [Serializable] sealed class Surface {public string name,texture;public float[] color;public float metal,smooth;}
        public override void OnImportAsset(AssetImportContext ctx)
        {
            using var file=File.OpenRead(ctx.assetPath);using var zip=new GZipStream(file,CompressionMode.Decompress);using var r=new BinaryReader(zip,Encoding.UTF8);
            if(Encoding.ASCII.GetString(r.ReadBytes(4))!="FCP1")throw new InvalidDataException("Expected FCP1.");
            var root=new GameObject(Path.GetFileNameWithoutExtension(ctx.assetPath));ctx.AddObjectToAsset("root",root);ctx.SetMainObject(root);
            int count=r.ReadInt32();if(count<1||count>256)throw new InvalidDataException("Surface count.");
            for(int k=0;k<count;k++)
            {
                int bytes=r.ReadInt32();if(bytes<1||bytes>65536)throw new InvalidDataException("Header size.");var data=JsonUtility.FromJson<Surface>(Encoding.UTF8.GetString(r.ReadBytes(bytes)));
                int nv=r.ReadInt32(),ni=r.ReadInt32();if(nv<1||nv>4000000||ni<1||ni>12000000||ni%3!=0)throw new InvalidDataException("Mesh size.");
                var v=new Vector3[nv];var n=new Vector3[nv];var uv=new Vector2[nv];var ix=new int[ni];
                for(int j=0;j<nv;j++){v[j]=new Vector3(r.ReadSingle(),r.ReadSingle(),r.ReadSingle());n[j]=new Vector3(r.ReadSingle(),r.ReadSingle(),r.ReadSingle());uv[j]=new Vector2(r.ReadSingle(),r.ReadSingle());}
                for(int j=0;j<ni;j++){ix[j]=r.ReadInt32();if(ix[j]<0||ix[j]>=nv)throw new InvalidDataException("Index.");}
                var mesh=new Mesh{name=data.name,indexFormat=IndexFormat.UInt32};mesh.vertices=v;mesh.normals=n;mesh.uv=uv;mesh.triangles=ix;mesh.RecalculateBounds();mesh.RecalculateTangents();ctx.AddObjectToAsset("mesh"+k,mesh);
                var mat=new Material(Shader.Find("Standard")){name=data.name,enableInstancing=true};mat.color=new Color(data.color[0],data.color[1],data.color[2],1);mat.SetFloat("_Metallic",data.metal);mat.SetFloat("_Glossiness",data.smooth);
                if(!string.IsNullOrEmpty(data.texture)){string p=Path.GetDirectoryName(ctx.assetPath).Replace('\\','/')+"/Textures/"+data.texture+".png";ctx.DependsOnArtifact(p);mat.mainTexture=AssetDatabase.LoadAssetAtPath<Texture2D>(p);mat.color=Color.white;}
                ctx.AddObjectToAsset("mat"+k,mat);var go=new GameObject(data.name);go.transform.SetParent(root.transform,false);go.AddComponent<MeshFilter>().sharedMesh=mesh;go.AddComponent<MeshRenderer>().sharedMaterial=mat;go.isStatic=true;
            }
        }
    }
}
