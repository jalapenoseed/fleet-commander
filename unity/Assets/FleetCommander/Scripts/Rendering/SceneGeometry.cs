using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
namespace FleetCommander.Rendering
{
    // Reusable native mesh assets. Static scenery is combined by material, not one object per seat/tree/line.
    public sealed class SceneGeometry
    {
        readonly Dictionary<Material,List<CombineInstance>> batches=new Dictionary<Material,List<CombineInstance>>();
        readonly Dictionary<PrimitiveType,Mesh> primitives=new Dictionary<PrimitiveType,Mesh>();
        public readonly List<Mesh> Owned=new List<Mesh>();
        Mesh Primitive(PrimitiveType type)
        {if(primitives.TryGetValue(type,out var mesh))return mesh;var go=GameObject.CreatePrimitive(type);mesh=go.GetComponent<MeshFilter>().sharedMesh;Object.Destroy(go);primitives[type]=mesh;return mesh;}
        public void Add(Mesh mesh,Vector3 p,Vector3 size,Material m,Quaternion? rotation=null)
        {if(!batches.TryGetValue(m,out var list)){list=new List<CombineInstance>();batches.Add(m,list);}list.Add(new CombineInstance{mesh=mesh,transform=Matrix4x4.TRS(p,rotation??Quaternion.identity,size)});}
        public void Box(Vector3 p,Vector3 size,Material m,Quaternion? q=null)=>Add(Primitive(PrimitiveType.Cube),p,size,m,q);
        public void Ball(Vector3 p,Vector3 size,Material m)=>Add(Primitive(PrimitiveType.Sphere),p,size,m);
        public void Cylinder(Vector3 p,float radius,float height,Material m)=>Add(Primitive(PrimitiveType.Cylinder),p,new Vector3(radius*2,height*.5f,radius*2),m);
        public void Beam(Vector3 a,Vector3 b,float width,Material m)
        {Vector3 d=b-a;Box((a+b)*.5f,new Vector3(width,d.magnitude,width),m,Quaternion.FromToRotation(Vector3.up,d));}
        public void Line(Vector3 a,Vector3 b,float width,Material m){a.y=b.y=.045f;Vector3 d=b-a;Box((a+b)*.5f,new Vector3(width,.025f,d.magnitude),m,Quaternion.LookRotation(d));}
        public void Ring(Vector3 center,float rx,float rz,float width,Material m,int segments=96)
        {for(int i=0;i<segments;i++){float a=i*Mathf.PI*2/segments,b=(i+1)*Mathf.PI*2/segments;Line(center+new Vector3(Mathf.Cos(a)*rx,0,Mathf.Sin(a)*rz),center+new Vector3(Mathf.Cos(b)*rx,0,Mathf.Sin(b)*rz),width,m);}}
        public Mesh FoliageCard(int quadrant)
        {
            var rects=new[]{new Vector4(41,94,620,577),new Vector4(800,48,1178,600),new Vector4(91,666,526,1210),new Vector4(674,744,1227,1185)};var r=rects[quadrant];float u=r.x/1254f,v=1-r.w/1254f,u2=r.z/1254f,v2=1-r.y/1254f;
            var mesh=new Mesh{name="Foliage quadrant "+quadrant};mesh.vertices=new[]{new Vector3(-.5f,0,0),new Vector3(.5f,0,0),new Vector3(.5f,1,0),new Vector3(-.5f,1,0)};mesh.uv=new[]{new Vector2(u,v),new Vector2(u2,v),new Vector2(u2,v2),new Vector2(u,v2)};mesh.triangles=new[]{0,2,1,0,3,2};mesh.RecalculateNormals();mesh.RecalculateBounds();Owned.Add(mesh);return mesh;
        }
        public void River(Material material)
        {
            const int n=256;var v=new Vector3[(n+1)*2];var uv=new Vector2[v.Length];var t=new int[n*6];
            for(int i=0;i<=n;i++){float z=-1800+i*3600f/n,x=270+Mathf.Sin(z*.009f)*50;v[i*2]=new Vector3(x-33,.19f,z);v[i*2+1]=new Vector3(x+33,.19f,z);uv[i*2]=new Vector2(0,z*.02f);uv[i*2+1]=new Vector2(1,z*.02f);if(i<n){int k=i*6,a=i*2;t[k]=a;t[k+1]=a+2;t[k+2]=a+1;t[k+3]=a+1;t[k+4]=a+2;t[k+5]=a+3;}}
            var mesh=new Mesh{name="Continuous limestone creek"};mesh.vertices=v;mesh.uv=uv;mesh.triangles=t;mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();Owned.Add(mesh);Add(mesh,Vector3.zero,Vector3.one,material);
        }
        public void Terrain(FleetCommander.Core.FleetConfig config,Material material)
        {
            const int n=192;const float size=3600;var v=new Vector3[(n+1)*(n+1)];var uv=new Vector2[v.Length];var t=new int[n*n*6];int k=0;
            for(int z=0;z<=n;z++)for(int x=0;x<=n;x++){int i=z*(n+1)+x;float px=(x/(float)n-.5f)*size,pz=(z/(float)n-.5f)*size;v[i]=new Vector3(px,FleetCommander.Core.SceneryTerrain.Height(config,px,pz),pz);uv[i]=new Vector2(px*.05f,pz*.05f);if(x<n&&z<n){t[k++]=i;t[k++]=i+n+1;t[k++]=i+1;t[k++]=i+1;t[k++]=i+n+1;t[k++]=i+n+2;}}
            var mesh=new Mesh{name="Continuous reference landscape",indexFormat=IndexFormat.UInt32};mesh.vertices=v;mesh.uv=uv;mesh.triangles=t;mesh.RecalculateNormals();mesh.RecalculateBounds();Owned.Add(mesh);Add(mesh,Vector3.zero,Vector3.one,material);
        }
        public Mesh Lathe(string name,Vector2[] profile,int segments=32)
        {
            var v=new Vector3[profile.Length*(segments+1)];var uv=new Vector2[v.Length];var t=new List<int>();
            for(int y=0;y<profile.Length;y++)for(int j=0;j<=segments;j++){float a=j*Mathf.PI*2/segments;int i=y*(segments+1)+j;v[i]=new Vector3(Mathf.Cos(a)*profile[y].x,profile[y].y,Mathf.Sin(a)*profile[y].x);uv[i]=new Vector2(j/(float)segments,y/(float)(profile.Length-1));if(y>0&&j>0){int prev=i-segments-1;t.AddRange(new[]{prev-1,i-1,i,prev-1,i,prev});}}
            var mesh=new Mesh{name=name};mesh.vertices=v;mesh.uv=uv;mesh.triangles=t.ToArray();mesh.RecalculateNormals();mesh.RecalculateBounds();Owned.Add(mesh);return mesh;
        }
        public Mesh Mountain(string name,int seed,float snowLine=1)
        {
            var v=new List<Vector3>();var t=new List<int>();const int rings=8,segments=28;
            for(int y=0;y<=rings;y++)for(int j=0;j<=segments;j++){float a=j*Mathf.PI*2/segments;float h=y/(float)rings;float radius=(1-h)*(1+.16f*Mathf.Sin(j*2.7f+seed)+.09f*Mathf.Sin(y*3.3f+j));v.Add(new Vector3(Mathf.Cos(a)*radius,h+.04f*Mathf.Sin(j*3+seed)*Mathf.Sin(h*Mathf.PI),Mathf.Sin(a)*radius));if(y>0&&j>0){int i=y*(segments+1)+j,p=i-segments-1;t.AddRange(new[]{p-1,i-1,i,p-1,i,p});}}
            var mesh=new Mesh{name=name};mesh.SetVertices(v);mesh.SetTriangles(t,0);mesh.RecalculateNormals();mesh.RecalculateBounds();Owned.Add(mesh);return mesh;
        }
        public void Build(Transform parent,string name)
        {
            foreach(var pair in batches){var mesh=new Mesh{name=name+" / "+pair.Key.name,indexFormat=IndexFormat.UInt32};mesh.CombineMeshes(pair.Value.ToArray(),true,true);Owned.Add(mesh);var go=new GameObject(mesh.name,typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(parent,false);go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterial=pair.Key;}
            batches.Clear();
        }
        public void Dispose(){foreach(var m in Owned)if(m)Object.Destroy(m);Owned.Clear();}
    }
}
