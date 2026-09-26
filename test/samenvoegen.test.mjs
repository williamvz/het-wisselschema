// De samenvoeging waarmee twee telefoons hetzelfde team gelijk houden. Elk
// geval hier is iets wat langs de lijn echt gebeurt: twee trainers die
// tegelijk tikken, of een telefoon die een kwartier geen bereik had.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voegSamen, gelijk } from '../src/lib/samenvoegen.js';

const kloon = (x) => JSON.parse(JSON.stringify(x));

function basisTeam() {
  return {
    team: { naam: 'JO9-1', spelers: [
      { id: 's1', naam: 'Daan', nummer: '1', keeper: true, posities: [] },
      { id: 's2', naam: 'Sem', nummer: '4', keeper: false, posities: ['V'] },
      { id: 's3', naam: 'Luuk', nummer: '', keeper: false, posities: [] },
    ] },
    wedstrijd: {
      id: 'w1', tegenstander: 'SV Test', selectie: ['s1', 's2', 's3'], beschikbaar: {},
      blokken: [{ id: 'b1', vanSec: 0, totSec: 900, vast: false, opstelling: { k: 's1' } }],
      pins: {}, planMs: 1000,
      klok: { loopt: false, verstreken: 0, sindsMs: null, bijgewerkt: 1000 },
      doelpunten: [],
    },
    archief: [{ id: 'oud1', tegenstander: 'Vorige week' }],
  };
}

test('gelijk kijkt niet naar de volgorde van sleutels, en null is hetzelfde als ontbreken', () => {
  assert.ok(gelijk({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }));
  assert.ok(gelijk({ a: 1, b: null }, { a: 1 }));
  assert.ok(!gelijk({ a: 1 }, { a: 2 }));
  assert.ok(!gelijk([1, 2], [2, 1]));
  assert.ok(!gelijk({ a: 0 }, {}));
});

test('wat maar aan één kant veranderde komt er gewoon in', () => {
  const b = basisTeam();
  const m = kloon(b); m.wedstrijd.tegenstander = 'VV Anders';
  assert.deepEqual(voegSamen(b, m, kloon(b)), m);
  assert.deepEqual(voegSamen(b, kloon(b), m), m);
  assert.deepEqual(voegSamen(b, m, m), m, 'twee keer dezelfde wijziging is één wijziging');
});

test('twee trainers die tegelijk een goal invoeren: allebei blijven staan', () => {
  const b = basisTeam();
  const william = kloon(b); william.wedstrijd.doelpunten.push({ id: 'g1', wie: 'wij', sec: 300, opVeld: ['s1'] });
  const dennis = kloon(b); dennis.wedstrijd.doelpunten.push({ id: 'g2', wie: 'zij', sec: 310, opVeld: ['s1'] });
  const uit = voegSamen(b, william, dennis);
  assert.deepEqual(uit.wedstrijd.doelpunten.map((d) => d.id).sort(), ['g1', 'g2']);
});

test('een goal weghalen terwijl de ander er een bij zet', () => {
  const b = basisTeam();
  b.wedstrijd.doelpunten = [{ id: 'g1', wie: 'wij', sec: 300, opVeld: [] }];
  const weg = kloon(b); weg.wedstrijd.doelpunten = [];
  const erbij = kloon(b); erbij.wedstrijd.doelpunten.push({ id: 'g2', wie: 'wij', sec: 400, opVeld: [] });
  assert.deepEqual(voegSamen(b, weg, erbij).wedstrijd.doelpunten.map((d) => d.id), ['g2']);
  assert.deepEqual(voegSamen(b, erbij, weg).wedstrijd.doelpunten.map((d) => d.id), ['g2']);
});

test('een goal van de een en een wissel van de ander gaan samen', () => {
  const b = basisTeam();
  const goal = kloon(b); goal.wedstrijd.doelpunten.push({ id: 'g1', wie: 'wij', sec: 300, opVeld: ['s1'] });
  const wissel = kloon(b);
  wissel.wedstrijd.blokken = [{ id: 'b1', vanSec: 0, totSec: 450, vast: true, opstelling: { k: 's1' } },
    { id: 'b2', vanSec: 450, totSec: 900, vast: false, opstelling: { k: 's2' } }];
  wissel.wedstrijd.planMs = 2000;
  const uit = voegSamen(b, goal, wissel);
  assert.equal(uit.wedstrijd.doelpunten.length, 1);
  assert.equal(uit.wedstrijd.blokken.length, 2);
});

test('van de klok wint de laatste wijziging, ook als die als eerste binnen was', () => {
  const b = basisTeam();
  b.wedstrijd.klok = { loopt: true, verstreken: 0, sindsMs: 5000, bijgewerkt: 5000 };
  // Dennis zette de klok offline stil, lang geleden. William zette hem daarna bij.
  const dennis = kloon(b); dennis.wedstrijd.klok = { loopt: false, verstreken: 120, sindsMs: null, bijgewerkt: 125000 };
  const william = kloon(b); william.wedstrijd.klok = { loopt: true, verstreken: 600, sindsMs: 900000, bijgewerkt: 900000 };
  assert.equal(voegSamen(b, dennis, william).wedstrijd.klok.bijgewerkt, 900000, 'Dennis voegt samen: William wint');
  assert.equal(voegSamen(b, william, dennis).wedstrijd.klok.bijgewerkt, 900000, 'William voegt samen: William wint');
  // en de klok wordt nooit half van de een en half van de ander
  const k = voegSamen(b, dennis, william).wedstrijd.klok;
  assert.deepEqual(k, william.wedstrijd.klok);
});

test('van het schema wint de laatste wijziging, en blokken en vastzettingen blijven bij elkaar', () => {
  const b = basisTeam();
  const oud = kloon(b);
  oud.wedstrijd.blokken = [{ id: 'bx', vanSec: 0, totSec: 900, vast: false, opstelling: { k: 's2' } }];
  oud.wedstrijd.pins = { bx: { k: 's2' } };
  oud.wedstrijd.planMs = 2000;
  const nieuw = kloon(b);
  nieuw.wedstrijd.blokken = [{ id: 'by', vanSec: 0, totSec: 900, vast: false, opstelling: { k: 's3' } }];
  nieuw.wedstrijd.pins = { by: { k: 's3' } };
  nieuw.wedstrijd.planMs = 3000;
  for (const uit of [voegSamen(b, oud, nieuw), voegSamen(b, nieuw, oud)]) {
    assert.equal(uit.wedstrijd.blokken[0].id, 'by');
    assert.deepEqual(Object.keys(uit.wedstrijd.pins), ['by']);
    assert.equal(uit.wedstrijd.planMs, 3000);
  }
});

test('twee spelers tegelijk uit de wedstrijd: allebei eruit', () => {
  const b = basisTeam();
  const a = kloon(b); a.wedstrijd.beschikbaar = { s2: { vanaf: 0, tot: 1400 } };
  const c = kloon(b); c.wedstrijd.beschikbaar = { s3: { vanaf: 0, tot: 1405 } };
  assert.deepEqual(Object.keys(voegSamen(b, a, c).wedstrijd.beschikbaar).sort(), ['s2', 's3']);
});

test('de selectie voegt samen als verzameling', () => {
  const b = basisTeam();
  const a = kloon(b); a.wedstrijd.selectie = ['s1', 's2', 's3', 's9']; // s9 sluit aan
  const c = kloon(b); c.wedstrijd.selectie = ['s1', 's3'];              // s2 is er niet
  assert.deepEqual(voegSamen(b, a, c).wedstrijd.selectie, ['s1', 's3', 's9']);
});

test('spelers: verschillende velden van dezelfde speler, en nieuwe spelers aan beide kanten', () => {
  const b = basisTeam();
  const a = kloon(b); a.team.spelers[1].nummer = '5'; a.team.spelers.push({ id: 's4', naam: 'Noud', posities: [] });
  const c = kloon(b); c.team.spelers[1].posities = ['V', 'M']; c.team.spelers.push({ id: 's5', naam: 'Tijn', posities: [] });
  const uit = voegSamen(b, a, c);
  const sem = uit.team.spelers.find((p) => p.id === 's2');
  assert.equal(sem.nummer, '5');
  assert.deepEqual(sem.posities, ['V', 'M']);
  assert.deepEqual(uit.team.spelers.map((p) => p.id), ['s1', 's2', 's3', 's4', 's5']);
});

test('een speler verwijderen terwijl de ander hem bijwerkt: bijwerken wint', () => {
  const b = basisTeam();
  const weg = kloon(b); weg.team.spelers = weg.team.spelers.filter((p) => p.id !== 's3');
  const bij = kloon(b); bij.team.spelers[2].nummer = '7';
  assert.ok(voegSamen(b, weg, bij).team.spelers.some((p) => p.id === 's3' && p.nummer === '7'));
  // en zonder bijwerken is hij gewoon weg
  const niks = kloon(b); niks.wedstrijd.tegenstander = 'Anders';
  assert.ok(!voegSamen(b, weg, niks).team.spelers.some((p) => p.id === 's3'));
});

test('een afgeronde wedstrijd blijft afgerond, ook als de ander er nog een goal in zette', () => {
  const b = basisTeam();
  const afgerond = kloon(b);
  afgerond.archief.unshift({ id: 'w1', tegenstander: 'SV Test' });
  afgerond.wedstrijd = null;
  const goal = kloon(b); goal.wedstrijd.doelpunten.push({ id: 'g1', wie: 'wij', sec: 60, opVeld: [] });
  for (const uit of [voegSamen(b, afgerond, goal), voegSamen(b, goal, afgerond)]) {
    assert.equal(uit.wedstrijd, null);
    assert.deepEqual(uit.archief.map((a) => a.id), ['w1', 'oud1'], 'nieuw archiefstuk vooraan');
  }
});

test('een nieuwe wedstrijd wint van bijwerken van de oude', () => {
  const b = basisTeam();
  const nieuw = kloon(b); nieuw.wedstrijd = { ...kloon(b.wedstrijd), id: 'w2', doelpunten: [] };
  const oud = kloon(b); oud.wedstrijd.tegenstander = 'Toch anders';
  assert.equal(voegSamen(b, oud, nieuw).wedstrijd.id, 'w2');
  assert.equal(voegSamen(b, nieuw, oud).wedstrijd.id, 'w2');
});

test('ongedaan maken draait alleen je eigen stap terug, niet de goal van de ander', () => {
  // Zo gebruikt de app het: voegSamen(na, voor, nu) - basis is de stand na
  // jouw stap, `mijn` die ervoor, `hun` wat er intussen van geworden is.
  const voor = basisTeam();
  const na = kloon(voor);
  na.wedstrijd.beschikbaar = { s2: { vanaf: 0, tot: 400 } };
  na.wedstrijd.blokken = [{ id: 'b1', vanSec: 0, totSec: 400, vast: true, opstelling: { k: 's1' } },
    { id: 'b2', vanSec: 400, totSec: 900, vast: false, opstelling: { k: 's3' } }];
  na.wedstrijd.planMs = 5000;
  const nu = kloon(na); nu.wedstrijd.doelpunten.push({ id: 'g9', wie: 'wij', sec: 500, opVeld: ['s3'] });

  const terug = voegSamen(na, voor, nu);
  assert.deepEqual(terug.wedstrijd.beschikbaar, {}, 'de uitval is teruggedraaid');
  assert.equal(terug.wedstrijd.blokken.length, 1, 'het schema ook');
  assert.equal(terug.wedstrijd.doelpunten.length, 1, 'de goal van de ander staat er nog');
});

test('samenvoegen is herhaalbaar: dezelfde wijziging nog een keer ontvangen doet niets', () => {
  const b = basisTeam();
  const a = kloon(b); a.wedstrijd.doelpunten.push({ id: 'g1', wie: 'wij', sec: 1, opVeld: [] });
  const c = kloon(b); c.team.spelers[0].nummer = '12';
  const een = voegSamen(b, a, c);
  assert.deepEqual(voegSamen(c, een, c), een);
  assert.deepEqual(voegSamen(a, een, een), een);
});
