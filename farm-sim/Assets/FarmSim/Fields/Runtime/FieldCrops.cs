// Справочник культур: сколько стадий растёт, когда готова к уборке, сколько даёт урожая.
// Позже переедет в ScriptableObject (чтобы настраивать в редакторе Unity), формат данных тот же.
namespace FarmSim.Fields
{
    public readonly struct CropDef
    {
        public readonly CropType Type;
        public readonly string Name;
        public readonly int ReadyStage;      // стадия, на которой можно убирать (растёт со стадии 1 до ReadyStage)
        public readonly int WitherStage;     // если не убрать — через период погибает (урожай 0)
        public readonly float LitersPerM2;   // базовый урожай с 1 м² при идеальных условиях
        public readonly bool Regrows;        // отрастает после уборки (трава) — пока не используется

        public CropDef(CropType t, string name, int ready, float litersPerM2, bool regrows = false)
        {
            Type = t; Name = name; ReadyStage = ready; WitherStage = ready + 1; LitersPerM2 = litersPerM2; Regrows = regrows;
        }
    }

    public static class FieldCrops
    {
        // Числа — стартовый баланс, их можно менять без переделки кода.
        static readonly CropDef[] Defs =
        {
            new CropDef(CropType.None, "—", 0, 0f),
            new CropDef(CropType.Wheat, "Пшеница", 8, 0.90f),
            new CropDef(CropType.Barley, "Ячмень", 7, 0.95f),
            new CropDef(CropType.Oat, "Овёс", 5, 0.75f),
            new CropDef(CropType.Canola, "Рапс", 9, 0.50f),
            new CropDef(CropType.Corn, "Кукуруза", 7, 1.10f),
            new CropDef(CropType.Sunflower, "Подсолнечник", 8, 0.55f),
            new CropDef(CropType.Soybean, "Соя", 7, 0.40f),
            new CropDef(CropType.Potato, "Картофель", 7, 4.00f),
            new CropDef(CropType.SugarBeet, "Сахарная свёкла", 8, 6.50f),
        };

        public static CropDef Get(CropType t) => (int)t < Defs.Length ? Defs[(int)t] : Defs[0];
        public static bool IsReady(uint s) { var c = FieldCell.Crop(s); return c != CropType.None && FieldCell.Growth(s) == Get(c).ReadyStage; }

        /// <summary>
        /// Множитель урожая клетки (1.0 = норма). Удобрение до +30%, без извести −15%, давно не пахали −15%,
        /// сорняки до −30%, камни до −15%, прикатано +2.5%, сухая земля −20%.
        /// </summary>
        public static float YieldFactor(uint s)
        {
            float k = 1f + 0.15f * System.Math.Min(FieldCell.Fert(s), 2);
            if (!FieldCell.Lime(s)) k -= 0.15f;
            if (FieldCell.PlowNeed(s) >= FieldCell.MaxPlowNeed) k -= 0.15f;
            int w = FieldCell.Weeds(s);
            if (w >= 1 && w <= 3) k -= 0.10f; else if (w >= 4 && w <= 6) k -= 0.30f;
            k -= 0.05f * FieldCell.Stones(s);
            if (FieldCell.Rolled(s)) k += 0.025f;
            if (FieldCell.Moisture(s) <= 1) k -= 0.20f;
            return k < 0f ? 0f : k;
        }
    }
}
