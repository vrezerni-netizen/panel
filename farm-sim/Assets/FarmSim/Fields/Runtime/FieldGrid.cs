// Сетка состояний всех полей карты. Чистый C# без UnityEngine: её можно тестировать вне Unity и считать в фоновом потоке.
//
// Устройство:
//  • Карта делится на чанки 64×64 клетки (при клетке 0.5 м это 32×32 м).
//  • Память выделяется только чанкам, где есть хоть одна клетка поля; в остальных — null (там «не поле»).
//  • Чанк хранит uint-состояние каждой клетки (раскладка бит — FieldCell) и номер поля (ushort, 0 = не поле).
//  • Любое изменение помечает чанк «грязным» для видеокарты (GpuDirty) и для сохранения (SaveDirty).
//    Менеджер в Unity перекладывает в текстуру только грязные чанки по 16 КБ, а не всю карту.
//  • Рост идёт «периодами» (например, раз в игровые сутки) и считается порциями чанков за кадр,
//    поэтому смена дня не даёт рывка FPS даже на 4 млн клеток.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;

namespace FarmSim.Fields
{
    public sealed class FieldChunk
    {
        public const int Size = 64, Shift = 6, Cells = Size * Size;
        public readonly int Index, Cx, Cz;                 // номер чанка и его координаты в чанках
        public readonly uint[] State = new uint[Cells];   // индекс клетки внутри чанка: lz * 64 + lx
        public readonly ushort[] FieldId = new ushort[Cells];
        public int FieldCells;                            // сколько клеток чанка принадлежит полям
        public bool GpuDirty, SaveDirty;
        public int GrowthPeriod;                          // какой период роста уже посчитан для чанка
        public FieldChunk(int index, int cx, int cz) { Index = index; Cx = cx; Cz = cz; }
    }

    /// <summary>Сводка по одному полю: для интерфейса, заданий, наёмных рабочих.</summary>
    public struct FieldStats
    {
        public int Cells, Grass, Stubble, Cultivated, Plowed, Seeded, Ready, Withered, Weedy, NeedPlow, NoLime;
        public double FertSum;
        public float Percent(int part) => Cells == 0 ? 0f : 100f * part / Cells;
        public float AvgFert => Cells == 0 ? 0f : (float)(FertSum / Cells);
    }

    public sealed class FieldGrid
    {
        public readonly float OriginX, OriginZ, CellSize, CellArea;
        public readonly int Width, Height, ChunksX, ChunksZ;
        public int GrowthPeriod { get; private set; }
        /// <summary>Погибают ли неубранные культуры через период после созревания (как «увядание» в настройках FS).</summary>
        public bool Withering = false;
        /// <summary>Шанс (из 100) появления сорняков в чистой обработанной клетке за период.</summary>
        public int WeedChance = 10;

        readonly float invCell;
        readonly FieldChunk[] chunks;                                   // null = в чанке нет полей
        readonly List<FieldChunk> allocated = new List<FieldChunk>();
        readonly Dictionary<ushort, List<FieldChunk>> chunksByField = new Dictionary<ushort, List<FieldChunk>>();
        int growthCursor;                                               // какой из allocated считать следующим
        bool growthRain;

        public IReadOnlyList<FieldChunk> AllocatedChunks => allocated;

        /// <param name="widthCells">ширина в клетках (округляется вверх до 64)</param>
        public FieldGrid(float originX, float originZ, float cellSize, int widthCells, int heightCells)
        {
            if (cellSize <= 0f) throw new ArgumentException("cellSize > 0");
            OriginX = originX; OriginZ = originZ; CellSize = cellSize; invCell = 1f / cellSize; CellArea = cellSize * cellSize;
            ChunksX = (widthCells + FieldChunk.Size - 1) >> FieldChunk.Shift; ChunksZ = (heightCells + FieldChunk.Size - 1) >> FieldChunk.Shift;
            Width = ChunksX << FieldChunk.Shift; Height = ChunksZ << FieldChunk.Shift;
            chunks = new FieldChunk[ChunksX * ChunksZ];
        }

        // ---------------------------------------------------------------- координаты
        public bool WorldToCell(float x, float z, out int cx, out int cz)
        {
            cx = (int)Math.Floor((x - OriginX) * invCell); cz = (int)Math.Floor((z - OriginZ) * invCell);
            return cx >= 0 && cz >= 0 && cx < Width && cz < Height;
        }
        public void CellCenter(int cx, int cz, out float x, out float z) { x = OriginX + (cx + 0.5f) * CellSize; z = OriginZ + (cz + 0.5f) * CellSize; }
        FieldChunk ChunkOf(int cx, int cz) => chunks[(cz >> FieldChunk.Shift) * ChunksX + (cx >> FieldChunk.Shift)];
        static int Local(int cx, int cz) => ((cz & (FieldChunk.Size - 1)) << FieldChunk.Shift) | (cx & (FieldChunk.Size - 1));

        // ---------------------------------------------------------------- доступ к клеткам
        public uint Get(int cx, int cz)
        {
            if (cx < 0 || cz < 0 || cx >= Width || cz >= Height) return 0u;
            var c = ChunkOf(cx, cz); return c == null ? 0u : c.State[Local(cx, cz)];
        }
        public ushort FieldIdAt(int cx, int cz)
        {
            if (cx < 0 || cz < 0 || cx >= Width || cz >= Height) return 0;
            var c = ChunkOf(cx, cz); return c == null ? (ushort)0 : c.FieldId[Local(cx, cz)];
        }
        public uint GetAtWorld(float x, float z) => WorldToCell(x, z, out int cx, out int cz) ? Get(cx, cz) : 0u;

        /// <summary>Записать состояние клетки поля (вне полей запись игнорируется).</summary>
        public bool Set(int cx, int cz, uint s)
        {
            if (cx < 0 || cz < 0 || cx >= Width || cz >= Height) return false;
            var c = ChunkOf(cx, cz); if (c == null) return false; int i = Local(cx, cz);
            if (c.FieldId[i] == 0 || c.State[i] == s) return false;
            c.State[i] = s; c.GpuDirty = c.SaveDirty = true; return true;
        }

        // ---------------------------------------------------------------- поля
        /// <summary>
        /// Добавить поле по многоугольнику (x0,z0, x1,z1, …) в мировых координатах. Клетки, чей центр внутри, становятся полем.
        /// Возвращает число клеток. Клетки, уже занятые другим полем, не перезаписываются.
        /// </summary>
        public int AddField(ushort id, float[] polygonXZ, GroundType initial = GroundType.Grass)
        {
            if (id == 0) throw new ArgumentException("id поля должен быть > 0");
            if (polygonXZ == null || polygonXZ.Length < 6 || (polygonXZ.Length & 1) != 0) throw new ArgumentException("нужно минимум 3 точки (x,z)");
            float minX = float.MaxValue, minZ = float.MaxValue, maxX = float.MinValue, maxZ = float.MinValue;
            for (int i = 0; i < polygonXZ.Length; i += 2) { minX = Math.Min(minX, polygonXZ[i]); maxX = Math.Max(maxX, polygonXZ[i]); minZ = Math.Min(minZ, polygonXZ[i + 1]); maxZ = Math.Max(maxZ, polygonXZ[i + 1]); }
            CellRange(minX, minZ, maxX, maxZ, out int x0, out int z0, out int x1, out int z1);
            int n = 0; uint fresh = FieldCell.NewFieldCell(initial); var touched = new HashSet<FieldChunk>();
            for (int cz = z0; cz <= z1; cz++)
                for (int cx = x0; cx <= x1; cx++)
                {
                    CellCenter(cx, cz, out float px, out float pz);
                    if (!InPolygon(polygonXZ, px, pz)) continue;
                    var c = EnsureChunk(cx, cz); int i = Local(cx, cz);
                    if (c.FieldId[i] != 0) continue;
                    c.FieldId[i] = id; c.State[i] = fresh; c.FieldCells++; c.GpuDirty = c.SaveDirty = true; n++; touched.Add(c);
                }
            if (!chunksByField.TryGetValue(id, out var list)) chunksByField[id] = list = new List<FieldChunk>();
            foreach (var c in touched) if (!list.Contains(c)) list.Add(c);
            return n;
        }

        FieldChunk EnsureChunk(int cx, int cz)
        {
            int ci = (cz >> FieldChunk.Shift) * ChunksX + (cx >> FieldChunk.Shift);
            var c = chunks[ci];
            if (c == null) { c = chunks[ci] = new FieldChunk(ci, cx >> FieldChunk.Shift, cz >> FieldChunk.Shift) { GrowthPeriod = GrowthPeriod }; allocated.Add(c); }
            return c;
        }

        void CellRange(float minX, float minZ, float maxX, float maxZ, out int x0, out int z0, out int x1, out int z1)
        {
            x0 = Math.Max(0, (int)Math.Floor((minX - OriginX) * invCell)); z0 = Math.Max(0, (int)Math.Floor((minZ - OriginZ) * invCell));
            x1 = Math.Min(Width - 1, (int)Math.Floor((maxX - OriginX) * invCell)); z1 = Math.Min(Height - 1, (int)Math.Floor((maxZ - OriginZ) * invCell));
        }

        static bool InPolygon(float[] p, float x, float z)
        {
            bool inside = false; int n = p.Length / 2;
            for (int i = 0, j = n - 1; i < n; j = i++)
            {
                float xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
                if ((zi > z) != (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
            }
            return inside;
        }

        // ---------------------------------------------------------------- работа орудий
        /// <summary>
        /// Применить действие к клеткам, чьи центры внутри четырёхугольника a-b-c-d (обход по контуру, любой порядок вращения).
        /// Так задаётся рабочая зона орудия: две точки ширины захвата сейчас и две — на прошлом шаге физики.
        /// </summary>
        public FieldOpResult ApplyQuad(in FieldOp op, float ax, float az, float bx, float bz, float cx, float cz, float dx, float dz)
        {
            Span<float> t = stackalloc float[12] { ax, az, bx, bz, cx, cz, ax, az, cx, cz, dx, dz };
            return ApplyTriangles(op, t);
        }

        /// <summary>Применить действие ко всем клеткам внутри набора треугольников (x,z по 3 точки). Каждая клетка — максимум один раз.</summary>
        public FieldOpResult ApplyTriangles(in FieldOp op, ReadOnlySpan<float> tris)
        {
            var res = new FieldOpResult();
            if (tris.Length < 6 || tris.Length % 6 != 0) return res;
            float minX = float.MaxValue, minZ = float.MaxValue, maxX = float.MinValue, maxZ = float.MinValue;
            for (int i = 0; i < tris.Length; i += 2) { minX = Math.Min(minX, tris[i]); maxX = Math.Max(maxX, tris[i]); minZ = Math.Min(minZ, tris[i + 1]); maxZ = Math.Max(maxZ, tris[i + 1]); }
            CellRange(minX, minZ, maxX, maxZ, out int x0, out int z0, out int x1, out int z1);
            double yield = 0; var o = op;
            for (int cz = z0; cz <= z1; cz++)
            {
                float pz = OriginZ + (cz + 0.5f) * CellSize;
                for (int cx = x0; cx <= x1; cx++)
                {
                    var ch = ChunkOf(cx, cz); if (ch == null) { cx |= FieldChunk.Size - 1; continue; }   // целый пустой чанк пропускаем
                    int i = Local(cx, cz); if (ch.FieldId[i] == 0) continue;
                    float px = OriginX + (cx + 0.5f) * CellSize;
                    if (!InAnyTriangle(tris, px, pz)) continue;
                    if (o.TryApply(ref ch.State[i], CellArea, ref yield)) { res.CellsChanged++; ch.GpuDirty = ch.SaveDirty = true; }
                }
            }
            res.AreaM2 = res.CellsChanged * CellArea; res.YieldLiters = yield;
            return res;
        }

        static bool InAnyTriangle(ReadOnlySpan<float> t, float px, float pz)
        {
            for (int k = 0; k + 5 < t.Length; k += 6)
            {
                float ax = t[k], az = t[k + 1], bx = t[k + 2], bz = t[k + 3], cx = t[k + 4], cz = t[k + 5];
                float d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
                float d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
                float d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
                bool neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
                if (!(neg && pos)) return true;
            }
            return false;
        }

        // ---------------------------------------------------------------- рост
        public bool GrowthPending => growthCursor < allocated.Count;

        /// <summary>Начать новый период роста (смена суток / периода). Сам расчёт идёт порциями через StepGrowth.</summary>
        public void BeginGrowthPeriod(bool rain = false)
        {
            while (GrowthPending) StepGrowth(int.MaxValue);   // прошлый период не досчитан — досчитать сразу
            GrowthPeriod++; growthRain = rain; growthCursor = 0;
        }

        /// <summary>Посчитать рост не больше чем в maxChunks чанках. Возвращает, сколько чанков осталось.</summary>
        public int StepGrowth(int maxChunks)
        {
            int done = 0;
            while (growthCursor < allocated.Count && done < maxChunks)
            {
                var c = allocated[growthCursor++];
                if (c.GrowthPeriod >= GrowthPeriod) continue;
                GrowChunk(c, GrowthPeriod, growthRain); c.GrowthPeriod = GrowthPeriod; done++;
            }
            return allocated.Count - growthCursor;
        }

        void GrowChunk(FieldChunk c, int period, bool rain)
        {
            bool changed = false; uint seedBase = (uint)c.Index * 4096u;
            for (int i = 0; i < FieldChunk.Cells; i++)
            {
                if (c.FieldId[i] == 0) continue;
                uint s = c.State[i], n = GrowCell(s, Hash(seedBase + (uint)i, (uint)period), rain);
                if (n != s) { c.State[i] = n; changed = true; }
            }
            if (changed) c.GpuDirty = c.SaveDirty = true;
        }

        /// <summary>Один период для одной клетки: влажность, культура на стадию дальше, сорняки.</summary>
        uint GrowCell(uint s, uint hash, bool rain)
        {
            var g = FieldCell.Ground(s); if (g == GroundType.None) return s;
            int m = rain ? FieldCell.MaxMoisture : FieldCell.Moisture(s) - 1;
            s = FieldCell.WithMoisture(FieldCell.WithFertNow(s, false), m);
            var crop = FieldCell.Crop(s);
            if (crop != CropType.None)
            {
                var def = FieldCrops.Get(crop); int st = FieldCell.Growth(s);
                if (st < def.ReadyStage) { if (FieldCell.Moisture(s) > 0) st++; }   // в засуху рост стоит
                else if (st == def.ReadyStage && Withering) st = def.WitherStage;
                s = FieldCell.WithGrowth(s, st);
            }
            int w = FieldCell.Weeds(s);
            if (w == 0) { if ((g == GroundType.Cultivated || g == GroundType.Plowed || g == GroundType.Seeded) && hash % 100 < (uint)WeedChance) w = 1; }
            else if (w < 6 && FieldCell.Moisture(s) > 0) w++;
            return FieldCell.WithWeeds(s, w);
        }

        static uint Hash(uint a, uint b)
        {
            uint h = a * 0x9E3779B1u ^ (b + 0x7F4A7C15u) * 0x85EBCA77u;
            h ^= h >> 15; h *= 0x2C1B3C6Du; h ^= h >> 12; h *= 0x297A2D39u; h ^= h >> 15;
            return h;
        }

        // ---------------------------------------------------------------- для видеокарты
        /// <summary>Сложить в список чанки, которые надо перезалить в текстуру (не больше max), и снять с них флаг.</summary>
        public int TakeGpuDirty(List<FieldChunk> into, int max)
        {
            int n = 0;
            for (int i = 0; i < allocated.Count && n < max; i++) { var c = allocated[i]; if (!c.GpuDirty) continue; c.GpuDirty = false; into.Add(c); n++; }
            return n;
        }

        // ---------------------------------------------------------------- статистика поля
        public FieldStats GetFieldStats(ushort id)
        {
            var st = new FieldStats();
            if (!chunksByField.TryGetValue(id, out var list)) return st;
            foreach (var c in list)
                for (int i = 0; i < FieldChunk.Cells; i++)
                {
                    if (c.FieldId[i] != id) continue; uint s = c.State[i]; st.Cells++;
                    switch (FieldCell.Ground(s))
                    {
                        case GroundType.Grass: st.Grass++; break; case GroundType.Stubble: st.Stubble++; break;
                        case GroundType.Cultivated: st.Cultivated++; break; case GroundType.Plowed: st.Plowed++; break;
                        case GroundType.Seeded: st.Seeded++; break;
                    }
                    var crop = FieldCell.Crop(s);
                    if (crop != CropType.None) { int g = FieldCell.Growth(s), r = FieldCrops.Get(crop).ReadyStage; if (g == r) st.Ready++; else if (g > r) st.Withered++; }
                    int w = FieldCell.Weeds(s); if (w >= 1 && w <= 6) st.Weedy++;
                    if (FieldCell.PlowNeed(s) >= FieldCell.MaxPlowNeed) st.NeedPlow++;
                    if (!FieldCell.Lime(s)) st.NoLime++;
                    st.FertSum += FieldCell.Fert(s);
                }
            return st;
        }

        // ---------------------------------------------------------------- сохранение
        const uint Magic = 0x31475346; // "FSG1"

        /// <summary>Сохранить состояния полей (номера полей не сохраняются: они строятся заново из многоугольников).</summary>
        public byte[] Save()
        {
            using (var ms = new MemoryStream())
            {
                using (var gz = new GZipStream(ms, CompressionLevel.Fastest, true))
                using (var w = new BinaryWriter(gz))
                {
                    w.Write(Magic); w.Write(1); w.Write(Width); w.Write(Height); w.Write(CellSize); w.Write(OriginX); w.Write(OriginZ); w.Write(GrowthPeriod);
                    w.Write(allocated.Count);
                    foreach (var c in allocated) { w.Write(c.Index); w.Write(MemoryMarshal.AsBytes(c.State.AsSpan())); c.SaveDirty = false; }   // чанк одним куском (порядок байт little-endian)
                }
                return ms.ToArray();
            }
        }

        /// <summary>Загрузить сохранение. Поля (AddField) должны быть уже добавлены — клетки вне полей игнорируются.</summary>
        public void Load(byte[] data)
        {
            using (var ms = new MemoryStream(data))
            using (var gz = new GZipStream(ms, CompressionMode.Decompress))
            using (var r = new BinaryReader(gz))
            {
                if (r.ReadUInt32() != Magic) throw new InvalidDataException("не сохранение полей");
                int ver = r.ReadInt32(); if (ver != 1) throw new InvalidDataException("неизвестная версия " + ver);
                int w = r.ReadInt32(), h = r.ReadInt32(); r.ReadSingle(); r.ReadSingle(); r.ReadSingle();
                if (w != Width || h != Height) throw new InvalidDataException("другой размер карты");
                GrowthPeriod = r.ReadInt32(); growthCursor = allocated.Count;
                int count = r.ReadInt32(); var buf = new uint[FieldChunk.Cells];
                for (int k = 0; k < count; k++)
                {
                    int idx = r.ReadInt32(); var c = idx >= 0 && idx < chunks.Length ? chunks[idx] : null;
                    var bytes = MemoryMarshal.AsBytes(buf.AsSpan());
                    for (int got = 0; got < bytes.Length;) { int n = r.Read(bytes.Slice(got)); if (n <= 0) throw new EndOfStreamException(); got += n; }
                    if (c == null) continue;
                    for (int i = 0; i < FieldChunk.Cells; i++) if (c.FieldId[i] != 0) c.State[i] = buf[i];
                    c.GpuDirty = true; c.SaveDirty = false;
                }
                foreach (var c in allocated) c.GrowthPeriod = GrowthPeriod;
            }
        }
    }
}
