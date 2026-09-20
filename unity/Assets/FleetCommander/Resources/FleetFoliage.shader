Shader "FleetCommander/Foliage" {
 Properties { _MainTex("Foliage atlas",2D)="white"{} _Color("Tint",Color)=(1,1,1,1) _Cutoff("Alpha cutoff",Range(0,1))=.42 }
 SubShader { Tags {"Queue"="AlphaTest" "RenderType"="TransparentCutout"} Cull Off
 CGPROGRAM
 #pragma surface surf Standard fullforwardshadows alphatest:_Cutoff addshadow vertex:vert
 #pragma target 3.0
 sampler2D _MainTex;float4 _Color;
 struct Input {float2 uv_MainTex;};
 void vert(inout appdata_full v){float3 world=mul(unity_ObjectToWorld,v.vertex).xyz;v.vertex.x+=sin(_Time.y*.8+world.z*.2)*.1*saturate(v.vertex.y*.04);v.normal=normalize(float3(v.normal.x,.7,v.normal.z));}
 void surf(Input IN,inout SurfaceOutputStandard o){float4 c=tex2D(_MainTex,IN.uv_MainTex)*_Color;o.Albedo=c.rgb;o.Alpha=c.a;o.Metallic=0;o.Smoothness=.12;o.Emission=c.rgb*.08;}
 ENDCG } Fallback "Transparent/Cutout/Diffuse"
}
