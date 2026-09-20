using UnityEngine;
namespace FleetCommander.Core
{
    // Rendering, flight clearance and the walking/free cameras use the same height function.
    public static class SceneryTerrain
    {
        public static float Height(FleetConfig c,float x,float z)
        {
            if(c.planet!=PlanetKind.Earth||c.scenery==SceneryKind.Stadium||c.scenery==SceneryKind.Metro)return 0;
            if(c.scenery==SceneryKind.Harbor)return x>240?-1:0;
            float radius=new Vector2(x,z).magnitude;if(radius<180)return 0;float edge=Mathf.SmoothStep(0,1,Mathf.Clamp01((radius-180)/240));
            float a=Mathf.PerlinNoise(x*.0021f+17.3f,z*.0021f+29.1f),b=Mathf.PerlinNoise(x*.0061f+6.3f,z*.0061f+10.8f);
            float h=edge*(a*47+b*13);
            bool alpine=c.scenery==SceneryKind.Alpine||c.scenery==SceneryKind.City;
            if(alpine)
            {
                float ridge=1-Mathf.Abs(2*Mathf.PerlinNoise(x*.0029f+70,z*.0029f+44)-1);
                float distant=Mathf.SmoothStep(0,1,Mathf.Clamp01((radius-480)/420));
                h+=distant*(Mathf.Pow(ridge,2.9f)*230+b*35);
            }
            if(c.scenery==SceneryKind.Overlook)h+=edge*Mathf.PerlinNoise(x*.009f+9,z*.009f)*18;
            if(c.scenery==SceneryKind.City||c.scenery==SceneryKind.RuralTown){float townEdge=Mathf.Max(Mathf.Abs(x)-430,Mathf.Abs(z-225)-65);h*=Mathf.SmoothStep(0,1,Mathf.Clamp01(townEdge/80));}
            if(c.scenery==SceneryKind.ForestLake){float lake=new Vector2(x-290,z).magnitude;h=Mathf.Lerp(-1,h,Mathf.SmoothStep(0,1,Mathf.Clamp01((lake-145)/45)));}
            if(c.scenery==SceneryKind.Coast){float land=Mathf.SmoothStep(0,1,Mathf.Clamp01((x+210)/100));h=Mathf.Lerp(-.7f,h,land);}
            if(c.scenery==SceneryKind.Creek){float center=270+Mathf.Sin(z*.009f)*50,bank=Mathf.SmoothStep(0,1,Mathf.Clamp01((Mathf.Abs(x-center)-25)/28));h=Mathf.Lerp(-.35f,h,bank);}
            return h;
        }
    }
}
