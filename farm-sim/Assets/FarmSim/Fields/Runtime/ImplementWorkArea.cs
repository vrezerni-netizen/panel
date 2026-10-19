// Рабочая зона навесного или прицепного орудия (плуг, культиватор, сеялка, жатка комбайна…).
//
// Как в Farming Simulator, зона задаётся тремя точками на раме орудия:
//   workStart  — левая передняя точка рабочей кромки
//   workWidth  — правая передняя точка (ширина захвата = расстояние start→width)
//   workHeight — левая задняя точка (глубина зоны контакта, обычно 0.5–1.5 м)
// Каждый шаг физики орудие сообщает менеджеру полосу, которую прошла кромка с прошлого шага, и сетка меняет клетки.
//
// Пример: плуг 4 м. workStart (-2, 0, 0.6), workWidth (2, 0, 0.6), workHeight (-2, 0, -0.6) относительно рамы.
// Опустили гидравликой (IsLowered = true), трактор едет вперёд быстрее 0.5 км/ч, лемеха касаются земли —
// клетки под полосой становятся «вспахано», борозды повёрнуты по ходу трактора.
using UnityEngine;
using UnityEngine.Events;

namespace FarmSim.Fields
{
    public sealed class ImplementWorkArea : MonoBehaviour
    {
        [System.Serializable] public class WorkedEvent : UnityEvent<FieldOpResult> { }

        [Header("Что делает орудие")]
        [SerializeField] FieldOpKind operation = FieldOpKind.Plow;
        [Tooltip("Для сеялки: какую культуру сеять. Для жатки: какую культуру убирать (None = любую)")]
        [SerializeField] CropType crop = CropType.Wheat;
        [Tooltip("Прямой посев по стерне без обработки (сеялки no-till)")]
        [SerializeField] bool directSeeding;

        [Header("Рабочая зона")]
        [SerializeField] Transform workStart;
        [SerializeField] Transform workWidth;
        [SerializeField] Transform workHeight;

        [Header("Условия работы")]
        [Tooltip("Опущено ли орудие (управляет навеска / гидравлика)")]
        public bool IsLowered = true;
        [Tooltip("Нужен ли включённый ВОМ (культиватор с ротором, мульчирователь, жатка)")]
        [SerializeField] bool needsPto;
        public bool PtoOn;
        [SerializeField] float minSpeedKmh = 0.5f;
        [Tooltip("Проверять лучом, что кромка касается земли (иначе орудие висит в воздухе — не работает)")]
        [SerializeField] bool needGroundContact = true;
        [SerializeField] LayerMask groundMask = ~0;
        [Tooltip("Насколько кромка может быть выше земли и всё ещё работать, м")]
        [SerializeField] float contactTolerance = 0.12f;

        [Header("События (частицы, расход семян/топлива, бункер комбайна)")]
        public WorkedEvent onWorked = new WorkedEvent();

        public FieldOpKind Operation { get => operation; set => operation = value; }
        public CropType Crop { get => crop; set => crop = value; }
        public bool IsWorking { get; private set; }
        public FieldOpResult LastResult { get; private set; }
        /// <summary>Ширина захвата, м (расстояние workStart → workWidth).</summary>
        public float Width => workStart && workWidth ? Vector3.Distance(workStart.position, workWidth.position) : 0f;
        /// <summary>Середина рабочей зоны в мире (там орудие «держится» за землю: тут прикладывается тяговое сопротивление).</summary>
        public Vector3 CenterWorld => workStart && workWidth && workHeight ? (workStart.position + workWidth.position) * 0.5f + (workHeight.position - workStart.position) * 0.5f : transform.position;
        public FieldOpResult Total;                     // всего за жизнь орудия (га = Total.AreaM2 / 10000)

        Rigidbody body;
        Vector3 prevLeft, prevRight;
        bool hasPrev;

        void Awake() { body = GetComponentInParent<Rigidbody>(); }

        void OnDisable() { hasPrev = false; IsWorking = false; }

        void FixedUpdate()
        {
            var fm = FieldManager.Instance;
            if (fm == null || workStart == null || workWidth == null || workHeight == null) return;

            Vector3 left = workStart.position, right = workWidth.position, backLeft = workHeight.position;
            Vector3 backRight = right + (backLeft - left);
            Vector3 forward = left - backLeft; forward.y = 0f;

            IsWorking = CanWork(forward);
            if (!IsWorking) { hasPrev = false; LastResult = default; return; }
            if (!hasPrev) { prevLeft = left; prevRight = right; hasPrev = true; }

            float heading = Mathf.Atan2(forward.x, forward.z) * Mathf.Rad2Deg;
            var op = new FieldOp(operation, FieldCell.AngleFromHeading(heading), crop, directSeeding);
            var r = fm.ApplyWorkArea(op, prevLeft, prevRight, left, right, backLeft, backRight);
            prevLeft = left; prevRight = right;

            LastResult = r;
            if (r.CellsChanged > 0) { Total.Add(r); onWorked.Invoke(r); }
        }

        bool CanWork(Vector3 forward)
        {
            if (!IsLowered || (needsPto && !PtoOn)) return false;
            if (body != null)
            {
#if UNITY_6000_0_OR_NEWER
                Vector3 v = body.linearVelocity;
#else
                Vector3 v = body.velocity;
#endif
                v.y = 0f;
                if (v.magnitude * 3.6f < minSpeedKmh || Vector3.Dot(v, forward) <= 0f) return false;   // назад не работает
            }
            if (needGroundContact && !(Touches(workStart.position) || Touches(workWidth.position))) return false;
            return true;
        }

        bool Touches(Vector3 p)
        {
            if (!Physics.Raycast(p + Vector3.up * 1.5f, Vector3.down, out var hit, 3f, groundMask, QueryTriggerInteraction.Ignore)) return false;
            return p.y <= hit.point.y + contactTolerance;
        }

        void OnDrawGizmosSelected()
        {
            if (workStart == null || workWidth == null || workHeight == null) return;
            Vector3 l = workStart.position, r = workWidth.position, bl = workHeight.position, br = r + (bl - l);
            Gizmos.color = IsWorking ? Color.green : new Color(1f, 0.6f, 0.1f);
            Gizmos.DrawLine(l, r); Gizmos.DrawLine(r, br); Gizmos.DrawLine(br, bl); Gizmos.DrawLine(bl, l);
        }
    }
}
