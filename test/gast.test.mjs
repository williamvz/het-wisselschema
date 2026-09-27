// Een speler van een ander team die één keer meedoet: hij speelt mee in het
// schema, maar komt niet in het team en krijgt geen seizoenssaldo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, wijzig, nieuweSpeler, nieuweWedstrijd, nieuweGast, wedstrijdSpelers, genereer, plan, herplanNu, rondAf, draaiTerug } from '../src/app/store.js';

function zetKlaar() {
  wijzig((s) => {
    s.team = { naam: 'JO9-1', spelers: ['Daan', 'Sem', 'Luuk', 'Noud', 'Tijn', 'Bram'].map((n) => nieuweSpeler(n)) };
    s.team.spelers[0].keeper = true;
    s.archief = [];
    s.wedstrijd = nieuweWedstrijd();
    s.wedstrijd.selectie = s.team.spelers.map((p) => p.id);
  });
}

test('een gastspeler speelt mee, maar komt niet in het team', () => {
  zetKlaar();
  const kees = nieuweGast('Kees', true);
  assert.equal(kees.gast, true);
  wijzig((s) => { s.wedstrijd.gasten.push(kees); s.wedstrijd.selectie.push(kees.id); });
  genereer();

  assert.equal(S.team.spelers.length, 6, 'het team blijft zes spelers');
  assert.equal(wedstrijdSpelers().length, 7, 'in de wedstrijd zijn het er zeven');
  const st = plan().statistieken.find((x) => x.spelerId === kees.id);
  assert.ok(st && st.speelSec > 0, 'Kees krijgt speeltijd');

  rondAf();
  assert.equal(S.wedstrijd, null);
  assert.equal(S.team.spelers.length, 6, 'na afloop staat Kees niet in het team');
  assert.ok(!S.team.spelers.some((p) => p.naam === 'Kees'));
  const archief = S.archief[0].statistieken;
  assert.equal(archief.find((x) => x.naam === 'Kees')?.gast, true, 'in het archief staat hij als gast');
  assert.ok(archief.filter((x) => x.naam !== 'Kees').every((x) => !x.gast));
});

test('een gast die halverwege invalt, wordt ingepast en is samen met de wissel terug te draaien', () => {
  zetKlaar();
  genereer();
  const piet = nieuweGast('Piet');
  herplanNu(20 * 60, [{ type: 'erin', spelerId: piet.id }], { gast: piet });

  assert.ok(S.wedstrijd.selectie.includes(piet.id));
  assert.equal(S.wedstrijd.beschikbaar[piet.id].vanaf, 20 * 60, 'Piet doet mee vanaf minuut 20');
  const st = plan().statistieken.find((x) => x.spelerId === piet.id);
  assert.ok(st && st.speelSec > 0 && st.speelSec <= 40 * 60, 'Piet speelt alleen in de rest van de wedstrijd');

  draaiTerug();
  assert.deepEqual(S.wedstrijd.gasten, [], 'ongedaan maken haalt de gast ook weg');
  assert.ok(!S.wedstrijd.selectie.includes(piet.id));
});
