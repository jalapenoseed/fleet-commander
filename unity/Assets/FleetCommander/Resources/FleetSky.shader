Shader "FleetCommander/Sky" {
 Properties { _Top("Zenith",Color)=(.02,.04,.1,1) _Horizon("Horizon",Color)=(.3,.2,.2,1) _Stars("Stars",Float)=0 }
 SubShader { Tags {"Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox"} Cull Off ZWrite Off
 Pass { CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct v2f{float4 pos:SV_POSITION;float3 dir:TEXCOORD0;};
 v2f vert(float4 v:POSITION){v2f o;o.pos=UnityObjectToClipPos(v);o.dir=v.xyz;return o;}
 float4 _Top,_Horizon;float _Stars;
 float4 frag(v2f i):SV_Target{float3 d=normalize(i.dir);float h=saturate(d.y);float3 c=lerp(_Horizon.rgb,_Top.rgb,pow(h,.4));float3 cell=floor(d*700);float s=frac(sin(dot(cell,float3(12.9898,78.233,37.719)))*43758.5453);c+=step(.9996,s)*_Stars*saturate(h*3)*.8;return float4(c,1);}
 ENDCG }
 }
}
