// Scherm: de wedstrijden. Een lijst van wat er gepland staat, en per
// wedstrijd het klaarzetten: wie is er, hoe spelen we, hoe lang.

import { h, icoon, melding, datumTekst, bevestig, toonSheet } from './ui.js';
import { S, wijzig, nieuweWedstrijd, nieuweGast, genereer, wanneer, zonderWissels } from './store.js';
import { FORMATIONS, SPEELVORMEN, formationsForSize, getFormation } from '../lib/formations.js';
import { tekenMiniVeld } from './veld.js';
import { account, wachtOpOpslaan } from './samenwerken.js';
import { verbindingsStaat } from './kop.js';

const PRESET_MIN = [10, 12.5, 15, 20, 25];

export function schermOpzet(ganaar) {
  const w = S.wedstrijd;
  if (!w || S.ui.lijst) return schermWedstrijden(ganaar);

  const wrap = h('div', {});
  wrap.appendChild(terugRij());
  if (!S.team.spelers.length) {
    wrap.appendChild(h('div', { class: 'kaart' }, h('div', { class: 'leeg' },
      h('p', {}, 'Voeg eerst spelers toe aan je team.'),
      h('button', { class: 'knop primair', onclick: () => ganaar('team') }, 'Naar het team'))));
    return wrap;
  }

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
    h('label', { class: 'veld' }, h('span', {}, 'Tegenstander'),
      h('input', { type: 'text', value: w.tegenstander, placeholder: 'SV Voorbeeld',
        onchange: (e) => wijzig((s) => { s.wedstrijd.tegenstander = e.target.value.trim(); }) })),
    h('div', { class: 'rij2' },
      h('label', { class: 'veld' }, h('span', {}, 'Datum'),
        h('input', { type: 'date', value: w.datum,
          onchange: (e) => wijzig((s) => { s.wedstrijd.datum = e.target.value; }) })),
      h('label', { class: 'veld' }, h('span', {}, 'Aanvang'),
        h('input', { type: 'time', value: w.aanvang || '',
          onchange: (e) => wijzig((s) => { s.wedstrijd.aanvang = e.target.value; }) }))),
    h('div', { class: 'segment' },
      ...[[true, 'Thuis'], [false, 'Uit']].map(([v, l]) =>
        h('button', { 'aria-pressed': String(w.thuis === v), onclick: () => wijzig((s) => { s.wedstrijd.thuis = v; }) }, l)))));

  // ---- aanwezigheid
  const aanwezig = new Set(w.selectie);
  const gasten = w.gasten || [];
  const kaartAanwezig = h('div', { class: 'kaart' });
  kaartAanwezig.appendChild(h('div', { class: 'kaart-kop' },
    h('h2', {}, 'Wie speelt er vandaag?'),
    h('span', { class: 'mini' }, `${aanwezig.size} van ${S.team.spelers.length + gasten.length}`)));
  const rij = h('div', { class: 'chiprij' });
  for (const p of S.team.spelers) {
    rij.appendChild(h('button', { class: 'chip', 'aria-pressed': String(aanwezig.has(p.id)),
      onclick: () => zet((m) => {
        m.selectie = aanwezig.has(p.id) ? m.selectie.filter((x) => x !== p.id) : [...m.selectie, p.id];
        delete m.beschikbaar[p.id];
      }) },
      h('i', { class: 'dot' }), p.naam, p.keeper ? h('span', { class: 'vlag K' }, 'K') : null));
  }
  // Een gast doet alleen vandaag mee: wegtikken is weghalen.
  for (const g of gasten) {
    rij.appendChild(h('button', { class: 'chip gast', 'aria-pressed': 'true', 'aria-label': `${g.naam}, gastspeler. Tik om weg te halen.`,
      onclick: () => zet((m) => {
        m.gasten = (m.gasten || []).filter((x) => x.id !== g.id);
        m.selectie = m.selectie.filter((x) => x !== g.id);
        delete m.beschikbaar[g.id];
      }) },
      h('i', { class: 'dot' }), g.naam, g.keeper ? h('span', { class: 'vlag K' }, 'K') : null, h('span', { class: 'mini' }, 'gast')));
  }
  kaartAanwezig.appendChild(rij);
  kaartAanwezig.appendChild(h('div', { class: 'knoprij', style: { marginTop: '10px' } },
    h('button', { class: 'knop klein stil', onclick: () => zet((m) => { m.selectie = [...S.team.spelers, ...(m.gasten || [])].map((p) => p.id); }) }, 'Iedereen'),
    h('button', { class: 'knop klein stil', onclick: () => zet((m) => { m.selectie = []; m.gasten = []; }) }, 'Niemand'),
    h('button', { class: 'knop klein', onclick: () => gastSheet((g) => zet((m) => {
      m.gasten = [...(m.gasten || []), g];
      m.selectie = [...m.selectie, g.id];
    })) }, icoon('plus', 16), 'Gastspeler')));
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

  // Niemand op de bank: dan valt er niets te wisselen, en ook niets in te stellen.
  if (zonderWissels(w)) {
    kaartTijd.appendChild(h('p', { class: 'uitleg' },
      `Totaal ${w.periodes * w.periodeMin} minuten. Er zijn niet meer spelers dan plekken, dus geen wissels: iedereen speelt de hele wedstrijd. Bij de rust kan wel iemand anders op doel gaan.`));
  } else {
    kaartTijd.appendChild(h('label', { class: 'veld' },
      h('span', {}, 'Wisselmomenten per periode'),
      h('div', { class: 'segment' },
        ...[[1, 'Eén: bij de rust'], [2, 'Twee: ook halverwege']].map(([n, l]) =>
          h('button', { 'aria-pressed': String(w.blokkenPerPeriode === n), onclick: () => zet((m) => { m.blokkenPerPeriode = n; }) }, l)))));
    kaartTijd.appendChild(h('p', { class: 'uitleg' },
      `Totaal ${w.periodes * w.periodeMin} minuten, verdeeld over ${w.periodes * w.blokkenPerPeriode} blokken van ${Math.round(w.periodeMin / w.blokkenPerPeriode * 10) / 10} minuten.`));
  }
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
    onclick: () => bevestig('Wedstrijd weggooien?',
      account.modus === 'team'
        ? 'De wedstrijd verdwijnt uit de lijst, ook bij je medetrainers. De opzet en het schema zijn dan weg.'
        : 'De opzet en het schema van deze wedstrijd verdwijnen.',
      () => { wijzig((s) => { s.wedstrijd = null; s.ui.lijst = true; }, { terugdraaibaar: true }); melding('Wedstrijd weggegooid'); },
      { knop: 'Weggooien', gevaar: true }) },
    'Deze wedstrijd weggooien'));
  return wrap;
}

/** Bovenaan een wedstrijd: terug naar de lijst, en of alles is opgeslagen. */
function terugRij() {
  const rij = h('div', { class: 'terugrij' },
    h('button', { class: 'knop klein stil', onclick: () => naarLijst() }, '‹ Alle wedstrijden'));
  const staat = opslagStaat();
  if (staat) rij.appendChild(h('span', { class: `opslag ${staat.klasse}`, role: 'status', title: staat.uitleg }, staat.tekst));
  return rij;
}

function naarLijst() {
  wijzig((s) => { s.ui.lijst = true; });
  window.scrollTo({ top: 0 });
}

/**
 * Wat je in een wedstrijd verandert, wordt meteen opgeslagen. Hier zie je
 * dat het ook bij de server is - en dus bij je medetrainers.
 */
function opslagStaat() {
  if (account.modus !== 'team') return null;
  const v = verbindingsStaat();
  if (v.klasse === 'ok') return { klasse: 'ok', tekst: '✓ Opgeslagen', uitleg: 'Je medetrainers zien dit ook.' };
  if (v.klasse === 'bezig') return { klasse: 'bezig', tekst: 'Opslaan…', uitleg: v.tekst };
  return { klasse: 'uit', tekst: account.onverstuurd ? 'Nog niet opgeslagen' : 'Geen verbinding', uitleg: v.tekst };
}

/**
 * Een speler van een ander team die vandaag meedoet: naam, en of hij kan
 * keepen. Hij komt niet in het team en krijgt geen seizoenssaldo.
 */
export function gastSheet(opToevoegen, { uitleg = 'Doet er vandaag iemand van een ander team mee? Die zet je hier alleen in deze wedstrijd; in je team komt hij niet.' } = {}) {
  toonSheet('Gastspeler', (c, sluit) => {
    let keeper = false;
    const naam = h('input', { type: 'text', placeholder: 'Voornaam', autocomplete: 'off', required: true });
    const keeperKnop = h('button', { class: 'schakel', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Kan keepen',
      onclick: () => { keeper = !keeper; keeperKnop.setAttribute('aria-pressed', String(keeper)); } }, h('i', {}));
    c.appendChild(h('p', { class: 'uitleg' }, uitleg));
    c.appendChild(h('form', { onsubmit: (e) => {
      e.preventDefault();
      if (!naam.value.trim()) { melding('Vul een naam in'); return; }
      const g = nieuweGast(naam.value.trim(), keeper);
      sluit();
      opToevoegen(g);
    } },
      h('label', { class: 'veld' }, h('span', {}, 'Naam'), naam),
      h('div', { class: 'strook' },
        h('div', { class: 'kop2' }, 'Kan keepen', h('small', {}, 'Alleen dan kan hij op doel komen')),
        keeperKnop),
      h('div', { class: 'knoprij', style: { marginTop: '16px' } },
        h('button', { class: 'knop', type: 'button', onclick: sluit }, 'Annuleren'),
        h('button', { class: 'knop primair', type: 'submit', style: { flex: '2' } }, 'Toevoegen'))));
  });
}

const accentTekst = (v) => (v < 0.05 ? 'volledig gelijk' : v < 0.35 ? 'licht accent' : v < 0.7 ? 'duidelijk accent' : 'sterk accent');

// ------------------------------------------------------------- de lijst
/** Alle wedstrijden van het team die nog gespeeld worden, en de laatst gespeelde. */
export function schermWedstrijden(ganaar) {
  const wrap = h('div', {});
  wrap.appendChild(h('button', { class: 'knop primair breed groot', onclick: () => nieuweWedstrijdSheet(ganaar) },
    icoon('plus', 20), 'Nieuwe wedstrijd'));

  const open = S.wedstrijd;
  const lijst = [...S.wedstrijden].sort((a, b) => wanneer(a).localeCompare(wanneer(b)));
  if (!lijst.length) {
    wrap.appendChild(h('div', { class: 'kaart', style: { marginTop: '14px' } }, h('div', { class: 'leeg' },
      h('h2', { style: { marginBottom: '6px' } }, 'Nog geen wedstrijden gepland'),
      h('p', {}, account.modus === 'team'
        ? 'Voeg een wedstrijd toe. Je medetrainers zien hem dan ook, en kunnen meehelpen met klaarzetten.'
        : 'Voeg een wedstrijd toe en laat de app het wisselschema maken.'))));
  } else {
    wrap.appendChild(h('div', { class: 'tussenkop' }, `Gepland (${lijst.length})`));
    for (const w of lijst) wrap.appendChild(wedstrijdRij(w, w === open, ganaar));
  }

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

function wedstrijdRij(w, open, ganaar) {
  const status = w.status === 'bezig' ? h('span', { class: 'vlag live' }, 'LIVE')
    : w.blokken ? h('span', { class: 'vlag' }, 'SCHEMA KLAAR') : null;
  const details = [datumTekst(w.datum), w.aanvang, w.thuis ? 'thuis' : 'uit', w.door ? `door ${w.door}` : null].filter(Boolean);
  return h('button', { class: 'kaart wedstrijdrij', 'aria-current': open ? 'true' : null,
    onclick: () => {
      wijzig((s) => { s.ui.wedstrijdId = w.id; s.ui.lijst = false; });
      ganaar(w.status === 'bezig' ? 'live' : 'opzet');
    } },
    h('div', { class: 'naam' }, w.tegenstander || 'Tegenstander nog onbekend', h('small', {}, details.join(' · '))),
    status, h('span', { class: 'pijl', 'aria-hidden': 'true' }, '›'));
}

/**
 * Een wedstrijd toevoegen: tegenstander, datum, aanvang, thuis of uit. Pas
 * bij Opslaan bestaat hij, en dan staat hij ook bij je medetrainers. De rest
 * (wie er is, de opstelling) zet je daarna klaar.
 */
export function nieuweWedstrijdSheet(ganaar) {
  toonSheet('Nieuwe wedstrijd', (c, sluit) => {
    let thuis = true;
    const tegen = h('input', { type: 'text', placeholder: 'SV Voorbeeld', autocomplete: 'off' });
    const datum = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10), required: true });
    const aanvang = h('input', { type: 'time' });
    const segment = h('div', { class: 'segment' });
    const tekenSegment = () => segment.replaceChildren(...[[true, 'Thuis'], [false, 'Uit']].map(([v, l]) =>
      h('button', { type: 'button', 'aria-pressed': String(thuis === v), onclick: () => { thuis = v; tekenSegment(); } }, l)));
    tekenSegment();
    const fout = h('p', { class: 'fout', role: 'alert' });
    const knop = h('button', { class: 'knop primair', type: 'submit', style: { flex: '2' } }, 'Opslaan');

    c.appendChild(h('form', { onsubmit: async (e) => {
      e.preventDefault();
      if (!datum.value) { fout.textContent = 'Kies een datum.'; datum.focus(); return; }
      knop.disabled = true;
      knop.textContent = 'Opslaan…';
      // Instellingen als speelvorm en speeltijd van de vorige wedstrijd.
      const vorige = S.archief[0] || S.wedstrijden[S.wedstrijden.length - 1] || null;
      wijzig((s) => {
        const w = nieuweWedstrijd(vorige ? { ...vorige } : null);
        Object.assign(w, { tegenstander: tegen.value.trim(), datum: datum.value, aanvang: aanvang.value, thuis });
        if (account.modus === 'team' && account.gebruiker?.naam) w.door = account.gebruiker.naam.split(/\s+/)[0];
        w.selectie = s.team.spelers.map((p) => p.id);
        s.wedstrijd = w;
        s.ui.lijst = false;
        s.ui.scherm = 'opzet';
      });
      const waar = await wachtOpOpslaan();
      sluit();
      ganaar('opzet');
      melding(waar === 'server' ? '✓ Opgeslagen. Je medetrainers zien hem nu ook.'
        : waar === 'later' ? 'Opgeslagen op je telefoon. Hij gaat naar de server zodra er bereik is.'
        : '✓ Wedstrijd opgeslagen');
    } },
      h('label', { class: 'veld' }, h('span', {}, 'Tegenstander'), tegen),
      h('div', { class: 'rij2' },
        h('label', { class: 'veld' }, h('span', {}, 'Datum'), datum),
        h('label', { class: 'veld' }, h('span', {}, 'Aanvang'), aanvang)),
      segment,
      fout,
      h('div', { class: 'knoprij', style: { marginTop: '16px' } },
        h('button', { class: 'knop', type: 'button', onclick: sluit }, 'Annuleren'),
        knop)));
  });
}
