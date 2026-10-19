// Трактор на колёсах Unity (WheelCollider) с трансмиссией из Drivetrain и почвой из сетки поля.
//
// Каждый шаг физики:
//  1. Под каждым колесом читается клетка поля: пашня, стерня, дорога, влажность → сцепление шин (жёсткость трения)
//     и сопротивление качению. На мокрой пашне колёса скользят и вязнут, на дороге держат.
//  2. Drivetrain считает силу тяги: мощность двигателя минус ВОМ, ограничение по сцеплению, обороты, нагрузку.
//  3. Сила раскладывается моментом на ведущие колёса (полный привод — на все), тормоза — на все.
//  4. Колёса на экране проседают в мягкую почву.
// Тяговое сопротивление орудий прикладывает само орудие (Implement) к своему телу — через сцепку оно тормозит трактор,
// а здесь оно учитывается только как «упреждение», чтобы круиз-контроль держал скорость.
using FarmSim.Fields;
using UnityEngine;

namespace FarmSim.Vehicles
{
    [RequireComponent(typeof(Rigidbody))]
    public sealed class TractorController : MonoBehaviour
    {
        [System.Serializable]
        public class Wheel
        {
            public WheelCollider collider;
            public Transform visual;
            public bool steer, drive = true;
            [HideInInspector] public float baseFwdStiffness, baseSideStiffness, sinkVisual;
        }

        [SerializeField] Wheel[] wheels = new Wheel[4];
        [SerializeField] Transform centerOfMass;
        [Tooltip("Масса трактора, кг (без орудий)")]
        [SerializeField] float massKg = 8000f;
        [SerializeField] float maxSteerDeg = 38f;
        [Tooltip("На скорости руль поворачивается меньше (доля на 40 км/ч)")]
        [SerializeField, Range(0.1f, 1f)] float steerAtSpeed = 0.35f;
        [Tooltip("Слои коллайдеров, которые считаются дорогой (асфальт, бетон)")]
        [SerializeField] LayerMask roadLayers;
        public Drivetrain drivetrain = new Drivetrain();

        // ---- управление (ставит TractorInput, интерфейс или наёмный рабочий)
        [Range(0, 1)] public float Throttle;
        [Range(0, 1)] public float Brake;
        [Range(-1, 1)] public float Steer;
        public bool Reverse;
        public bool Handbrake;

        // ---- состояние для приборов и звука
        public float SpeedKmh { get; private set; }
        public float EngineRpm => drivetrain.EngineRpm;
        public DriveOutput Last { get; private set; }
        public SoilResponse SoilUnder { get; private set; }
        public Rigidbody Body { get; private set; }

        TractorHitch hitch;
        float wheelbase = 2.8f, track = 1.9f;

        void Awake()
        {
            Body = GetComponent<Rigidbody>();
            Body.mass = massKg;
            Body.interpolation = RigidbodyInterpolation.Interpolate;
            Body.solverIterations = Mathf.Max(Body.solverIterations, 12);     // сцепки с тяжёлыми орудиями
            if (centerOfMass) Body.centerOfMass = transform.InverseTransformPoint(centerOfMass.position);
            hitch = GetComponent<TractorHitch>();
            foreach (var w in wheels)
            {
                if (w?.collider == null) continue;
                w.baseFwdStiffness = w.collider.forwardFriction.stiffness;
                w.baseSideStiffness = w.collider.sidewaysFriction.stiffness;
                drivetrain.WheelRadius = w.drive ? w.collider.radius : drivetrain.WheelRadius;
            }
            MeasureAxles();
        }

        void MeasureAxles()
        {
            float zf = float.MinValue, zr = float.MaxValue, xl = 0f, xr = 0f;
            foreach (var w in wheels)
            {
                if (w?.collider == null) continue;
                var p = transform.InverseTransformPoint(w.collider.transform.position);
                zf = Mathf.Max(zf, p.z); zr = Mathf.Min(zr, p.z); xl = Mathf.Min(xl, p.x); xr = Mathf.Max(xr, p.x);
            }
            if (zf > zr) wheelbase = zf - zr; if (xr > xl) track = xr - xl;
        }

        void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            Vector3 vel =
#if UNITY_6000_0_OR_NEWER
                Body.linearVelocity;
#else
                Body.velocity;
#endif
            float vFwd = Vector3.Dot(vel, transform.forward);
            SpeedKmh = vFwd * 3.6f;

            // 1. почва под колёсами → трение шин, качение
            var fm = FieldManager.Instance;
            float rollingN = 0f, gripSum = 0f, drivenLoad = 0f; int grounded = 0, driven = 0;
            SoilResponse avg = default;
            foreach (var w in wheels)
            {
                if (w?.collider == null) continue;
                if (w.drive) driven++;
                if (!w.collider.GetGroundHit(out var hit)) continue;
                uint cell = fm != null ? fm.GetState(hit.point) : 0u;
                bool road = roadLayers.value != 0 && hit.collider != null && (roadLayers.value & (1 << hit.collider.gameObject.layer)) != 0;
                var soil = road ? SoilResponse.Road : SoilResponse.FromCell(cell);
                SetGrip(w, soil.Grip);
                rollingN += soil.RollingCoef * hit.force;
                gripSum += soil.Grip; grounded++;
                if (w.drive) drivenLoad += hit.force * soil.Grip;
                avg.RollingCoef += soil.RollingCoef; avg.SinkM += soil.SinkM; avg.Grip += soil.Grip;
                w.sinkVisual = Mathf.Lerp(w.sinkVisual, soil.SinkM, dt * 3f);
            }
            if (grounded > 0) { avg.RollingCoef /= grounded; avg.Grip /= grounded; avg.SinkM /= grounded; }
            SoilUnder = avg;

            // 2. трансмиссия
            float draft = hitch != null ? hitch.DraftEstimateN : 0f, ptoW = hitch != null ? hitch.PtoLoadW : 0f;
            var o = drivetrain.Step(new DriveInput
            {
                Throttle = Throttle, Brake = Brake, Reverse = Reverse, SpeedMs = vFwd, MassKg = Body.mass + (hitch != null ? hitch.AttachedMassKg : 0f),
                ResistanceN = rollingN + draft, TractionLimitN = drivenLoad, PtoLoadW = ptoW, Dt = dt,
            });
            Last = o;

            // 3. момент на колёса, тормоза, руль (Аккерман: внутреннее колесо поворачивает сильнее)
            float perWheel = driven > 0 ? o.DriveForceN * drivetrain.WheelRadius / driven : 0f;
            float brakeTorque = o.BrakeForceN * drivetrain.WheelRadius / Mathf.Max(1, wheels.Length);
            if (Handbrake || (Throttle < 0.01f && Mathf.Abs(vFwd) < 0.3f)) brakeTorque = Mathf.Max(brakeTorque, Body.mass * 9.81f * 0.5f * drivetrain.WheelRadius / Mathf.Max(1, wheels.Length));
            float speedFactor = Mathf.Lerp(1f, steerAtSpeed, Mathf.Clamp01(Mathf.Abs(SpeedKmh) / 40f));
            float steerDeg = Steer * maxSteerDeg * speedFactor;
            float turnR = Mathf.Abs(steerDeg) > 0.1f ? wheelbase / Mathf.Tan(Mathf.Abs(steerDeg) * Mathf.Deg2Rad) : 0f;
            foreach (var w in wheels)
            {
                if (w?.collider == null) continue;
                w.collider.motorTorque = w.drive ? perWheel : 0f;
                w.collider.brakeTorque = brakeTorque;
                if (w.steer)
                {
                    if (turnR <= 0f) w.collider.steerAngle = 0f;
                    else
                    {
                        bool left = transform.InverseTransformPoint(w.collider.transform.position).x < 0f, inner = (steerDeg < 0f) == left;
                        float a = Mathf.Atan(wheelbase / (turnR + (inner ? -track / 2f : track / 2f))) * Mathf.Rad2Deg;
                        w.collider.steerAngle = Mathf.Sign(steerDeg) * a;
                    }
                }
            }

            // сопротивление качению: WheelCollider его не считает
            if (Mathf.Abs(vFwd) > 0.05f) Body.AddForce(-transform.forward * Mathf.Sign(vFwd) * Mathf.Min(rollingN, Body.mass * Mathf.Abs(vFwd) / dt), ForceMode.Force);
        }

        void SetGrip(Wheel w, float grip)
        {
            float k = grip / SoilResponse.Road.Grip;
            var f = w.collider.forwardFriction; f.stiffness = w.baseFwdStiffness * k; w.collider.forwardFriction = f;
            var s = w.collider.sidewaysFriction; s.stiffness = w.baseSideStiffness * k; w.collider.sidewaysFriction = s;
        }

        void LateUpdate()
        {
            foreach (var w in wheels)
            {
                if (w?.collider == null || w.visual == null) continue;
                w.collider.GetWorldPose(out var pos, out var rot);
                w.visual.SetPositionAndRotation(pos - transform.up * w.sinkVisual, rot);   // колесо в мягкой почве проседает
            }
        }
    }
}
