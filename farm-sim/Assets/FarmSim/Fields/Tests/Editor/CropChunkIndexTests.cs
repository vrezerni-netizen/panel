// Индекс засеянных чанков: рендер растений получает только их и пересчитывает только изменившиеся.
using NUnit.Framework;

namespace FarmSim.Fields.Tests
{
    public class CropChunkIndexTests
    {
        [Test]
        public void TracksSownChunks_AndForgetsHarvested()
        {
            var g = new FieldGrid(0f, 0f, 0.5f, 512, 512);           // 256×256 м, чанки по 32 м
            g.AddField(1, new[] { 0f, 0f, 200f, 0f, 200f, 200f, 0f, 200f }, GroundType.Cultivated);
            var idx = new CropChunkIndex(g);
            Assert.Greater(idx.Refresh(), 0);
            Assert.AreEqual(0, idx.ChunksWithCrops.Count, "ничего не посеяно");

            // посеяли полосу 6×20 м внутри одного чанка (x 40..46, z 40..60 — чанк (1,1))
            g.ApplyQuad(new FieldOp(FieldOpKind.Sow, crop: CropType.Wheat), 40, 40, 46, 40, 46, 60, 40, 60);
            Assert.AreEqual(1, idx.Refresh(), "пересчитан только изменившийся чанк");
            Assert.AreEqual(1, idx.ChunksWithCrops.Count);
            Assert.AreEqual(12 * 40, idx.CropCells(idx.ChunksWithCrops[0]));
            Assert.AreEqual(0, idx.Refresh(), "без изменений ничего не пересчитывается");

            // созрело и убрано — чанк пропал из списка
            for (int i = 1; i < FieldCrops.Get(CropType.Wheat).ReadyStage; i++) { g.BeginGrowthPeriod(rain: true); while (g.GrowthPending) g.StepGrowth(64); }
            idx.Refresh();
            Assert.AreEqual(1, idx.ChunksWithCrops.Count, "рост не убирает растения");
            g.ApplyQuad(new FieldOp(FieldOpKind.Harvest, crop: CropType.Wheat), 39, 39, 47, 39, 47, 61, 39, 61);
            idx.Refresh();
            Assert.AreEqual(0, idx.ChunksWithCrops.Count);
        }
    }
}
