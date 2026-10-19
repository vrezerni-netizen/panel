// Что делает с клеткой каждое орудие. Одна функция TryApply: проверка «можно ли» (фильтр) + изменение.
// Всё работает с одним uint без выделения памяти, поэтому проход 6-метрового плуга стоит доли микросекунды на клетку.
namespace FarmSim.Fields
{
    public enum FieldOpKind : byte
    {
        Plow,        // плуг: глубокая вспашка, убирает всё, сбрасывает «нужна вспашка»
        Cultivate,   // культиватор / дисковая борона
        Sow,         // сеялка (в Op.Crop — что сеем)
        Roll,        // каток
        Fertilize,   // удобрение (+1 уровень, не больше одного раза за период роста)
        Lime,        // известь
        Weed,        // борона-прополка: убирает мелкие сорняки на молодых посевах
        Herbicide,   // опрыскиватель: сорняки погибают
        Harvest,     // комбайн / копалка (в Op.Crop — какую культуру берёт жатка; None = любую)
        Mulch,       // мульчирователь: измельчает солому и стерню
        StonePick,   // камнесборщик
        Irrigate,    // полив: влажность на максимум
    }

    /// <summary>Действие орудия. Angle — направление борозд (0..7), Direct — прямой посев по стерне без обработки.</summary>
    public struct FieldOp
    {
        public FieldOpKind Kind;
        public CropType Crop;
        public int Angle;
        public bool Direct;

        public FieldOp(FieldOpKind kind, int angle = 0, CropType crop = CropType.None, bool direct = false) { Kind = kind; Angle = angle; Crop = crop; Direct = direct; }

        /// <summary>
        /// Применить к одной клетке. Возвращает true, если клетка изменилась.
        /// cellArea — площадь клетки в м² (для урожая), yieldLiters — сюда прибавляется собранный урожай.
        /// </summary>
        public bool TryApply(ref uint s, float cellArea, ref double yieldLiters)
        {
            var g = FieldCell.Ground(s);
            if (g == GroundType.None) return false;               // не поле
            uint n = s;
            switch (Kind)
            {
                case FieldOpKind.Plow:
                    n = FieldCell.WithGround(n, GroundType.Plowed); n = FieldCell.WithAngle(n, Angle);
                    n = FieldCell.WithCrop(n, CropType.None); n = FieldCell.WithGrowth(n, 0); n = FieldCell.WithWeeds(n, 0);
                    n = FieldCell.WithRolled(n, false); n = FieldCell.WithPlowNeed(n, 0); n = FieldCell.WithStraw(n, false);
                    break;
                case FieldOpKind.Cultivate:
                    n = FieldCell.WithGround(n, GroundType.Cultivated); n = FieldCell.WithAngle(n, Angle);
                    n = FieldCell.WithCrop(n, CropType.None); n = FieldCell.WithGrowth(n, 0); n = FieldCell.WithWeeds(n, 0);
                    n = FieldCell.WithRolled(n, false); n = FieldCell.WithStraw(n, false);
                    break;
                case FieldOpKind.Sow:
                    if (Crop == CropType.None) return false;
                    bool ready = g == GroundType.Cultivated || g == GroundType.Plowed || (Direct && (g == GroundType.Stubble || g == GroundType.Grass));
                    if (!ready) return false;                         // сеять можно только по обработанной земле (или прямой посев)
                    n = FieldCell.WithGround(n, GroundType.Seeded); n = FieldCell.WithAngle(n, Angle);
                    n = FieldCell.WithCrop(n, Crop); n = FieldCell.WithGrowth(n, 1); n = FieldCell.WithRolled(n, false); n = FieldCell.WithStraw(n, false);
                    break;
                case FieldOpKind.Roll:
                    if (g == GroundType.Seeded && FieldCell.Growth(s) > 2) return false;   // взошедшие посевы не катают
                    if (g != GroundType.Seeded && g != GroundType.Cultivated && g != GroundType.Plowed) return false;
                    n = FieldCell.WithRolled(n, true);
                    break;
                case FieldOpKind.Fertilize:
                    if (FieldCell.FertNow(s) || FieldCell.Fert(s) >= FieldCell.MaxFert) return false;
                    n = FieldCell.WithFertNow(FieldCell.WithFert(n, FieldCell.Fert(s) + 1), true);
                    break;
                case FieldOpKind.Lime:
                    if (FieldCell.Lime(s)) return false;
                    n = FieldCell.WithLime(n, true);
                    break;
                case FieldOpKind.Weed:
                    { int w = FieldCell.Weeds(s); if (w < 1 || w > 3 || (g == GroundType.Seeded && FieldCell.Growth(s) > 3)) return false; n = FieldCell.WithWeeds(n, 0); }
                    break;
                case FieldOpKind.Herbicide:
                    { int w = FieldCell.Weeds(s); if (w < 1 || w > 6) return false; n = FieldCell.WithWeeds(n, FieldCell.WeedsDead); }
                    break;
                case FieldOpKind.Harvest:
                    {
                        var c = FieldCell.Crop(s); if (c == CropType.None || (Crop != CropType.None && c != Crop)) return false;
                        var def = FieldCrops.Get(c); int st = FieldCell.Growth(s);
                        if (st < def.ReadyStage) return false;           // не созрело — жатка не берёт
                        if (st == def.ReadyStage) yieldLiters += def.LitersPerM2 * cellArea * FieldCrops.YieldFactor(s);   // погибшее даёт 0
                        n = FieldCell.WithGround(n, GroundType.Stubble); n = FieldCell.WithCrop(n, CropType.None); n = FieldCell.WithGrowth(n, 0);
                        n = FieldCell.WithFert(n, 0); n = FieldCell.WithFertNow(n, false); n = FieldCell.WithWeeds(n, 0); n = FieldCell.WithRolled(n, false);
                        n = FieldCell.WithPlowNeed(n, FieldCell.PlowNeed(s) + 1); n = FieldCell.WithStraw(n, true);
                    }
                    break;
                case FieldOpKind.Mulch:
                    if (!FieldCell.Straw(s)) return false;
                    n = FieldCell.WithStraw(n, false);
                    break;
                case FieldOpKind.StonePick:
                    if (FieldCell.Stones(s) == 0) return false;
                    n = FieldCell.WithStones(n, 0);
                    break;
                case FieldOpKind.Irrigate:
                    n = FieldCell.WithMoisture(n, FieldCell.MaxMoisture);
                    break;
            }
            if (n == s) return false;
            s = n; return true;
        }
    }

    /// <summary>Итог прохода орудия: сколько клеток изменилось и сколько собрано (для расхода семян/топлива, бункера комбайна, частиц).</summary>
    public struct FieldOpResult
    {
        public int CellsChanged;
        public float AreaM2;
        public double YieldLiters;
        public void Add(FieldOpResult o) { CellsChanged += o.CellsChanged; AreaM2 += o.AreaM2; YieldLiters += o.YieldLiters; }
        public override string ToString() => $"{CellsChanged} кл. ({AreaM2:0.##} м²), урожай {YieldLiters:0.##} л";
    }
}
