Shader "FleetCommander/Water" {
 Properties { _Color("Water",Color)=(.05,.24,.32,1) }
 SubShader { Tags {"RenderType"="Opaque"} CGPROGRAM
 #pragma surface surf Standard fullforwardshadows
 #pragma target 3.0
 struct Input {float3 worldPos;float3 viewDir;}; fixed4 _Color;float4 _FleetHorizon;
 void surf(Input IN,inout SurfaceOutputStandard o){float2 p=IN.worldPos.xz;float attenuation=1/(1+length(fwidth(p))*.3);float wave=(sin(p.x*.12+p.y*.07+_Time.y*.6)*.025+sin(p.y*.31-_Time.y)*.018)*attenuation;o.Normal=normalize(float3(wave,sin(p.x*.17+p.y*.13-_Time.y*.7)*.035*attenuation,1));float fres=pow(1-saturate(dot(normalize(IN.viewDir),o.Normal)),4);o.Albedo=lerp(_Color.rgb,_FleetHorizon.rgb,fres*.65);o.Smoothness=.92;o.Metallic=.28;o.Emission=_FleetHorizon.rgb*fres*.12;o.Alpha=1;}
 ENDCG } Fallback "Diffuse"
}
