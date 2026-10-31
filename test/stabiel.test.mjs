// Plannen én flexibel blijven: een handmatige ingreep mag het schema niet
// door elkaar schudden, en bewust extra speeltijd blijft staan.

import test from 'node:test';
import assert from 'node:assert/strict';
import { planWedstrijd, ruilInBlok, ruilNu, herverdeelEerlijk, herplan } from '../src/lib/schedule.js';
import { maakTeam, maakWedstrijd, keeperVan } from './helpers.mjs';

const NAMEN = ['Daan', 'Sem', 'Luuk', 'Noud', 'Tijn', 'Bram', 'Finn', 'Mees', 'Jur'];

function opzet(over = {}) {
  const spelers = maakTeam(NAMEN, { keepers: ['Daan', 'Sem'] });
  const w = maakWedstrijd(spelers, { blokkenPerPeriode: 2, periodeMin: 12, ...over });
  w.blokken = planWedstrijd(w, spelers).blokken;
  return { spelers, w };
}

const veldIds = (b) => new Set(Object.values(b.opstelling));
const verschillen = (a, b) => a.reduce((n, blok, i) => n + [...veldIds(b[i])].filter((id) => !veldIds(blok).has(id)).length, 0);
const speelSec = (res, id) => res.statistieken.find((s) => s.spelerId === id).speelSec;

/** Een veldspeler (geen keeper) en een bankspeler in blok i. */
function ruilPaar(w, i) {
  const b = w.blokken[i];
  const op = Object.values(b.opstelling);
  const eruit = op.find((id) => id !== keeperVan(b, w.formationId));
  const erin = Object.keys(Object.fromEntries(w.selectie.map((id) => [id, 1]))).find((id) => !op.includes(id));
  return { eruit, erin };
}

test('opnieuw plannen zonder wijziging laat het schema precies zoals het is', () => {
  const { spelers, w } = opzet();
  const nogmaals = planWedstrijd(w, spelers);
  assert.equal(verschillen(w.blokken, nogmaals.blokken), 0);
});

test('één handmatige ruil verandert alleen dat blok', () => {
  const { spelers, w } = opzet();
  const { eruit, erin } = ruilPaar(w, 2);
  const res = ruilInBlok(w, spelers, w.blokken[2].id, erin, eruit);

  assert.ok(veldIds(res.blokken[2]).has(erin) && !veldIds(res.blokken[2]).has(eruit), 'de ruil is gedaan');
  const rest = (blokken) => blokken.filter((_, i) => i !== 2);
  assert.equal(verschillen(rest(w.blokken), rest(res.blokken)), 0, 'de andere blokken staan precies zoals ze stonden');
});

test('extra speeltijd voor de een ten koste van de ander blijft staan', () => {
  const { spelers, w } = opzet();
  const { eruit, erin } = ruilPaar(w, 2);
  const duur = w.blokken[2].totSec - w.blokken[2].vanSec;
  const voor = planWedstrijd(w, spelers);
  const res = ruilInBlok(w, spelers, w.blokken[2].id, erin, eruit);

  assert.equal(speelSec(res, erin), speelSec(voor, erin) + duur, 'hij speelt een blok meer');
  assert.equal(speelSec(res, eruit), speelSec(voor, eruit) - duur, 'de ander een blok minder');
  assert.equal(res.match.bewust[erin], duur);
  assert.equal(res.match.bewust[eruit], -duur);
  assert.ok(!res.waarschuwingen.some((x) => x.tekst.includes('loopt uiteen')), 'bewust anders is geen scheefgroei');
  assert.ok(res.waarschuwingen.some((x) => x.tekst.includes('Bewust anders verdeeld')), 'maar de app benoemt het wel');
});

test('terugruilen maakt de bewuste afwijking weer ongedaan', () => {
  const { spelers, w } = opzet();
  const { eruit, erin } = ruilPaar(w, 2);
  const heen = ruilInBlok(w, spelers, w.blokken[2].id, erin, eruit);
  const terug = ruilInBlok(heen.match, spelers, w.blokken[2].id, erin, eruit);
  assert.deepEqual(terug.match.bewust, {});
});

test('twee veldspelers van plek ruilen verschuift geen speeltijd', () => {
  const { spelers, w } = opzet();
  const b = w.blokken[1];
  const [x, y] = Object.values(b.opstelling).filter((id) => id !== keeperVan(b, w.formationId));
  const res = ruilInBlok(w, spelers, b.id, x, y);
  assert.deepEqual(res.match.bewust, {});
});

test('tijdens de wedstrijd ruilen laat de rest van het schema staan', () => {
  const { spelers, w } = opzet();
  const { eruit, erin } = ruilPaar(w, 0);
  const res = ruilNu(w, spelers, erin, eruit, 200);
  // blok 0 is doorgeknipt: [gespeeld, nieuw stuk], daarna blok 1..7 ongewijzigd
  const na = res.match.blokken.slice(2);
  assert.equal(verschillen(w.blokken.slice(1), na), 0, 'de blokken na dit wisselmoment blijven gelijk');
  assert.ok(res.match.bewust[erin] > 0 && res.match.bewust[eruit] < 0);
});

test('uitval herplant zonder het hele schema te herschudden', () => {
  const { spelers, w } = opzet();
  const op = 4 * 360 + 100; // midden in een blok, ruim in de wedstrijd
  const uitvaller = Object.values(w.blokken[4].opstelling).find((id) => id !== keeperVan(w.blokken[4], w.formationId));
  const res = herplan(w, spelers, { opSec: op, wijzigingen: [{ type: 'uit', spelerId: uitvaller }] });
  const voor = w.blokken.filter((b) => b.vanSec >= 5 * 360);
  const na = res.match.blokken.filter((b) => b.vanSec >= 5 * 360);
  // Niemand valt uit de lucht: per blok verandert er hoogstens wat de uitvaller vraagt.
  assert.ok(verschillen(voor, na) <= voor.length * 2, `${verschillen(voor, na)} verschuivingen over ${voor.length} blokken`);
});

test('eerlijk herverdelen trekt de afwijking weer recht, rond wat vastligt', () => {
  const { spelers, w } = opzet();
  const { eruit, erin } = ruilPaar(w, 2);
  const bewust = ruilInBlok(w, spelers, w.blokken[2].id, erin, eruit);
  const recht = herverdeelEerlijk(bewust.match, spelers);

  assert.deepEqual(recht.match.bewust, {});
  assert.equal(recht.match.blokken[2].opstelling[Object.keys(recht.match.blokken[2].opstelling).find((s) => recht.match.blokken[2].opstelling[s] === erin)], erin, 'de gekozen opstelling blijft vastliggen');
  const sec = recht.statistieken.map((s) => s.speelSec);
  const verschil = (Math.max(...sec) - Math.min(...sec)) / 60;
  const voorSec = bewust.statistieken.map((s) => s.speelSec);
  const verschilVoor = (Math.max(...voorSec) - Math.min(...voorSec)) / 60;
  assert.ok(verschil < verschilVoor, `speeltijdverschil ${verschilVoor} → ${verschil} min`);
});

test('een nieuw schema begint zonder bewuste afwijkingen en stabiel gedrag verandert de eerlijkheid niet', () => {
  const spelers = maakTeam(NAMEN, { keepers: ['Daan', 'Sem'] });
  const vers = planWedstrijd(maakWedstrijd(spelers, { blokkenPerPeriode: 2, periodeMin: 12 }), spelers);
  const sec = vers.statistieken.map((s) => s.speelSec);
  assert.ok((Math.max(...sec) - Math.min(...sec)) / 60 <= 12, 'vers schema is nog steeds eerlijk');
});
