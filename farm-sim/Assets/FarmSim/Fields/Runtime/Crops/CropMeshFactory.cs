// Простая кочка стеблей для начала (пока нет своей модели из Blender): несколько изогнутых сужающихся листьев/стеблей.
// Высота 0..1 по Y, радиус ~0.5 — нужный размер ставит рендер (высота и ширина из стадии роста).
using System.Collections.Generic;
using UnityEngine;

namespace FarmSim.Fields
{
    public static class CropMeshFactory
    {
        /// <param name="blades">сколько стеблей в кочке (7 — пшеница, 4 — кукуруза с широкими листьями)</param>
        /// <param name="bladeWidth">ширина стебля у основания (в долях радиуса)</param>
        public static Mesh CreateTuft(int blades = 7, float bladeWidth = 0.09f, int segments = 3, int seed = 1)
        {
            var pos = new List<Vector3>(); var nrm = new List<Vector3>(); var uv = new List<Vector2>(); var idx = new List<int>();
            var rnd = new System.Random(seed);
            for (int b = 0; b < blades; b++)
            {
                float a = (float)(b / (double)blades * Mathf.PI * 2 + rnd.NextDouble() * 0.6), r = 0.12f + (float)rnd.NextDouble() * 0.3f;
                float lean = 0.15f + (float)rnd.NextDouble() * 0.25f, rot = a + 1.3f;
                var root = new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r);
                var side = new Vector3(Mathf.Cos(rot), 0, Mathf.Sin(rot));
                var outward = new Vector3(Mathf.Cos(a), 0.6f, Mathf.Sin(a)).normalized;
                int v0 = pos.Count;
                for (int k = 0; k <= segments; k++)
                {
                    float t = k / (float)segments, w = bladeWidth * (1f - t * 0.85f);
                    var c = root + new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a)) * lean * t * t + Vector3.up * t;
                    pos.Add(c - side * w); pos.Add(c + side * w);
                    nrm.Add(outward); nrm.Add(outward);
                    uv.Add(new Vector2(0, t)); uv.Add(new Vector2(1, t));
                    if (k > 0) { int o = v0 + (k - 1) * 2; idx.Add(o); idx.Add(o + 1); idx.Add(o + 2); idx.Add(o + 1); idx.Add(o + 3); idx.Add(o + 2); }
                }
            }
            var m = new Mesh { name = "CropTuft" };
            m.SetVertices(pos); m.SetNormals(nrm); m.SetUVs(0, uv); m.SetTriangles(idx, 0);
            m.bounds = new Bounds(new Vector3(0, 0.5f, 0), new Vector3(1.2f, 1.2f, 1.2f));
            return m;
        }
    }
}
