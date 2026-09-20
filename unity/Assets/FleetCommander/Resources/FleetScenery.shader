Shader "FleetCommander/Scenery" {
 Properties { _Color("Color",Color)=(.4,.5,.3,1) _Noise("Natural variation",Range(0,1))=.25 _Glow("Emission",Float)=0 _Snow("Snow altitude",Float)=9999 _Terrain("Terrain",Float)=0 _Shore("Shore",Float)=0 }
 SubShader { Tags {"RenderType"="Opaque"} CGPROGRAM
 #pragma surface surf Standard fullforwardshadows
 #pragma target 3.0
 struct Input { float3 worldPos; float3 worldNormal; };
 fixed4 _Color; half _Noise,_Glow;float _Snow,_Terrain,_Shore;
 float hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
 float noise(float2 p){float2 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(hash(i),hash(i+float2(1,0)),f.x),lerp(hash(i+float2(0,1)),hash(i+1),f.x),f.y);}
 void surf(Input IN,inout SurfaceOutputStandard o){float n=noise(IN.worldPos.xz*.17)*.65+noise(IN.worldPos.xz*3)*.35;float snow=smoothstep(_Snow-20,_Snow+15,IN.worldPos.y)*smoothstep(.15,.7,IN.worldNormal.y);float3 base=_Color.rgb*(1+(n-.5)*_Noise);base=lerp(base,float3(.30,.31,.27)*(1+(n-.5)*.3),_Terrain*(1-smoothstep(.5,.86,IN.worldNormal.y)));base=lerp(base,float3(.6,.51,.34),_Shore*(1-smoothstep(-210,-130,IN.worldPos.x)));o.Albedo=lerp(base,float3(.88,.92,.97),snow);o.Metallic=0;o.Smoothness=.16;o.Emission=_Color.rgb*_Glow;o.Alpha=1;}
 ENDCG } Fallback "Diffuse"
}
