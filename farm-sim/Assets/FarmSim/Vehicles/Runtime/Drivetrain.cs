// Двигатель и бесступенчатая трансмиссия трактора (CVT, как у современных тракторов и в Farming Simulator).
// Чистый C#: считает, какую силу тяги колёса могут дать сейчас, с учётом мощности двигателя, нагрузки ВОМ,
// передаточного отношения и сцепления шин с почвой. Колёсную физику (WheelCollider) делает TractorController.
using System;

namespace FarmSim.Vehicles
{
    /// <summary>Кривая момента двигателя: точки (обороты, Н·м), между ними — линейно.</summary>
    [Serializable]
    public class EngineCurve
    {
        public float IdleRpm = 850f, RatedRpm = 2100f, MaxRpm = 2300f;
        public float[] Rpm = { 850f, 1200f, 1500f, 1800f, 2100f, 2300f };
        public float[] TorqueNm = { 600f, 820f, 900f, 810f, 682f, 0f };   // 150 кВт (≈200 л.с.) на 2100 об/мин

        public float TorqueAt(float rpm)
        {
            if (rpm <= Rpm[0]) return TorqueNm[0];
            for (int i = 1; i < Rpm.Length; i++)
                if (rpm <= Rpm[i]) { float t = (rpm - Rpm[i - 1]) / (Rpm[i] - Rpm[i - 1]); return TorqueNm[i - 1] + (TorqueNm[i] - TorqueNm[i - 1]) * t; }
            return 0f;
        }
        public float PowerW(float rpm) => TorqueAt(rpm) * rpm * (float)(2 * Math.PI / 60.0);
        public float MaxPowerW() { float best = 0; for (float r = IdleRpm; r <= MaxRpm; r += 10f) best = Math.Max(best, PowerW(r)); return best; }
        /// <summary>Обороты наибольшего момента — сюда «садится» двигатель под тяжёлой нагрузкой.</summary>
        public float PeakTorqueRpm() { int k = 0; for (int i = 1; i < TorqueNm.Length; i++) if (TorqueNm[i] > TorqueNm[k]) k = i; return Rpm[k]; }
    }

    /// <summary>Что водитель и мир дают трансмиссии в этот шаг физики.</summary>
    public struct DriveInput
    {
        public float Throttle;        // 0..1 — доля максимальной скорости диапазона (как круиз-контроль в FS)
        public float Brake;           // 0..1
        public bool Reverse;
        public float SpeedMs;         // текущая скорость вдоль машины, м/с (назад — минус)
        public float MassKg;
        public float ResistanceN;     // качение + тяговое сопротивление орудий (известно миру) — для упреждения
        public float TractionLimitN;  // сколько сил шины могут передать без пробуксовки: μ × вес на ведущих колёсах
        public float PtoLoadW;        // мощность, которую забирает ВОМ
        public float SpeedLimitMs;    // предел скорости опущенного орудия (плуг 12 км/ч и т.п.), 0 — без предела
        public float Dt;
    }

    public struct DriveOutput
    {
        public float DriveForceN;     // сила тяги на всех ведущих колёсах (минус — торможение двигателем)
        public float BrakeForceN;     // тормозная сила
        public float EngineRpm;
        public float Load01;          // загрузка двигателя 0..1
        public float Slip01;          // насколько тяга упёрлась в сцепление (0 — нет пробуксовки, 1 — колёса буксуют)
        public float TargetSpeedMs;
    }

    [Serializable]
    public class Drivetrain
    {
        public EngineCurve Engine = new EngineCurve();
        public float Efficiency = 0.85f;            // потери в трансмиссии
        public float WheelRadius = 0.95f;           // задние колёса, м
        public float MaxOverallRatio = 420f;        // обороты двигателя / обороты колеса на самой «ползучей» передаче
        public float FieldMaxSpeedKmh = 25f, RoadMaxSpeedKmh = 50f, ReverseMaxSpeedKmh = 18f;
        public bool RoadRange;                      // диапазон «дорога» / «поле»
        public float MaxBrakeG = 0.55f;             // сила тормозов в долях g
        public float EngineBrakeG = 0.12f;
        public float RpmRate = 2200f;               // как быстро меняются обороты, об/мин в секунду

        public float EngineRpm { get; private set; } = 850f;

        public float MaxSpeedMs(bool reverse) => (reverse ? ReverseMaxSpeedKmh : RoadRange ? RoadMaxSpeedKmh : FieldMaxSpeedKmh) / 3.6f;

        public DriveOutput Step(in DriveInput i)
        {
            var o = new DriveOutput();
            float dir = i.Reverse ? -1f : 1f;
            float vTarget = dir * Clamp01(i.Throttle) * MaxSpeedMs(i.Reverse);
            // предел орудия режет только желаемую скорость, обороты остаются от педали газа — мощности хватает тянуть
            if (i.SpeedLimitMs > 0f && Math.Abs(vTarget) > i.SpeedLimitMs) vTarget = dir * i.SpeedLimitMs;
            o.TargetSpeedMs = vTarget;
            float v = i.SpeedMs, absV = Math.Abs(v);

            // регулятор оборотов: газ и ВОМ поднимают обороты к номинальным
            float rpmWanted = Engine.IdleRpm + (Engine.RatedRpm - Engine.IdleRpm) * Math.Max(Clamp01(i.Throttle), i.PtoLoadW > 0 ? 0.9f : 0f);
            float pAvail = Math.Max(0f, Engine.PowerW(EngineRpm) - i.PtoLoadW) * Efficiency;
            float fPower = pAvail / Math.Max(absV, 0.6f);
            float fTorque = Engine.TorqueAt(EngineRpm) * MaxOverallRatio * Efficiency / WheelRadius;
            float fMax = Math.Min(fPower, fTorque);

            // желаемая сила: разгон к целевой скорости + компенсация сопротивления
            float accelWanted = Clamp((vTarget - v) * 1.6f, -3f, 1.8f);
            float fWanted = i.MassKg * accelWanted + Math.Sign(vTarget != 0 ? vTarget : v) * i.ResistanceN;
            bool driving = vTarget != 0 && Math.Sign(fWanted) == Math.Sign(vTarget);
            float drive = driving
                ? Math.Sign(fWanted) * Math.Min(Math.Abs(fWanted), fMax)                                      // тянем
                : Math.Sign(fWanted) * Math.Min(Math.Abs(fWanted), EngineBrakeG * i.MassKg * 9.81f);          // сброс газа — торможение двигателем

            // сцепление шин: больше, чем держит почва, колёса не передадут — остальное уходит в пробуксовку
            if (i.TractionLimitN > 0f && Math.Abs(drive) > i.TractionLimitN)
            {
                o.Slip01 = Clamp01((Math.Abs(drive) - i.TractionLimitN) / Math.Max(i.TractionLimitN, 1f));
                drive = Math.Sign(drive) * i.TractionLimitN;
            }
            o.DriveForceN = drive;
            o.BrakeForceN = Clamp01(i.Brake) * MaxBrakeG * i.MassKg * 9.81f;
            o.Load01 = fMax > 1f ? Clamp01(Math.Abs(drive) * Math.Max(absV, 0.6f) / Math.Max(pAvail, 1f) + i.PtoLoadW / Math.Max(Engine.MaxPowerW(), 1f)) : 0f;

            // под тяжёлой нагрузкой обороты проседают к пику момента (слышно по звуку и видно на тахометре)
            float rpmTarget = rpmWanted;
            if (o.Load01 > 0.9f) rpmTarget = Math.Min(rpmTarget, Engine.PeakTorqueRpm() + (Engine.RatedRpm - Engine.PeakTorqueRpm()) * (1f - (o.Load01 - 0.9f) * 10f));
            EngineRpm += Clamp(rpmTarget - EngineRpm, -RpmRate * i.Dt, RpmRate * i.Dt);
            EngineRpm = Clamp(EngineRpm, Engine.IdleRpm * 0.9f, Engine.MaxRpm);
            o.EngineRpm = EngineRpm;
            return o;
        }

        static float Clamp01(float v) => v < 0f ? 0f : v > 1f ? 1f : v;
        static float Clamp(float v, float a, float b) => v < a ? a : v > b ? b : v;
    }
}
