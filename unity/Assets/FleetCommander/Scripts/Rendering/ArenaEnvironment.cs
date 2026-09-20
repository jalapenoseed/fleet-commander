using System.Collections.Generic;
using FleetCommander.Core;
using UnityEngine;
using UnityEngine.Rendering;
namespace FleetCommander.Rendering
{
    public sealed class ArenaEnvironment : MonoBehaviour
    {
        public SwarmSimulator Simulator;
        public int SceneRevision {get;private set;}
        GameObject scenery;Light sun,fill;Material sky;Cubemap reflection;
        string geometryKey="",lightKey="";SceneGeometry mesh;
        readonly List<Material> materials=new List<Material>();
        Material grass,stone,bark,leaf,gold,white,roof,water,foliage;readonly Mesh[] foliageCards=new Mesh[4];
        Material Mat(string name,Color color,float noise=.3f,float glow=0)
        {var m=new Material(Resources.Load<Shader>("FleetScenery")){name=name};m.SetColor("_Color",color);m.SetFloat("_Noise",noise);m.SetFloat("_Glow",glow);materials.Add(m);return m;}
        void Start()
        {
            sun=new GameObject("Sun / moon").AddComponent<Light>();sun.transform.SetParent(transform);sun.type=LightType.Directional;sun.shadows=LightShadows.Soft;sun.shadowStrength=.7f;sun.shadowBias=.04f;
            fill=new GameObject("Sky bounce").AddComponent<Light>();fill.transform.SetParent(transform);fill.type=LightType.Directional;fill.shadows=LightShadows.None;
            sky=new Material(Resources.Load<Shader>("FleetSky"));RenderSettings.skybox=sky;
            QualitySettings.shadowDistance=240;QualitySettings.shadows=ShadowQuality.All;QualitySettings.antiAliasing=4;
        }
        void Update()
        {
            if(!Simulator||!sky)return;var c=Simulator.DisplayConfig;
            string key=c.planet+"/"+c.scenery+"/"+(Simulator.Sports!=null||Simulator.Range!=null)+"/"+c.obstacles;
            if(key!=geometryKey){geometryKey=key;Build(c);}
            if(scenery)scenery.SetActive(Simulator.Chess==null);
            key=c.planet+"/"+c.sky+"/"+c.weather+"/"+(Simulator.Chess!=null);
            if(key!=lightKey){lightKey=key;Lighting(Simulator.Chess!=null?new FleetConfig{sky=SkyKind.Day}:c);}
            if(c.planet==PlanetKind.Earth&&c.weather==WeatherKind.Storm){float pulse=Mathf.Pow(Mathf.Max(0,Mathf.Sin(Time.time*.83f)*Mathf.Sin(Time.time*3.2f)),40);sun.intensity=Mathf.Lerp(.65f,2.8f,pulse);}
        }
        void Lighting(FleetConfig c)
        {
            bool night=c.sky==SkyKind.Night||c.sky==SkyKind.MilkyWay||c.sky==SkyKind.Moonlit,space=c.planet==PlanetKind.Moon;
            bool warm=c.sky==SkyKind.Golden||c.sky==SkyKind.Dusk;
            Color top=night?new Color(.008f,.027f,.085f):warm?new Color(.12f,.25f,.46f):new Color(.075f,.35f,.73f);
            Color horizon=night?new Color(.08f,.13f,.23f):warm?new Color(.98f,.46f,.25f):new Color(.71f,.83f,.91f);
            if(c.planet==PlanetKind.Mars){top=new Color(.3f,.15f,.1f);horizon=new Color(.75f,.4f,.22f);}if(space){top=Color.black;horizon=new Color(.015f,.022f,.04f);}
            sky.SetColor("_Top",top);sky.SetColor("_Horizon",horizon);sky.SetFloat("_Stars",night||space?1:0);sky.SetFloat("_Galaxy",c.sky==SkyKind.MilkyWay?1.8f:night?.15f:0);sky.SetFloat("_Night",night?1:0);
            sky.SetFloat("_Clouds",space?0:night?.1f:c.sky==SkyKind.Overcast||c.weather!=WeatherKind.Clear?1:.62f);
            sun.color=night?new Color(.61f,.76f,1):warm?new Color(1,.68f,.42f):new Color(1,.96f,.88f);sun.intensity=night?.7f:warm?1.25f:1.35f;
            sun.transform.rotation=Quaternion.Euler(night?35:warm?17:52,-38,0);sky.SetVector("_SunDir",-sun.transform.forward);Shader.SetGlobalColor("_FleetHorizon",horizon);
            fill.color=night?new Color(.3f,.48f,.8f):new Color(.68f,.81f,1);fill.intensity=night?.24f:.42f;fill.transform.rotation=Quaternion.Euler(32,140,0);
            RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=night?new Color(.18f,.25f,.4f):new Color(.58f,.68f,.82f);RenderSettings.ambientEquatorColor=night?new Color(.12f,.17f,.25f):new Color(.38f,.44f,.5f);RenderSettings.ambientGroundColor=night?new Color(.09f,.12f,.17f):new Color(.24f,.28f,.23f);
            var probe=new SphericalHarmonicsL2();probe.AddAmbientLight(RenderSettings.ambientEquatorColor);probe.AddDirectionalLight(Vector3.up,RenderSettings.ambientSkyColor,.45f);RenderSettings.ambientProbe=probe;
            RenderSettings.fog=!space;RenderSettings.fogMode=FogMode.ExponentialSquared;RenderSettings.fogColor=Color.Lerp(horizon,top,.24f);RenderSettings.fogDensity=c.weather==WeatherKind.Clear?.00048f:.0015f;
            if(reflection)Destroy(reflection);reflection=new Cubemap(32,TextureFormat.RGBA32,false){name="Scenery reflection"};
            for(int f=0;f<6;f++){var pixels=new Color[1024];for(int i=0;i<pixels.Length;i++){float h=f==2?1:f==3?0:(i/32+.5f)/32;pixels[i]=Color.Lerp(RenderSettings.ambientGroundColor,Color.Lerp(horizon,top,h),h);}reflection.SetPixels(pixels,(CubemapFace)f);}reflection.Apply();RenderSettings.defaultReflectionMode=DefaultReflectionMode.Custom;RenderSettings.customReflection=reflection;RenderSettings.reflectionIntensity=night?.6f:1;
        }
        void Clear()
        {if(scenery)Destroy(scenery);mesh?.Dispose();foreach(var m in materials)if(m)Destroy(m);materials.Clear();}
        void Build(FleetConfig c)
        {
            Clear();SceneRevision++;mesh=new SceneGeometry();scenery=new GameObject("Landscape · "+c.scenery);scenery.transform.SetParent(transform);
            bool moon=c.planet==PlanetKind.Moon,mars=c.planet==PlanetKind.Mars;
            grass=Mat("Meadow turf",moon?new Color(.3f,.31f,.33f):mars?new Color(.47f,.23f,.12f):new Color(.14f,.24f,.07f),.22f);
            stone=Mat("Weathered limestone",new Color(.54f,.51f,.42f),.6f);bark=Mat("Bark",new Color(.25f,.17f,.09f),.65f);leaf=Mat("Oak foliage",new Color(.18f,.32f,.07f),.6f);gold=Mat("Aspen foliage",new Color(.8f,.52f,.06f),.5f);white=Mat("Chalk and snow",new Color(.86f,.89f,.85f),.15f);roof=Mat("Slate",new Color(.19f,.24f,.26f));
            water=new Material(Resources.Load<Shader>("FleetWater")){name="Rippling water"};materials.Add(water);water.SetColor("_Color",new Color(.035f,.19f,.27f));
            grass.SetFloat("_Terrain",1);if(c.scenery==SceneryKind.Alpine||c.scenery==SceneryKind.City)grass.SetFloat("_Snow",245);if(c.scenery==SceneryKind.Coast)grass.SetFloat("_Shore",1);mesh.Terrain(c,grass);
            foliage=new Material(Resources.Load<Shader>("FleetFoliage")){name="Natural foliage atlas"};foliage.SetTexture("_MainTex",Resources.Load<Texture2D>("FoliageAtlas"));materials.Add(foliage);for(int i=0;i<4;i++)foliageCards[i]=mesh.FoliageCard(i);
            // These envelopes are shared with flight collision and pad placement.
            if(Simulator.Sports==null&&Simulator.Range==null&&c.obstacles)foreach(var b in FleetWorld.Obstacles)
            {
                mesh.Box(b.center,b.size,stone);mesh.Box(b.center+Vector3.up*(b.extents.y-.2f),new Vector3(b.size.x+.5f,.4f,b.size.z+.5f),roof);
                var glass=Mat("Operations glass",new Color(.12f,.32f,.38f),.1f,.12f);
                for(float y=3;y<b.max.y-1;y+=4)for(float x=b.min.x+2;x<b.max.x-1;x+=4)mesh.Box(new Vector3(x,y,b.min.z-.025f),new Vector3(2.5f,1.6f,.08f),glass);
                mesh.Box(new Vector3(b.center.x,2.8f,b.min.z-.08f),new Vector3(5,5.6f,.2f),roof);
            }
            if(moon||mars){Ridges(c.scenery,false);for(int i=0;i<160;i++){float a=i*2.39996f,r=190+Hash(i)*850;mesh.Ball(new Vector3(Mathf.Cos(a)*r,-3,Mathf.Sin(a)*r),new Vector3(8+Hash(i+4)*25,5+Hash(i+6)*16,12),stone);}mesh.Build(scenery.transform,"Planet terrain");return;}
            if(c.scenery==SceneryKind.Desert)grass.SetColor("_Color",new Color(.38f,.24f,.1f));
            switch(c.scenery)
            {
                case SceneryKind.RuralTown:RuralTown();Trees(false,270,650);break;
                case SceneryKind.Metro:Metro();break;
                case SceneryKind.Harbor:Harbor();break;
                case SceneryKind.Desert:Desert();break;
                case SceneryKind.ForestLake:Lake();Trees(false,230,1500);Cabins();break;
                case SceneryKind.Stadium:Stadium();Trees(false,270,140);break;
                case SceneryKind.Coast:Coast();break;
                case SceneryKind.Alpine:Ridges(c.scenery,true);Trees(true,220,1400);Cabins();break;
                case SceneryKind.City:Ridges(c.scenery,true);Town();Trees(false,320,160);break;
                case SceneryKind.Creek:Creek();Trees(false,190,1500);Ridges(c.scenery,false);break;
                case SceneryKind.Overlook:Overlook();Trees(false,360,260);Ridges(c.scenery,false);break;
                default:Ridges(c.scenery,false);Trees(false,230,700);Meadow();break;
            }
            mesh.Build(scenery.transform,"Scenery");ScenePackPlacement.Build(scenery.transform,c);
        }
        static float Hash(int i)=>FormationMath.Hash(i+743);
        void Ridges(SceneryKind kind,bool snowy) { /* The continuous shared terrain supplies the skyline. */ }
        void Tree(Vector3 p,float h,bool autumn,int seed)
        {
            p.y=SceneryTerrain.Height(Simulator.DisplayConfig,p.x,p.z);int type=autumn?(seed%4==0?1:2):seed%5==0?3:0;
            float width=type==1?h*.7f:type==2?h*.8f:h*1.15f;float yaw=seed*137.5f;
            mesh.Add(foliageCards[type],p,new Vector3(width,h,1),foliage,Quaternion.Euler(0,yaw,0));mesh.Add(foliageCards[type],p,new Vector3(width,h,1),foliage,Quaternion.Euler(0,yaw+90,0));
        }
        void Trees(bool autumn,float start,int count)
        {for(int i=0;i<count;i++){float a=i*2.39996f,r=start+Hash(i)*390;float x=Mathf.Cos(a)*r,z=Mathf.Sin(a)*r;if(Simulator.Config.scenery==SceneryKind.Creek&&Mathf.Abs(x-(270+Mathf.Sin(z*.009f)*50))<50)continue;if(Simulator.Config.scenery==SceneryKind.ForestLake&&new Vector2(x-290,z).magnitude<165)continue;Tree(new Vector3(x,0,z),7+Hash(i+8)*15,autumn,i);}}
        void Stadium()
        {
            var concrete=Mat("Stadium concrete",new Color(.63f,.62f,.57f));var crimson=Mat("Crimson seating",new Color(.52f,.04f,.05f));var cream=Mat("Crowd light shirts",new Color(.84f,.78f,.66f));var navy=Mat("Crowd dark shirts",new Color(.07f,.12f,.2f));var metal=Mat("White roof canopy",new Color(.77f,.8f,.79f));
            for(int row=0;row<18;row++)for(int seg=0;seg<100;seg++)
            {
                float a=seg*Mathf.PI*2/100,rx=165+row*2.3f,rz=136+row*2.3f,y=3+row*1.15f;Vector3 p=new Vector3(Mathf.Cos(a)*rx,y,Mathf.Sin(a)*rz);Quaternion q=Quaternion.Euler(0,-a*Mathf.Rad2Deg,0);
                mesh.Box(p,new Vector3(2.7f,1.1f,12),concrete,q);
                for(int seat=0;seat<5;seat++){Vector3 offset=q*new Vector3(0,.9f,(seat-2)*1.65f);mesh.Box(p+offset,new Vector3(.8f,.85f,.85f),(seg+row+seat)%4==0?cream:(seg+seat)%3==0?navy:crimson,q);}
                if(row==17){mesh.Box(p+Vector3.up*7,new Vector3(14,.5f,12.3f),metal,q);if(seg%4==0)mesh.Cylinder(p-Vector3.up*9,.8f,38,concrete);}
            }
            var lamps=Mat("Floodlights",new Color(.83f,.93f,1),0,2);
            for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2){Vector3 p=new Vector3(x*132,23,z*105);mesh.Cylinder(p,.6f,46,roof);mesh.Box(p+Vector3.up*24,new Vector3(11,4,.6f),lamps);}
            mesh.Box(new Vector3(0,23,163),new Vector3(38,18,2),crimson);mesh.Box(new Vector3(0,23,161.9f),new Vector3(34,14,.3f),roof);
            for(int x=-1;x<=1;x+=2)mesh.Cylinder(new Vector3(x*15,11,164),1.3f,22,concrete);
            // The main arena retains a visible field even before a sports match starts.
            if(Simulator.Sports==null&&Simulator.Range==null){var line=Mat("Arena field markings",new Color(.67f,.77f,.53f),0);mesh.Ring(Vector3.zero,26,26,.17f,line);mesh.Line(new Vector3(0,0,-95),new Vector3(0,0,95),.15f,line);}
        }
        void Coast()
        {
            var sand=Mat("Shore sand",new Color(.64f,.58f,.41f),.45f);mesh.Box(new Vector3(-4180,.12f,0),new Vector3(8000,.08f,8000),water);mesh.Box(new Vector3(-182,.05f,0),new Vector3(52,.04f,3000),sand);
            for(int i=0;i<44;i++){float z=i*40-840,x=-202+Mathf.Sin(i*.8f)*10;mesh.Ball(new Vector3(x,-2,z),new Vector3(15+Hash(i)*15,9,19),stone);}
            for(int i=0;i<70;i++){float a=i*2.4f;Tree(new Vector3(260+Hash(i)*350,0,Mathf.Sin(a)*700),9+Hash(i+12)*8,false,i);}Ridges(SceneryKind.Coast,false);
        }
        void Creek()
        {
            var limestone=Mat("Creek limestone shelves",new Color(.39f,.39f,.32f),.35f);
            mesh.River(water);
            for(int i=0;i<64;i++){float z=i*27-850,x=270+Mathf.Sin(z*.009f)*50;for(int side=-1;side<=1;side+=2){float rx=x+side*(30+Hash(i+21)*12);mesh.Ball(new Vector3(rx,SceneryTerrain.Height(Simulator.DisplayConfig,rx,z)-2.5f,z),new Vector3(15+Hash(i+8)*18,10+Hash(i)*8,18+Hash(i+5)*20),limestone);}}
            mesh.Box(new Vector3(270,1.2f,0),new Vector3(50,2.4f,3),limestone);mesh.Box(new Vector3(270,1.4f,-1.65f),new Vector3(47,2.5f,.25f),white);
            for(int i=0;i<14;i++)mesh.Ball(new Vector3(242+i*4,.13f,-4-Hash(i)*4),new Vector3(4,.4f,3),white);
        }
        void Overlook()
        {var granite=Mat("Warm granite",new Color(.6f,.36f,.22f),.7f);for(int i=0;i<50;i++){float a=i*2.4f,r=190+Hash(i)*220;float x=Mathf.Cos(a)*r,z=Mathf.Sin(a)*r;mesh.Ball(new Vector3(x,SceneryTerrain.Height(Simulator.DisplayConfig,x,z)-4,z),new Vector3(35+Hash(i+6)*40,15+Hash(i+8)*25,45),granite);}for(int i=0;i<60;i++){float a=i*2.4f;Tree(new Vector3(Mathf.Cos(a)*220,0,Mathf.Sin(a)*270),3+Hash(i)*4,false,i);}}
        void Meadow()
        {
            var yellow=Mat("Dandelion petals",new Color(1,.76f,.03f),0,.08f);var stem=Mat("Flower stems",new Color(.3f,.43f,.06f));
            for(int i=0;i<1800;i++){float x=145+Hash(i)*170,z=Hash(i+2200)*350-175,y=SceneryTerrain.Height(Simulator.DisplayConfig,x,z)+.4f+Hash(i+800)*.5f;mesh.Beam(new Vector3(x,y-.7f,z),new Vector3(x,y,z),.05f,stem);mesh.Box(new Vector3(x,y,z),new Vector3(.6f,.08f,.24f),yellow);mesh.Box(new Vector3(x,y,z),new Vector3(.24f,.09f,.6f),yellow);}
            House(new Vector3(-235,0,200),new Color(.61f,.2f,.09f),25,17,22);
        }
        void House(Vector3 p,Color color,float width,float height,float depth)
        {
            p.y=SceneryTerrain.Height(Simulator.DisplayConfig,p.x,p.z);var wall=Mat("Town facade",color);mesh.Box(p+Vector3.up*height*.5f,new Vector3(width,height,depth),wall);
            for(int side=-1;side<=1;side+=2)mesh.Box(p+new Vector3(side*width*.25f,height+width*.14f,0),new Vector3(width*.57f,.6f,depth+1.8f),roof,Quaternion.Euler(0,0,side*-28));
            var glass=Mat("Windows",new Color(.45f,.66f,.72f),0,.06f);
            for(int row=0;row<Mathf.FloorToInt(height/4);row++)for(int column=0;column<3;column++)mesh.Box(p+new Vector3((column-1)*width*.25f,2.3f+row*4,-depth*.5f-.05f),new Vector3(width*.13f,2,.14f),glass);
        }
        void Cabins(){for(int i=0;i<22;i++){float a=i*2.39996f;House(new Vector3(Mathf.Cos(a)*(245+Hash(i)*130),0,Mathf.Sin(a)*(245+Hash(i)*130)),new Color(.35f,.23f,.12f),12,7,12);}}
        void Town()
        {
            var road=Mat("Main street",new Color(.2f,.22f,.23f),.3f);mesh.Box(new Vector3(0,.02f,225),new Vector3(800,.02f,24),road);
            Color[] colors={new Color(.6f,.23f,.22f),new Color(.86f,.74f,.49f),new Color(.4f,.56f,.5f),new Color(.67f,.63f,.53f),new Color(.57f,.37f,.25f)};
            for(int i=0;i<16;i++){float x=(i/2-4)*45,z=i%2==0?207:243;mesh.Cylinder(new Vector3(x,3,z),.1f,6,roof);mesh.Ball(new Vector3(x,6,z),Vector3.one*.6f,stone);}
        }
        void RuralTown()
        {
            var fence=Mat("Cedar fence",new Color(.28f,.2f,.13f));var crop=Mat("Planted rows",new Color(.32f,.39f,.07f));
            var lane=Mat("Village road",new Color(.13f,.14f,.13f));mesh.Box(new Vector3(0,.05f,220),new Vector3(550,.06f,18),lane);
            for(int i=0;i<24;i++){float z=i*8-96;float y=SceneryTerrain.Height(Simulator.DisplayConfig,280,z);mesh.Box(new Vector3(280,y+.3f,z),new Vector3(100,.6f,2.5f),crop);}
            for(int i=0;i<35;i++){float x=195+i*4,y=SceneryTerrain.Height(Simulator.DisplayConfig,x,-108);mesh.Box(new Vector3(x,y+1,-108),new Vector3(.3f,2,.3f),fence);if(i<34)mesh.Box(new Vector3(x+2,y+1.2f,-108),new Vector3(4,.2f,.2f),fence);}
            House(new Vector3(-260,0,0),new Color(.48f,.09f,.055f),40,20,30);
        }
        void Metro()
        {
            var asphalt=Mat("Metro asphalt",new Color(.045f,.055f,.06f));var pavement=Mat("Concrete sidewalks",new Color(.27f,.28f,.27f));var glass=Mat("Tower glazing",new Color(.12f,.26f,.35f),.05f,.06f);var steel=Mat("Tower frame",new Color(.24f,.27f,.28f));
            for(int side=-1;side<=1;side+=2){mesh.Box(new Vector3(side*250,.04f,0),new Vector3(24,.05f,1300),asphalt);mesh.Box(new Vector3(0,.04f,side*250),new Vector3(1300,.05f,24),asphalt);}
            for(int i=0;i<48;i++){int row=i/8,col=i%8;float x=(col-3.5f)*105,z=(row-2.5f)*140;if(Mathf.Abs(x)<180&&Mathf.Abs(z)<180)continue;float h=25+Hash(i)*130;mesh.Box(new Vector3(x,.2f,z),new Vector3(74,.4f,75),pavement);mesh.Box(new Vector3(x,h*.5f,z),new Vector3(42,h,48),glass);for(int floor=0;floor<h/5;floor++)mesh.Box(new Vector3(x,1+floor*5,z),new Vector3(43,.7f,49),steel);for(int k=-2;k<=2;k++)mesh.Box(new Vector3(x+k*8,h*.5f,z-24.2f),new Vector3(.6f,h,.3f),steel);mesh.Box(new Vector3(x,h+2,z),new Vector3(12,4,16),roof);}
        }
        void Harbor()
        {
            var pier=Mat("Harbor concrete",new Color(.3f,.32f,.3f));var safety=Mat("Crane yellow",new Color(.72f,.46f,.06f));mesh.Box(new Vector3(4240,.13f,0),new Vector3(8000,.09f,8000),water);mesh.Box(new Vector3(235,1.2f,0),new Vector3(80,2.4f,520),pier);
            for(int i=0;i<40;i++){var paint=Mat("Container "+i,new Color(.16f+Hash(i)*.3f,.2f+Hash(i+7)*.2f,.2f+Hash(i+20)*.25f));float x=165-i%4*18,z=(i/4-4.5f)*28;mesh.Box(new Vector3(x,3,z),new Vector3(12,6,24),paint);for(int k=-5;k<=5;k++)mesh.Box(new Vector3(x+6.1f,3,z+k*2),new Vector3(.2f,5.8f,.15f),steelMaterial());}
            for(int i=-1;i<=1;i++){Vector3 p=new Vector3(232,0,i*130);mesh.Box(p+Vector3.up*25,new Vector3(3,50,3),safety);mesh.Box(p+new Vector3(20,49,0),new Vector3(65,2,2),safety);mesh.Beam(p+new Vector3(50,49,0),p+new Vector3(50,8,0),.12f,roof);}
        }
        Material steelMaterial()=>roof;
        void Desert()
        {
            var rock=Mat("Red mesa sandstone",new Color(.45f,.22f,.095f),.32f);var cactus=Mat("Desert cactus",new Color(.17f,.26f,.1f));
            for(int i=0;i<100;i++){float a=i*2.39996f,r=210+Hash(i)*700,x=Mathf.Cos(a)*r,z=Mathf.Sin(a)*r,y=SceneryTerrain.Height(Simulator.DisplayConfig,x,z);if(i%3==0){mesh.Cylinder(new Vector3(x,y+4,z),.55f,8,cactus);mesh.Beam(new Vector3(x,y+4,z),new Vector3(x+2,y+5,z),.5f,cactus);mesh.Cylinder(new Vector3(x+2,y+6,z),.4f,3,cactus);}else mesh.Ball(new Vector3(x,y,z),new Vector3(15+Hash(i+4)*35,10+Hash(i+7)*25,20+Hash(i+5)*30),rock);}
        }
        void Lake()
        {mesh.Cylinder(new Vector3(290,.12f,0),151,.1f,water);var timber=Mat("Lakeside dock",new Color(.34f,.24f,.13f));mesh.Box(new Vector3(170,.6f,-25),new Vector3(55,.6f,8),timber);for(int i=0;i<10;i++)mesh.Box(new Vector3(147+i*5,.98f,-25),new Vector3(.15f,.15f,8),roof);}
        void OnDestroy(){Clear();if(sky)Destroy(sky);if(reflection)Destroy(reflection);}
    }
}
