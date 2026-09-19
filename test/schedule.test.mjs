import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWedstrijd, maakBlokken, splitsOp, vergrendelTot, verlegGrens, statistieken } from '../src/lib/schedule.js';
import { getFormation } from '../src/lib/formations.js';
import { maakTeam, maakWedstrijd, min, veldSpelers, keeperVan } from './helpers.mjs';

const NAMEN7 = ['Daan', 'Sem', 'Luuk', 'Noud', 'Tijn', 'Bram', 'Finn'];

test('blokindeling: 4 kwarten van 15 minuten dekken precies 60 minuten', () => {
  const b = maakBlokken({ periodes: 4, periodeMin: 15, blokkenPerPeriode: 1 });
  assert.equal(b.length, 4);
  assert.equal(b[0].vanSec, 0);
  assert.equal(b[3].totSec, 3600);
  for (let i = 1; i < b.length; i++) assert.equal(b[i].vanSec, b[i - 1].totSec, 'geen gaten tussen blokken');
});

test('blokindeling: 2 wisselmomenten per kwart geeft 8 blokken zonder afrondingsgat', () => {
  const b = maakBlokken({ periodes: 4, periodeMin: 12.5, blokkenPerPeriode: 2 });
  assert.equal(b.length, 8);
  assert.equal(b[7].totSec, 4 * 12.5 * 60);
  for (let i = 1; i < b.length; i++) assert.equal(b[i].vanSec, b[i - 1].totSec);
});

test('7 spelers, 6-tal: elk blok vol bezet en speeltijd is zo eerlijk als rekenkundig kan', () => {
  const team = maakTeam(NAMEN7, { keepers: ['Daan', 'Sem'] });
  const w = maakWedstrijd(team);
  const { blokken, statistieken: stats } = planWedstrijd(w, team);

  assert.equal(blokken.length, 4);
  for (const b of blokken) assert.equal(veldSpelers(b).length, 6, 'zes spelers op het veld');

  // 4 blokken x 6 plekken = 24 blokbeurten over 7 spelers => 3 spelers 4x, 4 spelers 3x
  const aantallen = stats.map((s) => s.blokken).sort();
  assert.deepEqual(aantallen, [3, 3, 3, 3, 4, 4, 4]);

  // Niemand speelt meer dan een kwart meer dan een ander.
  const speeltijden = stats.map((s) => s.speelSec);
  assert.ok(Math.max(...speeltijden) - Math.min(...speeltijden) <= 15 * 60,
    `verschil te groot: ${speeltijden.map(min)}`);
});

test('7 spelers: niemand zit twee kwarten achter elkaar op de bank', () => {
  const team = maakTeam(NAMEN7, { keepers: ['Daan', 'Sem'] });
  for (let seed = 1; seed <= 25; seed++) {
    const w = maakWedstrijd(team, { opties: { seed } });
    const { statistieken: stats } = planWedstrijd(w, team);
    for (const s of stats) {
      assert.ok(s.langsteBankReeks <= 1, `seed ${seed}: ${s.naam} zit ${s.langsteBankReeks}x achter elkaar`);
    }
  }
});

test('elk blok heeft een echte keeper, en keepersbeurten worden verdeeld', () => {
  const team = maakTeam(NAMEN7, { keepers: ['Daan', 'Sem'] });
  const w = maakWedstrijd(team);
  const { blokken } = planWedstrijd(w, team);

  const keeperIds = new Set(team.filter((p) => p.keeper).map((p) => p.id));
  const beurten = {};
  for (const b of blokken) {
    const k = keeperVan(b, w.formationId);
    assert.ok(keeperIds.has(k), 'keeper moet keeper-vaardig zijn');
    beurten[k] = (beurten[k] || 0) + 1;
  }
  assert.equal(Object.keys(beurten).length, 2, 'beide keepers komen aan de beurt');
  assert.ok(Math.max(...Object.values(beurten)) <= 3, 'beurten redelijk verdeeld');
});

test('slechts één keeper in de selectie: die staat elk kwart op doel, zonder waarschuwing', () => {
  const team = maakTeam(NAMEN7, { keepers: ['Daan'] });
  const w = maakWedstrijd(team);
  const { blokken, waarschuwingen } = planWedstrijd(w, team);
  for (const b of blokken) assert.equal(keeperVan(b, w.formationId), 'p1');
  assert.ok(!waarschuwingen.some((x) => x.tekst.includes('Geen echte keeper')));
});

test('geen enkele keeper in de selectie: er staat wel iemand op doel, mét waarschuwing', () => {
  const team = maakTeam(NAMEN7, { keepers: [] });
  const w = maakWedstrijd(team);
  const { blokken, waarschuwingen } = planWedstrijd(w, team);
  for (const b of blokken) assert.ok(keeperVan(b, w.formationId), 'doel is bezet');
  assert.ok(waarschuwingen.some((x) => x.tekst.includes('Geen echte keeper')));
});

test('positievoorkeuren worden gerespecteerd waar dat kan', () => {
  const team = maakTeam(NAMEN7, {
    keepers: ['Daan'],
    posities: { Sem: ['V'], Luuk: ['V'], Noud: ['M'], Tijn: ['M'], Bram: ['A'], Finn: ['A'] },
  });
  const w = maakWedstrijd(team);
  const { blokken } = planWedstrijd(w, team);
  const f = getFormation(w.formationId);

  let passend = 0, totaal = 0;
  for (const b of blokken) {
    for (const [slotId, pid] of Object.entries(b.opstelling)) {
      const slot = f.slots.find((s) => s.id === slotId);
      const p = team.find((q) => q.id === pid);
      if (slot.role === 'K' || !p.posities.length) continue;
      totaal += 1;
      if (p.posities.includes(slot.role)) passend += 1;
    }
  }
  assert.ok(passend / totaal >= 0.8, `te weinig op voorkeurspositie: ${passend}/${totaal}`);
});

test('6 spelers op een 6-tal: iedereen speelt alles, niemand op de bank', () => {
  const team = maakTeam(NAMEN7.slice(0, 6), { keepers: ['Daan', 'Sem'] });
  const w = maakWedstrijd(team);
  const { blokken, statistieken: stats } = planWedstrijd(w, team);
  for (const b of blokken) assert.equal(veldSpelers(b).length, 6);
  for (const s of stats) assert.equal(s.speelSec, 3600);
});

test('5 spelers op een 6-tal: de spits vervalt, keeper en verdediging blijven', () => {
  const team = maakTeam(NAMEN7.slice(0, 5), { keepers: ['Daan'] });
  const w = maakWedstrijd(team);
  const { blokken, waarschuwingen } = planWedstrijd(w, team);
  const f = getFormation(w.formationId);
  for (const b of blokken) {
    assert.equal(veldSpelers(b).length, 5);
    const rollen = Object.keys(b.opstelling).map((sid) => f.slots.find((s) => s.id === sid).role);
    assert.ok(rollen.includes('K'), 'keeper blijft staan');
    assert.equal(rollen.filter((r) => r === 'V').length, 2, 'verdediging blijft intact');
  }
  assert.ok(waarschuwingen.some((x) => x.tekst.includes('Te weinig spelers')));
});

test('handmatig vastgezette posities (pins) worden gerespecteerd', () => {
  const team = maakTeam(NAMEN7, { keepers: ['Daan', 'Sem'] });
  const basis = planWedstrijd(maakWedstrijd(team), team);
  const blokId = basis.blokken[2].id;

  const w = maakWedstrijd(team, { blokken: basis.blokken, pins: { [blokId]: { sp: 'p7' } } });
  const { blokken } = planWedstrijd(w, team);
  assert.equal(blokken[2].opstelling.sp, 'p7', 'Finn staat vastgezet in de spits van kwart 3');
});

test('wisselinstructies benoemen wie eruit, wie erin en wie verschuift', () => {
  const team = maakTeam(NAMEN7, { keepers: ['Daan', 'Sem'] });
  const { wissels, blokken } = planWedstrijd(maakWedstrijd(team), team);
  assert.equal(wissels.length, 3, 'drie wisselmomenten tussen vier kwarten');
  for (const wi of wissels) {
    assert.equal(wi.eruit.length, wi.erin.length, 'even veel erin als eruit');
    assert.ok(wi.eruit.every((x) => x.naam), 'namen ingevuld');
  }
  const totaalErin = wissels.reduce((s, x) => s + x.erin.length, 0);
  assert.ok(totaalErin >= 3, 'er wordt daadwerkelijk gewisseld');
  assert.ok(blokken.every((b) => b.bank.length === 1));
});
