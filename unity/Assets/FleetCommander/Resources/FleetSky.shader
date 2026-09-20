Shader "FleetCommander/Sky" {
 Properties { _Top("Zenith",Color)=(.04,.3,.7,1) _Horizon("Horizon",Color)=(.65,.8,.95,1) _Stars("Stars",Float)=0 _Galaxy("Milky Way",Float)=0 _Clouds("Clouds",Float)=.4 _SunDir("Sun direction",Vector)=(.2,.6,.5,0) _Night("Moon",Float)=0 }
 SubShader { Tags {"Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox"} Cull Off ZWrite Off
 Pass { CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct v2f {float4 pos:SV_POSITION;float3 ray:TEXCOORD0;};
 float4 _Top,_Horizon,_SunDir;float _Stars,_Galaxy,_Clouds,_Night;
 v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.ray=v.vertex.xyz;return o;}
 float hash(float3 p){return frac(sin(dot(p,float3(127.1,311.7,74.7)))*43758.5453);}
 float n(float3 p){float3 i=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(lerp(hash(i),hash(i+float3(1,0,0)),f.x),lerp(hash(i+float3(0,1,0)),hash(i+float3(1,1,0)),f.x),f.y),lerp(lerp(hash(i+float3(0,0,1)),hash(i+float3(1,0,1)),f.x),lerp(hash(i+float3(0,1,1)),hash(i+1),f.x),f.y),f.z);}
 float fbm(float3 p){return n(p)*.57+n(p*2.03)*.28+n(p*4.1)*.1+n(p*8.2)*.05;}
 fixed4 frag(v2f i):SV_Target{
 float3 d=normalize(i.ray);float h=saturate(d.y);float3 col=lerp(_Horizon.rgb,_Top.rgb,pow(h,.45));
 float sun=saturate(dot(d,normalize(_SunDir.xyz)));float glow=pow(sun,24)*.2+pow(sun,256)*.6;float disc=smoothstep(.9995,.9998,sun);col+=lerp(float3(1,.84,.6),float3(.65,.78,1),_Night)*(glow*(1-_Night*.8)+disc*2);
 if(_Stars>.01&&d.y>0){float3 cell=floor(d*650);float star=step(.9965,hash(cell));float dotStar=pow(saturate(1-length(frac(d*650)-.5)*2),5);col+=star*dotStar*4*_Stars*smoothstep(0,.15,h);}
 float band=exp(-pow(dot(d,normalize(float3(.45,.45,-.65)))*7,2));float gal=band*fbm(d*30)*(.5+fbm(d*95));col+=float3(.27,.33,.5)*gal*_Galaxy*smoothstep(0,.18,h);
 float3 p=d/(max(.14,d.y)) * 3.0;p.x+=_Time.y*.004;float cloud=smoothstep(.5-.15*_Clouds,.72,fbm(p))*smoothstep(.01,.14,h)*saturate(_Clouds*2);float3 cloudColor=lerp(_Horizon.rgb*.8,float3(1,1,.98),saturate(h+sun*.4))*(1-_Night*.85);col=lerp(col,cloudColor,cloud);
 return float4(col,1);}
 ENDCG }
 } Fallback Off
}
