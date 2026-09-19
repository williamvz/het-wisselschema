// Scherm: gespeelde wedstrijden en instellingen.

import { h, icoon, toonSheet, bevestig, melding, datumTekst, minutenTekst, saldoTekst, voornaam, downloadBestand } from './ui.js';
import { S, wijzig, exporteer, neemOver, startSync, sync } from './store.js';
import { getFormation } from '../lib/formations.js';

export function schermArchief() {
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
  wrap.appendChild(overKaart());
  return wrap;
}

function archiefKaart(a) {
  const kaart = h('div', { class: 'kaart' });
  kaart.appendChild(h('div', { class: 'kaart-kop' },
    h('h3', {}, a.tegenstander || 'Onbekende tegenstander'),
    h('span', { class: 'mini' }, datumTekst(a.datum))));
  kaart.appendChild(h('p', { class: 'uitleg' },
    `${a.thuis ? 'Thuis' : 'Uit'} · ${getFormation(a.formationId).naam} · ${a.periodes}×${a.periodeMin} min`));

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
      st.keeperSec ? h('span', { class: 'vlag K' }, 'K') : null));
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

  kaart.appendChild(h('div', { class: 'tussenkop' }, 'Gegevens'));
  kaart.appendChild(h('div', { class: 'knoprij' },
    h('button', { class: 'knop klein', onclick: () => {
      downloadBestand(`wisselschema-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exporteer(), null, 2));
      melding('Back-up gedownload');
    } }, 'Back-up downloaden'),
    h('button', { class: 'knop klein stil gevaar', onclick: () => bevestig('Alles wissen?',
      'Team, wedstrijd en archief worden verwijderd. Dit kun je niet ongedaan maken.',
      () => { wijzig(() => { neemOver({ team: { naam: 'Mijn team', spelers: [] }, wedstrijd: null, archief: [] }); }); melding('Alles gewist'); },
      { knop: 'Alles wissen', gevaar: true }) }, 'Alles wissen')));

  kaart.appendChild(h('div', { class: 'tussenkop' }, 'Synchroniseren'));
  kaart.appendChild(h('p', { class: 'uitleg' },
    sync.actief
      ? `Verbonden met ${sync.adres}. Je team staat ook op de server, zodat je hem op je tablet terugvindt.`
      : 'Optioneel. Draai je de app vanaf een server met opslag (zoals de Home Assistant-add-on), vul dan het adres in. Laat leeg om alles alleen op dit apparaat te houden.'));
  const adresVeld = h('input', { type: 'text', value: S.instellingen.syncUrl || '', placeholder: 'https://wisselschema.thuis/api/state' });
  kaart.appendChild(adresVeld);
  kaart.appendChild(h('button', { class: 'knop klein', style: { marginTop: '8px' }, onclick: async () => {
    wijzig((s) => { s.instellingen.syncUrl = adresVeld.value.trim(); });
    melding(await startSync() ? 'Verbonden' : 'Geen verbinding - de app werkt gewoon lokaal door');
  } }, 'Verbinding testen'));
  return kaart;
}

function overKaart() {
  return h('div', { class: 'kaart' },
    h('h3', {}, 'Over deze app'),
    h('p', { class: 'uitleg', style: { marginBottom: '4px' } },
      'Het wisselschema draait volledig in je browser. Je gegevens blijven op je eigen apparaat staan; er wordt niets verstuurd tenzij je zelf een synchronisatieadres invult.'),
    h('p', { class: 'mini' }, 'Werkt zonder internet. Sla de pagina op of zet hem op je beginscherm.'));
}
