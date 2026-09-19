Shader "FleetCommander/SmokeAndScorch" {
 Properties { _Color("Tint",Color)=(.1,.1,.1,.5) }
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent"} Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off
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
 float4 frag(v2f i):SV_Target {
  UNITY_SETUP_INSTANCE_ID(i);float2 q=(i.uv-.5)*2;
  float grain=.84+.08*sin(q.x*19+q.y*7)+.08*sin(q.x*8-q.y*17);
  float alpha=saturate(1-dot(q,q))*grain;
  float4 c=UNITY_ACCESS_INSTANCED_PROP(Props,_Color);c.a*=alpha*alpha;return c;
 }
 ENDCG }
 }
}
