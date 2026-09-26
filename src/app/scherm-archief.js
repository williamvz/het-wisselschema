// Scherm: gespeelde wedstrijden en instellingen.

import { h, icoon, toonSheet, bevestig, melding, datumTekst, minutenTekst, saldoTekst, voornaam, downloadBestand } from './ui.js';
import { S, wijzig, exporteer, neemOver } from './store.js';
import { account, verbindMet } from './samenwerken.js';
import { verbindingsStaat } from './kop.js';
import { getFormation } from '../lib/formations.js';
import { stand, plusMin, verloop, goalMinuut } from '../lib/score.js';
import { plusMinLabel } from './scherm-live.js';

export function schermArchief(ganaar) {
  const wrap = h('div', {});

  if (!S.archief.length) {
    wrap.appendChild(h('div', { class: 'kaart' }, h('div', { class: 'leeg' },
      h('p', {}, 'Nog geen gespeelde wedstrijden.'),
      h('p', { class: 'mini' }, 'Na het afronden van een wedstrijd komt hij hier te staan, en wordt de speeltijd bijgeschreven in het seizoenssaldo.'))));
  } else {
    for (const a of S.archief) wrap.appendChild(archiefKaart(a));
  }

  wrap.appendChild(h('div', { class: 'tussenkop' }, 'Instellingen'));
  wrap.appendChild(instellingenKaart());
  wrap.appendChild(h('div', { class: 'tussenkop' }, 'Samenwerken'));
  wrap.appendChild(samenwerkKaart(ganaar));
  wrap.appendChild(overKaart());
  return wrap;
}

function archiefKaart(a) {
  const kaart = h('div', { class: 'kaart' });
  kaart.appendChild(h('div', { class: 'kaart-kop' },
    h('h3', {}, a.tegenstander || 'Onbekende tegenstander'),
    h('span', { class: 'mini' }, datumTekst(a.datum))));
  const goals = a.doelpunten || [];
  const { wij, zij } = stand(goals);
  kaart.appendChild(h('p', { class: 'uitleg' },
    goals.length ? h('b', { style: { color: 'var(--tekst)' } }, `${wij}-${zij} · `) : null,
    `${a.thuis ? 'Thuis' : 'Uit'} · ${getFormation(a.formationId).naam} · ${a.periodes}×${a.periodeMin} min`));
  if (goals.length) {
    const naam = (id) => voornaam((a.statistieken.find((x) => x.spelerId === id) || {}).naam);
    kaart.appendChild(h('div', { class: 'tussenkop', style: { marginTop: '10px' } }, 'Doelpunten'));
    for (const d of verloop(goals)) {
      kaart.appendChild(h('div', { class: `beweging ${d.wie === 'wij' ? 'erin' : 'uit'}` },
        h('span', { class: 'pijl', style: { width: '34px' } }, `${goalMinuut(d.sec)}'`),
        h('b', {}, `${d.wij}-${d.zij}`),
        h('span', {}, d.opVeld.map(naam).join(', '))));
    }
  }
  const pm = goals.length ? plusMin(goals) : null;

  const totaalSec = a.statistieken.reduce((n, s) => n + s.speelSec, 0);
  kaart.appendChild(h('div', { class: 'tussenkop', style: { marginTop: '10px' } },
    `Speeltijd · ${a.statistieken.length} spelers · ${minutenTekst(totaalSec / (a.statistieken.length || 1))} gemiddeld`));

  const max = Math.max(1, ...a.statistieken.map((s) => s.speelSec));
  for (const st of a.statistieken) {
    kaart.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0' } },
      h('span', { style: { width: '76px', fontSize: '.82rem', fontWeight: '600', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, voornaam(st.naam)),
      h('div', { style: { flex: '1', height: '14px', background: 'var(--vlak-2)', borderRadius: '4px', overflow: 'hidden' } },
        h('i', { style: { display: 'block', height: '100%', width: `${(st.speelSec / max) * 100}%`,
          background: 'var(--accent)', borderRadius: '4px' } })),
      h('span', { class: 'saldo', style: { width: '46px', textAlign: 'right' } }, minutenTekst(st.speelSec)),
      pm ? plusMinLabel(pm[st.spelerId]) : null,
      h('span', { style: { width: '24px', flex: 'none' } }, st.keeperSec ? h('span', { class: 'vlag K' }, 'K') : null)));
  }

  kaart.appendChild(h('button', { class: 'knop stil klein', style: { marginTop: '8px' },
    onclick: () => bevestig('Uit het archief halen?',
      'De wedstrijd verdwijnt uit de lijst. Het seizoenssaldo verandert hier niet van.',
      () => wijzig((s) => { s.archief = s.archief.filter((x) => x.id !== a.id); }, { terugdraaibaar: true }),
      { knop: 'Verwijderen', gevaar: true }) }, 'Verwijderen'));
  return kaart;
}

function instellingenKaart() {
  const kaart = h('div', { class: 'kaart' });
  const schakelaar = (sleutel, titel, uitleg) => {
    const knop = h('button', { class: 'schakel', 'aria-pressed': String(!!S.instellingen[sleutel]), 'aria-label': titel,
      onclick: () => wijzig((s) => { s.instellingen[sleutel] = !s.instellingen[sleutel]; }) }, h('i', {}));
    return h('div', { class: 'strook' }, h('div', { class: 'kop2' }, titel, h('small', {}, uitleg)), knop);
  };

  kaart.appendChild(schakelaar('geluid', 'Geluidssignaal', 'Piept bij een wisselmoment'));
  kaart.appendChild(schakelaar('trillen', 'Trillen', 'Handig als je telefoon in je jaszak zit'));
  kaart.appendChild(schakelaar('schermAan', 'Scherm aan houden', 'Tijdens de wedstrijd gaat je scherm niet uit'));

  kaart.appendChild(h('div', { class: 'strook' },
    h('div', { class: 'kop2' }, 'Weergave', h('small', {}, 'Licht leest het best in de zon')),
    h('select', { style: { width: 'auto', minWidth: '118px' },
      onchange: (e) => wijzig((s) => { s.instellingen.thema = e.target.value; }) },
      ...[['auto', 'Automatisch'], ['licht', 'Licht'], ['donker', 'Donker']].map(([v, l]) =>
        h('option', { value: v, selected: S.instellingen.thema === v }, l)))));

  const gedeeld = account.modus === 'team';
  kaart.appendChild(h('div', { class: 'tussenkop' }, 'Gegevens'));
  kaart.appendChild(h('div', { class: 'knoprij' },
    h('button', { class: 'knop klein', onclick: () => {
      downloadBestand(`wisselschema-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exporteer(), null, 2));
      melding('Back-up gedownload');
    } }, 'Back-up downloaden'),
    h('button', { class: 'knop klein stil gevaar', onclick: () => bevestig(gedeeld ? 'Teamgegevens wissen?' : 'Alles wissen?',
      gedeeld
        ? `Spelers, wedstrijd en archief van ${S.team.naam} worden gewist, voor alle trainers van dit team. Dit kun je niet ongedaan maken.`
        : 'Team, wedstrijd en archief worden verwijderd. Dit kun je niet ongedaan maken.',
      () => {
        wijzig(() => { neemOver({ team: { naam: gedeeld ? S.team.naam : 'Mijn team', spelers: [] }, wedstrijd: null, archief: [] }); });
        melding(gedeeld ? 'Teamgegevens gewist' : 'Alles gewist');
      },
      { knop: gedeeld ? 'Wissen' : 'Alles wissen', gevaar: true }) }, gedeeld ? 'Teamgegevens wissen' : 'Alles wissen')));
  return kaart;
}

function samenwerkKaart(ganaar) {
  const kaart = h('div', { class: 'kaart' });
  if (account.modus === 'team') {
    const team = account.teams.find((t) => t.id === account.teamId);
    const anderen = (team?.leden || []).filter((l) => l.id !== account.gebruiker?.id).map((l) => l.naam);
    let host = account.server;
    try { host = new URL(account.server).host; } catch (e) { /* laat het adres staan */ }
    kaart.appendChild(h('p', { class: 'uitleg', style: { marginTop: '0' } },
      `Ingelogd als ${account.gebruiker?.naam} op ${host}. `,
      team ? (anderen.length ? `${team.naam} deel je met ${anderen.join(', ')}.` : `Je bent de enige trainer van ${team.naam}.`) : ''));
    kaart.appendChild(h('div', { class: 'strook' },
      h('div', { class: 'kop2' }, 'Verbinding', h('small', {}, verbindingsStaat().tekst)),
      h('i', { class: `stip los ${verbindingsStaat().klasse}` })));
    if (account.gebruiker?.beheerder) {
      kaart.appendChild(h('button', { class: 'knop klein', style: { marginTop: '10px' }, onclick: () => ganaar('beheer') }, 'Club beheren'));
    }
    return kaart;
  }
  kaart.appendChild(h('p', { class: 'uitleg', style: { marginTop: '0' } },
    'Samen met andere trainers aan hetzelfde team werken, ook tijdens de wedstrijd? Dat kan met een server, zoals de app voor Home Assistant. Vul het adres in; daarna log je in.'));
  const adresVeld = h('input', { type: 'text', value: S.instellingen.syncUrl || '', placeholder: 'https://wisselschema.jouwclub.nl',
    autocapitalize: 'none', spellcheck: 'false' });
  kaart.appendChild(adresVeld);
  kaart.appendChild(h('button', { class: 'knop klein', style: { marginTop: '8px' }, onclick: async () => {
    if (!(await verbindMet(adresVeld.value))) melding('Geen wisselschema-server gevonden op dat adres');
  } }, 'Verbinden'));
  return kaart;
}

function overKaart() {
  return h('div', { class: 'kaart' },
    h('h3', {}, 'Over deze app'),
    h('p', { class: 'uitleg', style: { marginBottom: '4px' } }, account.modus === 'team'
      ? 'Het wisselschema draait in je browser en werkt ook zonder bereik. Je team staat op de server van je club; wat je zonder verbinding doet, gaat mee zodra er weer bereik is.'
      : 'Het wisselschema draait volledig in je browser. Je gegevens blijven op je eigen apparaat staan; er wordt niets verstuurd tenzij je zelf met een server verbindt.'),
    h('p', { class: 'mini' }, 'Werkt zonder internet. Sla de pagina op of zet hem op je beginscherm.'));
}
