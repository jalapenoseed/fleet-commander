// CPU-test adapter only. This folder is outside Assets and never ships in the Unity player.
// It uses System.Numerics and System.Math; it cannot run Unity rendering or engine components.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Web.Script.Serialization;
namespace UnityEngine
{
    public class ScriptableObject {}
    public sealed class CreateAssetMenuAttribute:Attribute {public string menuName,fileName;}
    public static class Mathf
    {
        public const float PI=(float)Math.PI;
        public static float Sin(float n)=>(float)Math.Sin(n);public static float Cos(float n)=>(float)Math.Cos(n);
        public static float Sqrt(float n)=>(float)Math.Sqrt(n);public static float Exp(float n)=>(float)Math.Exp(n);
        public static float Pow(float a,float b)=>(float)Math.Pow(a,b);public static float Atan2(float a,float b)=>(float)Math.Atan2(a,b);
        public static float Abs(float n)=>Math.Abs(n);public static int Abs(int n)=>Math.Abs(n);
        public static float Min(float a,float b)=>Math.Min(a,b);public static int Min(int a,int b)=>Math.Min(a,b);
        public static float Max(float a,float b)=>Math.Max(a,b);public static int Max(int a,int b)=>Math.Max(a,b);
        public static float Clamp(float n,float a,float b)=>Max(a,Min(b,n));public static int Clamp(int n,int a,int b)=>Max(a,Min(b,n));
        public static float Clamp01(float n)=>Clamp(n,0,1);public static int CeilToInt(float n)=>(int)Math.Ceiling(n);public static int FloorToInt(float n)=>(int)Math.Floor(n);
        public static float Lerp(float a,float b,float t)=>a+(b-a)*Clamp01(t);public static float InverseLerp(float a,float b,float n)=>a==b?0:Clamp01((n-a)/(b-a));
    }
    [Serializable] public struct Vector3
    {
        public float x,y,z;public Vector3(float x,float y,float z){this.x=x;this.y=y;this.z=z;}
        public static Vector3 zero=>new Vector3();public static Vector3 one=>new Vector3(1,1,1);public static Vector3 up=>new Vector3(0,1,0);public static Vector3 down=>new Vector3(0,-1,0);public static Vector3 forward=>new Vector3(0,0,1);
        public float sqrMagnitude=>x*x+y*y+z*z;public float magnitude=>Mathf.Sqrt(sqrMagnitude);public Vector3 normalized=>magnitude<1e-5f?zero:this/magnitude;
        public static Vector3 operator +(Vector3 a,Vector3 b)=>new Vector3(a.x+b.x,a.y+b.y,a.z+b.z);public static Vector3 operator -(Vector3 a,Vector3 b)=>new Vector3(a.x-b.x,a.y-b.y,a.z-b.z);
        public static Vector3 operator -(Vector3 a)=>a*-1;public static Vector3 operator *(Vector3 a,float b)=>new Vector3(a.x*b,a.y*b,a.z*b);public static Vector3 operator *(float b,Vector3 a)=>a*b;public static Vector3 operator /(Vector3 a,float b)=>a*(1/b);
        public static Vector3 Lerp(Vector3 a,Vector3 b,float t)=>a+(b-a)*Mathf.Clamp01(t);public static float Distance(Vector3 a,Vector3 b)=>(a-b).magnitude;
        public static Vector3 ClampMagnitude(Vector3 v,float max)=>v.sqrMagnitude>max*max?v.normalized*max:v;
        public override string ToString()=>x+","+y+","+z;
    }
    public struct Vector2
    {
        public float x,y;public Vector2(float x,float y){this.x=x;this.y=y;}public static float Distance(Vector2 a,Vector2 b)=>Mathf.Sqrt((a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y));
    }
    public struct Vector3Int:IEquatable<Vector3Int>
    {
        public int x,y,z;public Vector3Int(int x,int y,int z){this.x=x;this.y=y;this.z=z;}
        public static Vector3Int operator +(Vector3Int a,Vector3Int b)=>new Vector3Int(a.x+b.x,a.y+b.y,a.z+b.z);
        public bool Equals(Vector3Int b)=>x==b.x&&y==b.y&&z==b.z;public override bool Equals(object b)=>b is Vector3Int&&Equals((Vector3Int)b);
        public override int GetHashCode(){unchecked{return x*73856093^y*19349663^z*83492791;}}
    }
    [Serializable] public struct Quaternion
    {
        public float x,y,z,w;public Quaternion(float x,float y,float z,float w){this.x=x;this.y=y;this.z=z;this.w=w;}
        public static Quaternion identity=>new Quaternion(0,0,0,1);
        static System.Numerics.Quaternion N(Quaternion q)=>new System.Numerics.Quaternion(q.x,q.y,q.z,q.w);
        static Quaternion Q(System.Numerics.Quaternion q)=>new Quaternion(q.X,q.Y,q.Z,q.W);
        public static Quaternion Euler(float x,float y,float z)=>Q(System.Numerics.Quaternion.CreateFromYawPitchRoll(y*Mathf.PI/180,x*Mathf.PI/180,z*Mathf.PI/180));
        public static Quaternion Slerp(Quaternion a,Quaternion b,float t)=>Q(System.Numerics.Quaternion.Slerp(N(a),N(b),Mathf.Clamp01(t)));
        public static Quaternion operator *(Quaternion a,Quaternion b)=>Q(N(a)*N(b));
        public static Vector3 operator *(Quaternion a,Vector3 b){var v=System.Numerics.Vector3.Transform(new System.Numerics.Vector3(b.x,b.y,b.z),N(a));return new Vector3(v.X,v.Y,v.Z);}
        public static Quaternion LookRotation(Vector3 f)
        {
            f=f.normalized;return Euler(-(float)Math.Asin(f.y)*180/Mathf.PI,Mathf.Atan2(f.x,f.z)*180/Mathf.PI,0);
        }
    }
    public struct Bounds
    {
        public Vector3 center,size;public Bounds(Vector3 c,Vector3 s){center=c;size=s;}public Vector3 extents=>size*.5f;public Vector3 min=>center-extents;public Vector3 max=>center+extents;
        public Vector3 ClosestPoint(Vector3 p)=>new Vector3(Mathf.Clamp(p.x,min.x,max.x),Mathf.Clamp(p.y,min.y,max.y),Mathf.Clamp(p.z,min.z,max.z));
        public bool Contains(Vector3 p)=>p.x>=min.x&&p.x<=max.x&&p.y>=min.y&&p.y<=max.y&&p.z>=min.z&&p.z<=max.z;
    }
    [Serializable] public struct Color
    {
        public float r,g,b,a;public Color(float r,float g,float b,float a=1){this.r=r;this.g=g;this.b=b;this.a=a;}
        public static Color white=>new Color(1,1,1);public static Color yellow=>new Color(1,1,0);public static Color cyan=>new Color(0,1,1);
    }
    public static class JsonUtility
    {
        static JavaScriptSerializer Serializer()=>new JavaScriptSerializer{MaxJsonLength=16000000,RecursionLimit=100};
        public static string ToJson(object value,bool pretty=false)=>Serializer().Serialize(Fields(value));
        public static T FromJson<T>(string text)=>(T)ConvertFields(Serializer().DeserializeObject(text),typeof(T));
        static object Fields(object value)
        {
            if(value==null)return null;var type=value.GetType();if(type.IsEnum)return Convert.ToInt32(value);if(type.IsPrimitive||value is string)return value;
            if(value is IEnumerable){var list=new List<object>();foreach(var x in (IEnumerable)value)list.Add(Fields(x));return list;}
            var dict=new Dictionary<string,object>();foreach(var f in type.GetFields(BindingFlags.Instance|BindingFlags.Public))dict[f.Name]=Fields(f.GetValue(value));return dict;
        }
        static object ConvertFields(object value,Type type)
        {
            if(value==null)return null;if(type.IsEnum)return Enum.ToObject(type,Convert.ToInt32(value));if(type.IsPrimitive||type==typeof(string))return Convert.ChangeType(value,type,System.Globalization.CultureInfo.InvariantCulture);
            if(type.IsArray){var values=(object[])value;var arr=Array.CreateInstance(type.GetElementType(),values.Length);for(int i=0;i<values.Length;i++)arr.SetValue(ConvertFields(values[i],type.GetElementType()),i);return arr;}
            var obj=Activator.CreateInstance(type,true);var dict=(Dictionary<string,object>)value;foreach(var f in type.GetFields(BindingFlags.Instance|BindingFlags.Public))if(dict.ContainsKey(f.Name))f.SetValue(obj,ConvertFields(dict[f.Name],f.FieldType));return obj;
        }
    }
}
