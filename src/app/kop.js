// De kopbalk. Zonder account: de teamnaam. Met een account ook de teamkeuze,
// wie er verder meekijkt, en een stip die zegt of alles verstuurd is - dat
// wil je weten voordat je na de wedstrijd je telefoon wegstopt.

import { h, toonSheet, bevestig, melding, initialen, teamInitialen, datumTekst } from './ui.js';
import { S, herteken } from './store.js';
import { account, kiesTeam, uitloggen, vernieuwIk, wijzigWachtwoord, inloggen } from './samenwerken.js';
import { getFormation } from '../lib/formations.js';

function ondertitel() {
  const w = S.wedstrijd;
  if (!w) return `${S.team.spelers.length} speler${S.team.spelers.length === 1 ? '' : 's'}`;
  const tegen = w.tegenstander ? `${w.thuis ? 'thuis tegen' : 'uit bij'} ${w.tegenstander}` : datumTekst(w.datum);
  return `${tegen} · ${getFormation(w.formationId).naam}`;
}

/** Hoe het ervoor staat met de verbinding, in één woord voor de stip en een zin voor erbij. */
export function verbindingsStaat() {
  if (account.sessieVerlopen) return { klasse: 'fout', tekst: 'Je bent uitgelogd. Wat je nu doet, wordt bewaard tot je weer inlogt.' };
  if (account.verbinding === 'offline') {
    return { klasse: 'uit', tekst: account.onverstuurd
      ? 'Geen verbinding. Je wijzigingen staan op dit apparaat en gaan mee zodra er weer bereik is.'
      : 'Geen verbinding met de server. Je kunt gewoon doorwerken.' };
  }
  if (account.onverstuurd) return { klasse: 'bezig', tekst: 'Wijzigingen worden verstuurd…' };
  if (account.verbinding === 'ok') return { klasse: 'ok', tekst: 'Verbonden. Alles is verstuurd.' };
  return { klasse: 'uit', tekst: 'Verbinden…' };
}

export function kopbalk(ganaar) {
  const kop = h('header', { class: 'kop' }, h('div', { class: 'merk', 'aria-hidden': 'true' }, 'W'));
  const titel = [h('strong', {}, S.team.naam), h('small', {}, ondertitel())];

  if (account.modus !== 'team') {
    kop.appendChild(h('div', { class: 'titel' }, ...titel));
    return [kop];
  }

  if (!account.teamId) titel.splice(0, 2, h('strong', {}, 'Het Wisselschema'), h('small', {}, account.gebruiker?.naam || ''));
  kop.appendChild(account.teamId
    ? h('button', { class: 'titel teamknop', 'aria-label': `Team ${S.team.naam}, kies een ander team`,
      onclick: () => teamSheet(ganaar) }, ...titel)
    : h('div', { class: 'titel' }, ...titel));

  if (account.aanwezig.length) {
    const namen = account.aanwezig.map((a) => a.naam);
    kop.appendChild(h('div', { class: 'aanwezig', title: `Kijkt nu mee: ${namen.join(', ')}`,
      'aria-label': `Kijkt nu mee: ${namen.join(', ')}` },
      ...account.aanwezig.slice(0, 3).map((a) => h('span', {}, initialen(a.naam)))));
  }

  const staat = verbindingsStaat();
  kop.appendChild(h('button', { class: 'accountknop', 'aria-label': `${account.gebruiker?.naam || 'Account'}. ${staat.tekst}`,
    title: staat.tekst, onclick: () => accountSheet(ganaar) },
    initialen(account.gebruiker?.naam), h('i', { class: `stip ${staat.klasse}` })));

  const uit = [kop];
  if (account.sessieVerlopen) {
    uit.push(h('div', { class: 'melding hoog balk-melding' }, h('span', { class: 'ico' }, '!'),
      h('span', { style: { flex: '1' } }, 'Je bent uitgelogd. Je kunt doorwerken; log opnieuw in om het te delen.'),
      h('button', { class: 'knop klein', onclick: herinlogSheet }, 'Inloggen')));
  } else if (account.melding) {
    const tekst = account.melding;
    uit.push(h('div', { class: 'melding midden balk-melding' }, h('span', { class: 'ico' }, 'i'),
      h('span', { style: { flex: '1' } }, tekst),
      h('button', { class: 'knop klein stil', 'aria-label': 'Sluiten', onclick: () => { account.melding = null; herteken(); } }, '✕')));
  }
  return uit;
}

// ------------------------------------------------------------------- teams
function teamSheet(ganaar) {
  vernieuwIk(); // het lijstje kan veranderd zijn; komt het terug, dan tekent de app opnieuw
  toonSheet('Kies een team', (c, sluit) => {
    if (!account.teams.length) c.appendChild(h('div', { class: 'leeg' }, 'Je hebt nog geen teams.'));
    for (const t of account.teams) {
      const open = t.id === account.teamId;
      const leden = (t.leden || []).map((l) => l.naam).join(', ');
      c.appendChild(h('button', { class: 'spelerrij', 'aria-current': open ? 'true' : null,
        style: { width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--rand)' },
        onclick: () => { sluit(); if (!open) { kiesTeam(t.id); melding(`${t.naam} geopend`); } } },
        h('div', { class: 'bal' }, teamInitialen(t.naam)),
        h('div', { class: 'naam' }, t.naam, h('small', {}, leden || 'nog geen trainers')),
        open ? h('span', { class: 'vlag' }, 'OPEN') : !t.lid ? h('span', { class: 'mini' }, 'geen lid') : null));
    }
    if (account.gebruiker?.beheerder) {
      c.appendChild(h('button', { class: 'knop breed', style: { marginTop: '14px' },
        onclick: () => { sluit(); ganaar('beheer'); } }, 'Club beheren'));
    }
  });
}

// ----------------------------------------------------------------- account
function accountSheet(ganaar) {
  const g = account.gebruiker || {};
  toonSheet(g.naam || 'Account', (c, sluit) => {
    let host = account.server;
    try { host = new URL(account.server).host; } catch (e) { /* laat het adres staan */ }
    c.appendChild(h('p', { class: 'uitleg' }, `Ingelogd als ${g.gebruikersnaam}${g.beheerder ? ' · beheerder' : ''} op ${host}.`));
    const staat = verbindingsStaat();
    c.appendChild(h('div', { class: 'strook' },
      h('div', { class: 'kop2' }, 'Verbinding', h('small', {}, staat.tekst)),
      h('i', { class: `stip los ${staat.klasse}` })));
    if (account.aanwezig.length) {
      c.appendChild(h('div', { class: 'strook' },
        h('div', { class: 'kop2' }, 'Kijkt nu mee', h('small', {}, account.aanwezig.map((a) => a.naam).join(', ')))));
    }
    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '14px', flexDirection: 'column' } },
      g.beheerder ? h('button', { class: 'knop', onclick: () => { sluit(); ganaar('beheer'); } }, 'Club beheren') : null,
      h('button', { class: 'knop', onclick: () => { sluit(); wachtwoordSheet(); } }, 'Wachtwoord wijzigen'),
      h('button', { class: 'knop gevaar', onclick: () => {
        sluit();
        if (account.onverstuurd || account.sessieVerlopen) {
          bevestig('Nog niet alles is verstuurd', 'Er staan wijzigingen op dit apparaat die de server nog niet heeft. Als je uitlogt, ben je die kwijt.',
            uitloggen, { knop: 'Toch uitloggen', gevaar: true });
        } else uitloggen();
      } }, 'Uitloggen')));
  });
}

function wachtwoordSheet() {
  toonSheet('Wachtwoord wijzigen', (c, sluit) => {
    const huidig = h('input', { type: 'password', autocomplete: 'current-password' });
    const nieuw = h('input', { type: 'password', autocomplete: 'new-password', minlength: '8' });
    const fout = h('p', { class: 'fout', role: 'alert' });
    c.appendChild(h('label', { class: 'veld' }, h('span', {}, 'Huidig wachtwoord'), huidig));
    c.appendChild(h('label', { class: 'veld' }, h('span', {}, 'Nieuw wachtwoord (minstens 8 tekens)'), nieuw));
    c.appendChild(fout);
    c.appendChild(h('div', { class: 'knoprij' },
      h('button', { class: 'knop', onclick: sluit }, 'Annuleren'),
      h('button', { class: 'knop primair', style: { flex: '2' }, onclick: async () => {
        try { await wijzigWachtwoord(huidig.value, nieuw.value); sluit(); melding('Wachtwoord gewijzigd'); }
        catch (e) { fout.textContent = e.message; }
      } }, 'Opslaan')));
  });
}

/** Sessie verlopen midden in een wedstrijd: inloggen zonder dat het scherm verdwijnt. */
function herinlogSheet() {
  toonSheet('Opnieuw inloggen', (c, sluit) => {
    const naam = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', value: account.gebruiker?.gebruikersnaam || '' });
    const wachtwoord = h('input', { type: 'password', autocomplete: 'current-password' });
    const fout = h('p', { class: 'fout', role: 'alert' });
    c.appendChild(h('p', { class: 'uitleg' }, 'Wat je intussen hebt gedaan, gaat daarna alsnog mee.'));
    c.appendChild(h('label', { class: 'veld' }, h('span', {}, 'Gebruikersnaam'), naam));
    c.appendChild(h('label', { class: 'veld' }, h('span', {}, 'Wachtwoord'), wachtwoord));
    c.appendChild(fout);
    c.appendChild(h('button', { class: 'knop primair breed', onclick: async () => {
      try { await inloggen(naam.value, wachtwoord.value); sluit(); melding('Weer ingelogd'); }
      catch (e) { fout.textContent = e.message; }
    } }, 'Inloggen'));
  });
}
