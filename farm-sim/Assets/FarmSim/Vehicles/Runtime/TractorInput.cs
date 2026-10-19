// Управление с клавиатуры (на компьютере). На телефоне те же методы будут вызывать кнопки интерфейса.
//   W / S — газ и тормоз (S на месте — назад), A / D — руль, пробел — стояночный тормоз
//   Q — поднять/опустить навеску, E — ВОМ, T — прицепить/отцепить, G — диапазон «поле/дорога»
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace FarmSim.Vehicles
{
    [RequireComponent(typeof(TractorController))]
    public sealed class TractorInput : MonoBehaviour
    {
        [Tooltip("Как быстро нарастает газ и руль (плавно, как в FS)")]
        [SerializeField] float throttleRate = 1.5f, steerRate = 2.5f;
        TractorController t; TractorHitch h;
        float throttle, steer;

        void Awake() { t = GetComponent<TractorController>(); h = GetComponent<TractorHitch>(); }

        void Update()
        {
            bool fwd, back, left, right, hand, liftK, ptoK, attachK, rangeK;
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current; if (k == null) return;
            fwd = k.wKey.isPressed || k.upArrowKey.isPressed; back = k.sKey.isPressed || k.downArrowKey.isPressed;
            left = k.aKey.isPressed || k.leftArrowKey.isPressed; right = k.dKey.isPressed || k.rightArrowKey.isPressed;
            hand = k.spaceKey.isPressed; liftK = k.qKey.wasPressedThisFrame; ptoK = k.eKey.wasPressedThisFrame;
            attachK = k.tKey.wasPressedThisFrame; rangeK = k.gKey.wasPressedThisFrame;
#else
            fwd = Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow); back = Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow);
            left = Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow); right = Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow);
            hand = Input.GetKey(KeyCode.Space); liftK = Input.GetKeyDown(KeyCode.Q); ptoK = Input.GetKeyDown(KeyCode.E);
            attachK = Input.GetKeyDown(KeyCode.T); rangeK = Input.GetKeyDown(KeyCode.G);
#endif
            float dt = Time.deltaTime;
            float speed = t.SpeedKmh;
            // S: если едем вперёд — тормоз; если стоим — включается задний ход (и наоборот для W)
            if (fwd && t.Reverse && speed > -0.5f) t.Reverse = false;
            if (back && !t.Reverse && speed < 0.5f) t.Reverse = true;
            bool accel = t.Reverse ? back : fwd, brake = t.Reverse ? fwd : back;
            throttle = Mathf.MoveTowards(throttle, accel ? 1f : 0f, throttleRate * dt);
            steer = Mathf.MoveTowards(steer, (right ? 1f : 0f) - (left ? 1f : 0f), steerRate * dt);
            t.Throttle = throttle; t.Brake = brake ? 1f : 0f; t.Steer = steer; t.Handbrake = hand;

            if (h != null)
            {
                if (liftK) h.ToggleLift();
                if (ptoK) h.TogglePto();
                if (attachK) { bool any = false; foreach (var hp in h.points) if (hp.attached) { any = true; break; } if (any) h.DetachAll(); else h.TryAttach(); }
            }
            if (rangeK) t.drivetrain.RoadRange = !t.drivetrain.RoadRange;
        }
    }
}
