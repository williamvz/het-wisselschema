// Scherm: wedstrijd klaarzetten. Wie is er vandaag, hoe spelen we, hoe lang.

import { h, icoon, melding, datumTekst, bevestig } from './ui.js';
import { S, wijzig, nieuweWedstrijd, genereer } from './store.js';
import { FORMATIONS, SPEELVORMEN, formationsForSize, getFormation } from '../lib/formations.js';
import { tekenMiniVeld } from './veld.js';

const PRESET_MIN = [10, 12.5, 15, 20, 25];

export function schermOpzet(ganaar) {
  const w = S.wedstrijd;
  if (!w) return geenWedstrijd(ganaar);
  if (!S.team.spelers.length) {
    return h('div', { class: 'kaart' }, h('div', { class: 'leeg' },
      h('p', {}, 'Voeg eerst spelers toe aan je team.'),
      h('button', { class: 'knop primair', onclick: () => ganaar('team') }, 'Naar het team')));
  }

  const wrap = h('div', {});
  const bezig = w.status === 'bezig';

  // Elke wijziging hier gooit het schema weg en laat het opnieuw berekenen.
  // Tijdens een lopende wedstrijd zou dat ook de al gespeelde tijd wissen,
  // dus daar vragen we eerst.
  const doeZet = (fn) => wijzig((s) => { fn(s.wedstrijd); s.wedstrijd.blokken = null; s.wedstrijd.pins = {}; },
    { terugdraaibaar: true });
  const zet = (fn) => {
    if (!bezig) { doeZet(fn); return; }
    bevestig('De wedstrijd is bezig',
      'Als je de opzet nu aanpast, vervalt het huidige schema en de gespeelde tijd. Wil je in plaats daarvan iemand wisselen, gebruik dan het live-scherm.',
      () => doeZet(fn), { knop: 'Toch aanpassen', gevaar: true });
  };

  if (bezig) {
    wrap.appendChild(h('div', { class: 'melding midden' },
      h('span', { class: 'ico' }, '!'),
      h('span', {}, 'Deze wedstrijd loopt. Wijzigingen hier gooien het schema en de gespeelde tijd weg.')));
    wrap.appendChild(h('button', { class: 'knop primair breed', style: { marginBottom: '14px' },
      onclick: () => ganaar('live') }, 'Terug naar de wedstrijd'));
  }

  // ---- tegenstander en datum
  wrap.appendChild(h('div', { class: 'kaart' },
    h('div', { class: 'rij2' },
      h('label', { class: 'veld' }, h('span', {}, 'Tegenstander'),
        h('input', { type: 'text', value: w.tegenstander, placeholder: 'SV Voorbeeld',
          onchange: (e) => wijzig((s) => { s.wedstrijd.tegenstander = e.target.value; }) })),
      h('label', { class: 'veld' }, h('span', {}, 'Datum'),
        h('input', { type: 'date', value: w.datum,
          onchange: (e) => wijzig((s) => { s.wedstrijd.datum = e.target.value; }) }))),
    h('div', { class: 'segment' },
      ...[[true, 'Thuis'], [false, 'Uit']].map(([v, l]) =>
        h('button', { 'aria-pressed': String(w.thuis === v), onclick: () => wijzig((s) => { s.wedstrijd.thuis = v; }) }, l)))));

  // ---- aanwezigheid
  const aanwezig = new Set(w.selectie);
  const kaartAanwezig = h('div', { class: 'kaart' });
  kaartAanwezig.appendChild(h('div', { class: 'kaart-kop' },
    h('h2', {}, 'Wie speelt er vandaag?'),
    h('span', { class: 'mini' }, `${aanwezig.size} van ${S.team.spelers.length}`)));
  const rij = h('div', { class: 'chiprij' });
  for (const p of S.team.spelers) {
    rij.appendChild(h('button', { class: 'chip', 'aria-pressed': String(aanwezig.has(p.id)),
      onclick: () => zet((m) => {
        m.selectie = aanwezig.has(p.id) ? m.selectie.filter((x) => x !== p.id) : [...m.selectie, p.id];
        delete m.beschikbaar[p.id];
      }) },
      h('i', { class: 'dot' }), p.naam, p.keeper ? h('span', { class: 'vlag K' }, 'K') : null));
  }
  kaartAanwezig.appendChild(rij);
  kaartAanwezig.appendChild(h('div', { class: 'knoprij', style: { marginTop: '10px' } },
    h('button', { class: 'knop klein stil', onclick: () => zet((m) => { m.selectie = S.team.spelers.map((p) => p.id); }) }, 'Iedereen'),
    h('button', { class: 'knop klein stil', onclick: () => zet((m) => { m.selectie = []; }) }, 'Niemand')));
  wrap.appendChild(kaartAanwezig);

  // ---- speelvorm en opstelling
  const kaartVorm = h('div', { class: 'kaart' });
  kaartVorm.appendChild(h('h2', {}, 'Speelvorm'));
  kaartVorm.appendChild(h('p', { class: 'uitleg' }, 'Hoeveel spelers staan er bij jullie op het veld?'));
  kaartVorm.appendChild(h('div', { class: 'segment' },
    ...SPEELVORMEN.map((n) => h('button', { 'aria-pressed': String(w.speelvorm === n),
      onclick: () => zet((m) => { m.speelvorm = n; m.formationId = formationsForSize(n)[0].id; }) }, `${n}-tal`))));

  kaartVorm.appendChild(h('div', { class: 'tussenkop' }, 'Opstelling'));
  const opstellingen = h('div', { style: { display: 'flex', gap: '10px', overflowX: 'auto',
    padding: '2px 0 6px', margin: '0 -4px', scrollSnapType: 'x mandatory' } });
  for (const f of formationsForSize(w.speelvorm)) {
    const gekozen = f.id === w.formationId;
    opstellingen.appendChild(h('button', {
      class: 'knop', 'aria-pressed': String(gekozen),
      style: { flex: 'none', flexDirection: 'column', height: 'auto', padding: '8px', gap: '6px',
        scrollSnapAlign: 'start', borderColor: gekozen ? 'var(--accent)' : 'var(--rand)',
        borderWidth: gekozen ? '2px' : '1px', background: gekozen ? 'var(--accent-zacht)' : 'var(--vlak)' },
      onclick: () => zet((m) => { m.formationId = f.id; }) },
      tekenMiniVeld(f.id, 54),
      h('span', { style: { fontSize: '.8rem' } }, f.naam)));
  }
  kaartVorm.appendChild(opstellingen);
  wrap.appendChild(kaartVorm);

  // ---- speeltijd
  const kaartTijd = h('div', { class: 'kaart' });
  kaartTijd.appendChild(h('h2', {}, 'Speeltijd'));
  kaartTijd.appendChild(h('div', { class: 'rij2', style: { marginTop: '10px' } },
    h('label', { class: 'veld' }, h('span', {}, 'Aantal perioden'),
      h('div', { class: 'segment' }, ...[2, 3, 4].map((n) =>
        h('button', { 'aria-pressed': String(w.periodes === n), onclick: () => zet((m) => { m.periodes = n; }) }, String(n))))),
    h('label', { class: 'veld' }, h('span', {}, 'Minuten per periode'),
      h('select', { onchange: (e) => zet((m) => { m.periodeMin = Number(e.target.value); }) },
        ...PRESET_MIN.map((m2) => h('option', { value: String(m2), selected: w.periodeMin === m2 }, `${m2} min`)),
        PRESET_MIN.includes(w.periodeMin) ? null : h('option', { value: String(w.periodeMin), selected: true }, `${w.periodeMin} min`)))));

  kaartTijd.appendChild(h('label', { class: 'veld' },
    h('span', {}, 'Wisselmomenten per periode'),
    h('div', { class: 'segment' },
      ...[[1, 'Eén: bij de rust'], [2, 'Twee: ook halverwege']].map(([n, l]) =>
        h('button', { 'aria-pressed': String(w.blokkenPerPeriode === n), onclick: () => zet((m) => { m.blokkenPerPeriode = n; }) }, l)))));
  kaartTijd.appendChild(h('p', { class: 'uitleg' },
    `Totaal ${w.periodes * w.periodeMin} minuten, verdeeld over ${w.periodes * w.blokkenPerPeriode} blokken van ${Math.round(w.periodeMin / w.blokkenPerPeriode * 10) / 10} minuten.`));
  wrap.appendChild(kaartTijd);

  // ---- verdeling
  const accent = w.opties.vormAccent ?? 0;
  const accentUit = h('span', { class: 'mini' }, accentTekst(accent));
  const kaartVerdeling = h('div', { class: 'kaart' });
  kaartVerdeling.appendChild(h('div', { class: 'kaart-kop' }, h('h3', {}, 'Verdeling van de speeltijd'), accentUit));
  kaartVerdeling.appendChild(h('input', { type: 'range', class: 'schuif', min: '0', max: '100', step: '10',
    value: String(Math.round(accent * 100)),
    oninput: (e) => { accentUit.textContent = accentTekst(Number(e.target.value) / 100); },
    onchange: (e) => wijzig((s) => { s.wedstrijd.opties.vormAccent = Number(e.target.value) / 100; }) }));
  kaartVerdeling.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
    h('span', { class: 'mini' }, 'Iedereen evenveel'), h('span', { class: 'mini' }, 'Accent op basisspelers')));
  if (accent > 0.05) {
    kaartVerdeling.appendChild(h('div', { class: 'melding midden', style: { marginTop: '10px' } },
      h('span', { class: 'ico' }, '!'),
      h('span', {}, 'In de jeugd tot en met JO12 is gelijke speeltijd het uitgangspunt van de KNVB. Gebruik dit met mate.')));
  }
  wrap.appendChild(kaartVerdeling);

  // ---- actie
  const genoeg = aanwezig.size >= 2;
  const maakSchema = () => { genereer({ nieuweSeed: true }); ganaar('schema'); melding('Wisselschema gemaakt'); };
  wrap.appendChild(h('button', { class: 'knop primair breed groot', disabled: !genoeg,
    onclick: () => {
      if (!bezig) { maakSchema(); return; }
      bevestig('De wedstrijd is bezig', 'Een nieuw schema wist de gespeelde tijd van deze wedstrijd.',
        maakSchema, { knop: 'Nieuw schema', gevaar: true });
    } },
    icoon('fluit', 20), w.blokken ? 'Schema opnieuw maken' : 'Maak het wisselschema'));
  if (!genoeg) wrap.appendChild(h('p', { class: 'uitleg', style: { textAlign: 'center', marginTop: '8px' } },
    'Selecteer minstens twee spelers.'));

  wrap.appendChild(h('button', { class: 'knop stil breed', style: { marginTop: '14px' },
    onclick: () => bevestig('Wedstrijd weggooien?', 'De opzet en het schema van deze wedstrijd verdwijnen.',
      () => { wijzig((s) => { s.wedstrijd = null; }, { terugdraaibaar: true }); }, { knop: 'Weggooien', gevaar: true }) },
    'Deze wedstrijd weggooien'));
  return wrap;
}

const accentTekst = (v) => (v < 0.05 ? 'volledig gelijk' : v < 0.35 ? 'licht accent' : v < 0.7 ? 'duidelijk accent' : 'sterk accent');

function geenWedstrijd(ganaar) {
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'kaart' }, h('div', { class: 'leeg' },
    h('h2', { style: { marginBottom: '6px' } }, 'Geen wedstrijd klaargezet'),
    h('p', {}, 'Zet een wedstrijd klaar en laat de app het wisselschema maken.'),
    h('button', { class: 'knop primair groot', style: { marginTop: '8px' }, onclick: () => {
      const vorige = S.archief[0];
      wijzig((s) => { s.wedstrijd = nieuweWedstrijd(vorige ? { ...vorige } : null); s.wedstrijd.selectie = s.team.spelers.map((p) => p.id); });
    } }, icoon('plus', 20), 'Nieuwe wedstrijd'))));

  if (S.archief.length) {
    wrap.appendChild(h('div', { class: 'tussenkop' }, 'Laatst gespeeld'));
    for (const a of S.archief.slice(0, 3)) {
      wrap.appendChild(h('div', { class: 'kaart', style: { padding: '11px 14px' } },
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          h('div', { class: 'naam', style: { flex: '1', fontWeight: '600' } },
            a.tegenstander || 'Onbekende tegenstander',
            h('small', { style: { display: 'block', fontSize: '.76rem', color: 'var(--zacht)' } },
              `${datumTekst(a.datum)} · ${a.thuis ? 'thuis' : 'uit'} · ${getFormation(a.formationId).naam}`)),
          h('button', { class: 'knop klein', onclick: () => ganaar('archief') }, 'Bekijk'))));
    }
  }
  return wrap;
}
