// Scherm: de wedstrijd zelf. Klok, huidige opstelling, en de twee knoppen
// waar het langs de lijn om draait: "wissel gedaan" en "speler eruit".

import { h, icoon, toonSheet, bevestig, melding, mmss, minutenTekst, piep, tril, voornaam } from './ui.js';
import { S, wijzig, plan, klokStand, klokStart, klokPauze, klokZet, klokAutoPauze, periodeGrens, herplanNu, bevestigWissel, rondAf, kanTerug, draaiTerug, noteerGoal, schrapGoal } from './store.js';
import { getFormation } from '../lib/formations.js';
import { totaleSpeeltijd } from '../lib/schedule.js';
import { tekenVeld } from './veld.js';
import { blokLabel } from './scherm-schema.js';
import { stand, plusMin, verloop, goalMinuut } from '../lib/score.js';

let tikkers = [];
const gemeld = new Set();

export function tikLive() { for (const f of tikkers) f(); }

/** Het blok dat nu gespeeld wordt: het eerste dat nog niet is afgetekend. */
export function actiefBlokIndex(blokken) {
  const i = blokken.findIndex((b) => !b.vast);
  return i < 0 ? blokken.length - 1 : i;
}

export function schermLive(ganaar, herteken) {
  tikkers = [];
  const w = S.wedstrijd;
  if (!w || !w.blokken) {
    return h('div', { class: 'kaart' }, h('div', { class: 'leeg' },
      h('p', {}, 'Nog geen wedstrijd om te spelen.'),
      h('button', { class: 'knop primair', onclick: () => ganaar('opzet') }, 'Wedstrijd klaarzetten')));
  }

  const p = plan();
  const totaal = totaleSpeeltijd(w);
  const idx = actiefBlokIndex(p.blokken);
  const blok = p.blokken[idx];
  const komendeWissel = p.wissels[idx] || null;
  const wrap = h('div', {});

  // ------------------------------------------------------------- klokkaart
  const klokEl = h('div', { class: 'klok' }, '0:00');
  const kwartEl = h('div', { class: 'kwartlabel' }, '');
  const balk = h('div', { class: 'balk' }, h('i', { style: { width: '0%' } }));
  const restEl = h('div', { class: 'tot-wissel' });
  const startKnop = h('button', { class: 'knop primair groot', style: { flex: '2' } });

  const klokKaart = h('div', { class: 'kaart klok-kaart' }, kwartEl, klokEl, balk, restEl,
    h('div', { class: 'knoprij', style: { marginTop: '12px' } },
      h('button', { class: 'knop groot', onclick: klokSheet }, 'Bijstellen'),
      startKnop));
  klokEl.style.cursor = 'pointer';
  klokEl.addEventListener('click', klokSheet);
  wrap.appendChild(klokKaart);

  // ------------------------------------------------------------- score
  wrap.appendChild(scoreKaart(w));

  // ------------------------------------------------------ wisselmelding
  const alarmVak = h('div', {});
  wrap.appendChild(alarmVak);

  // ------------------------------------------------------ huidige opstelling
  const veldKaart = h('div', { class: 'kaart' });
  veldKaart.appendChild(h('div', { class: 'kaart-kop' },
    h('h2', {}, `Nu op het veld`),
    h('span', { class: 'mini' }, `${blokLabel(blok, w)} · tot ${Math.round(blok.totSec / 60)} min`)));
  veldKaart.appendChild(tekenVeld(blok, S.team.spelers, w.formationId));

  const opVeld = new Set(Object.values(blok.opstelling));
  const bank = w.selectie.map((id) => S.team.spelers.find((q) => q.id === id))
    .filter((q) => q && !opVeld.has(q.id));
  if (bank.length) {
    veldKaart.appendChild(h('div', { class: 'tussenkop' }, 'Bank'));
    veldKaart.appendChild(h('div', { class: 'chiprij' }, ...bank.map((q) => {
      // `tot` is null na een rondje door JSON (Infinity bestaat daar niet): dan speelt hij gewoon mee.
      const uit = ((((w.beschikbaar || {})[q.id] || {}).tot) ?? Infinity) < totaal;
      return h('span', { class: 'chip', style: uit ? { opacity: '.5' } : {} },
        h('i', { class: 'dot' }), q.naam, uit ? h('span', { class: 'mini' }, '· eruit') : null);
    })));
  }
  wrap.appendChild(veldKaart);

  // ------------------------------------------------------------- knoppen
  wrap.appendChild(h('div', { class: 'knoprij' },
    h('button', { class: 'knop gevaar groot', style: { flex: '1 1 100%' }, onclick: () => uitvalSheet(p, idx) },
      '🚑 Speler kan niet verder'),
    h('button', { class: 'knop', onclick: () => erbijSheet(p) }, 'Speler erbij'),
    h('button', { class: 'knop', onclick: () => ganaar('schema') }, 'Heel schema'),
    kanTerug() ? h('button', { class: 'knop', onclick: () => {
      melding(draaiTerug() ? 'Laatste stap teruggedraaid' : 'Er is niets meer terug te draaien');
    } }, icoon('terug', 17), 'Ongedaan') : null));

  // ------------------------------------------------------------- speeltijd
  const tijdKaart = h('div', { class: 'kaart', style: { marginTop: '12px' } });
  tijdKaart.appendChild(h('h3', {}, 'Speeltijd vandaag'));
  const maxSec = Math.max(1, ...p.statistieken.map((s) => s.speelSec));
  const pm = (w.doelpunten || []).length ? plusMin(w.doelpunten) : null;
  for (const st of p.statistieken) {
    tijdKaart.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' } },
      h('span', { style: { width: '78px', fontSize: '.84rem', fontWeight: '600', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, voornaam(st.naam)),
      h('div', { style: { flex: '1', height: '16px', background: 'var(--vlak-2)', borderRadius: '5px', overflow: 'hidden' } },
        h('i', { style: { display: 'block', height: '100%', width: `${(st.speelSec / maxSec) * 100}%`,
          background: opVeld.has(st.spelerId) ? 'var(--accent)' : 'var(--bank)', borderRadius: '5px' } })),
      h('span', { class: 'saldo', style: { width: '48px', textAlign: 'right' } }, minutenTekst(st.speelSec)),
      pm ? plusMinLabel(pm[st.spelerId]) : null));
  }
  if (pm) tijdKaart.appendChild(h('p', { class: 'mini', style: { margin: '8px 0 0' } },
    'Rechts: doelpunten voor en tegen terwijl de speler in het veld stond.'));
  wrap.appendChild(tijdKaart);

  wrap.appendChild(h('button', { class: 'knop breed', style: { marginTop: '10px' },
    onclick: () => bevestig('Wedstrijd afronden?',
      'De gespeelde minuten worden bijgeschreven in het seizoenssaldo en de wedstrijd gaat naar het archief.',
      () => { rondAf(); ganaar('archief'); melding('Wedstrijd opgeslagen'); }, { knop: 'Afronden' }) },
    'Wedstrijd afronden'));

  // ------------------------------------------------------------- de klok
  function ververs() {
    const t = klokStand();
    const loopt = w.klok.loopt;
    klokEl.textContent = mmss(t);
    klokEl.classList.toggle('pauze', !loopt);

    const periode = Math.min(w.periodes - 1, Math.floor(t / (w.periodeMin * 60)));
    kwartEl.textContent = w.klok.pauzeReden === 'rust'
      ? `rust na periode ${periode + (t >= (periode + 1) * w.periodeMin * 60 ? 1 : 0)}`
      : w.klok.pauzeReden === 'einde' ? 'einde wedstrijd'
      : `periode ${periode + 1} van ${w.periodes}${loopt ? '' : ' · gepauzeerd'}`;

    const rest = blok.totSec - t;
    const deel = Math.max(0, Math.min(1, (t - blok.vanSec) / Math.max(1, blok.totSec - blok.vanSec)));
    balk.firstChild.style.width = `${deel * 100}%`;
    balk.classList.toggle('bijna', rest <= 120 && rest > 0);
    balk.classList.toggle('nu', rest <= 0);

    restEl.replaceChildren(rest > 0
      ? h('span', {}, 'nog ', h('b', {}, mmss(rest)), ' tot de wissel')
      : h('span', {}, komendeWissel ? 'wisselen!' : 'einde wedstrijd'));

    startKnop.replaceChildren(loopt ? '⏸ Pauze' : t === 0 ? '▶ Aftrap' : '▶ Verder');
    startKnop.onclick = () => (loopt ? klokPauze('hand') : klokStart());

    // Automatisch stoppen aan het eind van een periode; de klok loopt in het
    // echt ook niet door tijdens het limonadekwartier.
    const grens = periodeGrens(w, t);
    if (grens !== null) {
      klokAutoPauze(grens, grens >= totaal ? 'einde' : 'rust');
      sein();
    }

    // Wisselmelding
    const sleutel = `${w.id}:${blok.id}`;
    if (rest <= 0 && !gemeld.has(sleutel)) { gemeld.add(sleutel); sein(); }
    toonAlarm(rest <= 0);
  }

  function sein() {
    if (S.instellingen.geluid) piep({ aantal: 3 });
    if (S.instellingen.trillen) tril([180, 90, 180, 90, 260]);
  }

  function toonAlarm(actief) {
    const alWeergegeven = alarmVak.dataset.aan === String(actief);
    if (alWeergegeven) return;
    alarmVak.dataset.aan = String(actief);
    alarmVak.replaceChildren();
    if (!actief) return;

    if (!komendeWissel) {
      alarmVak.appendChild(h('div', { class: 'kaart alarmkaart', style: { textAlign: 'center' } },
        h('h2', {}, 'Einde wedstrijd'),
        h('p', { class: 'uitleg' }, 'Rond de wedstrijd af om de speeltijd bij te schrijven.')));
      return;
    }
    const kaart = h('div', { class: 'kaart alarmkaart' });
    kaart.appendChild(h('h2', { style: { textAlign: 'center', marginBottom: '10px' } }, '🔔 Wisselen'));
    for (const x of komendeWissel.eruit) {
      kaart.appendChild(h('div', { class: 'beweging uit' }, h('span', { class: 'pijl' }, '↓'),
        h('b', {}, x.naam), h('span', {}, `eruit (${x.van})`)));
    }
    for (const x of komendeWissel.erin) {
      kaart.appendChild(h('div', { class: 'beweging erin' }, h('span', { class: 'pijl' }, '↑'),
        h('b', {}, x.naam), h('span', {}, `erin als ${x.naar}`)));
    }
    for (const x of komendeWissel.verplaatst) {
      kaart.appendChild(h('div', { class: 'beweging schuif' }, h('span', { class: 'pijl' }, '↔'),
        h('b', {}, x.naam), h('span', {}, `${x.van} → ${x.naar}`)));
    }
    kaart.appendChild(h('button', { class: 'knop primair breed groot', style: { marginTop: '12px' },
      onclick: () => {
        bevestigWissel(idx, klokStand());
        melding('Wissel genoteerd');
        herteken();
      } }, 'Wissel uitgevoerd'));
    alarmVak.appendChild(kaart);
  }

  function klokSheet() {
    toonSheet('Klok bijstellen', (c, sluit) => {
      c.appendChild(h('p', { class: 'uitleg' }, 'De scheidsrechter houdt de echte tijd bij. Loopt jouw klok uit de pas, zet hem dan gelijk.'));
      c.appendChild(h('div', { class: 'rij2' },
        ...[[-60, '−1 min'], [-10, '−10 sec'], [10, '+10 sec'], [60, '+1 min']].map(([d, l]) =>
          h('button', { class: 'knop', onclick: () => { klokZet(klokStand() + d); sluit(); } }, l))));
      c.appendChild(h('div', { class: 'tussenkop' }, 'Naar het begin van'));
      c.appendChild(h('div', { class: 'knoprij' },
        ...Array.from({ length: w.periodes }, (_, i) => h('button', { class: 'knop klein',
          onclick: () => { klokZet(i * w.periodeMin * 60); sluit(); } }, `periode ${i + 1}`))));
    });
  }

  tikkers.push(ververs);
  ververs();
  return wrap;
}

// ---------------------------------------------------------------- score
function scoreKaart(w) {
  const { wij, zij } = stand(w.doelpunten);
  const kaart = h('div', { class: 'kaart scorekaart' });
  kaart.appendChild(h('div', { class: 'stand', 'aria-label': `Stand ${wij} tegen ${zij}` },
    h('div', {}, h('b', {}, String(wij)), h('small', {}, 'wij')),
    h('span', { class: 'streep' }, '–'),
    h('div', {}, h('b', {}, String(zij)), h('small', {}, w.tegenstander || 'zij'))));
  kaart.appendChild(h('div', { class: 'scoreknoppen' },
    h('button', { class: 'knop scoreknop wij', onclick: () => { noteerGoal('wij'); tril(60); } }, '⚽ Goal'),
    h('button', { class: 'knop scoreknop zij', onclick: () => { noteerGoal('zij'); tril(60); } }, 'Tegengoal')));

  const lijst = verloop(w.doelpunten);
  if (lijst.length) {
    kaart.appendChild(h('div', { class: 'chiprij', style: { marginTop: '10px' } }, ...lijst.map((d) =>
      h('button', { class: `chip goalchip ${d.wie}`, onclick: () => goalSheet(d) },
        `${goalMinuut(d.sec)}' · ${d.wij}-${d.zij}`))));
  }
  return kaart;
}

function goalSheet(d) {
  const naam = (id) => voornaam((S.team.spelers.find((q) => q.id === id) || {}).naam);
  toonSheet(`${d.wie === 'wij' ? 'Goal' : 'Tegengoal'} · ${mmss(d.sec)}`, (c, sluit) => {
    c.appendChild(h('div', { class: 'tussenkop', style: { marginTop: 0 } }, 'Op het veld'));
    c.appendChild(h('p', {}, d.opVeld.map(naam).join(', ') || 'onbekend'));
    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '12px' } },
      h('button', { class: 'knop gevaar', onclick: () => { schrapGoal(d.id); sluit(); melding('Doelpunt weggehaald'); } }, 'Weghalen'),
      h('button', { class: 'knop primair', style: { flex: '2' }, onclick: sluit }, 'Klopt')));
  });
}

export function plusMinLabel(r) {
  const saldo = r ? r.saldo : 0;
  return h('span', { class: `saldo ${saldo > 0 ? 'plus' : saldo < 0 ? 'min' : ''}`, style: { width: '30px', textAlign: 'right' },
    title: r ? `${r.voor} voor, ${r.tegen} tegen` : 'geen doelpunten' }, saldo > 0 ? `+${saldo}` : String(saldo));
}

// --------------------------------------------------------------- uitval
function uitvalSheet(p, idx) {
  const w = S.wedstrijd;
  const t = klokStand();
  const totaal = totaleSpeeltijd(w);
  const inzetbaar = w.selectie
    .map((id) => S.team.spelers.find((q) => q.id === id))
    .filter(Boolean)
    .filter((q) => (((w.beschikbaar || {})[q.id] || {}).tot ?? totaal) >= totaal);

  toonSheet('Wie kan niet verder?', (c, sluit) => {
    c.appendChild(h('p', { class: 'uitleg' },
      `Het schema wordt vanaf ${mmss(t)} opnieuw berekend. Alles wat al gespeeld is blijft staan.`));
    const lijst = h('div', {});
    const blok = p.blokken[idx];
    for (const q of inzetbaar) {
      const slotId = Object.keys(blok.opstelling).find((sid) => blok.opstelling[sid] === q.id);
      const slot = slotId ? getFormation(w.formationId).slots.find((s) => s.id === slotId) : null;
      const st = p.statistieken.find((x) => x.spelerId === q.id);
      lijst.appendChild(h('button', {
        class: 'spelerrij', style: { width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--rand)' },
        onclick: () => { sluit(); doeUitval(q, t); } },
        h('div', { class: 'bal' }, slot ? slot.label : 'bank'),
        h('div', { class: 'naam' }, q.naam,
          h('small', {}, `${st ? minutenTekst(st.speelSec) : '0 min'} gespeeld`))));
    }
    c.appendChild(lijst);
  });
}

function doeUitval(speler, t) {
  const voor = plan();
  const voorVeld = new Set(Object.values(voor.blokken[actiefBlokIndex(voor.blokken)].opstelling));

  herplanNu(t, [{ type: 'uit', spelerId: speler.id }]);

  const na = plan();
  const naIdx = actiefBlokIndex(na.blokken);
  const naBlok = na.blokken[naIdx];
  const formatie = getFormation(S.wedstrijd.formationId);
  const erin = Object.values(naBlok.opstelling).filter((id) => !voorVeld.has(id));
  const verschoven = Object.entries(naBlok.opstelling)
    .filter(([sid, id]) => voorVeld.has(id) && voor.blokken[actiefBlokIndex(voor.blokken)].opstelling[sid] !== id)
    .map(([sid, id]) => ({ id, slot: formatie.slots.find((s) => s.id === sid) }));

  const naam = (id) => (S.team.spelers.find((q) => q.id === id) || {}).naam;
  toonSheet(`${speler.naam} gaat eruit`, (c, sluit) => {
    c.appendChild(h('div', { class: 'wissel' },
      h('div', { class: 'wanneer' }, `Doe dit nu · ${mmss(t)}`),
      h('div', { class: 'beweging uit' }, h('span', { class: 'pijl' }, '↓'), h('b', {}, speler.naam), h('span', {}, 'eraf')),
      ...erin.map((id) => {
        const sid = Object.keys(naBlok.opstelling).find((s) => naBlok.opstelling[s] === id);
        const slot = formatie.slots.find((s) => s.id === sid);
        return h('div', { class: 'beweging erin' }, h('span', { class: 'pijl' }, '↑'), h('b', {}, naam(id)),
          h('span', {}, `erin als ${slot ? slot.label : '?'}`));
      }),
      ...verschoven.map((x) => h('div', { class: 'beweging schuif' }, h('span', { class: 'pijl' }, '↔'),
        h('b', {}, naam(x.id)), h('span', {}, `nu ${x.slot ? x.slot.label : '?'}`))),
      !erin.length && !verschoven.length
        ? h('p', { class: 'uitleg', style: { marginTop: '8px', marginBottom: 0 } }, 'Er is niemand meer op de bank - jullie spelen verder met één man minder.')
        : null));
    c.appendChild(h('div', { class: 'tussenkop' }, 'Rest van de wedstrijd'));
    c.appendChild(h('p', { class: 'uitleg' }, 'Het hele schema is opnieuw verdeeld over de spelers die er nog zijn.'));
    c.appendChild(h('div', { class: 'knoprij' },
      h('button', { class: 'knop', onclick: () => { draaiTerug(); sluit(); melding('Teruggedraaid'); } }, 'Toch niet'),
      h('button', { class: 'knop primair', style: { flex: '2' }, onclick: sluit }, 'Duidelijk')));
  });
}

function erbijSheet(p) {
  const w = S.wedstrijd;
  const t = klokStand();
  const totaal = totaleSpeeltijd(w);
  const uitgevallen = w.selectie.filter((id) => (((w.beschikbaar || {})[id] || {}).tot ?? totaal) < totaal);
  const nogNiet = S.team.spelers.filter((q) => !w.selectie.includes(q.id));

  toonSheet('Speler erbij', (c, sluit) => {
    if (!uitgevallen.length && !nogNiet.length) {
      c.appendChild(h('div', { class: 'leeg' }, 'Iedereen doet al mee.'));
      return;
    }
    c.appendChild(h('p', { class: 'uitleg' }, `Deze speler doet vanaf ${mmss(t)} weer mee en wordt in het resterende schema ingepast.`));
    const lijst = h('div', {});
    for (const id of uitgevallen) {
      const q = S.team.spelers.find((x) => x.id === id);
      if (!q) continue;
      lijst.appendChild(h('button', { class: 'spelerrij', style: { width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--rand)' },
        onclick: () => { herplanNu(t, [{ type: 'terug', spelerId: id }]); sluit(); melding(`${q.naam} doet weer mee`); } },
        h('div', { class: 'bal' }, '↩'), h('div', { class: 'naam' }, q.naam, h('small', {}, 'was eruit gehaald'))));
    }
    for (const q of nogNiet) {
      lijst.appendChild(h('button', { class: 'spelerrij', style: { width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--rand)' },
        onclick: () => { herplanNu(t, [{ type: 'erin', spelerId: q.id }]); sluit(); melding(`${q.naam} sluit aan`); } },
        h('div', { class: 'bal' }, '+'), h('div', { class: 'naam' }, q.naam, h('small', {}, 'stond niet in de selectie'))));
    }
    c.appendChild(lijst);
  });
}
