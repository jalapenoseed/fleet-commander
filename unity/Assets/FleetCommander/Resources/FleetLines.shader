Shader "FleetCommander/Lines" {
 Properties { [HideInInspector] _SrcBlend("Source blend",Float)=5 [HideInInspector] _DstBlend("Destination blend",Float)=1 }
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent"} Blend [_SrcBlend] [_DstBlend] ZWrite Off Cull Off
 Pass { CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct input { float4 vertex:POSITION;float4 color:COLOR; };
 struct output { float4 position:SV_POSITION;float4 color:COLOR; };
 output vert(input v){output o;o.position=UnityObjectToClipPos(v.vertex);o.color=v.color;return o;}
 float4 frag(output i):SV_Target{return i.color;}
 ENDCG }
 }
}
