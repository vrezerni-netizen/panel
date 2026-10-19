// Рендер растений всех полей: GPU-инстансинг без объектов в сцене.
//
// Кадр:
//  1. CPU: какие засеянные чанки 32×32 м видны камере (по коробке чанка) и ближе MaxDistance — их не больше maxVisibleChunks.
//  2. GPU, CropCulling.compute: по потоку на каждую кочку видимых чанков — читает клетку из _FieldStateTex,
//     отсекает пустое, далёкое (с прореживанием) и вне камеры, пишет компактные данные (32 байта) в участок своей культуры.
//  3. GPU: WriteArgs кладёт число стеблей каждого участка в аргументы отрисовки.
//  4. Graphics.RenderMeshIndirect — один вызов на культуру. Число стеблей CPU не знает и не ждёт.
// Состояние поля (рост, уборка) приходит только через текстуру FieldManager: срезал комбайн — в следующем кадре стеблей нет.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace FarmSim.Fields
{
    [System.Serializable]
    public class CropVisual
    {
        public CropType crop = CropType.Wheat;
        [Tooltip("Меш кочки: высота 0..1 по Y, радиус ~0.5. Пусто — сделается простой автоматически")]
        public Mesh mesh;
        [Tooltip("Материал на шейдере FarmSim/CropInstanced")]
        public Material material;
        [Tooltip("Высота спелого растения, м")]
        public float height = 0.95f;
        [Tooltip("Ширина кочки, м")]
        public float width = 0.45f;
        public bool castShadows = true;
    }

    [DefaultExecutionOrder(100)]
    public sealed class CropRenderer : MonoBehaviour
    {
        [SerializeField] ComputeShader culling;
        [SerializeField] List<CropVisual> crops = new List<CropVisual>();
        [Header("Плотность и дальность")]
        [Tooltip("Кочек на клетку 0.5 м: 1 (4 на м²), 2 или 4 (16 на м²)")]
        [SerializeField] int tuftsPerCell = 2;
        [SerializeField, Range(0f, 1f)] float jitter = 0.8f;
        [SerializeField] float maxDistance = 160f;
        [Tooltip("С какого расстояния начинается прореживание")]
        [SerializeField] float lodStart = 45f;
        [Tooltip("Какая доля кочек остаётся на краю дальности (оставшиеся шире)")]
        [SerializeField, Range(0.02f, 1f)] float lodMinKeep = 0.12f;
        [Header("Бюджет")]
        [SerializeField] int maxVisibleChunks = 192;
        [Tooltip("Сколько кочек одной культуры может быть видно за кадр (по 32 байта)")]
        [SerializeField] int capacityPerCrop = 262144;

        const int MaxCrops = 32, ArgsPerSlot = 5;
        static readonly int IdStems = Shader.PropertyToID("_Stems"), IdSlotOffset = Shader.PropertyToID("_SlotOffset");

        GraphicsBuffer stems, counters, args, visible;
        int kClear, kCull, kArgs;
        CropChunkIndex index;
        FieldManager fm;
        readonly Plane[] planes = new Plane[6];
        readonly Vector4[] planeVec = new Vector4[6];
        readonly Vector4[] cropParams = new Vector4[MaxCrops];
        readonly List<Vector4> visibleList = new List<Vector4>(256);
        readonly List<(float d, Vector4 v)> candidates = new List<(float, Vector4)>(512);
        MaterialPropertyBlock[] blocks;
        bool ready;

        void Start()
        {
            fm = FieldManager.Instance;
            if (fm == null || culling == null) { Debug.LogWarning("CropRenderer: нет FieldManager или compute-шейдера — растения не рисуются", this); enabled = false; return; }
            if (!SystemInfo.supportsComputeShaders) { Debug.LogWarning("CropRenderer: устройство без compute-шейдеров — растения выключены", this); enabled = false; return; }
            tuftsPerCell = tuftsPerCell >= 4 ? 4 : tuftsPerCell >= 2 ? 2 : 1;
            if (crops.Count == 0 || crops.Count > MaxCrops) { Debug.LogWarning("CropRenderer: нужно от 1 до 32 культур", this); enabled = false; return; }

            index = new CropChunkIndex(fm.Grid);
            kClear = culling.FindKernel("ClearCounters"); kCull = culling.FindKernel("CullStems"); kArgs = culling.FindKernel("WriteArgs");
            int slots = crops.Count;
            stems = new GraphicsBuffer(GraphicsBuffer.Target.Structured, slots * capacityPerCrop, 32);
            counters = new GraphicsBuffer(GraphicsBuffer.Target.Structured, MaxCrops, 4);
            visible = new GraphicsBuffer(GraphicsBuffer.Target.Structured, maxVisibleChunks, 16);
            args = new GraphicsBuffer(GraphicsBuffer.Target.IndirectArguments, slots, GraphicsBuffer.IndirectDrawIndexedArgs.size);

            var a = new GraphicsBuffer.IndirectDrawIndexedArgs[slots];
            for (int i = 0; i < MaxCrops; i++) cropParams[i] = new Vector4(-1, 1, 0, 0);
            blocks = new MaterialPropertyBlock[slots];
            for (int s = 0; s < slots; s++)
            {
                var cv = crops[s];
                if (cv.mesh == null) cv.mesh = CropMeshFactory.CreateTuft(cv.crop == CropType.Corn ? 4 : 7, cv.crop == CropType.Corn ? 0.16f : 0.09f, 3, s + 1);
                a[s] = new GraphicsBuffer.IndirectDrawIndexedArgs
                {
                    indexCountPerInstance = cv.mesh.GetIndexCount(0), instanceCount = 0,
                    startIndex = cv.mesh.GetIndexStart(0), baseVertexIndex = (uint)cv.mesh.GetBaseVertex(0), startInstance = 0,
                };
                cropParams[(int)cv.crop] = new Vector4(s, FieldCrops.Get(cv.crop).ReadyStage, cv.height, cv.width);
                blocks[s] = new MaterialPropertyBlock();
                blocks[s].SetBuffer(IdStems, stems);
                blocks[s].SetInteger(IdSlotOffset, s * capacityPerCrop);   // SV_InstanceID с нуля в каждом вызове
            }
            args.SetData(a);

            foreach (int k in new[] { kClear, kCull, kArgs })
            {
                culling.SetBuffer(k, "_Counters", counters);
            }
            culling.SetBuffer(kCull, "_Stems", stems);
            culling.SetBuffer(kCull, "_VisibleChunks", visible);
            culling.SetBuffer(kArgs, "_Args", args);
            culling.SetTexture(kCull, "_FieldStateTex", fm.StateTexture);
            var g = fm.Grid;
            culling.SetVector("_FieldParams", new Vector4(g.OriginX, g.OriginZ, 1f / g.CellSize, g.CellSize));
            culling.SetVector("_FieldSizeCells", new Vector4(g.Width, g.Height, 1f / g.Width, 1f / g.Height));
            culling.SetInt("_TuftsPerCell", tuftsPerCell);
            culling.SetInt("_TuftsPerChunk", FieldChunk.Cells * tuftsPerCell);
            culling.SetInt("_Capacity", capacityPerCrop);
            culling.SetInt("_SlotCount", slots);
            culling.SetVectorArray("_CropParams", cropParams);
            ready = true;
        }

        void OnDestroy()
        {
            stems?.Release(); counters?.Release(); args?.Release(); visible?.Release();
        }

        void LateUpdate()
        {
            if (!ready) return;
            var cam = Camera.main; if (cam == null) return;
            index.Refresh();

            // 1. видимые засеянные чанки (ближние первыми, чтобы при нехватке бюджета пропадали дальние)
            GeometryUtility.CalculateFrustumPlanes(cam, planes);
            var g = fm.Grid; float size = FieldChunk.Size * g.CellSize, maxH = 3f;
            Vector3 cp = cam.transform.position;
            candidates.Clear();
            foreach (var c in index.ChunksWithCrops)
            {
                float x0 = g.OriginX + c.Cx * size, z0 = g.OriginZ + c.Cz * size;
                var b = new Bounds(new Vector3(x0 + size / 2, maxH / 2, z0 + size / 2), new Vector3(size, maxH, size));
                float d = Mathf.Sqrt(b.SqrDistance(cp));
                if (d > maxDistance || !GeometryUtility.TestPlanesAABB(planes, b)) continue;
                candidates.Add((d, new Vector4(x0, z0, d, c.Index)));
            }
            candidates.Sort((p, q) => p.d.CompareTo(q.d));
            visibleList.Clear();
            for (int i = 0; i < candidates.Count && i < maxVisibleChunks; i++) visibleList.Add(candidates[i].v);
            if (visibleList.Count == 0) return;
            visible.SetData(visibleList);

            // 2–3. отбор на видеокарте
            for (int i = 0; i < 6; i++) planeVec[i] = new Vector4(planes[i].normal.x, planes[i].normal.y, planes[i].normal.z, planes[i].distance);
            culling.SetVectorArray("_FrustumPlanes", planeVec);
            culling.SetVector("_CameraPos", cp);
            culling.SetFloat("_MaxDistance", maxDistance); culling.SetFloat("_LodStart", lodStart); culling.SetFloat("_LodMinKeep", lodMinKeep); culling.SetFloat("_Jitter", jitter);
            culling.SetInt("_VisibleCount", visibleList.Count);
            int threads = visibleList.Count * FieldChunk.Cells * tuftsPerCell, groups = (threads + 63) / 64;
            int gx = Mathf.Min(groups, 65535), gy = (groups + gx - 1) / gx;
            culling.SetInt("_ThreadsPerRow", gx * 64);
            culling.Dispatch(kClear, 1, 1, 1);
            culling.Dispatch(kCull, gx, gy, 1);
            culling.Dispatch(kArgs, 1, 1, 1);

            // 4. по вызову на культуру
            var world = new Bounds(cp, Vector3.one * (maxDistance * 2f + 10f));
            for (int s = 0; s < crops.Count; s++)
            {
                var cv = crops[s]; if (cv.material == null) continue;
                var rp = new RenderParams(cv.material)
                {
                    worldBounds = world, matProps = blocks[s], layer = gameObject.layer, receiveShadows = true,
                    shadowCastingMode = cv.castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off,
                };
                Graphics.RenderMeshIndirect(rp, cv.mesh, args, 1, s);
            }
        }
    }
}
