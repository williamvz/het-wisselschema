// Scherm: het team. Spelers toevoegen, plakken of uploaden.

import { h, icoon, toonSheet, bevestig, melding, saldoTekst, initialen, downloadBestand } from './ui.js';
import { S, wijzig, nieuweSpeler, uid, exporteer, neemOver, lokaleGegevens, metServer } from './store.js';

const ROLNAAM = { V: 'Verdediging', M: 'Middenveld', A: 'Aanval' };

export function schermTeam() {
  const spelers = S.team.spelers;
  const wrap = h('div', {});

  wrap.appendChild(h('div', { class: 'kaart' },
    h('label', { class: 'veld', style: { marginBottom: '0' } },
      h('span', {}, 'Teamnaam'),
      h('input', { type: 'text', value: S.team.naam, placeholder: 'JO9-1',
        onchange: (e) => wijzig((s) => { s.team.naam = e.target.value.trim() || 'Mijn team'; }) }))));

  const lijst = h('div', { class: 'kaart' });
  lijst.appendChild(h('div', { class: 'kaart-kop' },
    h('h2', {}, `Spelers`),
    h('span', { class: 'mini' }, `${spelers.length} in de selectie`)));

  if (!spelers.length) {
    lijst.appendChild(h('div', { class: 'leeg' },
      h('p', {}, 'Nog geen spelers.'),
      h('div', { class: 'knoprij', style: { justifyContent: 'center' } },
        h('button', { class: 'knop primair', onclick: () => plakSheet() }, 'Namen plakken'),
        h('button', { class: 'knop', onclick: voorbeeldTeam }, 'Voorbeeldteam'))));
  } else {
    for (const p of spelers) lijst.appendChild(spelerRij(p));
  }
  wrap.appendChild(lijst);

  wrap.appendChild(h('div', { class: 'knoprij' },
    h('button', { class: 'knop primair', onclick: () => bewerkSpeler(null) }, icoon('plus', 18), 'Speler'),
    h('button', { class: 'knop', onclick: () => plakSheet() }, 'Plakken'),
    h('button', { class: 'knop', onclick: bestandSheet }, 'Bestand')));

  if (spelers.length) {
    wrap.appendChild(h('div', { class: 'tussenkop' }, 'Speeltijd over het seizoen'));
    wrap.appendChild(saldoKaart());
  }
  return wrap;
}

function spelerRij(p) {
  const merk = [];
  if (p.keeper) merk.push(h('span', { class: 'vlag K' }, 'KEEPER'));
  for (const r of p.posities || []) merk.push(h('span', { class: `vlag ${r}` }, ROLNAAM[r] || r));

  const saldo = Math.round((p.saldoSec || 0) / 60);
  return h('div', { class: 'spelerrij', role: 'button', tabindex: '0',
    onclick: () => bewerkSpeler(p),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bewerkSpeler(p); } } },
    h('div', { class: 'bal' }, p.nummer || initialen(p.naam)),
    h('div', { class: 'naam' }, p.naam,
      merk.length ? h('small', {}, ...merk.map((m, i) => [i ? ' ' : '', m]).flat()) : h('small', {}, 'geen voorkeur')),
    h('span', { class: `saldo ${saldo > 2 ? 'plus' : saldo < -2 ? 'min' : ''}` }, saldo === 0 ? '' : `${saldoTekst(p.saldoSec)} min`));
}

function saldoKaart() {
  const gesorteerd = [...S.team.spelers].sort((a, b) => (a.saldoSec || 0) - (b.saldoSec || 0));
  const max = Math.max(60, ...gesorteerd.map((p) => Math.abs(p.saldoSec || 0)));
  const kaart = h('div', { class: 'kaart' });
  kaart.appendChild(h('p', { class: 'uitleg' },
    'Hoeveel iemand voor- of achterloopt op de gemiddelde speeltijd. Wie achterloopt krijgt bij het maken van een nieuw schema voorrang.'));
  for (const p of gesorteerd) {
    const v = p.saldoSec || 0;
    const breedte = (Math.abs(v) / max) * 50;
    kaart.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' } },
      h('span', { style: { width: '82px', fontSize: '.84rem', fontWeight: '600', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.naam),
      h('div', { style: { flex: '1', height: '18px', position: 'relative', background: 'var(--vlak-2)',
        borderRadius: '5px', overflow: 'hidden' } },
        h('i', { style: { position: 'absolute', left: '50%', top: '0', bottom: '0', width: '1px', background: 'var(--rand)' } }),
        h('i', { style: {
          position: 'absolute', top: '3px', bottom: '3px', borderRadius: '3px',
          background: v >= 0 ? 'var(--rol-V)' : 'var(--waarschuwing)',
          left: v >= 0 ? '50%' : `${50 - breedte}%`, width: `${Math.max(breedte, v === 0 ? 0 : 1.5)}%`,
        } })),
      h('span', { class: 'saldo', style: { width: '46px', textAlign: 'right' } }, `${saldoTekst(v)}m`)));
  }
  kaart.appendChild(h('button', { class: 'knop stil klein', style: { marginTop: '8px' },
    onclick: () => bevestig('Saldo wissen?', 'Iedereen begint weer op nul. Het archief blijft staan.',
      () => wijzig((s) => { for (const p of s.team.spelers) p.saldoSec = 0; }, { terugdraaibaar: true }),
      { knop: 'Wissen' }) }, 'Saldo op nul zetten'));
  return kaart;
}

// ------------------------------------------------------------------ bewerken
export function bewerkSpeler(bestaand) {
  const p = bestaand ? { ...bestaand } : nieuweSpeler();
  toonSheet(bestaand ? p.naam || 'Speler' : 'Nieuwe speler', (c, sluit) => {
    const naamVeld = h('input', { type: 'text', value: p.naam, placeholder: 'Voornaam', autocomplete: 'off' });
    const nrVeld = h('input', { type: 'text', value: p.nummer, placeholder: '7', inputmode: 'numeric' });

    c.appendChild(h('div', { class: 'rij2' },
      h('label', { class: 'veld' }, h('span', {}, 'Naam'), naamVeld),
      h('label', { class: 'veld' }, h('span', {}, 'Rugnummer'), nrVeld)));

    const keeperKnop = h('button', { class: 'schakel', 'aria-pressed': String(!!p.keeper), 'aria-label': 'Kan keepen',
      onclick: () => { p.keeper = !p.keeper; keeperKnop.setAttribute('aria-pressed', String(p.keeper)); } }, h('i', {}));
    c.appendChild(h('div', { class: 'strook' },
      h('div', { class: 'kop2' }, 'Kan keepen', h('small', {}, 'Alleen deze spelers worden op doel gezet')),
      keeperKnop));

    c.appendChild(h('div', { class: 'tussenkop' }, 'Voorkeurspositie'));
    c.appendChild(h('p', { class: 'uitleg' }, 'Laat leeg als het niet uitmaakt; dan zet het schema deze speler overal in.'));
    const posRij = h('div', { class: 'chiprij' });
    for (const [r, naam] of Object.entries(ROLNAAM)) {
      const knop = h('button', { class: 'chip', 'aria-pressed': String((p.posities || []).includes(r)),
        onclick: () => {
          const aan = !(p.posities || []).includes(r);
          p.posities = aan ? [...(p.posities || []), r] : (p.posities || []).filter((x) => x !== r);
          knop.setAttribute('aria-pressed', String(aan));
        } }, h('i', { class: 'dot' }), naam);
      posRij.appendChild(knop);
    }
    c.appendChild(posRij);

    const sterkteUit = h('b', {}, String(p.sterkte ?? 3));
    c.appendChild(h('details', { style: { marginTop: '14px' } },
      h('summary', { class: 'mini', style: { cursor: 'pointer', padding: '6px 0' } }, 'Meer instellingen'),
      h('div', { class: 'strook' },
        h('div', { class: 'kop2' }, 'Inzetbaarheid', h('small', {}, 'Telt alleen mee als je bij de wedstrijd accent op basisspelers zet')),
        h('div', { class: 'tel' }, sterkteUit, h('span', { class: 'mini' }, '/ 5'))),
      h('input', { type: 'range', class: 'schuif', min: '1', max: '5', step: '1', value: String(p.sterkte ?? 3),
        oninput: (e) => { p.sterkte = Number(e.target.value); sterkteUit.textContent = e.target.value; } })));

    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '18px' } },
      bestaand ? h('button', { class: 'knop gevaar', onclick: () => {
        sluit();
        bevestig('Speler verwijderen?', `${p.naam} verdwijnt uit het team.`, () => {
          wijzig((s) => { s.team.spelers = s.team.spelers.filter((q) => q.id !== p.id); }, { terugdraaibaar: true });
        }, { knop: 'Verwijderen', gevaar: true });
      } }, 'Verwijderen') : null,
      h('button', { class: 'knop primair', style: { flex: '2' }, onclick: () => {
        p.naam = naamVeld.value.trim();
        p.nummer = nrVeld.value.trim();
        if (!p.naam) { melding('Vul een naam in'); return; }
        wijzig((s) => {
          const i = s.team.spelers.findIndex((q) => q.id === p.id);
          if (i < 0) { s.team.spelers.push(p); return; }
          // Alleen wat hier is aangepast: een collega kan intussen iets
          // anders aan deze speler hebben veranderd, of het saldo is bijgewerkt.
          const aangepast = ['naam', 'nummer', 'keeper', 'posities', 'sterkte']
            .filter((k) => JSON.stringify(p[k]) !== JSON.stringify(bestaand[k]));
          for (const k of aangepast) s.team.spelers[i][k] = p[k];
        });
        sluit();
      } }, 'Opslaan')));
  });
}

// -------------------------------------------------------------- invoerhulpen
/**
 * Leest een geplakte of geüploade lijst. Eén speler per regel; extra velden
 * gescheiden door komma, puntkomma of tab, in willekeurige volgorde:
 *   Daan
 *   Sem, 7, keeper
 *   Luuk; 4; V M
 */
export function leesSpelers(tekst) {
  const uit = [];
  for (const ruweRegel of String(tekst).split(/\r?\n/)) {
    const regel = ruweRegel.trim();
    if (!regel || /^(naam|speler|name)\b/i.test(regel)) continue;
    const delen = regel.split(/[,;\t]/).map((d) => d.trim()).filter(Boolean);
    if (!delen.length) continue;
    const p = nieuweSpeler(delen[0]);
    for (const d of delen.slice(1)) {
      if (/^\d{1,2}$/.test(d)) p.nummer = d;
      else if (/^(k|keeper|doelman|doelvrouw|gk)$/i.test(d)) p.keeper = true;
      else {
        const rollen = d.toUpperCase().replace(/[^VMAK ]/g, '').split(/\s*/).filter((x) => 'VMA'.includes(x));
        if (rollen.length) p.posities = [...new Set([...p.posities, ...rollen])];
        if (/K/.test(d.toUpperCase()) && d.length <= 4) p.keeper = true;
      }
    }
    uit.push(p);
  }
  return uit;
}

function plakSheet() {
  toonSheet('Namen plakken', (c, sluit) => {
    c.appendChild(h('p', { class: 'uitleg' },
      'Eén speler per regel. Je mag er rugnummer, "keeper" en voorkeursposities (V/M/A) achter zetten, gescheiden door een komma.'));
    const ta = h('textarea', { placeholder: 'Daan, 1, keeper\nSem, 4, V\nLuuk\nNoud, 8, M\nTijn\nBram, 9, A\nFinn' });
    c.appendChild(ta);
    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '12px' } },
      h('button', { class: 'knop', onclick: sluit }, 'Annuleren'),
      h('button', { class: 'knop primair', style: { flex: '2' }, onclick: () => {
        const nieuw = leesSpelers(ta.value);
        if (!nieuw.length) { melding('Geen namen gevonden'); return; }
        wijzig((s) => { s.team.spelers.push(...nieuw); }, { terugdraaibaar: true });
        sluit();
        melding(`${nieuw.length} speler${nieuw.length === 1 ? '' : 's'} toegevoegd`);
      } }, 'Toevoegen')));
  });
}

function bestandSheet() {
  toonSheet('Bestand', (c, sluit) => {
    c.appendChild(h('p', { class: 'uitleg' },
      'Een eerder gemaakte back-up (.json) of een simpele namenlijst (.csv of .txt).'));
    const invoer = h('input', { type: 'file', accept: '.json,.csv,.txt,application/json,text/csv,text/plain',
      style: { padding: '12px' },
      onchange: async (e) => {
        const bestand = e.target.files[0];
        if (!bestand) return;
        const tekst = await bestand.text();
        if (/\.json$/i.test(bestand.name) || tekst.trim().startsWith('{')) {
          try {
            const data = JSON.parse(tekst);
            bevestig('Back-up terugzetten?', 'Je huidige team, wedstrijd en archief worden vervangen.', () => {
              wijzig(() => { neemOver(data); });
              sluit(); melding('Back-up teruggezet');
            }, { knop: 'Terugzetten', gevaar: true });
          } catch (err) { melding('Dit JSON-bestand is niet leesbaar'); }
        } else {
          const nieuw = leesSpelers(tekst);
          if (!nieuw.length) { melding('Geen namen gevonden'); return; }
          wijzig((s) => { s.team.spelers.push(...nieuw); }, { terugdraaibaar: true });
          sluit(); melding(`${nieuw.length} spelers toegevoegd`);
        }
      } });
    c.appendChild(invoer);

    // Wie de app al zonder account gebruikte, heeft zijn team op de telefoon
    // staan. Na het inloggen hoeft dat niet opnieuw ingetypt te worden.
    const lokaal = lokaleGegevens();
    if (lokaal && (lokaal.team?.spelers?.length || lokaal.archief?.length)) {
      const n = lokaal.team.spelers.length;
      c.appendChild(h('div', { class: 'tussenkop' }, 'Van dit apparaat'));
      c.appendChild(h('p', { class: 'uitleg' },
        `Op dit apparaat staat nog ${lokaal.team.naam} van voor het inloggen: ${n} speler${n === 1 ? '' : 's'}, ${(lokaal.archief || []).length} gespeelde wedstrijden.`));
      c.appendChild(h('button', { class: 'knop breed', onclick: () => bevestig(`${lokaal.team.naam} overnemen?`,
        `Spelers, wedstrijd en archief van ${S.team.naam} worden vervangen door die van dit apparaat, voor alle trainers van het team.`, () => {
          wijzig(() => { neemOver({ team: { ...lokaal.team, naam: S.team.naam }, wedstrijd: lokaal.wedstrijd ?? null, archief: lokaal.archief || [] }); },
            { terugdraaibaar: true });
          sluit(); melding('Overgenomen');
        }, { knop: 'Overnemen', gevaar: true }) }, `Overnemen in ${S.team.naam}`));
    }

    c.appendChild(h('div', { class: 'tussenkop' }, 'Back-up maken'));
    c.appendChild(h('button', { class: 'knop breed', onclick: () => {
      downloadBestand(`wisselschema-${S.team.naam.replace(/\W+/g, '-').toLowerCase()}.json`, JSON.stringify(exporteer(), null, 2));
      melding('Back-up gedownload');
    } }, 'Alles downloaden als JSON'));
  });
}

function voorbeeldTeam() {
  wijzig((s) => {
    if (!metServer()) s.team.naam = 'JO9-1'; // een clubteam houdt zijn eigen naam
    s.team.spelers = leesSpelers(
      'Daan, 1, keeper\nSem, 4, keeper\nLuuk, 2, V\nNoud, 6, M\nTijn, 8, M\nBram, 9, A\nFinn, 11, A');
  }, { terugdraaibaar: true });
  melding('Voorbeeldteam geladen - pas het gerust aan');
}
