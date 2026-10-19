// Граница одного поля на карте. Точки границы — дочерние объекты по порядку обхода (минимум 3).
// FieldManager при старте превращает многоугольник в клетки сетки.
using UnityEngine;

namespace FarmSim.Fields
{
    public sealed class FieldArea : MonoBehaviour
    {
        [Tooltip("Номер поля (1..65535). Должен быть уникальным на карте")]
        [SerializeField] ushort fieldId = 1;
        [Tooltip("Состояние земли в начале новой игры")]
        [SerializeField] GroundType startGround = GroundType.Stubble;

        public ushort FieldId => fieldId;
        public GroundType StartGround => startGround;

        /// <summary>Точки границы (x0,z0, x1,z1, …) в мировых координатах.</summary>
        public float[] GetPolygonXZ()
        {
            int n = transform.childCount; var p = new float[n * 2];
            for (int i = 0; i < n; i++) { var w = transform.GetChild(i).position; p[2 * i] = w.x; p[2 * i + 1] = w.z; }
            return p;
        }

        void OnDrawGizmos()
        {
            int n = transform.childCount; if (n < 2) return;
            Gizmos.color = new Color(1f, 0.85f, 0.2f, 1f);
            for (int i = 0; i < n; i++) Gizmos.DrawLine(transform.GetChild(i).position + Vector3.up * 0.2f, transform.GetChild((i + 1) % n).position + Vector3.up * 0.2f);
        }
    }
}
