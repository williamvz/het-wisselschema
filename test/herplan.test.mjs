import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWedstrijd, herplan, wisselUitgevoerd, blokOp } from '../src/lib/schedule.js';
import { maakTeam, maakWedstrijd, min, veldSpelers, keeperVan } from './helpers.mjs';

const NAMEN7 = ['Daan', 'Sem', 'Luuk', 'Noud', 'Tijn', 'Bram', 'Finn'];
const opzet = (namen = NAMEN7, keepers = ['Daan', 'Sem']) => {
  const team = maakTeam(namen, { keepers });
  const basis = planWedstrijd(maakWedstrijd(team), team);
  return { team, match: { ...maakWedstrijd(team), blokken: basis.blokken }, basis };
};

/** Wie stond er op het veld op tijdstip t? */
const opVeldOp = (blokken, t) => new Set(veldSpelers(blokken[blokOp(blokken, t)]));

test('speler valt uit op minuut 23: historie blijft staan, het kwart wordt gesplitst', () => {
  const { team, match } = opzet();
  const t = 23 * 60;
  const slachtoffer = [...opVeldOp(match.blokken, t)][2];

  const na = herplan(match, team, { opSec: t, wijzigingen: [{ type: 'uit', spelerId: slachtoffer }] });

  // Kwart 2 loopt van 900 tot 1800 en is nu geknipt op 1380.
  const grenzen = na.blokken.map((b) => [b.vanSec, b.totSec]);
  assert.ok(grenzen.some(([v, tt]) => v === 900 && tt === t), `kwart 2 geknipt op ${t}: ${JSON.stringify(grenzen)}`);
  assert.ok(grenzen.some(([v]) => v === t), 'er is een vervolgblok vanaf het uitvalmoment');

  // Historie ongemoeid: alles voor het uitvalmoment is identiek en vastgezet.
  for (const b of na.blokken.filter((x) => x.totSec <= t)) {
    assert.equal(b.vast, true, 'gespeeld blok staat vast');
  }
  assert.deepEqual(na.blokken[0].opstelling, match.blokken[0].opstelling, 'kwart 1 is niet herschreven');

  // De uitgevallen speler komt na minuut 23 niet meer voor.
  for (const b of na.blokken.filter((x) => x.vanSec >= t)) {
    assert.ok(!veldSpelers(b).includes(slachtoffer), 'uitgevallen speler staat niet meer opgesteld');
  }
  // En er staat nog steeds een volledig team.
  for (const b of na.blokken) assert.equal(veldSpelers(b).length, 6);
});

test('speler valt uit: de invaller is degene met de grootste achterstand in speeltijd', () => {
  const { team, match } = opzet();
  const t = 23 * 60;
  const veld = opVeldOp(match.blokken, t);
  const bank = team.map((p) => p.id).filter((id) => !veld.has(id));
  const slachtoffer = [...veld][2];

  const na = herplan(match, team, { opSec: t, wijzigingen: [{ type: 'uit', spelerId: slachtoffer }] });
  const naVeld = opVeldOp(na.blokken, t + 1);
  assert.ok(bank.some((id) => naVeld.has(id)), 'de bankzitter is het veld ingekomen');
});

test('de keeper valt uit: er staat direct een nieuwe keeper op doel', () => {
  const { team, match } = opzet();
  const t = 20 * 60;
  const huidigeKeeper = keeperVan(match.blokken[blokOp(match.blokken, t)], match.formationId);

  const na = herplan(match, team, { opSec: t, wijzigingen: [{ type: 'uit', spelerId: huidigeKeeper }] });
  const keeperIds = new Set(team.filter((p) => p.keeper).map((p) => p.id));

  for (const b of na.blokken.filter((x) => x.vanSec >= t)) {
    const k = keeperVan(b, match.formationId);
    assert.ok(k && k !== huidigeKeeper, 'ander doelman');
    assert.ok(keeperIds.has(k), 'en wel een die kan keepen');
  }
});

test('de enige wisselspeler valt uit: het team speelt verder met vijf', () => {
  const { team, match } = opzet();
  const t = 20 * 60;
  const veld = [...opVeldOp(match.blokken, t)];
  const bank = team.map((p) => p.id).filter((id) => !veld.includes(id));

  // Eerst de bank eruit, daarna een veldspeler: dan zijn er nog 5 over.
  let stap = herplan(match, team, { opSec: t, wijzigingen: [{ type: 'uit', spelerId: bank[0] }] });
  stap = herplan(stap.match, team, { opSec: t + 60, wijzigingen: [{ type: 'uit', spelerId: veld[0] }] });

  const laatste = stap.blokken[stap.blokken.length - 1];
  assert.equal(veldSpelers(laatste).length, 5, 'verder met vijf spelers');
  assert.ok(stap.waarschuwingen.some((w) => w.tekst.includes('Te weinig spelers')));
  assert.ok(keeperVan(laatste, match.formationId), 'en het doel blijft bezet');
});

test('speeltijd na een uitval wordt zo eerlijk mogelijk herverdeeld over de rest', () => {
  const { team, match } = opzet();
  const t = 15 * 60; // precies op de kwartgrens
  const veld = [...opVeldOp(match.blokken, t - 1)];
  const na = herplan(match, team, { opSec: t, wijzigingen: [{ type: 'uit', spelerId: veld[0] }] });

  const rest = na.statistieken.filter((s) => s.spelerId !== veld[0]);
  const speeltijden = rest.map((s) => s.speelSec);
  const spreiding = (Math.max(...speeltijden) - Math.min(...speeltijden)) / 60;
  assert.ok(spreiding <= 15, `spreiding onder de overgebleven zes is ${spreiding} min`);
});

test('late binnenkomer vanaf minuut 15 krijgt speeltijd, maar niet met terugwerkende kracht', () => {
  const team = maakTeam([...NAMEN7, 'Jesse'], { keepers: ['Daan', 'Sem'] });
  const zonderJesse = { ...maakWedstrijd(team), selectie: team.slice(0, 7).map((p) => p.id) };
  const basis = planWedstrijd(zonderJesse, team);
  const match = { ...zonderJesse, blokken: basis.blokken };

  const t = 15 * 60;
  const na = herplan(match, team, { opSec: t, wijzigingen: [{ type: 'erin', spelerId: 'p8' }] });

  for (const b of na.blokken.filter((x) => x.totSec <= t)) {
    assert.ok(!veldSpelers(b).includes('p8'), 'Jesse speelt niet mee in kwart 1');
  }
  const jesse = na.statistieken.find((s) => s.spelerId === 'p8');
  assert.ok(jesse.speelSec > 0, 'Jesse komt wel in actie');
  assert.ok(jesse.speelSec <= 45 * 60, 'maar hoogstens de resterende 45 minuten');
});

test('uitgevallen speler die toch weer verder kan wordt opnieuw ingepland', () => {
  const { team, match } = opzet();
  const veld = [...opVeldOp(match.blokken, 10 * 60)];
  const uit = herplan(match, team, { opSec: 10 * 60, wijzigingen: [{ type: 'uit', spelerId: veld[0] }] });
  const terug = herplan(uit.match, team, { opSec: 30 * 60, wijzigingen: [{ type: 'terug', spelerId: veld[0] }] });

  const laatsteBlokken = terug.blokken.filter((b) => b.vanSec >= 30 * 60);
  assert.ok(laatsteBlokken.some((b) => veldSpelers(b).includes(veld[0])), 'speelt weer mee na herstel');
});

test('een wissel die twee minuten te laat wordt uitgevoerd telt eerlijk door', () => {
  const { team, match } = opzet();
  const werkelijk = 17 * 60; // gepland op 15:00, uitgevoerd op 17:00
  const na = wisselUitgevoerd(match, team, 0, werkelijk);

  assert.equal(na.blokken[0].totSec, werkelijk, 'kwart 1 telt door tot de echte wissel');
  assert.equal(na.blokken[1].vanSec, werkelijk, 'kwart 2 begint daar');
  assert.equal(na.blokken[1].totSec, 30 * 60, 'de kwartgrens zelf schuift niet op');
  assert.equal(na.blokken[0].vast, true);

  const totaal = na.statistieken.reduce((s, x) => s + x.speelSec, 0);
  assert.equal(totaal, 4 * 15 * 60 * 6, 'totale veldtijd blijft kloppen');
});

test('herhaald herplannen blijft stabiel en houdt het team compleet', () => {
  const { team } = opzet();
  let huidig = opzet().match;
  for (const t of [7 * 60, 14 * 60, 21 * 60, 28 * 60, 35 * 60, 42 * 60]) {
    const res = herplan(huidig, team, { opSec: t });
    huidig = res.match;
    for (const b of res.blokken) {
      assert.ok(veldSpelers(b).length >= 5, 'team blijft compleet');
      assert.equal(new Set(veldSpelers(b)).size, veldSpelers(b).length, 'niemand staat dubbel opgesteld');
    }
    assert.ok(res.blokken.every((b, i) => i === 0 || b.vanSec === res.blokken[i - 1].totSec), 'geen gaten in de tijdlijn');
  }
  const totaal = huidig.blokken[huidig.blokken.length - 1].totSec;
  assert.equal(totaal, 3600, 'de wedstrijd duurt nog steeds 60 minuten');
});

test('seizoenssaldo duwt wie voorstond richting minder speeltijd', () => {
  const team = maakTeam(NAMEN7, { keepers: ['Daan', 'Sem'], saldo: { Finn: 20 * 60, Bram: -20 * 60 } });
  const w = maakWedstrijd(team, { opties: { seed: 7, saldoGewicht: 0.6 } });
  const { statistieken: stats } = planWedstrijd(w, team);
  const finn = stats.find((s) => s.naam === 'Finn');
  const bram = stats.find((s) => s.naam === 'Bram');
  assert.ok(bram.speelSec >= finn.speelSec, `Bram (${min(bram.speelSec)}) haalt Finn (${min(finn.speelSec)}) in`);
});

test('bij een uitval blijft de rest zoveel mogelijk staan', () => {
  // Langs de lijn wil je "Daan op doel, Finn erin" roepen - geen complete
  // herschikking van het elftal. Het schema mag de rust niet onnodig verstoren.
  const team = maakTeam(NAMEN7, {
    keepers: ['Daan', 'Sem'],
    posities: { Luuk: ['V'], Noud: ['M'], Tijn: ['M'], Bram: ['A'], Finn: ['A'] },
  });

  let totaalVerschoven = 0;
  let metingen = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const t of [10, 120, 8 * 60, 23 * 60, 38 * 60]) {
      const basis = planWedstrijd(maakWedstrijd(team, { opties: { seed } }), team);
      const match = { ...maakWedstrijd(team, { opties: { seed } }), blokken: basis.blokken };

      const voorBlok = match.blokken[blokOp(match.blokken, t)];
      const slachtoffer = Object.values(voorBlok.opstelling)[1];

      const na = herplan(match, team, { opSec: t, wijzigingen: [{ type: 'uit', spelerId: slachtoffer }] });
      const naBlok = na.blokken[blokOp(na.blokken, t + 1)];

      // Wie stond er al op het veld en staat nu ergens anders?
      const verschoven = Object.entries(naBlok.opstelling).filter(([slotId, pid]) => {
        if (pid === slachtoffer) return false;
        const oudSlot = Object.keys(voorBlok.opstelling).find((s) => voorBlok.opstelling[s] === pid);
        return oudSlot && oudSlot !== slotId;
      }).length;

      assert.ok(verschoven <= 3, `seed ${seed} op ${t / 60} min: ${verschoven} spelers verschuiven`);
      totaalVerschoven += verschoven;
      metingen += 1;
    }
  }
  const gemiddeld = totaalVerschoven / metingen;
  assert.ok(gemiddeld <= 1.5, `gemiddeld ${gemiddeld.toFixed(2)} positiewissels per uitval (mag hoogstens 1.5)`);
});
