// Сцепка трактора: 3-точечная навеска с гидравликой, дышло для прицепных орудий и вал отбора мощности (ВОМ).
//
// Как это устроено в физике:
//  • Орудие цепляется ConfigurableJoint к телу трактора. Перед сцепкой орудие ставится точно в точку сцепки,
//    иначе сустав «выстрелит».
//  • 3-точечная: орудие не крутится по курсу; вверх-вниз его двигает гидравлика (точка сустава поднимается на liftHeight).
//    Опущенное — «плавает»: может ходить по высоте ±floatRange и чуть качаться, повторяя рельеф. Поднятое держится жёстко.
//  • Дышло: орудие свободно поворачивается за трактором (±75°), качается по рельефу; опускается своей гидравликой
//    (та же HydraulicLift, только без подъёма точки сцепки).
//  • ВОМ: вал разгоняется от оборотов двигателя; орудию, которому он нужен, без него работать нельзя (ImplementWorkArea.PtoOn),
//    а включённый вал забирает мощность у двигателя (TractorController → Drivetrain).
using System.Collections.Generic;
using UnityEngine;

namespace FarmSim.Vehicles
{
    public sealed class TractorHitch : MonoBehaviour
    {
        [System.Serializable]
        public class HitchPoint
        {
            public string name = "Задняя навеска";
            public AttachType type = AttachType.ThreePoint;
            [Tooltip("Точка сцепки на тракторе в нижнем положении гидравлики")]
            public Transform point;
            [Tooltip("Насколько гидравлика поднимает точку, м")]
            public float liftHeight = 0.7f;
            [Tooltip("На сколько опущенное орудие может ходить по высоте за рельефом, м")]
            public float floatRange = 0.12f;
            public HydraulicLift lift = new HydraulicLift();
            [HideInInspector] public Implement attached;
            [HideInInspector] public ConfigurableJoint joint;
            [HideInInspector] public Vector3 baseLocal;
            [HideInInspector] public bool floating;
        }

        public List<HitchPoint> points = new List<HitchPoint>();
        public PtoShaft pto = new PtoShaft();
        [SerializeField] float attachDistance = 0.7f;
        [SerializeField] float attachAngleDeg = 25f;

        TractorController tractor;
        Rigidbody body;

        public float PtoLoadW { get; private set; }
        public float DraftEstimateN { get; private set; }
        public float AttachedMassKg { get; private set; }
        /// <summary>Предел скорости от опущенных орудий, м/с (0 — нет предела). Берётся самый строгий.</summary>
        public float SpeedLimitMs { get; private set; }

        void Awake()
        {
            tractor = GetComponent<TractorController>(); body = GetComponent<Rigidbody>();
            foreach (var hp in points) if (hp.point) hp.baseLocal = transform.InverseTransformPoint(hp.point.position);
        }

        // ---------------------------------------------------------------- сцепка
        /// <summary>Ближайшее свободное орудие, которое можно прицепить (тип сцепки, расстояние, направление).</summary>
        public Implement FindAttachable(out HitchPoint at)
        {
            at = null; Implement best = null; float bestD = float.MaxValue;
            foreach (var hp in points)
            {
                if (hp.attached != null || hp.point == null) continue;
                Vector3 hpos = PointWorld(hp), hf = transform.forward;
                foreach (var im in Implement.All)
                {
                    if (im.AttachedTo != null || im.attachPoint == null) continue;
                    Vector3 ip = im.attachPoint.position, ifw = im.transform.forward;
                    if (!AttachRules.CanAttach(hp.type, im.attachType, hpos.x, hpos.z, hf.x, hf.z, ip.x, ip.z, ifw.x, ifw.z, attachDistance, attachAngleDeg)) continue;
                    float d = (ip - hpos).sqrMagnitude; if (d < bestD) { bestD = d; best = im; at = hp; }
                }
            }
            return best;
        }

        public bool TryAttach() { var im = FindAttachable(out var hp); if (im == null) return false; Attach(hp, im); return true; }

        public void Attach(HitchPoint hp, Implement im)
        {
            // поставить орудие точно в точку сцепки (по курсу — как трактор), потом соединить
            Vector3 hpos = PointWorld(hp);
            var rot = Quaternion.LookRotation(Vector3.ProjectOnPlane(transform.forward, Vector3.up), Vector3.up);
            if (hp.type == AttachType.Drawbar) rot = Quaternion.LookRotation(Vector3.ProjectOnPlane(im.transform.forward, Vector3.up), Vector3.up);
            Vector3 offset = im.transform.position - im.attachPoint.position;
            im.transform.SetPositionAndRotation(hpos + rot * Quaternion.Inverse(im.transform.rotation) * offset, rot);
            im.Body.position = im.transform.position; im.Body.rotation = im.transform.rotation;

            var j = im.gameObject.AddComponent<ConfigurableJoint>();
            j.connectedBody = body; j.autoConfigureConnectedAnchor = false;
            j.anchor = im.transform.InverseTransformPoint(im.attachPoint.position);
            j.connectedAnchor = transform.InverseTransformPoint(hpos);
            j.xMotion = j.yMotion = j.zMotion = ConfigurableJointMotion.Locked;
            j.enableCollision = false;
            if (hp.type == AttachType.ThreePoint)
            {
                j.angularYMotion = ConfigurableJointMotion.Locked;                    // по курсу навеска не даёт крутиться
                j.angularXMotion = ConfigurableJointMotion.Limited; j.angularZMotion = ConfigurableJointMotion.Limited;
                j.lowAngularXLimit = new SoftJointLimit { limit = -10f }; j.highAngularXLimit = new SoftJointLimit { limit = 10f };
                j.angularZLimit = new SoftJointLimit { limit = 5f };
            }
            else
            {
                j.angularYMotion = ConfigurableJointMotion.Limited; j.angularYLimit = new SoftJointLimit { limit = 75f };   // поворот за трактором
                j.angularXMotion = ConfigurableJointMotion.Limited; j.lowAngularXLimit = new SoftJointLimit { limit = -25f }; j.highAngularXLimit = new SoftJointLimit { limit = 25f };
                j.angularZMotion = ConfigurableJointMotion.Limited; j.angularZLimit = new SoftJointLimit { limit = 12f };
            }
            hp.attached = im; hp.joint = j; hp.floating = false;
            hp.lift.Position = hp.lift.Target = 1f;                                   // прицепили — поднято
            im.OnAttached(this);
            RecountMass();
        }

        public void Detach(HitchPoint hp)
        {
            if (hp.attached == null) return;
            if (hp.joint) Destroy(hp.joint);
            hp.attached.OnDetached(); hp.attached = null; hp.joint = null;
            RecountMass();
        }

        public void DetachAll() { foreach (var hp in points) Detach(hp); }

        // ---------------------------------------------------------------- гидравлика и ВОМ
        public void ToggleLift(int index = -1) { foreach (var hp in Targets(index)) hp.lift.Toggle(); }
        public void LowerAll() { foreach (var hp in points) hp.lift.Lower(); }
        public void RaiseAll() { foreach (var hp in points) hp.lift.Raise(); }
        public void TogglePto() => pto.On = !pto.On;

        IEnumerable<HitchPoint> Targets(int index) { for (int i = 0; i < points.Count; i++) if (index < 0 || index == i) yield return points[i]; }

        Vector3 PointWorld(HitchPoint hp) => transform.TransformPoint(hp.baseLocal + Vector3.up * (hp.type == AttachType.ThreePoint ? hp.lift.Position * hp.liftHeight : 0f));

        void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            pto.Step(tractor != null ? tractor.EngineRpm : 0f, dt);
            float ptoW = 0f, draft = 0f, limit = 0f;
            foreach (var hp in points)
            {
                hp.lift.Step(dt);
                var im = hp.attached; if (im == null || hp.joint == null) continue;
                if (hp.type == AttachType.ThreePoint)
                {
                    hp.joint.connectedAnchor = hp.baseLocal + Vector3.up * (hp.lift.Position * hp.liftHeight);
                    bool shouldFloat = hp.lift.IsDown;                               // опущено — повторяет рельеф по высоте
                    if (shouldFloat != hp.floating)
                    {
                        hp.floating = shouldFloat;
                        hp.joint.yMotion = shouldFloat ? ConfigurableJointMotion.Limited : ConfigurableJointMotion.Locked;
                        hp.joint.linearLimit = new SoftJointLimit { limit = hp.floatRange };
                    }
                }
                if (im.workArea != null)
                {
                    im.workArea.IsLowered = hp.lift.IsDown;
                    im.workArea.PtoOn = pto.RpmOk;
                }
                if (im.needsPto) { ptoW += pto.LoadW(im.ptoPowerKW * 1000f); im.SetPtoRpm(pto.Rpm); }
                draft += im.CurrentDraftN;
                if (hp.lift.IsDown && im.speedLimitKmh > 0f) { float l = im.speedLimitKmh / 3.6f; limit = limit > 0f ? Mathf.Min(limit, l) : l; }
            }
            PtoLoadW = ptoW; DraftEstimateN = draft; SpeedLimitMs = limit;
        }

        void RecountMass() { float m = 0f; foreach (var hp in points) if (hp.attached) m += hp.attached.Body.mass; AttachedMassKg = m; }

        void OnDrawGizmosSelected()
        {
            foreach (var hp in points)
            {
                if (hp.point == null) continue;
                Gizmos.color = hp.attached ? Color.green : Color.yellow;
                Gizmos.DrawWireSphere(Application.isPlaying ? PointWorld(hp) : hp.point.position, attachDistance);
            }
        }
    }
}
