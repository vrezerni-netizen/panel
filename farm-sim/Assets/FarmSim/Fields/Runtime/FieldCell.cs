// Состояние одной клетки поля упаковано в одно 32-битное число (uint).
// Тот же порядок бит читает шейдер грунта (FieldGround.hlsl), поэтому раскладку менять только вместе с ним.
//
//  биты   поле            значения
//  0-3    Ground   (4)    тип грунта: GroundType
//  4-6    Angle    (3)    направление борозд: 0..7, шаг 22.5° (0..157.5°, борозда симметрична)
//  7      Rolled   (1)    прикатано катком
//  8-12   Crop     (5)    культура: CropType (0 = пусто)
//  13-16  Growth   (4)    стадия роста 0..15 (смысл стадий — в FieldCrops)
//  17-18  Fert     (2)    уровень удобрения 0..3
//  19-21  Weeds    (3)    сорняки: 0 нет, 1..3 мелкие, 4..6 крупные, 7 погибшие (после гербицида)
//  22     Lime     (1)    известковано
//  23     FertNow  (1)    в этот период роста уже удобряли (защита от двойного внесения за один проход)
//  24-25  PlowNeed (2)    сколько уборок прошло без вспашки 0..3 (3 = нужна вспашка, урожай ниже)
//  26     Straw    (1)    на поле лежит солома / стерня не измельчена
//  27-28  Stones   (2)    камни 0..3
//  29-31  Moisture (3)    влажность почвы 0..7
//
// Клетка = 4 байта. Поле 1×1 км при клетке 0.5 м = 2048×2048 клеток = 16 МБ (CPU) + 16 МБ (GPU, RGBA32).
// На CPU память выделяется только чанкам, где есть поля (см. FieldGrid), поэтому обычно в 2–3 раза меньше.
namespace FarmSim.Fields
{
    /// <summary>Тип обработки грунта в клетке.</summary>
    public enum GroundType : byte
    {
        None = 0,        // не поле (дорога, луг, лес) — орудия здесь не работают
        Grass = 1,       // необработанная земля / дернина
        Stubble = 2,     // стерня после уборки
        Cultivated = 3,  // культивировано
        Plowed = 4,      // вспахано (глубокие борозды)
        Seeded = 5,      // засеяно (рядки сеялки)
    }

    /// <summary>Культура. Числа хранятся в 5 битах: до 31 культуры.</summary>
    public enum CropType : byte
    {
        None = 0,
        Wheat = 1,
        Barley = 2,
        Oat = 3,
        Canola = 4,
        Corn = 5,
        Sunflower = 6,
        Soybean = 7,
        Potato = 8,
        SugarBeet = 9,
    }

    /// <summary>Упаковка и распаковка полей клетки. Всё через сдвиги и маски — без выделения памяти.</summary>
    public static class FieldCell
    {
        public const int GroundShift = 0, GroundBits = 4;
        public const int AngleShift = 4, AngleBits = 3;
        public const int RolledShift = 7;
        public const int CropShift = 8, CropBits = 5;
        public const int GrowthShift = 13, GrowthBits = 4;
        public const int FertShift = 17, FertBits = 2;
        public const int WeedsShift = 19, WeedsBits = 3;
        public const int LimeShift = 22;
        public const int FertNowShift = 23;
        public const int PlowNeedShift = 24, PlowNeedBits = 2;
        public const int StrawShift = 26;
        public const int StonesShift = 27, StonesBits = 2;
        public const int MoistureShift = 29, MoistureBits = 3;

        public const int MaxFert = 3, MaxWeeds = 7, WeedsDead = 7, MaxPlowNeed = 3, MaxStones = 3, MaxMoisture = 7, MaxGrowth = 15;
        public const int AngleSteps = 8;   // 180° / 8 = 22.5°

        static uint Mask(int bits) => (1u << bits) - 1u;
        static uint Get(uint s, int shift, int bits) => (s >> shift) & Mask(bits);
        static uint Set(uint s, int shift, int bits, uint v) => (s & ~(Mask(bits) << shift)) | ((v & Mask(bits)) << shift);
        static bool Flag(uint s, int shift) => ((s >> shift) & 1u) != 0;
        static uint SetFlag(uint s, int shift, bool v) => v ? s | (1u << shift) : s & ~(1u << shift);

        public static GroundType Ground(uint s) => (GroundType)Get(s, GroundShift, GroundBits);
        public static uint WithGround(uint s, GroundType g) => Set(s, GroundShift, GroundBits, (uint)g);
        public static int Angle(uint s) => (int)Get(s, AngleShift, AngleBits);
        public static uint WithAngle(uint s, int a) => Set(s, AngleShift, AngleBits, (uint)a);
        public static bool Rolled(uint s) => Flag(s, RolledShift);
        public static uint WithRolled(uint s, bool v) => SetFlag(s, RolledShift, v);
        public static CropType Crop(uint s) => (CropType)Get(s, CropShift, CropBits);
        public static uint WithCrop(uint s, CropType c) => Set(s, CropShift, CropBits, (uint)c);
        public static int Growth(uint s) => (int)Get(s, GrowthShift, GrowthBits);
        public static uint WithGrowth(uint s, int g) => Set(s, GrowthShift, GrowthBits, (uint)Clamp(g, 0, MaxGrowth));
        public static int Fert(uint s) => (int)Get(s, FertShift, FertBits);
        public static uint WithFert(uint s, int f) => Set(s, FertShift, FertBits, (uint)Clamp(f, 0, MaxFert));
        public static int Weeds(uint s) => (int)Get(s, WeedsShift, WeedsBits);
        public static uint WithWeeds(uint s, int w) => Set(s, WeedsShift, WeedsBits, (uint)Clamp(w, 0, MaxWeeds));
        public static bool Lime(uint s) => Flag(s, LimeShift);
        public static uint WithLime(uint s, bool v) => SetFlag(s, LimeShift, v);
        public static bool FertNow(uint s) => Flag(s, FertNowShift);
        public static uint WithFertNow(uint s, bool v) => SetFlag(s, FertNowShift, v);
        public static int PlowNeed(uint s) => (int)Get(s, PlowNeedShift, PlowNeedBits);
        public static uint WithPlowNeed(uint s, int v) => Set(s, PlowNeedShift, PlowNeedBits, (uint)Clamp(v, 0, MaxPlowNeed));
        public static bool Straw(uint s) => Flag(s, StrawShift);
        public static uint WithStraw(uint s, bool v) => SetFlag(s, StrawShift, v);
        public static int Stones(uint s) => (int)Get(s, StonesShift, StonesBits);
        public static uint WithStones(uint s, int v) => Set(s, StonesShift, StonesBits, (uint)Clamp(v, 0, MaxStones));
        public static int Moisture(uint s) => (int)Get(s, MoistureShift, MoistureBits);
        public static uint WithMoisture(uint s, int v) => Set(s, MoistureShift, MoistureBits, (uint)Clamp(v, 0, MaxMoisture));

        /// <summary>Направление движения орудия (в градусах от оси +Z по часовой) в индекс угла борозды 0..7.</summary>
        public static int AngleFromHeading(float headingDeg)
        {
            float a = headingDeg % 180f; if (a < 0f) a += 180f;            // борозда на 0° и на 180° одна и та же
            return (int)System.Math.Round(a / (180f / AngleSteps)) % AngleSteps;
        }

        /// <summary>Свежая клетка поля: необработанная земля средней влажности.</summary>
        public static uint NewFieldCell(GroundType g = GroundType.Grass) => WithMoisture(WithGround(0u, g), 4);

        static int Clamp(int v, int a, int b) => v < a ? a : v > b ? b : v;

        /// <summary>Строка для отладки: «Plowed a3 Wheat g4 f1 w0 …».</summary>
        public static string Describe(uint s) =>
            $"{Ground(s)} a{Angle(s)} {(Rolled(s) ? "R " : "")}{Crop(s)} g{Growth(s)} f{Fert(s)}{(FertNow(s) ? "*" : "")} w{Weeds(s)} {(Lime(s) ? "L " : "")}p{PlowNeed(s)} {(Straw(s) ? "S " : "")}st{Stones(s)} m{Moisture(s)}";
    }
}
