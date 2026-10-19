// Какие чанки поля сейчас засеяны. Рендер растений отправляет на видеокарту только их, а не всю карту.
// Чистый C# (без UnityEngine): пересчитывается только чанк, у которого изменилась версия (FieldChunk.Version).
using System.Collections.Generic;

namespace FarmSim.Fields
{
    public sealed class CropChunkIndex
    {
        readonly FieldGrid grid;
        readonly Dictionary<int, int> seenVersion = new Dictionary<int, int>();
        readonly Dictionary<int, int> cropCells = new Dictionary<int, int>();
        readonly List<FieldChunk> withCrops = new List<FieldChunk>();
        bool listDirty = true;

        public CropChunkIndex(FieldGrid grid) { this.grid = grid; }

        /// <summary>Чанки, где есть хоть одна засеянная клетка (после Refresh).</summary>
        public IReadOnlyList<FieldChunk> ChunksWithCrops => withCrops;

        /// <summary>Сколько засеянных клеток в чанке (0, если нет или чанк не учтён).</summary>
        public int CropCells(FieldChunk c) => cropCells.TryGetValue(c.Index, out int n) ? n : 0;

        /// <summary>Пересчитать изменившиеся чанки. Возвращает, сколько чанков пересчитано.</summary>
        public int Refresh()
        {
            int recounted = 0;
            foreach (var c in grid.AllocatedChunks)
            {
                if (seenVersion.TryGetValue(c.Index, out int v) && v == c.Version) continue;
                seenVersion[c.Index] = c.Version; recounted++;
                int n = 0;
                for (int i = 0; i < FieldChunk.Cells; i++)
                {
                    uint s = c.State[i];
                    if (FieldCell.Ground(s) == GroundType.Seeded && FieldCell.Crop(s) != CropType.None) n++;
                }
                int had = CropCells(c);
                cropCells[c.Index] = n;
                if ((had > 0) != (n > 0)) listDirty = true;
            }
            if (listDirty)
            {
                withCrops.Clear();
                foreach (var c in grid.AllocatedChunks) if (CropCells(c) > 0) withCrops.Add(c);
                listDirty = false;
            }
            return recounted;
        }
    }
}
