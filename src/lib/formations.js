// Opstellingen per speelvorm.
//
// Veldcoordinaten: x 0..100 (links -> rechts), y 0..100 (eigen doel -> doel tegenstander).
// De app tekent het veld staand (portret), eigen doel onderaan.
//
// Rollen: K = keeper, V = verdediger, M = middenvelder, A = aanvaller.
// `dropOrder` bepaalt welke positie als eerste vervalt als je met te weinig
// spelers staat (blessure zonder wissel op de bank). Aanvaller eruit, keeper
// en centrale verdediging blijven.

export const ROLES = {
  K: { key: 'K', naam: 'Keeper', kort: 'K' },
  V: { key: 'V', naam: 'Verdediger', kort: 'V' },
  M: { key: 'M', naam: 'Middenvelder', kort: 'M' },
  A: { key: 'A', naam: 'Aanvaller', kort: 'A' },
};

const F = (id, naam, speelvorm, slots, dropOrder) => ({ id, naam, speelvorm, slots, dropOrder });
const S = (id, label, role, x, y) => ({ id, label, role, x, y });

export const FORMATIONS = [
  // ---- 4 tegen 4 (JO7) - zonder keeper ----
  F('4-2-2', '2-2', 4, [
    S('vl', 'VL', 'V', 30, 30), S('vr', 'VR', 'V', 70, 30),
    S('al', 'AL', 'A', 30, 70), S('ar', 'AR', 'A', 70, 70),
  ], ['ar', 'al', 'vr']),

  F('4-1-2-1', '1-2-1 (met keeper)', 4, [
    S('k', 'K', 'K', 50, 9),
    S('vl', 'VL', 'V', 32, 36), S('vr', 'VR', 'V', 68, 36),
    S('sp', 'SP', 'A', 50, 76),
  ], ['sp', 'vr']),

  // ---- 6 tegen 6 (JO8 / JO9) ----
  F('6-1-2-2-1', '1-2-2-1', 6, [
    S('k', 'K', 'K', 50, 8),
    S('vl', 'VL', 'V', 28, 30), S('vr', 'VR', 'V', 72, 30),
    S('ml', 'ML', 'M', 28, 58), S('mr', 'MR', 'M', 72, 58),
    S('sp', 'SP', 'A', 50, 82),
  ], ['sp', 'mr', 'vr', 'ml']),

  F('6-1-3-2', '1-3-2', 6, [
    S('k', 'K', 'K', 50, 8),
    S('vl', 'VL', 'V', 20, 32), S('vc', 'VC', 'V', 50, 27), S('vr', 'VR', 'V', 80, 32),
    S('al', 'AL', 'A', 34, 72), S('ar', 'AR', 'A', 66, 72),
  ], ['ar', 'vr', 'al', 'vl']),

  F('6-1-2-3', '1-2-3', 6, [
    S('k', 'K', 'K', 50, 8),
    S('vl', 'VL', 'V', 32, 30), S('vr', 'VR', 'V', 68, 30),
    S('al', 'AL', 'A', 20, 68), S('ac', 'AC', 'A', 50, 76), S('ar', 'AR', 'A', 80, 68),
  ], ['ar', 'al', 'vr', 'ac']),

  F('6-1-1-3-1', '1-1-3-1', 6, [
    S('k', 'K', 'K', 50, 8),
    S('lm', 'LM', 'V', 50, 26),
    S('ml', 'ML', 'M', 22, 54), S('mc', 'MC', 'M', 50, 56), S('mr', 'MR', 'M', 78, 54),
    S('sp', 'SP', 'A', 50, 84),
  ], ['sp', 'mr', 'ml', 'mc']),

  // ---- 7 tegen 7 ----
  F('7-1-3-2-1', '1-3-2-1', 7, [
    S('k', 'K', 'K', 50, 7),
    S('vl', 'VL', 'V', 22, 28), S('vc', 'VC', 'V', 50, 24), S('vr', 'VR', 'V', 78, 28),
    S('ml', 'ML', 'M', 33, 55), S('mr', 'MR', 'M', 67, 55),
    S('sp', 'SP', 'A', 50, 83),
  ], ['sp', 'mr', 'vr', 'ml']),

  F('7-1-2-3-1', '1-2-3-1', 7, [
    S('k', 'K', 'K', 50, 7),
    S('vl', 'VL', 'V', 32, 27), S('vr', 'VR', 'V', 68, 27),
    S('ml', 'ML', 'M', 20, 55), S('mc', 'MC', 'M', 50, 53), S('mr', 'MR', 'M', 80, 55),
    S('sp', 'SP', 'A', 50, 83),
  ], ['sp', 'mr', 'ml', 'vr']),

  // ---- 8 tegen 8 (JO10 / JO11) ----
  F('8-1-3-3-1', '1-3-3-1', 8, [
    S('k', 'K', 'K', 50, 7),
    S('vl', 'VL', 'V', 22, 27), S('vc', 'VC', 'V', 50, 23), S('vr', 'VR', 'V', 78, 27),
    S('ml', 'ML', 'M', 22, 55), S('mc', 'MC', 'M', 50, 57), S('mr', 'MR', 'M', 78, 55),
    S('sp', 'SP', 'A', 50, 84),
  ], ['sp', 'mr', 'vr', 'ml', 'vl']),

  F('8-1-3-2-2', '1-3-2-2', 8, [
    S('k', 'K', 'K', 50, 7),
    S('vl', 'VL', 'V', 22, 27), S('vc', 'VC', 'V', 50, 23), S('vr', 'VR', 'V', 78, 27),
    S('ml', 'ML', 'M', 32, 54), S('mr', 'MR', 'M', 68, 54),
    S('al', 'AL', 'A', 32, 82), S('ar', 'AR', 'A', 68, 82),
  ], ['ar', 'al', 'mr', 'vr', 'ml']),

  F('8-1-2-3-2', '1-2-3-2', 8, [
    S('k', 'K', 'K', 50, 7),
    S('vl', 'VL', 'V', 33, 26), S('vr', 'VR', 'V', 67, 26),
    S('ml', 'ML', 'M', 20, 54), S('mc', 'MC', 'M', 50, 52), S('mr', 'MR', 'M', 80, 54),
    S('al', 'AL', 'A', 33, 82), S('ar', 'AR', 'A', 67, 82),
  ], ['ar', 'al', 'mr', 'ml', 'vr']),

  F('8-1-3-1-3', '1-3-1-3', 8, [
    S('k', 'K', 'K', 50, 7),
    S('vl', 'VL', 'V', 22, 27), S('vc', 'VC', 'V', 50, 23), S('vr', 'VR', 'V', 78, 27),
    S('mc', 'MC', 'M', 50, 53),
    S('al', 'AL', 'A', 22, 80), S('ac', 'AC', 'A', 50, 86), S('ar', 'AR', 'A', 78, 80),
  ], ['ar', 'al', 'ac', 'vr', 'vl']),

  // ---- 11 tegen 11 ----
  F('11-1-4-3-3', '1-4-3-3', 11, [
    S('k', 'K', 'K', 50, 5),
    S('lb', 'LB', 'V', 14, 25), S('cvl', 'CVL', 'V', 38, 20), S('cvr', 'CVR', 'V', 62, 20), S('rb', 'RB', 'V', 86, 25),
    S('ml', 'ML', 'M', 28, 50), S('mc', 'MC', 'M', 50, 44), S('mr', 'MR', 'M', 72, 50),
    S('al', 'LB2', 'A', 18, 78), S('sp', 'SP', 'A', 50, 86), S('ar', 'RB2', 'A', 82, 78),
  ], ['ar', 'al', 'mr', 'ml', 'rb', 'lb']),

  F('11-1-4-4-2', '1-4-4-2', 11, [
    S('k', 'K', 'K', 50, 5),
    S('lb', 'LB', 'V', 14, 25), S('cvl', 'CVL', 'V', 38, 20), S('cvr', 'CVR', 'V', 62, 20), S('rb', 'RB', 'V', 86, 25),
    S('ml', 'ML', 'M', 14, 52), S('mcl', 'MCL', 'M', 38, 48), S('mcr', 'MCR', 'M', 62, 48), S('mr', 'MR', 'M', 86, 52),
    S('al', 'SPL', 'A', 38, 82), S('ar', 'SPR', 'A', 62, 82),
  ], ['ar', 'mr', 'ml', 'al', 'rb', 'lb']),

  F('11-1-3-4-3', '1-3-4-3', 11, [
    S('k', 'K', 'K', 50, 5),
    S('vl', 'VL', 'V', 25, 22), S('vc', 'VC', 'V', 50, 18), S('vr', 'VR', 'V', 75, 22),
    S('ml', 'ML', 'M', 12, 50), S('mcl', 'MCL', 'M', 38, 46), S('mcr', 'MCR', 'M', 62, 46), S('mr', 'MR', 'M', 88, 50),
    S('al', 'AL', 'A', 20, 80), S('sp', 'SP', 'A', 50, 86), S('ar', 'AR', 'A', 80, 80),
  ], ['ar', 'al', 'mr', 'ml', 'vr']),

  F('11-1-4-2-3-1', '1-4-2-3-1', 11, [
    S('k', 'K', 'K', 50, 5),
    S('lb', 'LB', 'V', 14, 25), S('cvl', 'CVL', 'V', 38, 20), S('cvr', 'CVR', 'V', 62, 20), S('rb', 'RB', 'V', 86, 25),
    S('mcl', 'MCL', 'M', 38, 42), S('mcr', 'MCR', 'M', 62, 42),
    S('ml', 'ML', 'M', 18, 66), S('mc', 'MC', 'M', 50, 64), S('mr', 'MR', 'M', 82, 66),
    S('sp', 'SP', 'A', 50, 87),
  ], ['mr', 'ml', 'sp', 'rb', 'lb']),
];

export const SPEELVORMEN = [...new Set(FORMATIONS.map((f) => f.speelvorm))].sort((a, b) => a - b);

export function getFormation(id) {
  return FORMATIONS.find((f) => f.id === id) || FORMATIONS.find((f) => f.speelvorm === 6);
}

export function formationsForSize(size) {
  return FORMATIONS.filter((f) => f.speelvorm === size);
}

// Slots voor een blok waarin je met minder spelers staat dan de speelvorm toelaat.
// We laten posities vervallen volgens dropOrder, zodat de resterende opstelling
// nog steeds logisch is (je gooit de spits eruit, niet je laatste verdediger).
export function slotsForCount(formation, count) {
  const slots = formation.slots.slice();
  if (count >= slots.length) return slots;
  const teDroppen = slots.length - count;
  const gedropt = new Set(formation.dropOrder.slice(0, teDroppen));
  let rest = slots.filter((s) => !gedropt.has(s.id));
  // Veiligheidsklep als dropOrder te kort is: gooi achteraan weg, maar hou de keeper.
  while (rest.length > count) {
    const idx = rest.map((s, i) => [s, i]).filter(([s]) => s.role !== 'K').pop();
    if (!idx) break;
    rest.splice(idx[1], 1);
  }
  return rest;
}
