// Een team heeft een lijst wedstrijden. Elk apparaat heeft er één open; die
// is gewoon `S.wedstrijd` voor de schermen. Rechtstreeks op de toestand van
// de app (store.js draait ook zonder browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, wijzig, nieuweWedstrijd, nieuweSpeler, laadTeamDeel, teamDeel, neemOver, metWedstrijden, openWedstrijd, rondAf, genereer } from '../src/app/store.js';

const dag = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const wedstrijd = (id, datum, extra = {}) => ({ ...nieuweWedstrijd(), id, datum, ...extra });

test('een nieuwe wedstrijd komt erbij in de lijst, en de andere blijven staan', () => {
  laadTeamDeel({ team: { naam: 'JO9-1', spelers: [] }, wedstrijden: [wedstrijd('w1', dag(3))], archief: [] });
  wijzig((s) => { s.wedstrijd = wedstrijd('w2', dag(10)); });
  assert.deepEqual(S.wedstrijden.map((w) => w.id), ['w1', 'w2']);
  assert.equal(S.wedstrijd.id, 'w2', 'de nieuwe staat open');

  // Bijwerken vervangt, op zijn plek.
  wijzig((s) => { s.wedstrijd = { ...s.wedstrijd, tegenstander: 'VV Later' }; });
  assert.deepEqual(S.wedstrijden.map((w) => w.tegenstander), ['', 'VV Later']);

  // Weggooien haalt alleen de open wedstrijd weg.
  wijzig((s) => { s.wedstrijd = null; });
  assert.deepEqual(S.wedstrijden.map((w) => w.id), ['w1']);
  assert.equal(S.wedstrijd.id, 'w1', 'dan staat vanzelf de volgende open');
});

test('zonder eigen keuze staat de wedstrijd open die bezig is, en anders de eerstvolgende', () => {
  const lijst = [wedstrijd('oud', dag(-7)), wedstrijd('later', dag(14)), wedstrijd('eerst', dag(2)), wedstrijd('vandaag', dag(0), { aanvang: '10:30' })];
  assert.equal(openWedstrijd(lijst, null).id, 'vandaag');
  assert.equal(openWedstrijd(lijst, 'later').id, 'later', 'wat je zelf koos');
  assert.equal(openWedstrijd(lijst, 'bestaat-niet').id, 'vandaag');
  lijst[1].status = 'bezig';
  assert.equal(openWedstrijd(lijst, null).id, 'later', 'een lopende wedstrijd gaat voor');
  assert.equal(openWedstrijd([wedstrijd('oud', dag(-7))], null).id, 'oud', 'alleen oude: de laatste daarvan');
  assert.equal(openWedstrijd([], null), null);
});

test('afronden haalt de wedstrijd uit de lijst en zet hem in het archief', () => {
  wijzig((s) => {
    s.team = { naam: 'JO9-1', spelers: ['Daan', 'Sem', 'Luuk', 'Noud', 'Tijn', 'Bram', 'Mees'].map((n) => nieuweSpeler(n)) };
    s.team.spelers[0].keeper = true;
    s.archief = [];
    s.wedstrijden = [wedstrijd('zaterdag', dag(0)), wedstrijd('woensdag', dag(4))];
    s.ui.wedstrijdId = 'zaterdag';
    s.wedstrijd.selectie = s.team.spelers.map((p) => p.id);
  });
  genereer();
  rondAf();
  assert.deepEqual(S.wedstrijden.map((w) => w.id), ['woensdag']);
  assert.equal(S.archief[0].id, 'zaterdag');
  assert.equal(S.wedstrijd.id, 'woensdag');
});

test('gegevens met één wedstrijd (van voor de lijst) worden omgezet', () => {
  assert.deepEqual(metWedstrijden({ team: {}, wedstrijd: { id: 'w1' }, archief: [] }), { team: {}, wedstrijden: [{ id: 'w1' }], archief: [] });
  assert.deepEqual(metWedstrijden({ team: {}, wedstrijd: null, archief: [] }).wedstrijden, []);
  const nieuw = { team: {}, wedstrijden: [{ id: 'w1' }], archief: [] };
  assert.equal(metWedstrijden(nieuw), nieuw, 'al omgezet: blijft zoals het is');

  // Een oude back-up terugzetten.
  neemOver({ team: { naam: 'JO9-1', spelers: [] }, wedstrijd: wedstrijd('uit-backup', dag(1)), archief: [] });
  assert.deepEqual(S.wedstrijden.map((w) => w.id), ['uit-backup']);
  // Wat er van een server of uit de opslag van het apparaat komt.
  laadTeamDeel({ team: { naam: 'JO9-1', spelers: [] }, wedstrijd: wedstrijd('van-server', dag(1)), archief: [] });
  assert.deepEqual(teamDeel().wedstrijden.map((w) => w.id), ['van-server']);
  assert.ok(!('wedstrijd' in teamDeel()), 'wat gedeeld wordt is alleen de lijst');
});
