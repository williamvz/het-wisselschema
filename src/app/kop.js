// De kopbalk. Zonder account: de teamnaam. Met een account ook de teamkeuze,
// wie er verder meekijkt, en een stip die zegt of alles verstuurd is - dat
// wil je weten voordat je na de wedstrijd je telefoon wegstopt.

import { h, toonSheet, bevestig, melding, initialen, teamInitialen, datumTekst } from './ui.js';
import { S, herteken } from './store.js';
import { account, kiesTeam, uitloggen, vernieuwIk, wijzigWachtwoord } from './samenwerken.js';
import { getFormation } from '../lib/formations.js';

const hostVan = (adres) => { try { return new URL(adres).host; } catch (e) { return adres || ''; } };

function ondertitel() {
  const w = S.wedstrijd;
  if (!w) return `${S.team.spelers.length} speler${S.team.spelers.length === 1 ? '' : 's'}`;
  const tegen = w.tegenstander ? `${w.thuis ? 'thuis tegen' : 'uit bij'} ${w.tegenstander}` : datumTekst(w.datum);
  return `${tegen} · ${getFormation(w.formationId).naam}`;
}

/** Hoe het ervoor staat met de verbinding, in één woord voor de stip en een zin voor erbij. */
export function verbindingsStaat() {
  if (account.verbinding === 'offline') {
    return { klasse: 'uit', tekst: account.onverstuurd
      ? 'Geen verbinding. Je wijzigingen staan op dit apparaat en gaan mee zodra er weer bereik is.'
      : 'Geen verbinding met de server. Je kunt gewoon doorwerken.' };
  }
  if (account.onverstuurd) return { klasse: 'bezig', tekst: 'Wijzigingen worden verstuurd…' };
  if (account.verbinding === 'ok') return { klasse: 'ok', tekst: 'Verbonden. Alles is verstuurd.' };
  return { klasse: 'uit', tekst: 'Verbinden…' };
}

export function kopbalk(scherm) {
  const beheer = scherm === 'beheer';
  const kop = h('header', { class: `kop${beheer ? ' beheerkop' : ''}` }, h('div', { class: 'merk', 'aria-hidden': 'true' }, 'W'));
  const titel = [h('strong', {}, S.team.naam), h('small', {}, ondertitel())];

  if (account.modus !== 'team') {
    kop.appendChild(h('div', { class: 'titel' }, ...titel));
    return [kop];
  }

  // Als beheerder ben je niet met een team bezig, maar met de hele club.
  if (beheer) titel.splice(0, 2, h('strong', {}, 'Clubbeheer'), h('small', {}, 'Teams en trainers van de club'));
  else if (!account.teamId) titel.splice(0, 2, h('strong', {}, 'Het Wisselschema'), h('small', {}, account.gebruiker?.naam || ''));
  kop.appendChild(account.teamId && !beheer
    ? h('button', { class: 'titel teamknop', 'aria-label': `Team ${S.team.naam}, kies een ander team`,
      onclick: () => teamSheet() }, ...titel)
    : h('div', { class: 'titel' }, ...titel));

  if (account.aanwezig.length && !beheer) {
    const namen = account.aanwezig.map((a) => a.naam);
    kop.appendChild(h('div', { class: 'aanwezig', title: `Kijkt nu mee: ${namen.join(', ')}`,
      'aria-label': `Kijkt nu mee: ${namen.join(', ')}` },
      ...account.aanwezig.slice(0, 3).map((a) => h('span', {}, initialen(a.naam)))));
  }

  const staat = verbindingsStaat();
  kop.appendChild(h('button', { class: 'accountknop', 'aria-label': `${account.gebruiker?.naam || 'Account'}. ${staat.tekst}`,
    title: staat.tekst, onclick: () => accountSheet() },
    initialen(account.gebruiker?.naam), h('i', { class: `stip ${staat.klasse}` })));

  const uit = [kop];
  if (account.melding) {
    const tekst = account.melding;
    uit.push(h('div', { class: 'melding midden balk-melding' }, h('span', { class: 'ico' }, 'i'),
      h('span', { style: { flex: '1' } }, tekst),
      h('button', { class: 'knop klein stil', 'aria-label': 'Sluiten', onclick: () => { account.melding = null; herteken(); } }, '✕')));
  }
  return uit;
}

// ------------------------------------------------------------------- teams
function teamSheet() {
  vernieuwIk(); // het lijstje kan veranderd zijn; komt het terug, dan tekent de app opnieuw
  toonSheet('Kies een team', (c, sluit) => {
    const rij = (t) => {
      const open = t.id === account.teamId;
      const leden = (t.leden || []).map((l) => l.naam).join(', ');
      return h('button', { class: 'spelerrij', 'aria-current': open ? 'true' : null,
        style: { width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--rand)' },
        onclick: () => { sluit(); if (!open) { kiesTeam(t.id); melding(`${t.naam} geopend`); } } },
        h('div', { class: 'bal' }, teamInitialen(t.naam)),
        h('div', { class: 'naam' }, t.naam, h('small', {}, leden || 'nog geen trainers')),
        open ? h('span', { class: 'vlag' }, 'OPEN') : null);
    };
    const mijn = account.teams.filter((t) => t.lid);
    const overig = account.teams.filter((t) => !t.lid);
    if (!mijn.length) c.appendChild(h('div', { class: 'leeg' }, 'Je bent van geen enkel team trainer.'));
    for (const t of mijn) c.appendChild(rij(t));
    // Een beheerder mag bij elk team, maar is daar geen trainer van.
    if (overig.length) {
      c.appendChild(h('div', { class: 'tussenkop' }, 'Andere teams van de club'));
      c.appendChild(h('p', { class: 'mini' }, 'Als beheerder kun je deze openen. Trainer worden doe je onder Club.'));
      for (const t of overig) c.appendChild(rij(t));
    }
  });
}

// ----------------------------------------------------------------- account
function accountSheet() {
  const g = account.gebruiker || {};
  toonSheet(g.naam || 'Account', (c, sluit) => {
    c.appendChild(h('p', { class: 'uitleg' }, `Ingelogd als ${g.gebruikersnaam} op ${hostVan(account.server)}.`));
    const mijn = account.teams.filter((t) => t.lid).map((t) => t.naam);
    c.appendChild(h('div', { class: 'strook' },
      h('div', { class: 'kop2' }, 'Trainer', h('small', {}, mijn.length ? mijn.join(', ') : 'nog van geen team'))));
    if (g.beheerder) {
      c.appendChild(h('div', { class: 'strook' },
        h('div', { class: 'kop2' }, 'Beheerder', h('small', {}, 'Je beheert de teams en trainers van de club, onder Club'))));
    }
    const staat = verbindingsStaat();
    c.appendChild(h('div', { class: 'strook' },
      h('div', { class: 'kop2' }, 'Verbinding', h('small', {}, staat.tekst)),
      h('i', { class: `stip los ${staat.klasse}` })));
    if (account.aanwezig.length) {
      c.appendChild(h('div', { class: 'strook' },
        h('div', { class: 'kop2' }, 'Kijkt nu mee', h('small', {}, account.aanwezig.map((a) => a.naam).join(', ')))));
    }
    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '14px', flexDirection: 'column' } },
      h('button', { class: 'knop', onclick: () => { sluit(); wachtwoordSheet(); } }, 'Wachtwoord wijzigen'),
      h('button', { class: 'knop gevaar', onclick: () => {
        sluit();
        if (account.onverstuurd) {
          bevestig('Nog niet alles is verstuurd', 'Er staan wijzigingen op dit apparaat die de server nog niet heeft. Als je uitlogt, ben je die kwijt.',
            uitloggen, { knop: 'Toch uitloggen', gevaar: true });
        } else uitloggen();
      } }, 'Uitloggen')));
  });
}

/**
 * Een echt formulier, met je gebruikersnaam erin: dan
 * onthoudt de wachtwoordbeheerder van je telefoon het nieuwe wachtwoord, in
 * plaats van bij de volgende keer inloggen het oude in te vullen.
 */
function wachtwoordSheet() {
  const g = account.gebruiker || {};
  toonSheet('Wachtwoord wijzigen', (c, sluit) => {
    const naam = h('input', { type: 'text', name: 'username', autocomplete: 'username', value: g.gebruikersnaam || '',
      readonly: '', tabindex: '-1' });
    const huidig = h('input', { type: 'password', name: 'current-password', autocomplete: 'current-password', required: true });
    const nieuw = h('input', { type: 'password', name: 'new-password', autocomplete: 'new-password', required: true, minlength: '8' });
    const herhaal = h('input', { type: 'password', name: 'new-password-2', autocomplete: 'new-password', required: true, minlength: '8' });
    const fout = h('p', { class: 'fout', role: 'alert' });
    const knop = h('button', { class: 'knop primair', type: 'submit', style: { flex: '2' } }, 'Wachtwoord wijzigen');

    const klaar = () => {
      c.replaceChildren(
        h('div', { class: 'melding goed', role: 'status' }, h('span', { class: 'ico' }, '✓'),
          h('span', {}, h('b', {}, 'Je wachtwoord is gewijzigd. '),
            'Op je andere telefoons en computers ben je nu uitgelogd; daar log je in met het nieuwe wachtwoord.')),
        h('button', { class: 'knop primair breed', style: { marginTop: '14px' }, onclick: sluit }, 'Klaar'));
    };

    c.appendChild(h('form', { onsubmit: async (e) => {
      e.preventDefault();
      fout.textContent = '';
      if (nieuw.value.length < 8) { fout.textContent = 'Het nieuwe wachtwoord moet minstens 8 tekens lang zijn.'; nieuw.focus(); return; }
      if (nieuw.value !== herhaal.value) { fout.textContent = 'De twee nieuwe wachtwoorden zijn niet hetzelfde.'; herhaal.focus(); return; }
      if (nieuw.value === huidig.value) { fout.textContent = 'Het nieuwe wachtwoord is hetzelfde als het huidige.'; nieuw.focus(); return; }
      knop.disabled = true;
      knop.textContent = 'Even geduld…';
      try {
        await wijzigWachtwoord(huidig.value, nieuw.value);
        klaar();
      } catch (err) {
        fout.textContent = err.message || 'Dat lukte niet.';
        knop.disabled = false;
        knop.textContent = 'Wachtwoord wijzigen';
      }
    } },
      h('label', { class: 'veld' }, h('span', {}, 'Gebruikersnaam'), naam),
      h('label', { class: 'veld' }, h('span', {}, 'Huidig wachtwoord'), huidig),
      h('label', { class: 'veld' }, h('span', {}, 'Nieuw wachtwoord'), nieuw, h('small', { class: 'mini' }, 'Minstens 8 tekens.')),
      h('label', { class: 'veld' }, h('span', {}, 'Nieuw wachtwoord, nog een keer'), herhaal),
      fout,
      h('div', { class: 'knoprij' },
        h('button', { class: 'knop', type: 'button', onclick: sluit }, 'Annuleren'),
        knop)));
  });
}
