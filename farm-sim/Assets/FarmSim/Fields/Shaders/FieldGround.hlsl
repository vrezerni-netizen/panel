// Чтение состояний поля в шейдерах (URP, Shader Graph → узел Custom Function, режим File, этот файл).
// Раскладка бит совпадает с FieldCell.cs. Текстуру и параметры выставляет FieldManager как глобальные:
//   _FieldStateTex  (RGBA32, 1 пиксель = 1 клетка, 4 байта = uint состояния)
//   _FieldParams    = (originX, originZ, 1/cellSize, cellSize)
//   _FieldSizeCells = (ширина, высота, 1/ширина, 1/высота)
// ВАЖНО: в Shader Graph эти три имени НЕ добавлять в Blackboard (иначе станут свойствами материала и перекроют глобальные).
//
// Как устроен грунт:
//   1) FieldGround_float даёт веса слоёв (трава, стерня, культивация, пахота, посев) с мягкими краями:
//      смешиваются 4 соседние клетки (ручная билинейная интерполяция) + шум, поэтому край полосы не «пиксельный».
//   2) FieldFurrowUV_float поворачивает UV текстуры борозд по направлению прохода (угол из клетки, шаг 22.5°).
//   3) FieldFurrowNormal_float возвращает нормаль из повёрнутой текстуры обратно в оси ландшафта.
//   Итог в графе: albedo/normal/roughness = смесь слоёв по весам; у пахоты/культивации/посева — нормаль борозд (+ Parallax Occlusion по желанию).
//   4) FieldCrop_float — для вершинного шейдера растений: какая культура и какая стадия под этой точкой.
#ifndef FARMSIM_FIELD_GROUND_INCLUDED
#define FARMSIM_FIELD_GROUND_INCLUDED

TEXTURE2D(_FieldStateTex);
float4 _FieldParams;
float4 _FieldSizeCells;

// ---------------------------------------------------------------- чтение клетки
uint FS_Load(int2 c)
{
    c = clamp(c, int2(0, 0), int2(_FieldSizeCells.xy) - 1);
    uint4 b = (uint4)round(LOAD_TEXTURE2D(_FieldStateTex, c) * 255.0);
    return b.r | (b.g << 8) | (b.b << 16) | (b.a << 24);
}
float2 FS_CellCoord(float3 worldPos) { return (worldPos.xz - _FieldParams.xy) * _FieldParams.z; }   // в клетках, непрерывно

uint FS_Ground(uint s)   { return s & 15u; }
uint FS_Angle(uint s)    { return (s >> 4) & 7u; }
uint FS_Rolled(uint s)   { return (s >> 7) & 1u; }
uint FS_Crop(uint s)     { return (s >> 8) & 31u; }
uint FS_Growth(uint s)   { return (s >> 13) & 15u; }
uint FS_Fert(uint s)     { return (s >> 17) & 3u; }
uint FS_Weeds(uint s)    { return (s >> 19) & 7u; }
uint FS_Lime(uint s)     { return (s >> 22) & 1u; }
uint FS_Straw(uint s)    { return (s >> 26) & 1u; }
uint FS_Stones(uint s)   { return (s >> 27) & 3u; }
uint FS_Moisture(uint s) { return (s >> 29) & 7u; }

// GroundType: 0 None, 1 Grass, 2 Stubble, 3 Cultivated, 4 Plowed, 5 Seeded
void FS_Weights(uint s, out float4 a, out float2 b)
{
    uint g = FS_Ground(s);
    a = float4(g == 1u, g == 2u, g == 3u, g == 4u);
    b = float2(g == 5u, g == 0u);
}

float FS_Hash(float2 p) { p = frac(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return frac(p.x * p.y); }
float FS_Noise(float2 p)
{
    float2 i = floor(p), f = frac(p); f = f * f * (3.0 - 2.0 * f);
    return lerp(lerp(FS_Hash(i), FS_Hash(i + float2(1, 0)), f.x), lerp(FS_Hash(i + float2(0, 1)), FS_Hash(i + float2(1, 1)), f.x), f.y);
}

// ---------------------------------------------------------------- грунт
// WorldPos — мировая позиция пикселя; EdgeNoise — насколько «рвать» край полосы (0..1 клетки, хорошо 0.35).
// GroundA = веса (трава, стерня, культивация, пахота); GroundB = (посев, «не поле»). Сумма всех весов = 1.
// FurrowDir — направление борозд в мире (x, z); Rolled/Moisture/Fertilizer/Weeds/Straw — 0..1 для оттенков и деталей.
void FieldGround_float(float3 WorldPos, float EdgeNoise, out float4 GroundA, out float2 GroundB, out float2 FurrowDir,
                       out float Rolled, out float Moisture, out float Fertilizer, out float Weeds, out float Straw)
{
    float2 p = FS_CellCoord(WorldPos) - 0.5;
    p += (float2(FS_Noise(WorldPos.xz * 1.3), FS_Noise(WorldPos.xz * 1.3 + 17.0)) - 0.5) * EdgeNoise;
    int2 i0 = (int2)floor(p); float2 f = frac(p);
    uint s00 = FS_Load(i0), s10 = FS_Load(i0 + int2(1, 0)), s01 = FS_Load(i0 + int2(0, 1)), s11 = FS_Load(i0 + int2(1, 1));

    float4 a00, a10, a01, a11; float2 b00, b10, b01, b11;
    FS_Weights(s00, a00, b00); FS_Weights(s10, a10, b10); FS_Weights(s01, a01, b01); FS_Weights(s11, a11, b11);
    GroundA = lerp(lerp(a00, a10, f.x), lerp(a01, a11, f.x), f.y);
    GroundB = lerp(lerp(b00, b10, f.x), lerp(b01, b11, f.x), f.y);

    float m = lerp(lerp(FS_Moisture(s00), FS_Moisture(s10), f.x), lerp(FS_Moisture(s01), FS_Moisture(s11), f.x), f.y);
    Moisture = m / 7.0;

    // дискретные признаки — из ближайшей клетки
    uint sn = f.y < 0.5 ? (f.x < 0.5 ? s00 : s10) : (f.x < 0.5 ? s01 : s11);
    float ang = FS_Angle(sn) * (3.14159265 / 8.0);          // 0..157.5°, от оси +Z по часовой
    FurrowDir = float2(sin(ang), cos(ang));
    Rolled = FS_Rolled(sn);
    Fertilizer = FS_Fert(sn) / 3.0;
    uint w = FS_Weeds(sn); Weeds = (w >= 1u && w <= 6u) ? w / 6.0 : 0.0;
    Straw = FS_Straw(sn);
}

// UV для текстуры борозд: U — поперёк борозд, V — вдоль. Spacing — метров на один повтор текстуры (например 1.5).
void FieldFurrowUV_float(float3 WorldPos, float2 FurrowDir, float Spacing, out float2 UV)
{
    float2 side = float2(FurrowDir.y, -FurrowDir.x);
    UV = float2(dot(WorldPos.xz, side), dot(WorldPos.xz, FurrowDir)) / Spacing;
}

// Нормаль из повёрнутой текстуры борозд (tangent space текстуры) → tangent space ландшафта (касательная = +X, бинормаль = +Z).
void FieldFurrowNormal_float(float3 NormalTS, float2 FurrowDir, out float3 Out)
{
    float2 side = float2(FurrowDir.y, -FurrowDir.x);
    float2 xz = NormalTS.x * side + NormalTS.y * FurrowDir;
    Out = normalize(float3(xz.x, xz.y, NormalTS.z));
}

// ---------------------------------------------------------------- готовая поверхность поля (один узел в Shader Graph)
// Входы-текстуры в узле Custom Function объявлять как Texture2D (в коде это UnityTexture2D).
// Tiling — повторов текстуры на метр (0.25 = раз в 4 м); FurrowSpacing — метров между бороздами плуга (~1.2);
// EdgeNoise — рваность края полосы в клетках (0.35).
// Выход: Albedo, NormalTS (tangent space ландшафта), Smoothness и FieldMask (1 — поле, 0 — не поле: там можно показать свои слои террейна).
void FieldSoilSurface_float(float3 WorldPos,
    UnityTexture2D GrassTex, UnityTexture2D StubbleTex, UnityTexture2D CultivatedTex, UnityTexture2D PlowedTex, UnityTexture2D SeededTex,
    UnityTexture2D FurrowNormalTex, float Tiling, float FurrowSpacing, float EdgeNoise,
    out float3 Albedo, out float3 NormalTS, out float Smoothness, out float FieldMask)
{
    float4 wA; float2 wB; float2 dir; float rolled, moist, fert, weeds, straw;
    FieldGround_float(WorldPos, EdgeNoise, wA, wB, dir, rolled, moist, fert, weeds, straw);

    // цвет: у каждого слоя свой сдвиг UV, чтобы повторы текстур не совпадали; пахота — вдоль борозд
    float2 uv = WorldPos.xz * Tiling;
    float2 uvPlow, uvCult, uvSeed;
    FieldFurrowUV_float(WorldPos, dir, FurrowSpacing, uvPlow);
    FieldFurrowUV_float(WorldPos, dir, FurrowSpacing * 0.45, uvCult);   // культиватор — мельче и чаще
    FieldFurrowUV_float(WorldPos, dir, FurrowSpacing * 0.25, uvSeed);   // рядки сеялки ~30 см
    float3 cGrass = SAMPLE_TEXTURE2D(GrassTex.tex, GrassTex.samplerstate, uv).rgb;
    float3 cStub  = SAMPLE_TEXTURE2D(StubbleTex.tex, StubbleTex.samplerstate, uv + 0.37).rgb;
    float3 cCult  = SAMPLE_TEXTURE2D(CultivatedTex.tex, CultivatedTex.samplerstate, uv + 0.71).rgb;
    float3 cPlow  = SAMPLE_TEXTURE2D(PlowedTex.tex, PlowedTex.samplerstate, uvPlow * float2(1.0, 0.25)).rgb;
    float3 cSeed  = SAMPLE_TEXTURE2D(SeededTex.tex, SeededTex.samplerstate, uv + 0.13).rgb;
    float wGrass = wA.x + wB.y;                                           // «не поле» тоже трава (если FieldMask не используется)
    Albedo = cGrass * wGrass + cStub * wA.y + cCult * wA.z + cPlow * wA.w + cSeed * wB.x;
    Albedo = lerp(Albedo, Albedo * float3(1.12, 1.07, 0.88), straw * wA.y);   // солома на стерне — светлее и желтее

    // влажная голая земля темнее и глянцевее
    float soil = wA.z + wA.w + wB.x;
    Albedo *= lerp(1.0, 0.72, moist * soil);
    Smoothness = lerp(0.06, 0.32, moist * soil);

    // борозды: одна карта нормалей с разным шагом; каток приминает рельеф
    float3 nPlow = UnpackNormal(SAMPLE_TEXTURE2D(FurrowNormalTex.tex, FurrowNormalTex.samplerstate, uvPlow));
    float3 nCult = UnpackNormal(SAMPLE_TEXTURE2D(FurrowNormalTex.tex, FurrowNormalTex.samplerstate, uvCult));
    float3 nSeed = UnpackNormal(SAMPLE_TEXTURE2D(FurrowNormalTex.tex, FurrowNormalTex.samplerstate, uvSeed));
    float3 tPlow, tCult, tSeed;
    FieldFurrowNormal_float(nPlow, dir, tPlow); FieldFurrowNormal_float(nCult, dir, tCult); FieldFurrowNormal_float(nSeed, dir, tSeed);
    float2 xy = tPlow.xy * wA.w + tCult.xy * (wA.z * 0.55) + tSeed.xy * (wB.x * 0.7);
    xy *= 1.0 - rolled * 0.6;
    NormalTS = normalize(float3(xy, 1.0));
    FieldMask = 1.0 - wB.y;
}

// ---------------------------------------------------------------- растения (вершинный шейдер)
// CropId — номер культуры этого материала (CropType), ReadyStage — стадия созревания (FieldCrops).
// Height01: 0 — здесь нет этой культуры (вершины сплющиваются в землю), иначе 0..1 по стадии роста; Withered = 1, если погибло.
void FieldCrop_float(float3 WorldPos, float CropId, float ReadyStage, out float Height01, out float Withered)
{
    uint s = FS_Load((int2)floor(FS_CellCoord(WorldPos)));
    bool here = FS_Crop(s) == (uint)round(CropId) && FS_Ground(s) == 5u;
    float g = FS_Growth(s);
    Height01 = here ? saturate(g / max(ReadyStage, 1.0)) : 0.0;
    Withered = here && g > ReadyStage ? 1.0 : 0.0;
}

#endif
