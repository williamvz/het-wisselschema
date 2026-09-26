// Schermen voor wie nog niet binnen is: verbinden, inloggen, de server
// inrichten, en de melding dat je (nog) geen team hebt.

import { h, icoon, melding, toonSheet, sluitSheet } from './ui.js';
import { account, inloggen, inrichten, herstellen, terugNaarLokaal, uitloggen, vernieuwIk, naBeheer } from './samenwerken.js';
import { vraag } from './api.js';

const veld = (label, invoer, uitleg) =>
  h('label', { class: 'veld' }, h('span', {}, label), invoer, uitleg ? h('small', { class: 'mini' }, uitleg) : null);

const hostVan = (adres) => { try { return new URL(adres).host; } catch (e) { return adres || ''; } };

function kop(tekst) {
  return [
    h('div', { class: 'merk', 'aria-hidden': 'true' }, 'W'),
    h('h1', {}, 'Het Wisselschema'),
    h('p', { class: 'uitleg' }, tekst),
  ];
}

/**
 * Een formulier dat tijdens het versturen zijn knop uitzet en een fout
 * onder de velden laat zien, zonder het scherm opnieuw op te bouwen: dan
 * blijft wat je typte gewoon staan.
 */
function formulier(velden, knoptekst, actie, { klasse = 'kaart' } = {}) {
  const fout = h('p', { class: 'fout', role: 'alert' });
  const knop = h('button', { class: 'knop primair breed groot', type: 'submit' }, knoptekst);
  return h('form', { class: klasse, onsubmit: async (e) => {
    e.preventDefault();
    fout.textContent = '';
    knop.disabled = true;
    knop.textContent = 'Even geduld…';
    try { await actie(); }
    catch (err) { fout.textContent = err.message || 'Dat lukte niet.'; }
    knop.disabled = false;
    knop.textContent = knoptekst;
  } }, ...velden, fout, knop);
}

export function schermVerbinden() {
  return h('div', { class: 'inlog' }, ...kop('Verbinden met de server…'));
}

export function schermInloggen() {
  const naam = h('input', { type: 'text', name: 'username', autocomplete: 'username', autocapitalize: 'none',
    spellcheck: 'false', required: true, placeholder: 'bv. dennis' });
  const wachtwoord = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  return h('div', { class: 'inlog' },
    ...kop('Log in om je team te openen.'),
    formulier([veld('Gebruikersnaam', naam), veld('Wachtwoord', wachtwoord)], 'Inloggen',
      () => inloggen(naam.value, wachtwoord.value)),
    h('p', { class: 'mini centraal' }, `Server: ${hostVan(account.server)}. Nog geen account? Vraag het de beheerder van je club.`),
    h('button', { class: 'knop stil breed', onclick: vergetenSheet }, 'Wachtwoord vergeten?'),
    account.handmatig
      ? h('button', { class: 'knop stil breed', onclick: terugNaarLokaal }, 'Zonder server verder, alleen op dit apparaat')
      : null);
}

export function schermInrichten() {
  const st = account.status || {};
  const code = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    required: true, placeholder: 'ABCD-EFGH' });
  const naam = h('input', { type: 'text', autocomplete: 'name', required: true, placeholder: 'Je naam' });
  const gebruikersnaam = h('input', { type: 'text', name: 'username', autocomplete: 'username', autocapitalize: 'none',
    spellcheck: 'false', required: true });
  const wachtwoord = h('input', { type: 'password', name: 'new-password', autocomplete: 'new-password', required: true, minlength: '8' });

  // De gebruikersnaam volgt de voornaam, tot je hem zelf aanpast.
  let zelfGekozen = false;
  gebruikersnaam.addEventListener('input', () => { zelfGekozen = true; });
  naam.addEventListener('input', () => { if (!zelfGekozen) gebruikersnaam.value = gebruikersnaamVoor(naam.value); });

  return h('div', { class: 'inlog' },
    ...kop('Deze server heeft nog geen accounts. Maak het eerste aan: dat wordt de beheerder, die daarna trainers en teams toevoegt.'),
    formulier([
      veld('Inrichtcode', code, 'Staat in het logboek van de server. In Home Assistant: Instellingen → Apps → Het Wisselschema → Logboek.'),
      veld('Je naam', naam),
      veld('Gebruikersnaam', gebruikersnaam),
      veld('Wachtwoord', wachtwoord, 'Minstens 8 tekens.'),
      st.oudTeam ? h('div', { class: 'melding info' }, h('span', { class: 'ico' }, 'i'),
        h('span', {}, `Het team dat al op de server stond (${st.oudTeam.naam}, ${st.oudTeam.spelers} spelers) wordt je eerste team.`)) : null,
    ], 'Beheerder aanmaken', () => inrichten({
      code: code.value, naam: naam.value, gebruikersnaam: gebruikersnaam.value, wachtwoord: wachtwoord.value,
    })));
}

async function vergetenSheet() {
  let st = account.status || {};
  try { st = await vraag('api/status'); } catch (e) { /* dan wat we al wisten */ }
  toonSheet('Wachtwoord vergeten', (c) => {
    c.appendChild(h('p', { class: 'uitleg' },
      'Vraag de beheerder van je club om een nieuw wachtwoord: dat kan onder Club beheren, en je krijgt het in een berichtje.'));
    if (!st.herstellen) {
      c.appendChild(h('p', { class: 'uitleg' },
        'Ben je zelf de beheerder? Zet dan in Home Assistant bij de app Het Wisselschema de optie reset_password aan en start hem opnieuw. In het logboek staat daarna een herstelcode; daarmee kies je hier een nieuw wachtwoord.'));
      return;
    }
    const code = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', required: true });
    const naam = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
    const wachtwoord = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '8' });
    c.appendChild(formulier([
      veld('Herstelcode', code, 'Staat in het logboek van de server; werkt één keer.'),
      veld('Gebruikersnaam', naam),
      veld('Nieuw wachtwoord', wachtwoord, 'Minstens 8 tekens.'),
    ], 'Nieuw wachtwoord instellen', async () => {
      await herstellen({ code: code.value, gebruikersnaam: naam.value, wachtwoord: wachtwoord.value });
      sluitSheet();
      melding('Nieuw wachtwoord ingesteld. Zet reset_password weer uit.');
    }, { klasse: '' }));
  });
}

/** Van "Dennis de Vries" naar "dennis": wat de meeste clubs als gebruikersnaam nemen. */
export function gebruikersnaamVoor(naam) {
  return String(naam || '').trim().split(/\s+/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

export function schermGeenTeam(ganaar) {
  const wrap = h('div', {});
  if (account.gebruiker?.beheerder) {
    const naam = h('input', { type: 'text', required: true, placeholder: 'JO9-1' });
    wrap.appendChild(formulier([
      h('h2', {}, 'Maak je eerste team'),
      h('p', { class: 'uitleg' }, 'Daarna voeg je spelers toe, en kun je onder Club beheren trainers aan het team koppelen.'),
      veld('Teamnaam', naam),
    ], 'Team aanmaken', async () => {
      const r = await vraag('api/teams', { methode: 'POST', data: { naam: naam.value, leden: [account.gebruiker.id] } });
      await naBeheer(r.team.id);
      melding(`${r.team.naam} aangemaakt`);
    }));
    wrap.appendChild(h('button', { class: 'knop breed', onclick: () => ganaar('beheer') }, icoon('team', 18), 'Club beheren'));
  } else {
    wrap.appendChild(h('div', { class: 'kaart' }, h('div', { class: 'leeg' },
      h('h2', { style: { marginBottom: '6px' } }, 'Nog geen team'),
      h('p', {}, 'Je bent nog niet aan een team gekoppeld. Vraag de beheerder van je club om je toe te voegen.'),
      h('div', { class: 'knoprij', style: { justifyContent: 'center' } },
        h('button', { class: 'knop primair', onclick: async () => { await vernieuwIk(); melding(account.teamId ? 'Team gevonden' : 'Nog steeds geen team'); } }, 'Opnieuw kijken'),
        h('button', { class: 'knop', onclick: uitloggen }, 'Uitloggen')))));
  }
  return wrap;
}
