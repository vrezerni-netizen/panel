// Проверки логики полей. В Unity: Window → General → Test Runner → EditMode → Run All.
// Эти же тесты гоняются и без Unity: farm-sim/Tools/FieldTests (dotnet test).
using NUnit.Framework;

namespace FarmSim.Fields.Tests
{
    public class FieldGridTests
    {
        // Карта 128×128 м, клетка 0.5 м. Поле — квадрат 20×20 м с углом в (10,10).
        static FieldGrid MakeGrid(out ushort id)
        {
            var g = new FieldGrid(0f, 0f, 0.5f, 256, 256);
            id = 7;
            int cells = g.AddField(id, new[] { 10f, 10f, 30f, 10f, 30f, 30f, 10f, 30f }, GroundType.Stubble);
            Assert.AreEqual(40 * 40, cells, "20×20 м при клетке 0.5 м = 1600 клеток");
            return g;
        }

        // Проход орудия шириной 4 м вдоль оси Z от z0 до z1 с центром по x.
        static FieldOpResult Pass(FieldGrid g, FieldOp op, float x, float z0, float z1, float width = 4f)
        {
            float l = x - width / 2, r = x + width / 2;
            return g.ApplyQuad(op, l, z0, r, z0, r, z1, l, z1);
        }

        [Test]
        public void Bits_RoundTrip()
        {
            uint s = 0;
            s = FieldCell.WithGround(s, GroundType.Seeded); s = FieldCell.WithAngle(s, 5); s = FieldCell.WithRolled(s, true);
            s = FieldCell.WithCrop(s, CropType.SugarBeet); s = FieldCell.WithGrowth(s, 13); s = FieldCell.WithFert(s, 2);
            s = FieldCell.WithWeeds(s, 6); s = FieldCell.WithLime(s, true); s = FieldCell.WithFertNow(s, true);
            s = FieldCell.WithPlowNeed(s, 3); s = FieldCell.WithStraw(s, true); s = FieldCell.WithStones(s, 2); s = FieldCell.WithMoisture(s, 7);
            Assert.AreEqual(GroundType.Seeded, FieldCell.Ground(s)); Assert.AreEqual(5, FieldCell.Angle(s)); Assert.IsTrue(FieldCell.Rolled(s));
            Assert.AreEqual(CropType.SugarBeet, FieldCell.Crop(s)); Assert.AreEqual(13, FieldCell.Growth(s)); Assert.AreEqual(2, FieldCell.Fert(s));
            Assert.AreEqual(6, FieldCell.Weeds(s)); Assert.IsTrue(FieldCell.Lime(s)); Assert.IsTrue(FieldCell.FertNow(s));
            Assert.AreEqual(3, FieldCell.PlowNeed(s)); Assert.IsTrue(FieldCell.Straw(s)); Assert.AreEqual(2, FieldCell.Stones(s)); Assert.AreEqual(7, FieldCell.Moisture(s));
            // изменение одного поля не задевает соседние биты
            uint t = FieldCell.WithGrowth(s, 1);
            Assert.AreEqual(s & ~(15u << FieldCell.GrowthShift), t & ~(15u << FieldCell.GrowthShift));
        }

        [Test]
        public void Angle_FromHeading_IsSymmetric()
        {
            Assert.AreEqual(0, FieldCell.AngleFromHeading(0f));
            Assert.AreEqual(0, FieldCell.AngleFromHeading(180f));      // туда и обратно — одна борозда
            Assert.AreEqual(4, FieldCell.AngleFromHeading(90f));
            Assert.AreEqual(4, FieldCell.AngleFromHeading(-90f));
            Assert.AreEqual(2, FieldCell.AngleFromHeading(45f));
        }

        [Test]
        public void Plow_ChangesOnlyFieldCellsUnderTheStrip()
        {
            var g = MakeGrid(out _);
            var r = Pass(g, new FieldOp(FieldOpKind.Plow, angle: 0), 20f, 0f, 40f);    // полоса 4 м поперёк всего поля и за его края
            Assert.AreEqual(8 * 40, r.CellsChanged, "4 м × 20 м поля = 8×40 клеток; за краем поля — не поле");
            Assert.AreEqual(80f, r.AreaM2, 1e-3);
            g.WorldToCell(20.1f, 20.1f, out int cx, out int cz);
            Assert.AreEqual(GroundType.Plowed, FieldCell.Ground(g.Get(cx, cz)));
            g.WorldToCell(25f, 20f, out cx, out cz);
            Assert.AreEqual(GroundType.Stubble, FieldCell.Ground(g.Get(cx, cz)), "вне полосы не тронуто");
            g.WorldToCell(20f, 5f, out cx, out cz);
            Assert.AreEqual(GroundType.None, FieldCell.Ground(g.Get(cx, cz)), "вне поля ничего нет");
            // повторный проход по вспаханному ничего не меняет
            Assert.AreEqual(0, Pass(g, new FieldOp(FieldOpKind.Plow, angle: 0), 20f, 0f, 40f).CellsChanged);
        }

        [Test]
        public void Sow_NeedsTilledGround_ThenGrows_ThenHarvestGivesYield()
        {
            var g = MakeGrid(out ushort id);
            var sow = new FieldOp(FieldOpKind.Sow, crop: CropType.Wheat);
            Assert.AreEqual(0, Pass(g, sow, 20f, 10f, 30f).CellsChanged, "по стерне без обработки не сеется");
            Assert.Greater(Pass(g, new FieldOp(FieldOpKind.Sow, crop: CropType.Wheat, direct: true), 14f, 10f, 30f).CellsChanged, 0, "прямой посев сеет по стерне");

            Pass(g, new FieldOp(FieldOpKind.Cultivate), 20f, 10f, 30f);
            Assert.AreEqual(8 * 40, Pass(g, sow, 20f, 10f, 30f).CellsChanged);
            g.WorldToCell(20f, 20f, out int cx, out int cz);
            Assert.AreEqual(1, FieldCell.Growth(g.Get(cx, cz)));

            var harvest = new FieldOp(FieldOpKind.Harvest, crop: CropType.Wheat);
            Assert.AreEqual(0, Pass(g, harvest, 20f, 10f, 30f).CellsChanged, "незрелое не убирается");

            int ready = FieldCrops.Get(CropType.Wheat).ReadyStage;
            for (int i = 1; i < ready; i++) { g.BeginGrowthPeriod(rain: true); while (g.GrowthPending) g.StepGrowth(1); }
            Assert.AreEqual(ready, FieldCell.Growth(g.Get(cx, cz)));
            Assert.IsTrue(FieldCrops.IsReady(g.Get(cx, cz)));
            Assert.Greater(g.GetFieldStats(id).Ready, 0);

            var r = Pass(g, harvest, 20f, 10f, 30f);
            Assert.AreEqual(8 * 40, r.CellsChanged);
            // 80 м² × 0.9 л/м² × множитель (без удобрения и без извести: 1 − 0.15 = 0.85; сорняки могли снизить ещё)
            Assert.That(r.YieldLiters, Is.InRange(80 * 0.9 * 0.5, 80 * 0.9 * 0.85 + 0.01));
            uint s = g.Get(cx, cz);
            Assert.AreEqual(GroundType.Stubble, FieldCell.Ground(s)); Assert.AreEqual(CropType.None, FieldCell.Crop(s));
            Assert.AreEqual(1, FieldCell.PlowNeed(s)); Assert.IsTrue(FieldCell.Straw(s));
        }

        [Test]
        public void Fertilize_OncePerGrowthPeriod()
        {
            var g = MakeGrid(out _);
            var fert = new FieldOp(FieldOpKind.Fertilize);
            Assert.AreEqual(8 * 40, Pass(g, fert, 20f, 10f, 30f).CellsChanged);
            Assert.AreEqual(0, Pass(g, fert, 20f, 10f, 30f).CellsChanged, "второй раз за период не добавляется");
            g.BeginGrowthPeriod(); while (g.GrowthPending) g.StepGrowth(4);
            Assert.AreEqual(8 * 40, Pass(g, fert, 20f, 10f, 30f).CellsChanged, "в новом периоде можно ещё");
            g.WorldToCell(20f, 20f, out int cx, out int cz);
            Assert.AreEqual(2, FieldCell.Fert(g.Get(cx, cz)));
        }

        [Test]
        public void ManyThinSteps_LeaveNoGaps()
        {
            // трактор едет 3 м/с, физика 50 Гц: шаг 6 см — меньше клетки. Полоса должна быть сплошной.
            var g = MakeGrid(out _);
            int total = 0; float z = 10f;
            var op = new FieldOp(FieldOpKind.Cultivate);
            while (z < 30f) { float z2 = z + 0.06f; total += Pass(g, op, 20f, z, z2 + 0.5f).CellsChanged; z = z2; }
            Assert.AreEqual(8 * 40, total, "каждая клетка полосы обработана ровно один раз");
        }

        [Test]
        public void DiagonalPass_SetsAngle()
        {
            var g = MakeGrid(out _);
            // полоса под 45°: четырёхугольник, повёрнутый на 45°
            float s = 2f / 1.41421356f;
            var r = g.ApplyQuad(new FieldOp(FieldOpKind.Plow, angle: FieldCell.AngleFromHeading(45f)), 12 - s, 12 + s, 12 + s, 12 - s, 28 + s, 28 - s, 28 - s, 28 + s);
            Assert.Greater(r.CellsChanged, 0);
            g.WorldToCell(20f, 20f, out int cx, out int cz);
            Assert.AreEqual(2, FieldCell.Angle(g.Get(cx, cz)));
        }

        [Test]
        public void GpuDirty_OnlyTouchedChunks()
        {
            var g = new FieldGrid(0f, 0f, 0.5f, 1024, 1024);
            g.AddField(1, new[] { 0f, 0f, 500f, 0f, 500f, 500f, 0f, 500f });
            var list = new System.Collections.Generic.List<FieldChunk>();
            g.TakeGpuDirty(list, int.MaxValue); list.Clear();
            Pass(g, new FieldOp(FieldOpKind.Plow), 100f, 100f, 110f);
            g.TakeGpuDirty(list, int.MaxValue);
            Assert.That(list.Count, Is.InRange(1, 2), "проход 4×10 м задевает 1–2 чанка 32×32 м, а не всю карту");
        }

        [Test]
        public void Herbicide_KillsWeeds_WeedsGrowOverTime()
        {
            var g = MakeGrid(out ushort id);
            g.WeedChance = 100;
            Pass(g, new FieldOp(FieldOpKind.Cultivate), 20f, 10f, 30f);
            g.BeginGrowthPeriod(rain: true); while (g.GrowthPending) g.StepGrowth(8);
            Assert.AreEqual(8 * 40, g.GetFieldStats(id).Weedy, "на обработанной полосе выросли сорняки");
            Assert.AreEqual(8 * 40, Pass(g, new FieldOp(FieldOpKind.Herbicide), 20f, 10f, 30f).CellsChanged);
            Assert.AreEqual(0, g.GetFieldStats(id).Weedy);
        }

        [Test]
        public void SaveLoad_RoundTrip()
        {
            var g = MakeGrid(out _);
            Pass(g, new FieldOp(FieldOpKind.Plow, angle: 3), 20f, 10f, 30f);
            Pass(g, new FieldOp(FieldOpKind.Lime), 15f, 10f, 30f);
            g.BeginGrowthPeriod(); while (g.GrowthPending) g.StepGrowth(16);
            byte[] data = g.Save();

            var g2 = MakeGrid(out _); g2.Load(data);
            Assert.AreEqual(g.GrowthPeriod, g2.GrowthPeriod);
            for (int z = 0; z < 128; z++) for (int x = 0; x < 128; x++) Assert.AreEqual(g.Get(x, z), g2.Get(x, z));
            Assert.Less(data.Length, 4096, "сжатое сохранение маленькое");
        }
    }
}
