using UnityEngine;
namespace FleetCommander.Rendering
{
    [RequireComponent(typeof(Camera))] public sealed class FleetBloom : MonoBehaviour
    {
        Material material;
        void Start(){var s=Resources.Load<Shader>("FleetBloom");if(s&&s.isSupported)material=new Material(s);}
        void OnRenderImage(RenderTexture source,RenderTexture destination)
        {
            if(!material){Graphics.Blit(source,destination);return;}
            var a=RenderTexture.GetTemporary(Mathf.Max(1,source.width/4),Mathf.Max(1,source.height/4),0,RenderTextureFormat.ARGBHalf);
            var b=RenderTexture.GetTemporary(a.width,a.height,0,RenderTextureFormat.ARGBHalf);
            Graphics.Blit(source,a,material,0);Graphics.Blit(a,b,material,1);Graphics.Blit(b,a,material,1);material.SetTexture("_Bloom",a);Graphics.Blit(source,destination,material,2);
            RenderTexture.ReleaseTemporary(a);RenderTexture.ReleaseTemporary(b);
        }
        void OnDestroy(){if(material)Destroy(material);}
    }
}
