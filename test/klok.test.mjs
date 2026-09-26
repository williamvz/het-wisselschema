// De wedstrijdklok en ongedaan maken, rechtstreeks op de toestand van de app
// (store.js draait ook zonder browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, wijzig, nu, klokAutoPauze, klokPauze, klokStart, klokZet, periodeGrens, nieuweWedstrijd,
  kanTerug, draaiTerug, laadTeamDeel, noteerGoal } from '../src/app/store.js';

/** Een wedstrijd van 4 x 15 minuten waarvan de klok `sec` seconden geleden vanaf `vanaf` begon te lopen. */
function lopend(sec, vanaf = 0, extra = {}) {
  const w = nieuweWedstrijd();
  Object.assign(w, { periodes: 4, periodeMin: 15 });
  w.klok = { loopt: true, verstreken: vanaf, sindsMs: nu() - sec * 1000, pauzeReden: null, bijgewerkt: 12345, ...extra };
  return w;
}

test('de klok stopt aan het eind van elke periode, niet alleen aan het eind van de wedstrijd', () => {
  assert.equal(periodeGrens(lopend(899)), null);
  assert.equal(periodeGrens(lopend(900.3)), 900, 'eind van periode 1');
  assert.equal(periodeGrens(lopend(1000)), 900, 'ook als de telefoon even in je zak zat');
  assert.equal(periodeGrens(lopend(50, 900, { laatsteGrens: 900 })), null, 'na de rust verder: niet meteen weer stoppen');
  assert.equal(periodeGrens(lopend(900.2, 900, { laatsteGrens: 900 })), 1800, 'eind van periode 2');
  assert.equal(periodeGrens(lopend(200, 3500, { laatsteGrens: 2700 })), 3600, 'einde wedstrijd');
  assert.equal(periodeGrens(lopend(200, 3500, { laatsteGrens: 3600 })), null, 'en daarna niet opnieuw');
  assert.equal(periodeGrens(lopend(100, 1000)), null, 'oude gegevens zonder laatsteGrens: vanaf waar hij startte');
  const stil = lopend(1000); stil.klok.loopt = false;
  assert.equal(periodeGrens(stil), null, 'een stilstaande klok stopt niet');
});

test('de klok verzetten stopt hem niet op de grens waar je net overheen sprong', () => {
  S.wedstrijd = lopend(10);
  klokZet(1800);
  assert.equal(S.wedstrijd.klok.laatsteGrens, 1800);
  assert.equal(periodeGrens(S.wedstrijd), null);
  klokZet(850); // terug naar periode 1: de grens van 900 komt dan weer
  assert.equal(S.wedstrijd.klok.laatsteGrens, 0);
});

test('vanzelf stoppen telt niet als nieuwere klokwijziging, zelf stoppen wel', () => {
  // Zo kan een telefoon die offline de oude klok liet doorlopen niet winnen
  // van wat een collega intussen met de klok deed (zie samenvoegen.js).
  S.wedstrijd = lopend(900.5);
  klokAutoPauze(900, 'rust');
  assert.equal(S.wedstrijd.klok.loopt, false);
  assert.equal(S.wedstrijd.klok.verstreken, 900);
  assert.equal(S.wedstrijd.klok.bijgewerkt, 12345, 'vanzelf: tijdstip blijft staan');

  klokStart();
  assert.equal(S.wedstrijd.klok.laatsteGrens, 900, 'de afgehandelde grens blijft bewaard');
  assert.ok(S.wedstrijd.klok.bijgewerkt > 12345, 'zelf starten: nieuw tijdstip');
  klokPauze('hand');
  assert.equal(S.wedstrijd.klok.laatsteGrens, 900, 'ook na een pauze');
});

test('ongedaan maken blijft bij de wedstrijd waar je in zit', () => {
  S.team = { naam: 'JO9-1', spelers: [] };
  S.archief = [];
  S.wedstrijd = lopend(60);
  noteerGoal('wij');
  assert.ok(kanTerug());

  // Een collega rondt af en zet de volgende wedstrijd klaar.
  const volgende = nieuweWedstrijd();
  laadTeamDeel({ team: S.team, wedstrijd: volgende, archief: [] }, { vanAfstand: true });
  assert.equal(kanTerug(), false, 'de goal in de vorige wedstrijd is niet meer terug te draaien');
  assert.equal(draaiTerug(), false);
  assert.equal(S.wedstrijd.id, volgende.id, 'en de nieuwe wedstrijd blijft staan');

  // Zelf een nieuwe wedstrijd beginnen werkt net zo.
  noteerGoal('zij');
  assert.ok(kanTerug());
  wijzig((s) => { s.wedstrijd = nieuweWedstrijd(); });
  assert.equal(kanTerug(), false);
});
