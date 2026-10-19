// Растения поля, нарисованные непрямым инстансингом (Graphics.RenderMeshIndirect).
// Данные каждой кочки берутся из буфера _Stems, который заполняет CropCulling.compute; _SlotOffset — начало участка культуры.
// Меш кочки: высота от 0 до 1 по Y, радиус ~0.5 (масштаб — из буфера). Сетку можно сделать CropMeshFactory.CreateTuft.
Shader "FarmSim/CropInstanced"
{
    Properties
    {
        _BaseMap ("Текстура листа (альфа = вырез)", 2D) = "white" {}
        _Cutoff ("Порог выреза", Range(0, 1)) = 0.4
        _YoungColor ("Молодое", Color) = (0.30, 0.50, 0.17, 1)
        _RipeColor ("Спелое", Color) = (0.86, 0.71, 0.36, 1)
        _WitheredColor ("Погибшее", Color) = (0.40, 0.35, 0.27, 1)
        _BloomColor ("Цветение", Color) = (0.98, 0.83, 0.12, 1)
        _WindStrength ("Сила ветра", Range(0, 0.5)) = 0.09
        _WindFreq ("Частота ветра", Range(0, 5)) = 1.6
        _WindDir ("Направление ветра (x, z)", Vector) = (1, 0.4, 0, 0)
    }

    HLSLINCLUDE
    #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

    struct StemData { float4 posYaw; float4 shape; };
    StructuredBuffer<StemData> _Stems;
    int _SlotOffset;

    TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
    CBUFFER_START(UnityPerMaterial)
        float4 _BaseMap_ST;
        half _Cutoff;
        half4 _YoungColor, _RipeColor, _WitheredColor, _BloomColor;
        half _WindStrength, _WindFreq;
        float4 _WindDir;
    CBUFFER_END

    struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; uint instanceID : SV_InstanceID; };

    // Позиция и нормаль кочки в мире: масштаб по высоте/ширине, поворот, ветер (верх гнётся сильнее корня)
    void StemTransform(Attributes v, out float3 posWS, out float3 nrmWS, out float4 shape)
    {
        StemData d = _Stems[(uint)_SlotOffset + v.instanceID];
        shape = d.shape;
        float3 p = v.positionOS.xyz; p.xz *= d.shape.y; p.y *= d.shape.x;
        float s, c; sincos(d.posYaw.w, s, c);
        float3 pr = float3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
        float t = saturate(v.positionOS.y);
        float phase = dot(d.posYaw.xz, float2(0.31, 0.17));
        float w = sin(_Time.y * _WindFreq + phase) * _WindStrength * t * t * d.shape.x;
        pr.xz += normalize(_WindDir.xy + 1e-5) * w;
        posWS = d.posYaw.xyz + pr;
        float3 n = v.normalOS;
        nrmWS = normalize(float3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c));
    }

    half3 StemColor(float4 shape, float t)
    {
        half3 col = lerp(_YoungColor.rgb, _RipeColor.rgb, smoothstep(0.6, 1.0, shape.z));
        float flags = shape.w;
        if (fmod(flags, 2.0) >= 1.0) col = _WitheredColor.rgb;
        else if (flags >= 2.0 && t > 0.72) col = _BloomColor.rgb;
        return col * (0.45 + 0.55 * t);   // у корня темнее (затенение внутри посева)
    }
    ENDHLSL

    SubShader
    {
        Tags { "RenderType" = "TransparentCutout" "Queue" = "AlphaTest" "RenderPipeline" = "UniversalPipeline" }
        Cull Off

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            struct Varyings { float4 positionCS : SV_POSITION; float3 positionWS : TEXCOORD0; float3 normalWS : TEXCOORD1; float2 uv : TEXCOORD2; half3 color : TEXCOORD3; float fog : TEXCOORD4; };

            Varyings vert(Attributes v)
            {
                Varyings o; float3 posWS, nrmWS; float4 shape;
                StemTransform(v, posWS, nrmWS, shape);
                o.positionWS = posWS; o.normalWS = nrmWS; o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                o.positionCS = TransformWorldToHClip(posWS);
                o.color = StemColor(shape, saturate(v.positionOS.y));
                o.fog = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 frag(Varyings i, bool front : SV_IsFrontFace) : SV_Target
            {
                half4 tex = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv);
                clip(tex.a - _Cutoff);
                float3 n = normalize(i.normalWS) * (front ? 1.0 : -1.0);
                Light ml = GetMainLight(TransformWorldToShadowCoord(i.positionWS));
                half ndl = saturate(dot(n, ml.direction)) * 0.75 + 0.25;          // тонкие листья просвечивают
                half3 col = tex.rgb * i.color * (ml.color * ndl * ml.shadowAttenuation + SampleSH(n));
                return half4(MixFog(col, i.fog), 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ColorMask 0
            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"
            float3 _LightDirection;

            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };
            Varyings vert(Attributes v)
            {
                Varyings o; float3 posWS, nrmWS; float4 shape;
                StemTransform(v, posWS, nrmWS, shape);
                float4 cs = TransformWorldToHClip(ApplyShadowBias(posWS, nrmWS, _LightDirection));
                #if UNITY_REVERSED_Z
                    cs.z = min(cs.z, UNITY_NEAR_CLIP_VALUE);
                #else
                    cs.z = max(cs.z, UNITY_NEAR_CLIP_VALUE);
                #endif
                o.positionCS = cs; o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                return o;
            }
            half4 frag(Varyings i) : SV_Target { clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a - _Cutoff); return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ColorMask R
            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex vert
            #pragma fragment frag
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };
            Varyings vert(Attributes v)
            {
                Varyings o; float3 posWS, nrmWS; float4 shape;
                StemTransform(v, posWS, nrmWS, shape);
                o.positionCS = TransformWorldToHClip(posWS); o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                return o;
            }
            half4 frag(Varyings i) : SV_Target { clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a - _Cutoff); return 0; }
            ENDHLSL
        }
    }
}
