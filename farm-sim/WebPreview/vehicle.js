/* Физика трактора для браузерного показа: построчный перенос Assets/FarmSim/Vehicles/Runtime
   (Drivetrain, SoilResponse, ImplementDraft, HydraulicLift, PtoShaft). Числа те же, что в Unity-версии и её тестах. */
(function (root) {
  'use strict';
  const FS = root.FieldSim, { G, OP, Cell } = FS;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), clamp01 = (v) => clamp(v, 0, 1);

  class EngineCurve {
    constructor() { this.idle = 850; this.rated = 2100; this.max = 2300; this.rpm = [850, 1200, 1500, 1800, 2100, 2300]; this.tq = [600, 820, 900, 810, 682, 0]; }
    torqueAt(r) { if (r <= this.rpm[0]) return this.tq[0]; for (let i = 1; i < this.rpm.length; i++) if (r <= this.rpm[i]) { const t = (r - this.rpm[i - 1]) / (this.rpm[i] - this.rpm[i - 1]); return this.tq[i - 1] + (this.tq[i] - this.tq[i - 1]) * t; } return 0; }
    powerW(r) { return this.torqueAt(r) * r * 2 * Math.PI / 60; }
    maxPowerW() { let b = 0; for (let r = this.idle; r <= this.max; r += 10) b = Math.max(b, this.powerW(r)); return b; }
    peakTorqueRpm() { let k = 0; for (let i = 1; i < this.tq.length; i++) if (this.tq[i] > this.tq[k]) k = i; return this.rpm[k]; }
  }

  class Drivetrain {
    constructor() {
      this.engine = new EngineCurve(); this.eff = 0.85; this.wheelR = 0.95; this.maxRatio = 420;
      this.fieldKmh = 25; this.roadKmh = 50; this.revKmh = 18; this.road = false; this.brakeG = 0.55; this.engBrakeG = 0.12; this.rpmRate = 2200;
      this.rpm = 850; this._maxP = this.engine.maxPowerW();
    }
    maxSpeed(rev) { return (rev ? this.revKmh : this.road ? this.roadKmh : this.fieldKmh) / 3.6; }
    /** i: throttle, brake, reverse, v, mass, resist, traction, ptoW, limit (м/с, 0 — нет), dt → {drive, brake, rpm, load, slip, target} */
    step(i) {
      const e = this.engine, dir = i.reverse ? -1 : 1, v = i.v, av = Math.abs(v);
      let vT = dir * clamp01(i.throttle) * this.maxSpeed(i.reverse);
      if (i.limit > 0 && Math.abs(vT) > i.limit) vT = dir * i.limit;
      const rpmWanted = e.idle + (e.rated - e.idle) * Math.max(clamp01(i.throttle), i.ptoW > 0 ? 0.9 : 0);
      const pAvail = Math.max(0, e.powerW(this.rpm) - i.ptoW) * this.eff;
      const fPower = pAvail / Math.max(av, 0.6), fTorque = e.torqueAt(this.rpm) * this.maxRatio * this.eff / this.wheelR, fMax = Math.min(fPower, fTorque);
      const accel = clamp((vT - v) * 1.6, -3, 1.8);
      const fWanted = i.mass * accel + Math.sign(vT !== 0 ? vT : v) * i.resist;
      const driving = vT !== 0 && Math.sign(fWanted) === Math.sign(vT);
      let drive = Math.sign(fWanted) * Math.min(Math.abs(fWanted), driving ? fMax : this.engBrakeG * i.mass * 9.81);
      let slip = 0;
      if (i.traction > 0 && Math.abs(drive) > i.traction) { slip = clamp01((Math.abs(drive) - i.traction) / Math.max(i.traction, 1)); drive = Math.sign(drive) * i.traction; }
      const load = fMax > 1 ? clamp01(Math.abs(drive) * Math.max(av, 0.6) / Math.max(pAvail, 1) + i.ptoW / this._maxP) : 0;
      let rpmT = rpmWanted; if (load > 0.9) rpmT = Math.min(rpmT, e.peakTorqueRpm() + (e.rated - e.peakTorqueRpm()) * (1 - (load - 0.9) * 10));
      this.rpm = clamp(this.rpm + clamp(rpmT - this.rpm, -this.rpmRate * i.dt, this.rpmRate * i.dt), e.idle * 0.9, e.max);
      return { drive, brake: clamp01(i.brake) * this.brakeG * i.mass * 9.81, rpm: this.rpm, load, slip, target: vT };
    }
  }

  const ROAD = { roll: 0.015, grip: 0.9, sink: 0 };
  function soilFromCell(s, onRoad) {
    let r;
    switch (Cell.ground(s)) {
      case G.None: return onRoad ? ROAD : { roll: 0.035, grip: 0.75, sink: 0.01 };
      case G.Grass: r = { roll: 0.04, grip: 0.72, sink: 0.01 }; break;
      case G.Stubble: r = { roll: 0.05, grip: 0.75, sink: 0.015 }; break;
      case G.Cultivated: r = { roll: 0.09, grip: 0.58, sink: 0.04 }; break;
      case G.Plowed: r = { roll: 0.12, grip: 0.52, sink: 0.07 }; break;
      case G.Seeded: r = { roll: 0.08, grip: 0.6, sink: 0.035 }; break;
      default: r = { ...ROAD };
    }
    const m = Cell.moisture(s);
    if (m >= 6) { r.grip *= 0.78; r.roll *= 1.3; r.sink *= 1.5; } else if (m <= 1) { r.grip *= 1.05; r.roll *= 0.9; }
    if (Cell.rolled(s)) { r.roll *= 0.85; r.sink *= 0.6; }
    return r;
  }
  const DRAFT = { [OP.Plow]: 9000, [OP.Cultivate]: 3000, [OP.Sow]: 1600, [OP.Roll]: 900, [OP.Weed]: 700, [OP.Mulch]: 1200, [OP.StonePick]: 1500 };
  function draftN(kind, width, kmh, s) {
    const k = DRAFT[kind] || 0; if (!k) return 0; const g = Cell.ground(s); if (g === G.None) return 0;
    let soil = g === G.Plowed || g === G.Cultivated ? 0.7 : 1; if (Cell.moisture(s) >= 6) soil *= 1.15;
    return k * width * soil * (0.8 + 0.02 * kmh);
  }

  class HydraulicLift {
    constructor(speed) { this.speed = speed || 0.7; this.pos = 1; this.target = 1; }
    get isDown() { return this.pos <= 0.05; }
    get moving() { return Math.abs(this.target - this.pos) > 1e-4; }
    toggle() { this.target = this.target > 0.5 ? 0 : 1; }
    step(dt) { const d = this.target - this.pos, m = this.speed * dt; this.pos += d > m ? m : d < -m ? -m : d; }
  }
  class PtoShaft {
    constructor() { this.nominal = 1000; this.engAtNominal = 1900; this.spinUp = 1.2; this.on = false; this.rpm = 0; }
    step(engineRpm, dt) { const t = this.on ? engineRpm * this.nominal / this.engAtNominal : 0, r = this.nominal / Math.max(this.spinUp, 0.05) * dt; this.rpm += Math.max(-r * 1.5, Math.min(r, t - this.rpm)); }
    get ok() { return this.on && this.rpm >= this.nominal * 0.8; }
    loadW(implW) { return this.on ? implW * Math.min(1, this.rpm / this.nominal) : 0; }
  }

  root.VehicleSim = { EngineCurve, Drivetrain, soilFromCell, draftN, HydraulicLift, PtoShaft, ROAD };
})(typeof self !== 'undefined' ? self : this);
