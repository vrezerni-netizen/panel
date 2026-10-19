// Проверки физики трактора без Unity: двигатель, трансмиссия, почва, тяга орудий, гидравлика, ВОМ, сцепка.
// Движение считается упрощённо по прямой (масса 8 т, шаг 0.02 с) — так проверяется, что числа дают правдоподобную езду.
using System;
using FarmSim.Fields;
using NUnit.Framework;

namespace FarmSim.Vehicles.Tests
{
    public class VehicleLogicTests
    {
        const float Mass = 8000f, G = 9.81f, Dt = 0.02f;

        struct SimResult { public float V, Dist; public DriveOutput Last; }

        // Прямолинейное движение: тяга − (качение + орудие) − тормоз. Стоящий трактор не сдвигается, пока тяга не больше сопротивления.
        static SimResult Sim(Drivetrain d, float seconds, float throttle, float crr, float grip, float draftN = 0f, float ptoW = 0f, bool reverse = false, float brake = 0f, float v0 = 0f, float limitMs = 0f)
        {
            var r = new SimResult { V = v0 };
            for (float t = 0; t < seconds; t += Dt)
            {
                float resist = crr * Mass * G + draftN;
                var o = d.Step(new DriveInput { Throttle = throttle, Brake = brake, Reverse = reverse, SpeedMs = r.V, MassKg = Mass, ResistanceN = resist, TractionLimitN = grip * Mass * G, PtoLoadW = ptoW, SpeedLimitMs = limitMs, Dt = Dt });
                r.Last = o;
                if (Math.Abs(r.V) < 0.02f && Math.Abs(o.DriveForceN) <= resist) { r.V = 0f; continue; }
                float sign = Math.Abs(r.V) > 0.02f ? Math.Sign(r.V) : Math.Sign(o.DriveForceN);
                float f = o.DriveForceN - sign * (resist + o.BrakeForceN);
                float nv = r.V + f / Mass * Dt;
                if (Math.Sign(nv) != Math.Sign(r.V) && r.V != 0f && (brake > 0f || throttle == 0f)) nv = 0f;   // тормоз не разгоняет назад
                r.V = nv; r.Dist += Math.Abs(r.V) * Dt;
            }
            return r;
        }
        static float Kmh(float ms) => ms * 3.6f;
        static SoilResponse Soil(GroundType g, int moisture = 4) => SoilResponse.FromCell(FieldCell.WithMoisture(FieldCell.WithGround(0u, g), moisture));

        [Test]
        public void Engine_Is150kW_AtRatedRpm()
        {
            var e = new EngineCurve();
            Assert.That(e.PowerW(2100f) / 1000f, Is.InRange(147f, 153f));
            Assert.AreEqual(900f, e.TorqueAt(1500f), 0.01f);
            Assert.AreEqual((900f + 810f) / 2f, e.TorqueAt(1650f), 0.01f);
            Assert.AreEqual(1500f, e.PeakTorqueRpm());
        }

        [Test]
        public void EmptyTractor_ReachesFieldTopSpeed()
        {
            var s = Soil(GroundType.Stubble);
            var r = Sim(new Drivetrain(), 30f, 1f, s.RollingCoef, s.Grip);
            Assert.That(Kmh(r.V), Is.InRange(24f, 25.5f), "диапазон «поле» — 25 км/ч");
            var road = new Drivetrain { RoadRange = true };
            var r2 = Sim(road, 60f, 1f, SoilResponse.Road.RollingCoef, SoilResponse.Road.Grip);
            Assert.That(Kmh(r2.V), Is.InRange(48f, 50.5f), "диапазон «дорога» — 50 км/ч");
        }

        [Test]
        public void Plow_SlowsTractor_AndLoadsEngine()
        {
            var s = Soil(GroundType.Stubble);
            var d = new Drivetrain();
            float draft = ImplementDraft.ForceN(FieldOpKind.Plow, 4f, 10f, FieldCell.WithGround(0u, GroundType.Stubble));
            Assert.That(draft, Is.InRange(30000f, 40000f), "плуг 4 м на стерне ≈ 36 кН");
            var r = Sim(d, 40f, 1f, s.RollingCoef, s.Grip, draft);
            Assert.That(Kmh(r.V), Is.InRange(7f, 14f), "пахота идёт на 8–12 км/ч, а не на 25");
            Assert.Greater(r.Last.Load01, 0.9f, "двигатель загружен полностью");
            Assert.Less(r.Last.EngineRpm, 2100f, "обороты просели под нагрузкой");
        }

        [Test]
        public void Pto_TakesPower_SoTractorIsSlower()
        {
            var s = Soil(GroundType.Stubble);
            float draft = ImplementDraft.ForceN(FieldOpKind.Cultivate, 6f, 10f, FieldCell.WithGround(0u, GroundType.Stubble));
            var noPto = Sim(new Drivetrain(), 40f, 1f, s.RollingCoef, s.Grip, draft);
            var withPto = Sim(new Drivetrain(), 40f, 1f, s.RollingCoef, s.Grip, draft, ptoW: 70000f);
            Assert.Less(withPto.V, noPto.V - 0.5f, "ротор на ВОМ забирает мощность — едем медленнее");
        }

        [Test]
        public void ImplementSpeedLimit_CapsSpeed_EngineStaysAtRated()
        {
            // сеялка 3 м по культивации: тянуть легко, но в работе — не быстрее 15 км/ч, как в FS
            var s = Soil(GroundType.Cultivated);
            uint cell = FieldCell.WithGround(0u, GroundType.Cultivated);
            float draft = ImplementDraft.ForceN(FieldOpKind.Sow, 3f, 15f, cell);
            var free = Sim(new Drivetrain(), 30f, 1f, s.RollingCoef, s.Grip, draft);
            var lim = Sim(new Drivetrain(), 30f, 1f, s.RollingCoef, s.Grip, draft, limitMs: 15f / 3.6f);
            Assert.That(Kmh(free.V), Is.GreaterThan(22f), "без предела едет почти на максимуме диапазона");
            Assert.That(Kmh(lim.V), Is.InRange(14.5f, 15.2f));
            Assert.That(lim.Last.EngineRpm, Is.GreaterThan(2000f), "предел режет скорость, а не газ: обороты не падают");
        }

        [Test]
        public void WetPlowedSoil_WheelsSlip()
        {
            var dry = Soil(GroundType.Stubble);
            var wet = Soil(GroundType.Plowed, 7);
            Assert.Less(wet.Grip, dry.Grip * 0.7f);
            uint wetPlowed = FieldCell.WithMoisture(FieldCell.WithGround(0u, GroundType.Plowed), 7);
            float draft = ImplementDraft.ForceN(FieldOpKind.Plow, 6f, 6f, wetPlowed);
            var r = Sim(new Drivetrain(), 20f, 0.6f, wet.RollingCoef, wet.Grip, draft);
            Assert.Greater(r.Last.Slip01, 0f, "на мокрой пашне тяжёлый плуг — колёса буксуют");
        }

        [Test]
        public void Reverse_And_Brakes()
        {
            var s = SoilResponse.Road;
            var r = Sim(new Drivetrain(), 20f, 1f, s.RollingCoef, s.Grip, reverse: true);
            Assert.That(Kmh(r.V), Is.InRange(-18.5f, -17f), "назад не быстрее 18 км/ч");
            var stop = Sim(new Drivetrain { RoadRange = true }, 10f, 0f, s.RollingCoef, s.Grip, brake: 1f, v0: 40f / 3.6f);
            Assert.AreEqual(0f, stop.V, 1e-3f);
            Assert.Less(stop.Dist, 15f, "с 40 км/ч тормозной путь меньше 15 м");
        }

        [Test]
        public void HydraulicLift_TakesTime_AndReportsDown()
        {
            var lift = new HydraulicLift { Speed = 0.7f };
            lift.Lower();
            float t = 0; while (!lift.IsDown && t < 5f) { lift.Step(Dt); t += Dt; }
            Assert.That(t, Is.InRange(1.25f, 1.45f), "полный ход ≈ 1.4 с");
            lift.Toggle(); lift.Step(Dt);
            Assert.IsFalse(lift.IsDown); Assert.IsTrue(lift.IsMoving);
        }

        [Test]
        public void Pto_SpinsUp_AndDrawsPower()
        {
            var pto = new PtoShaft();
            Assert.AreEqual(0f, pto.LoadW(50000f));
            pto.On = true;
            float t = 0; while (!pto.RpmOk && t < 5f) { pto.Step(1900f, Dt); t += Dt; }
            Assert.That(t, Is.InRange(0.8f, 1.3f));
            for (int k = 0; k < 100; k++) pto.Step(1900f, Dt);
            Assert.AreEqual(1000f, pto.Rpm, 1f);
            Assert.AreEqual(50000f, pto.LoadW(50000f), 50f);
            pto.On = false; for (int k = 0; k < 200; k++) pto.Step(1900f, Dt);
            Assert.AreEqual(0f, pto.Rpm, 1f);
        }

        [Test]
        public void Attach_NeedsSameType_CloseAndAligned()
        {
            Assert.IsTrue(AttachRules.CanAttach(AttachType.ThreePoint, AttachType.ThreePoint, 0, 0, 0, 1, 0.3f, 0.2f, 0.1f, 1f));
            Assert.IsFalse(AttachRules.CanAttach(AttachType.ThreePoint, AttachType.Drawbar, 0, 0, 0, 1, 0, 0, 0, 1), "дышло на навеску не цепляется");
            Assert.IsFalse(AttachRules.CanAttach(AttachType.ThreePoint, AttachType.ThreePoint, 0, 0, 0, 1, 2f, 0, 0, 1), "слишком далеко");
            Assert.IsFalse(AttachRules.CanAttach(AttachType.ThreePoint, AttachType.ThreePoint, 0, 0, 0, 1, 0, 0, 1, 0), "орудие стоит боком");
        }

        [Test]
        public void Draft_OnlyInField_LooseSoilIsLighter()
        {
            Assert.AreEqual(0f, ImplementDraft.ForceN(FieldOpKind.Plow, 4f, 10f, 0u), "орудие не в поле");
            float stubble = ImplementDraft.ForceN(FieldOpKind.Plow, 4f, 10f, FieldCell.WithGround(0u, GroundType.Stubble));
            float plowed = ImplementDraft.ForceN(FieldOpKind.Plow, 4f, 10f, FieldCell.WithGround(0u, GroundType.Plowed));
            Assert.Less(plowed, stubble);
            Assert.AreEqual(0f, ImplementDraft.ForceN(FieldOpKind.Fertilize, 12f, 10f, FieldCell.WithGround(0u, GroundType.Stubble)), "разбрасыватель землю не тянет");
        }
    }
}
