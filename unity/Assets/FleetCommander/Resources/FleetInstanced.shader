Shader "FleetCommander/InstancedHull" {
 Properties { _Color("Tint",Color)=(.2,.24,.26,1) _Glow("Glow",Float)=0 }
 SubShader {
  Tags { "RenderType"="Opaque" }
  LOD 200
  CGPROGRAM
  #pragma surface surf Standard fullforwardshadows addshadow
  #pragma target 3.0
  #pragma multi_compile_instancing
  struct Input { float3 worldPos; };
  UNITY_INSTANCING_BUFFER_START(Props)
   UNITY_DEFINE_INSTANCED_PROP(float4,_Color)
  UNITY_INSTANCING_BUFFER_END(Props)
  float _Glow;
  void surf(Input IN,inout SurfaceOutputStandard o) {
   float4 c=UNITY_ACCESS_INSTANCED_PROP(Props,_Color);
   o.Albedo=c.rgb; o.Metallic=.55; o.Smoothness=.55; o.Emission=c.rgb*_Glow; o.Alpha=1;
  }
  ENDCG
 }
 Fallback "Diffuse"
}
