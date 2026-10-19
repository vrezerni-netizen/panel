// Логика навески и ВОМ без Unity: гидравлика подъёма, вал отбора мощности, проверка «можно ли прицепить».
using System;

namespace FarmSim.Vehicles
{
    public enum AttachType : byte
    {
        ThreePoint,   // 3-точечная навеска: орудие поднимается гидравликой трактора (плуг, культиватор, сеялка)
        Drawbar,      // прицепное на дышле: орудие едет на своих колёсах и поворачивается за трактором
    }

    /// <summary>Гидравлика подъёма: 0 — внизу (рабочее положение), 1 — поднято (транспортное).</summary>
    [Serializable]
    public class HydraulicLift
    {
        public float Speed = 0.7f;            // доля хода в секунду (полный подъём ≈ 1.4 с)
        public float Position = 1f;
        public float Target = 1f;
        /// <summary>Орудие опущено настолько, что работает.</summary>
        public bool IsDown => Position <= 0.05f;
        public bool IsMoving => Math.Abs(Target - Position) > 1e-4f;
        public void Lower() => Target = 0f;
        public void Raise() => Target = 1f;
        public void Toggle() => Target = Target > 0.5f ? 0f : 1f;
        public void Step(float dt)
        {
            float d = Target - Position, max = Speed * dt;
            Position += d > max ? max : d < -max ? -max : d;
        }
    }

    /// <summary>Вал отбора мощности (ВОМ): включён ли, обороты, сколько мощности отдаёт орудию.</summary>
    [Serializable]
    public class PtoShaft
    {
        public float NominalRpm = 1000f;      // стандарт 540 или 1000 об/мин
        public float EngineRpmAtNominal = 1900f;
        public float SpinUpTime = 1.2f;       // разгон вала после включения, с
        public bool On;
        public float Rpm { get; private set; }

        /// <summary>Шаг: вал разгоняется к оборотам двигателя × передаточное, выключенный — останавливается.</summary>
        public void Step(float engineRpm, float dt)
        {
            float target = On ? engineRpm * NominalRpm / EngineRpmAtNominal : 0f;
            float rate = NominalRpm / Math.Max(SpinUpTime, 0.05f) * dt;
            Rpm += Math.Max(-rate * 1.5f, Math.Min(rate, target - Rpm));
        }
        /// <summary>Хватает ли оборотов для нормальной работы орудия (не меньше 80% от нормы).</summary>
        public bool RpmOk => On && Rpm >= NominalRpm * 0.8f;
        /// <summary>Мощность, которую забирает орудие сейчас, Вт (растёт вместе с оборотами вала).</summary>
        public float LoadW(float implementPowerW) => On ? implementPowerW * Math.Min(1f, Rpm / Math.Max(NominalRpm, 1f)) : 0f;
    }

    public static class AttachRules
    {
        /// <summary>
        /// Можно ли прицепить: тип сцепки совпадает, точки сцепки ближе maxDist (м) и орудие смотрит туда же, куда трактор (не больше maxAngleDeg).
        /// Векторы — в мире (x, z), высота не учитывается.
        /// </summary>
        public static bool CanAttach(AttachType hitch, AttachType implement, float hx, float hz, float hfx, float hfz, float ix, float iz, float ifx, float ifz, float maxDist = 0.7f, float maxAngleDeg = 25f)
        {
            if (hitch != implement) return false;
            float dx = ix - hx, dz = iz - hz;
            if (dx * dx + dz * dz > maxDist * maxDist) return false;
            float lh = (float)Math.Sqrt(hfx * hfx + hfz * hfz), li = (float)Math.Sqrt(ifx * ifx + ifz * ifz);
            if (lh < 1e-5f || li < 1e-5f) return false;
            float cos = (hfx * ifx + hfz * ifz) / (lh * li);
            return cos >= Math.Cos(maxAngleDeg * Math.PI / 180.0);
        }
    }
}
