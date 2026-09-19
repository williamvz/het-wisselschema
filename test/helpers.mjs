import { getFormation } from '../src/lib/formations.js';

export function maakTeam(namen, extra = {}) {
  return namen.map((n, i) => ({
    id: `p${i + 1}`, naam: n,
    keeper: (extra.keepers || []).includes(n),
    posities: (extra.posities || {})[n] || [],
    sterkte: (extra.sterktes || {})[n] ?? 3,
    saldoSec: (extra.saldo || {})[n] || 0,
  }));
}

export function maakWedstrijd(spelers, over = {}) {
  return {
    id: 'w1', datum: '2026-09-19', tegenstander: 'Testers',
    periodes: 4, periodeMin: 15, blokkenPerPeriode: 1,
    formationId: '6-1-2-2-1',
    selectie: spelers.map((p) => p.id),
    beschikbaar: {}, blokken: null, pins: {},
    opties: { seed: 42 },
    ...over,
  };
}

export const min = (sec) => Math.round((sec / 60) * 10) / 10;

export function veldSpelers(blok) {
  return Object.values(blok.opstelling);
}

export function keeperVan(blok, formationId) {
  const f = getFormation(formationId);
  const slot = f.slots.find((s) => s.role === 'K');
  return slot ? blok.opstelling[slot.id] : null;
}
