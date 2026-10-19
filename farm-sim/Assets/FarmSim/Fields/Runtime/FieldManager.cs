// Менеджер полей в сцене Unity: держит сетку (FieldGrid), текстуру состояний для шейдеров и считает рост по кадрам.
//
// Видеокарта получает одну текстуру RGBA32 размером с сетку (2048×2048 = 16 МБ): 1 пиксель = 1 клетка, 4 байта = uint клетки.
// После первой заливки в неё копируются только изменившиеся чанки 64×64 (16 КБ каждый) через Graphics.CopyTexture —
// поэтому проход трактора стоит десятки килобайт в кадр, а не мегабайты. Если устройство не умеет CopyTexture,
// включается запасной путь: правка CPU-копии текстуры и полная заливка не чаще 10 раз в секунду.
//
// Шейдеры читают глобальные параметры:
//   _FieldStateTex  — текстура состояний (читать только через Load, без фильтрации)
//   _FieldParams    — (originX, originZ, 1/cellSize, cellSize)
//   _FieldSizeCells — (ширина, высота, 1/ширина, 1/высота) в клетках
using System.Collections.Generic;
using Unity.Collections;
using UnityEngine;

namespace FarmSim.Fields
{
    [DefaultExecutionOrder(-100)]
    public sealed class FieldManager : MonoBehaviour
    {
        public static FieldManager Instance { get; private set; }

        [Header("Сетка (вся карта)")]
        [Tooltip("Левый нижний угол карты в мире (X, Z)")]
        [SerializeField] Vector2 origin = new Vector2(-512f, -512f);
        [Tooltip("Размер клетки в метрах. 0.5 — как в Farming Simulator; на слабых телефонах 1.0 (в 4 раза меньше памяти)")]
        [SerializeField] float cellSize = 0.5f;
        [Tooltip("Размер карты в клетках (округлится вверх до 64)")]
        [SerializeField] Vector2Int sizeCells = new Vector2Int(2048, 2048);

        [Header("Бюджет на кадр")]
        [SerializeField] int uploadChunksPerFrame = 64;    // сколько грязных чанков отправить в видеокарту за кадр
        [SerializeField] int growthChunksPerFrame = 8;     // сколько чанков посчитать роста за кадр (8 ≈ 1 мс: вся карта 1 км² за ~2 с)
        [SerializeField] float fallbackUploadInterval = 0.1f;

        [Header("Рост")]
        [SerializeField] bool withering = false;
        [SerializeField, Range(0, 100)] int weedChance = 10;

        [Header("Материалы грунта (необязательно: параметры и так глобальные)")]
        [SerializeField] Material[] groundMaterials;

        public FieldGrid Grid { get; private set; }
        public Texture2D StateTexture => stateTex;

        static readonly int IdTex = Shader.PropertyToID("_FieldStateTex");
        static readonly int IdParams = Shader.PropertyToID("_FieldParams");
        static readonly int IdSize = Shader.PropertyToID("_FieldSizeCells");

        Texture2D stateTex;
        Texture2D[] staging;
        bool useCopy;
        float fallbackTimer;
        bool fallbackPending;
        readonly List<FieldChunk> dirty = new List<FieldChunk>(256);
        readonly Dictionary<FieldArea, ushort> areas = new Dictionary<FieldArea, ushort>();

        void Awake()
        {
            if (Instance != null && Instance != this) { Debug.LogError("В сцене два FieldManager — второй выключен", this); enabled = false; return; }
            Instance = this;
            Grid = new FieldGrid(origin.x, origin.y, cellSize, sizeCells.x, sizeCells.y) { Withering = withering, WeedChance = weedChance };
            foreach (var f in FindObjectsByType<FieldArea>(FindObjectsInactive.Exclude, FindObjectsSortMode.None)) RegisterField(f);
            CreateTexture();
            BindShaders();
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            if (stateTex) Destroy(stateTex);
            if (staging != null) foreach (var t in staging) if (t) Destroy(t);
        }

        /// <summary>Добавить поле из компонента FieldArea (вызывается сам в Awake для всех полей сцены).</summary>
        public ushort RegisterField(FieldArea area)
        {
            if (areas.TryGetValue(area, out var have)) return have;
            int cells = Grid.AddField(area.FieldId, area.GetPolygonXZ(), area.StartGround);
            areas[area] = area.FieldId;
            if (cells == 0) Debug.LogWarning($"Поле {area.FieldId} не попало на сетку: проверь границы карты и точки поля", area);
            return area.FieldId;
        }

        // ---------------------------------------------------------------- текстура
        void CreateTexture()
        {
            stateTex = new Texture2D(Grid.Width, Grid.Height, TextureFormat.RGBA32, false, true)
            {
                name = "FieldState", filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, anisoLevel = 0,
            };
            var all = stateTex.GetPixelData<uint>(0);
            for (int i = 0; i < all.Length; i++) all[i] = 0u;
            foreach (var c in Grid.AllocatedChunks) { CopyChunkTo(all, c); c.GpuDirty = false; }

            useCopy = SystemInfo.copyTextureSupport != UnityEngine.Rendering.CopyTextureSupport.None;
            // при копировании по кускам CPU-копия больше не нужна: освобождаем 16 МБ оперативки
            stateTex.Apply(false, useCopy);
            if (useCopy)
            {
                staging = new Texture2D[Mathf.Max(1, uploadChunksPerFrame)];
                for (int i = 0; i < staging.Length; i++)
                    staging[i] = new Texture2D(FieldChunk.Size, FieldChunk.Size, TextureFormat.RGBA32, false, true) { name = "FieldChunkStaging", filterMode = FilterMode.Point };
            }
        }

        void CopyChunkTo(NativeArray<uint> all, FieldChunk c)
        {
            int baseX = c.Cx * FieldChunk.Size, baseZ = c.Cz * FieldChunk.Size;
            for (int lz = 0; lz < FieldChunk.Size; lz++)
                NativeArray<uint>.Copy(c.State, lz * FieldChunk.Size, all, (baseZ + lz) * Grid.Width + baseX, FieldChunk.Size);
        }

        void BindShaders()
        {
            var p = new Vector4(origin.x, origin.y, 1f / cellSize, cellSize);
            var s = new Vector4(Grid.Width, Grid.Height, 1f / Grid.Width, 1f / Grid.Height);
            Shader.SetGlobalTexture(IdTex, stateTex); Shader.SetGlobalVector(IdParams, p); Shader.SetGlobalVector(IdSize, s);
            if (groundMaterials != null)
                foreach (var m in groundMaterials) if (m) { m.SetTexture(IdTex, stateTex); m.SetVector(IdParams, p); m.SetVector(IdSize, s); }
        }

        void LateUpdate()
        {
            if (Grid.GrowthPending) Grid.StepGrowth(growthChunksPerFrame);
            UploadDirty();
        }

        void UploadDirty()
        {
            if (useCopy)
            {
                dirty.Clear(); Grid.TakeGpuDirty(dirty, staging.Length);
                for (int i = 0; i < dirty.Count; i++)
                {
                    var c = dirty[i]; var st = staging[i];
                    st.SetPixelData(c.State, 0); st.Apply(false);
                    Graphics.CopyTexture(st, 0, 0, 0, 0, FieldChunk.Size, FieldChunk.Size, stateTex, 0, 0, c.Cx * FieldChunk.Size, c.Cz * FieldChunk.Size);
                }
                return;
            }
            // запасной путь: правим CPU-копию, заливаем целиком не чаще fallbackUploadInterval
            dirty.Clear(); Grid.TakeGpuDirty(dirty, int.MaxValue);
            if (dirty.Count > 0) { var all = stateTex.GetPixelData<uint>(0); foreach (var c in dirty) CopyChunkTo(all, c); fallbackPending = true; }
            fallbackTimer += Time.unscaledDeltaTime;
            if (fallbackPending && fallbackTimer >= fallbackUploadInterval) { stateTex.Apply(false); fallbackPending = false; fallbackTimer = 0f; }
        }

        // ---------------------------------------------------------------- API для орудий и игры
        /// <summary>Действие в четырёхугольнике a-b-c-d (мировые координаты, высота не важна).</summary>
        public FieldOpResult ApplyQuad(in FieldOp op, Vector3 a, Vector3 b, Vector3 c, Vector3 d) => Grid.ApplyQuad(op, a.x, a.z, b.x, b.z, c.x, c.z, d.x, d.z);

        /// <summary>
        /// Рабочая зона орудия за шаг физики: полоса, которую передняя кромка прошла с прошлого шага (prevL-prevR → left-right),
        /// плюс сама зона контакта (left-right-backRight-backLeft). Так нет пропусков ни на скорости, ни на поворотах.
        /// </summary>
        public FieldOpResult ApplyWorkArea(in FieldOp op, Vector3 prevLeft, Vector3 prevRight, Vector3 left, Vector3 right, Vector3 backLeft, Vector3 backRight)
        {
            System.Span<float> t = stackalloc float[24]
            {
                prevLeft.x, prevLeft.z, prevRight.x, prevRight.z, right.x, right.z,
                prevLeft.x, prevLeft.z, right.x, right.z, left.x, left.z,
                left.x, left.z, right.x, right.z, backRight.x, backRight.z,
                left.x, left.z, backRight.x, backRight.z, backLeft.x, backLeft.z,
            };
            return Grid.ApplyTriangles(op, t);
        }

        public uint GetState(Vector3 world) => Grid.GetAtWorld(world.x, world.z);
        public FieldStats GetFieldStats(ushort fieldId) => Grid.GetFieldStats(fieldId);

        /// <summary>Новый период роста (вызывать из системы времени: смена суток / периода). Считается порциями по кадрам.</summary>
        public void NextGrowthPeriod(bool rain = false) => Grid.BeginGrowthPeriod(rain);

        public byte[] Save() => Grid.Save();
        public void Load(byte[] data) => Grid.Load(data);   // текстура обновится сама: Load помечает чанки грязными

#if UNITY_EDITOR
        [ContextMenu("Отладка: следующий период роста")] void DebugGrow() => NextGrowthPeriod(false);
        [ContextMenu("Отладка: период роста с дождём")] void DebugGrowRain() => NextGrowthPeriod(true);
#endif
    }
}
