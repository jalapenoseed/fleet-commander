Shader "FleetCommander/AircraftSurface" {
 Properties {
  _Color("Paint and damage",Color)=(.2,.24,.26,1)
  _MainTex("Albedo",2D)="white"{}
  [Normal] _BumpMap("Normal",2D)="bump"{}
  _RoughMap("Roughness",2D)="white"{}
  _MetalMap("Metalness",2D)="white"{}
  _OcclusionMap("Occlusion",2D)="white"{}
  _Metallic("Metallic",Range(0,1))=.2
  _Smoothness("Smoothness",Range(0,1))=.4
  _MappedRoughness("Use roughness map",Float)=0
  _MappedMetallic("Use metalness map",Float)=0
  _Glow("Emission",Float)=0
  _Weave("Carbon weave",Range(0,1))=0
  _Rotor("Rotor surface",Float)=0
  _RotorClock("Rotor clock",Float)=0
  _RotorLayout("Rotor pivots",Vector)=(.5,.15,.4,.25)
  _RotorActive("Rotor active",Float)=0
 }
 SubShader {
  Tags { "RenderType"="Opaque" }
  LOD 200
  CGPROGRAM
  #pragma surface surf Standard fullforwardshadows addshadow vertex:vert
  #pragma target 3.0
  #pragma multi_compile_instancing
  #include "UnityStandardUtils.cginc"
  struct Input { float3 localPos;float2 uv_MainTex; };
  UNITY_INSTANCING_BUFFER_START(Props)
   UNITY_DEFINE_INSTANCED_PROP(float4,_Color)
   UNITY_DEFINE_INSTANCED_PROP(float,_RotorActive)
  UNITY_INSTANCING_BUFFER_END(Props)
  sampler2D _MainTex,_BumpMap,_RoughMap,_MetalMap,_OcclusionMap;
  half _Metallic,_Smoothness,_Glow,_Weave,_MappedRoughness,_MappedMetallic;
  float _Rotor,_RotorClock;float4 _RotorLayout;
  void vert(inout appdata_full v,out Input o) {
   UNITY_SETUP_INSTANCE_ID(v);
   if(_Rotor>.5) {
    float spin=UNITY_ACCESS_INSTANCED_PROP(Props,_RotorActive);
    float a=_RotorClock*67*spin*sign(v.vertex.x*v.vertex.z);
    float sn=sin(a),cs=cos(a);
    float2 pivot=float2(sign(v.vertex.x)*_RotorLayout.x,sign(v.vertex.z)*_RotorLayout.z);
    float2 delta=v.vertex.xz-pivot;
    v.vertex.xz=pivot+float2(delta.x*cs-delta.y*sn,delta.x*sn+delta.y*cs);
    float2 n=v.normal.xz;v.normal.xz=float2(n.x*cs-n.y*sn,n.x*sn+n.y*cs);
    float2 t=v.tangent.xz;v.tangent.xz=float2(t.x*cs-t.y*sn,t.x*sn+t.y*cs);
   }
   UNITY_INITIALIZE_OUTPUT(Input,o);o.localPos=v.vertex.xyz;
  }
  void surf(Input IN,inout SurfaceOutputStandard o) {
   float4 c=UNITY_ACCESS_INSTANCED_PROP(Props,_Color);
   float weave=sin((IN.localPos.x+IN.localPos.z)*170)*sin((IN.localPos.x-IN.localPos.z)*170);
   float wear=1-saturate(c.a);
   float patch=sin(IN.localPos.x*17+IN.localPos.y*31)*sin(IN.localPos.z*21-IN.localPos.x*9)*.5+.5;
   float scorch=saturate((wear-patch*.6)*2.2);
   float3 albedo=tex2D(_MainTex,IN.uv_MainTex).rgb;
   o.Albedo=lerp(c.rgb*albedo*(1+weave*.08*_Weave),float3(.026,.023,.021),scorch*.94);
   o.Normal=UnpackScaleNormal(tex2D(_BumpMap,IN.uv_MainTex),.5);
   o.Metallic=lerp(_Metallic,tex2D(_MetalMap,IN.uv_MainTex).r,_MappedMetallic)*(1-scorch*.75);
   o.Smoothness=lerp(lerp(_Smoothness,1-tex2D(_RoughMap,IN.uv_MainTex).r,_MappedRoughness),.08,scorch);
   o.Occlusion=lerp(1,tex2D(_OcclusionMap,IN.uv_MainTex).r,.6);
   o.Emission=c.rgb*_Glow*c.a;o.Alpha=1;
  }
  ENDCG
 }
 Fallback "Diffuse"
}
