using FleetCommander.Core;
using UnityEngine;
using UnityEngine.Rendering;
namespace FleetCommander.Rendering
{
    public sealed class ArenaEnvironment : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        GameObject scenery;Light sun;Material sky;Material ground;
        string previous="";
        readonly System.Collections.Generic.List<Material> materials=new System.Collections.Generic.List<Material>();
        public Material Material(Color color,float glow=0)
        {
            var m=new Material(Resources.Load<Shader>("FleetInstanced"));m.SetColor("_Color",color);m.SetFloat("_Glow",glow);materials.Add(m);return m;
        }
        public GameObject Shape(string name,PrimitiveType type,Vector3 p,Vector3 size,Material m,Transform parent=null)
        {
            var go=GameObject.CreatePrimitive(type);go.name=name;go.transform.SetParent(parent?parent:transform);go.transform.position=p;go.transform.localScale=size;
            go.GetComponent<Renderer>().sharedMaterial=m;var col=go.GetComponent<Collider>();if(col)Destroy(col);return go;
        }
        void Start()
        {
            sun=new GameObject("Sun / moon light").AddComponent<Light>();sun.transform.SetParent(transform);sun.type=LightType.Directional;sun.shadows=LightShadows.Soft;sun.shadowStrength=.8f;sun.shadowBias=.05f;
            sky=new Material(Resources.Load<Shader>("FleetSky"));RenderSettings.skybox=sky;
            ground=Material(new Color(.10f,.14f,.16f));Shape("Flight field",PrimitiveType.Cube,new Vector3(0,-.3f,0),new Vector3(2200,.6f,2200),ground);
            var concrete=Material(new Color(.2f,.25f,.27f));var edge=Material(new Color(.05f,.45f,.52f),.7f);
            foreach(var b in FleetWorld.Obstacles)
            {
                Shape("Shared obstacle envelope",PrimitiveType.Cube,b.center,b.size,concrete);
                for(int y=4;y<b.size.y;y+=5)Shape("Facade light",PrimitiveType.Cube,new Vector3(b.center.x,y,b.min.z-.03f),new Vector3(b.size.x*.8f,.16f,.08f),edge);
                Shape("Rooftop equipment",PrimitiveType.Cube,b.center+Vector3.up*(b.extents.y+1.1f),new Vector3(b.size.x*.5f,2,b.size.z*.5f),concrete);
            }
            var marking=Material(new Color(.22f,.42f,.44f),.2f);
            for(int i=-8;i<=8;i++)
            {
                Shape("North-south field stripe",PrimitiveType.Cube,new Vector3(i*20,.03f,0),new Vector3(.08f,.03f,320),marking);
                Shape("East-west field stripe",PrimitiveType.Cube,new Vector3(0,.03f,i*20),new Vector3(320,.03f,.08f),marking);
            }
            QualitySettings.shadowDistance=220;QualitySettings.shadows=ShadowQuality.All;QualitySettings.antiAliasing=4;RenderSettings.ambientMode=AmbientMode.Trilight;
        }
        void Update()
        {
            if(!Simulator||!sky)return;var c=Simulator.Replay.Playing?Simulator.Replay.DisplayConfig:Simulator.Config;
            string key=c.planet+"/"+c.scenery+"/"+c.sky+"/"+c.weather;
            if(previous!=key){previous=key;Apply(c);}
            if(c.planet==PlanetKind.Earth&&c.weather==WeatherKind.Storm){float pulse=Mathf.Pow(Mathf.Max(0,Mathf.Sin(Time.time*.83f)*Mathf.Sin(Time.time*3.2f)),40);sun.intensity=Mathf.Lerp(.5f,3,pulse);}
        }
        void Apply(FleetConfig c)
        {
            bool moon=c.planet==PlanetKind.Moon,mars=c.planet==PlanetKind.Mars,night=c.sky==SkyKind.Night;
            Color top=moon?new Color(.004f,.005f,.015f):mars?new Color(.18f,.08f,.065f):night?new Color(.005f,.013f,.035f):c.sky==SkyKind.Day?new Color(.14f,.36f,.6f):new Color(.07f,.12f,.22f);
            Color horizon=moon?new Color(.015f,.02f,.035f):mars?new Color(.63f,.31f,.18f):night?new Color(.04f,.09f,.16f):c.sky==SkyKind.Day?new Color(.6f,.73f,.79f):new Color(.8f,.45f,.31f);
            sky.SetColor("_Top",top);sky.SetColor("_Horizon",horizon);sky.SetFloat("_Stars",moon||night?1:0);
            sun.color=moon?new Color(.8f,.88f,1):mars?new Color(1,.73f,.56f):night?new Color(.6f,.76f,1):new Color(1,.84f,.64f);
            sun.intensity=night?.7f:1.2f;sun.transform.rotation=Quaternion.Euler(night?40:25,-35,0);
            RenderSettings.ambientSkyColor=Color.Lerp(top,Color.white,.22f);RenderSettings.ambientEquatorColor=Color.Lerp(horizon,Color.gray,.6f)*.7f;RenderSettings.ambientGroundColor=new Color(.08f,.1f,.13f);
            RenderSettings.fog=!moon;RenderSettings.fogMode=FogMode.ExponentialSquared;RenderSettings.fogColor=Color.Lerp(horizon,top,.6f);RenderSettings.fogDensity=c.weather==WeatherKind.Clear?.0009f:.0035f;
            ground.SetColor("_Color",moon?new Color(.2f,.21f,.22f):mars?new Color(.24f,.13f,.08f):new Color(.08f,.13f,.14f));
            if(scenery)Destroy(scenery);scenery=new GameObject("Scenery · "+c.scenery);scenery.transform.SetParent(transform);
            var stone=Material(mars?new Color(.28f,.15f,.1f):new Color(.16f,.21f,.23f));
            if(moon||mars||c.scenery==SceneryKind.Alpine)
            {
                for(int i=0;i<36;i++){float a=i*Mathf.PI*2/36,r=330+FormationMath.Hash(i)*180;float h=30+FormationMath.Hash(i+80)*130;var g=Shape("Distant ridge",PrimitiveType.Sphere,new Vector3(Mathf.Cos(a)*r,-h*.4f,Mathf.Sin(a)*r),new Vector3(150,h*2,160),stone,scenery.transform);g.transform.rotation=Quaternion.Euler(0,i*37,0);}
            }
            else if(c.scenery==SceneryKind.City)
            {
                for(int i=0;i<56;i++){float a=i*Mathf.PI*2/56,r=300+FormationMath.Hash(i)*130,h=20+FormationMath.Hash(i+40)*150;Shape("Skyline tower",PrimitiveType.Cube,new Vector3(Mathf.Cos(a)*r,h/2,Mathf.Sin(a)*r),new Vector3(18+FormationMath.Hash(i+3)*20,h,25),stone,scenery.transform);}
            }
            else if(c.scenery==SceneryKind.Coast)
            {
                var water=Material(new Color(.06f,.19f,.25f));Shape("Coastal water",PrimitiveType.Cube,new Vector3(-560,.1f,0),new Vector3(650,.1f,1800),water,scenery.transform);
                for(int i=0;i<10;i++)Shape("Shore rock",PrimitiveType.Sphere,new Vector3(-240,0,i*70-300),new Vector3(20,12,35),stone,scenery.transform);
            }
            else
            {
                for(int side=-1;side<=1;side+=2)for(int row=0;row<5;row++)Shape("Grandstand tier",PrimitiveType.Cube,new Vector3(side*(195+row*8),row*3+1.5f,0),new Vector3(8,3,300),stone,scenery.transform);
                var lamps=Material(new Color(.55f,.8f,1),3);
                for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2){Shape("Floodlight mast",PrimitiveType.Cylinder,new Vector3(x*175,25,z*140),new Vector3(.6f,25,.6f),stone,scenery.transform);Shape("Floodlight panel",PrimitiveType.Cube,new Vector3(x*175,50,z*140),new Vector3(8,2,1),lamps,scenery.transform);}
            }
        }
        void OnDestroy(){foreach(var m in materials)if(m)Destroy(m);if(sky)Destroy(sky);}
    }
}
