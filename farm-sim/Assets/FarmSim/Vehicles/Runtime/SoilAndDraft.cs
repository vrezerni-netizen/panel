// Как почва под колесом и орудие в земле влияют на трактор. Чистый C#, данные берутся из клетки поля (FieldCell).
//  • SoilResponse: сопротивление качению, сцепление шин, насколько колесо проседает (для вида и следов).
//  • ImplementDraft: тяговое сопротивление орудия в земле (плуг тянуть тяжелее всего).
using FarmSim.Fields;

namespace FarmSim.Vehicles
{
    public struct SoilResponse
    {
        public float RollingCoef;   // доля веса, которая уходит в сопротивление качению
        public float Grip;          // коэффициент сцепления μ (асфальт ≈ 0.9)
        public float SinkM;         // насколько шина проседает, м

        public static readonly SoilResponse Road = new SoilResponse { RollingCoef = 0.015f, Grip = 0.9f, SinkM = 0f };

        /// <summary>Почва по состоянию клетки. Клетка «не поле» — дорога или луг вне полей (как дорога, если onRoad).</summary>
        public static SoilResponse FromCell(uint s, bool onRoad = false)
        {
            SoilResponse r;
            switch (FieldCell.Ground(s))
            {
                case GroundType.None: return onRoad ? Road : new SoilResponse { RollingCoef = 0.035f, Grip = 0.75f, SinkM = 0.01f };
                case GroundType.Grass: r = new SoilResponse { RollingCoef = 0.04f, Grip = 0.72f, SinkM = 0.01f }; break;
                case GroundType.Stubble: r = new SoilResponse { RollingCoef = 0.05f, Grip = 0.75f, SinkM = 0.015f }; break;
                case GroundType.Cultivated: r = new SoilResponse { RollingCoef = 0.09f, Grip = 0.58f, SinkM = 0.04f }; break;
                case GroundType.Plowed: r = new SoilResponse { RollingCoef = 0.12f, Grip = 0.52f, SinkM = 0.07f }; break;
                case GroundType.Seeded: r = new SoilResponse { RollingCoef = 0.08f, Grip = 0.6f, SinkM = 0.035f }; break;
                default: r = Road; break;
            }
            int m = FieldCell.Moisture(s);
            if (m >= 6) { r.Grip *= 0.78f; r.RollingCoef *= 1.3f; r.SinkM *= 1.5f; }       // мокро: скользко и вязко
            else if (m <= 1) { r.Grip *= 1.05f; r.RollingCoef *= 0.9f; }                    // сухо и твёрдо
            if (FieldCell.Rolled(s)) { r.RollingCoef *= 0.85f; r.SinkM *= 0.6f; }            // прикатано — плотнее
            return r;
        }
    }

    public static class ImplementDraft
    {
        /// <summary>Тяговое сопротивление на метр ширины захвата, Н (при средней почве и 10 км/ч).</summary>
        public static float PerMeterN(FieldOpKind kind)
        {
            switch (kind)
            {
                case FieldOpKind.Plow: return 9000f;        // плуг на 25 см
                case FieldOpKind.Cultivate: return 3000f;
                case FieldOpKind.Sow: return 1600f;
                case FieldOpKind.Roll: return 900f;
                case FieldOpKind.Weed: return 700f;
                case FieldOpKind.Mulch: return 1200f;
                case FieldOpKind.StonePick: return 1500f;
                default: return 0f;                         // разбрасыватель, опрыскиватель, жатка не тянут землю
            }
        }

        /// <summary>
        /// Сила, с которой орудие в земле тормозит трактор, Н. Растёт со скоростью; рыхлую землю тянуть легче, мокрую — тяжелее.
        /// </summary>
        public static float ForceN(FieldOpKind kind, float widthM, float speedKmh, uint soilUnderTool)
        {
            float k = PerMeterN(kind); if (k <= 0f) return 0f;
            var g = FieldCell.Ground(soilUnderTool);
            if (g == GroundType.None) return 0f;                              // орудие не в поле — не пашет
            float soil = g == GroundType.Plowed || g == GroundType.Cultivated ? 0.7f : 1f;
            if (FieldCell.Moisture(soilUnderTool) >= 6) soil *= 1.15f;
            float speed = 0.8f + 0.02f * speedKmh;                            // 10 км/ч → 1.0
            return k * widthM * soil * speed;
        }
    }
}
