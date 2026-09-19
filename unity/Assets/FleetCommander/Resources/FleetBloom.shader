Shader "Hidden/FleetCommander/Bloom" {
 Properties { _MainTex("Source",2D)="white"{} _Bloom("Bloom",2D)="black"{} }
 SubShader { Cull Off ZWrite Off ZTest Always
 CGINCLUDE
 #include "UnityCG.cginc"
 sampler2D _MainTex,_Bloom;float4 _MainTex_TexelSize;
 float4 threshold(v2f_img i):SV_Target{float3 c=tex2D(_MainTex,i.uv).rgb;return float4(max(0,c-1),1);}
 float4 blur(v2f_img i):SV_Target{float3 c=0;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)c+=tex2D(_MainTex,i.uv+float2(x,y)*_MainTex_TexelSize.xy*1.5).rgb;return float4(c/9,1);}
 float4 finish(v2f_img i):SV_Target{float3 c=tex2D(_MainTex,i.uv).rgb+tex2D(_Bloom,i.uv).rgb*.28;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);return float4(saturate(c),1);}
 ENDCG
 Pass { CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment threshold
 ENDCG }
 Pass { CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment blur
 ENDCG }
 Pass { CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment finish
 ENDCG }
 }
}
