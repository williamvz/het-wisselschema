// Breed uitproberen: alle speelvormen, opstellingen en teamgroottes, met en
// zonder keepers. Niet op schoonheid, maar op "het mag nooit stukgaan en de
// uitkomst moet altijd een geldige opstelling zijn".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWedstrijd, herplan, blokOp, totaleSpeeltijd } from '../src/lib/schedule.js';
import { FORMATIONS, getFormation, slotsForCount } from '../src/lib/formations.js';

const NAMEN = ['Daan', 'Sem', 'Luuk', 'Noud', 'Tijn', 'Bram', 'Finn', 'Jesse', 'Mees', 'Cas',
  'Sven', 'Guus', 'Joep', 'Roan', 'Stijn', 'Thijs'];

const team = (n, keepers) => NAMEN.slice(0, n).map((naam, i) => ({
  id: `p${i + 1}`, naam, keeper: i < keepers,
  posities: [[], ['V'], ['M'], ['A'], ['V', 'M'], ['M', 'A']][i % 6],
  sterkte: 1 + (i % 5), saldoSec: (i % 7 - 3) * 300,
}));

function keurSchema(res, spelers, formatie, match, waar) {
  const totaal = totaleSpeeltijd(match);
  let vorigEind = 0;
  for (const b of res.blokken) {
    assert.equal(b.vanSec, vorigEind, `${waar}: gat of overlap in de tijdlijn`);
    vorigEind = b.totSec;

    const opgesteld = Object.values(b.opstelling);
    assert.equal(new Set(opgesteld).size, opgesteld.length, `${waar}: iemand staat dubbel opgesteld`);

    const slotIds = new Set(formatie.slots.map((s) => s.id));
    for (const sid of Object.keys(b.opstelling)) {
      assert.ok(slotIds.has(sid), `${waar}: onbekende positie ${sid}`);
      assert.ok(spelers.some((p) => p.id === b.opstelling[sid]), `${waar}: onbekende speler opgesteld`);
    }

    const beschikbaar = spelers.filter((p) => {
      const v = (match.beschikbaar || {})[p.id] || {};
      const midden = (b.vanSec + b.totSec) / 2;
      return (v.vanaf ?? 0) <= midden && (v.tot ?? Infinity) >= midden;
    }).length;
    assert.equal(opgesteld.length, Math.min(formatie.slots.length, beschikbaar),
      `${waar}: verkeerd aantal spelers op het veld`);

    // de overgebleven posities moeten een geldige verkleining van de opstelling zijn
    const verwacht = new Set(slotsForCount(formatie, opgesteld.length).map((s) => s.id));
    for (const sid of Object.keys(b.opstelling)) assert.ok(verwacht.has(sid), `${waar}: positie ${sid} hoort niet bij ${opgesteld.length} spelers`);
  }
  assert.equal(vorigEind, totaal, `${waar}: de wedstrijd duurt niet de volle tijd`);

  const somGespeeld = res.statistieken.reduce((n, s) => n + s.speelSec, 0);
  const somVeld = res.blokken.reduce((n, b) => n + (b.totSec - b.vanSec) * Object.keys(b.opstelling).length, 0);
  assert.equal(somGespeeld, somVeld, `${waar}: speeltijdboekhouding klopt niet`);
}

test('elke speelvorm en teamgrootte levert een geldig schema', () => {
  let gevallen = 0;
  for (const formatie of FORMATIONS) {
    const vorm = formatie.speelvorm;
    for (const extra of [-2, -1, 0, 1, 3]) {
      const n = vorm + extra;
      if (n < 2 || n > NAMEN.length) continue;
      for (const keepers of [0, 1, 2]) {
        for (const blokkenPerPeriode of [1, 2]) {
          const spelers = team(n, Math.min(keepers, n));
          const match = {
            periodes: 4, periodeMin: 15, blokkenPerPeriode, formationId: formatie.id,
            selectie: spelers.map((p) => p.id), beschikbaar: {}, blokken: null, pins: {},
            opties: { seed: n * 31 + keepers * 7 + blokkenPerPeriode },
          };
          const waar = `${formatie.id} met ${n} spelers, ${keepers} keepers, ${blokkenPerPeriode} blok/periode`;
          const res = planWedstrijd(match, spelers);
          keurSchema(res, spelers, formatie, match, waar);
          gevallen += 1;
        }
      }
    }
  }
  assert.ok(gevallen > 150, `te weinig gevallen doorlopen (${gevallen})`);
});

test('herplannen op willekeurige momenten blijft geldig, hoe vaak je het ook doet', () => {
  for (const formatieId of ['4-2-2', '6-1-2-2-1', '8-1-3-3-1', '11-1-4-3-3']) {
    const formatie = getFormation(formatieId);
    const n = Math.min(formatie.speelvorm + 2, NAMEN.length);
    const spelers = team(n, 2);
    let match = {
      periodes: 4, periodeMin: 15, blokkenPerPeriode: 1, formationId: formatieId,
      selectie: spelers.map((p) => p.id), beschikbaar: {}, blokken: null, pins: {},
      opties: { seed: 99 },
    };
    match = { ...match, blokken: planWedstrijd(match, spelers).blokken };

    // vier keer iemand eruit halen, op onregelmatige momenten
    for (const [i, t] of [311, 902, 1777, 2600].entries()) {
      const opVeld = Object.values(match.blokken[blokOp(match.blokken, t)].opstelling);
      const wijzigingen = opVeld.length > formatie.slots.length - 2
        ? [{ type: 'uit', spelerId: opVeld[i % opVeld.length] }] : [];
      const res = herplan(match, spelers, { opSec: t, wijzigingen });
      match = res.match;
      keurSchema(res, spelers, formatie, match, `${formatieId} na herplan ${i + 1} op ${t}s`);
    }
  }
});

test('rare invoer laat de planner niet omvallen', () => {
  const spelers = team(7, 2);
  const basis = {
    periodes: 4, periodeMin: 15, blokkenPerPeriode: 1, formationId: '6-1-2-2-1',
    selectie: spelers.map((p) => p.id), beschikbaar: {}, blokken: null, pins: {}, opties: { seed: 1 },
  };

  // niemand geselecteerd
  const leeg = planWedstrijd({ ...basis, selectie: [] }, spelers);
  assert.equal(leeg.statistieken.length, 0);
  assert.ok(leeg.waarschuwingen.length, 'zegt tenminste dat er niemand is gekozen');

  // één speler
  const een = planWedstrijd({ ...basis, selectie: ['p1'] }, spelers);
  assert.ok(een.blokken.every((b) => Object.keys(b.opstelling).length === 1));

  // iedereen de hele wedstrijd onbeschikbaar
  const geen = planWedstrijd({
    ...basis, beschikbaar: Object.fromEntries(spelers.map((p) => [p.id, { vanaf: 0, tot: 0 }])),
  }, spelers);
  assert.ok(geen.blokken.every((b) => Object.keys(b.opstelling).length === 0), 'leeg veld, geen crash');

  // onbekende opstelling valt terug op een geldige
  const raar = planWedstrijd({ ...basis, formationId: 'bestaat-niet' }, spelers);
  assert.ok(raar.blokken.every((b) => Object.keys(b.opstelling).length > 0));

  // pin naar een speler die niet meespeelt wordt genegeerd
  const eersteBlok = planWedstrijd(basis, spelers).blokken[0];
  const metPin = planWedstrijd({ ...basis, selectie: ['p1', 'p2', 'p3'], pins: { [eersteBlok.id]: { sp: 'p7' } } }, spelers);
  assert.ok(metPin.blokken.every((b) => !Object.values(b.opstelling).includes('p7')));

  // nul perioden
  const nul = planWedstrijd({ ...basis, periodes: 0 }, spelers);
  assert.equal(nul.blokken.length, 0);
});
