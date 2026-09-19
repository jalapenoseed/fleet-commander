Shader "FleetCommander/Beacon" {
 Properties { _Color("Tint",Color)=(1,1,1,1) }
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent"} Blend One One ZWrite Off Cull Off
 Pass { CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #pragma multi_compile_instancing
 #include "UnityCG.cginc"
 struct appdata {float4 vertex:POSITION;float2 uv:TEXCOORD0;UNITY_VERTEX_INPUT_INSTANCE_ID};
 struct v2f {float4 pos:SV_POSITION;float2 uv:TEXCOORD0;UNITY_VERTEX_INPUT_INSTANCE_ID};
 UNITY_INSTANCING_BUFFER_START(Props)
 UNITY_DEFINE_INSTANCED_PROP(float4,_Color)
 UNITY_INSTANCING_BUFFER_END(Props)
 v2f vert(appdata v){v2f o;UNITY_SETUP_INSTANCE_ID(v);UNITY_TRANSFER_INSTANCE_ID(v,o);o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.uv;return o;}
 float4 frag(v2f i):SV_Target{UNITY_SETUP_INSTANCE_ID(i);float r=length(i.uv-.5)*2;float glow=pow(saturate(1-r),3);return UNITY_ACCESS_INSTANCED_PROP(Props,_Color)*glow;}
 ENDCG }
 }
}
