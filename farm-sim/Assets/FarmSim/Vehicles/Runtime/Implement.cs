// Навесное или прицепное орудие: как цепляется, нужен ли ВОМ, сколько мощности берёт, какие части крутятся.
// Пока орудие работает в земле, оно само тормозит себя силой тягового сопротивления (ImplementDraft) —
// сила идёт через сцепку в трактор, и трактор с плугом едет медленнее, а двигатель нагружается.
using System.Collections.Generic;
using FarmSim.Fields;
using UnityEngine;

namespace FarmSim.Vehicles
{
    [RequireComponent(typeof(Rigidbody))]
    public sealed class Implement : MonoBehaviour
    {
        public static readonly List<Implement> All = new List<Implement>();

        [Header("Сцепка")]
        public AttachType attachType = AttachType.ThreePoint;
        [Tooltip("Точка сцепки на орудии: центр нижних тяг навески или петля дышла")]
        public Transform attachPoint;
        [Header("Работа")]
        public ImplementWorkArea workArea;
        [Tooltip("Множитель тягового сопротивления (тяжёлый плуг > 1)")]
        public float draftMultiplier = 1f;
        [Header("ВОМ")]
        public bool needsPto;
        [Tooltip("Сколько мощности забирает орудие при номинальных оборотах ВОМ, кВт")]
        public float ptoPowerKW = 0f;
        [Tooltip("Части, которые крутит ВОМ (ротор, диски, барабан)")]
        public Transform[] spinningParts;
        public Vector3 spinAxis = Vector3.right;
        [Tooltip("Оборотов детали на один оборот вала ВОМ")]
        public float spinRatio = 0.5f;

        public Rigidbody Body { get; private set; }
        public TractorHitch AttachedTo { get; private set; }
        public float CurrentDraftN { get; private set; }
        float ptoRpm;

        void Awake() { Body = GetComponent<Rigidbody>(); if (workArea == null) workArea = GetComponentInChildren<ImplementWorkArea>(); }
        void OnEnable() { All.Add(this); }
        void OnDisable() { All.Remove(this); }

        internal void OnAttached(TractorHitch h) { AttachedTo = h; }
        internal void OnDetached()
        {
            AttachedTo = null; ptoRpm = 0f; CurrentDraftN = 0f;
            if (workArea != null) { workArea.IsLowered = false; workArea.PtoOn = false; }
        }
        internal void SetPtoRpm(float rpm) { ptoRpm = rpm; }

        void FixedUpdate()
        {
            CurrentDraftN = 0f;
            if (AttachedTo == null || workArea == null || !workArea.IsWorking) return;
            Vector3 v =
#if UNITY_6000_0_OR_NEWER
                Body.linearVelocity;
#else
                Body.velocity;
#endif
            v.y = 0f; float speed = v.magnitude; if (speed < 0.05f) return;
            var fm = FieldManager.Instance; Vector3 c = workArea.CenterWorld;
            uint cell = fm != null ? fm.GetState(c) : 0u;
            CurrentDraftN = ImplementDraft.ForceN(workArea.Operation, workArea.Width, speed * 3.6f, cell) * draftMultiplier;
            Body.AddForceAtPosition(-v / speed * CurrentDraftN, c, ForceMode.Force);
        }

        void Update()
        {
            if (spinningParts == null || ptoRpm <= 0f) return;
            float deg = ptoRpm * spinRatio * 6f * Time.deltaTime;   // об/мин → градусы за кадр
            foreach (var p in spinningParts) if (p) p.Rotate(spinAxis, deg, Space.Self);
        }
    }
}
