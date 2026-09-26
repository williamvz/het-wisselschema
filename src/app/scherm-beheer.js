// Scherm: de club beheren. Alleen voor beheerders: trainers en teams
// aanmaken, en bepalen wie bij welk team hoort. Iedere trainer ziet daarna
// alleen zijn eigen teams.

import { h, icoon, toonSheet, bevestig, melding, initialen, teamInitialen, kopieer } from './ui.js';
import { herteken } from './store.js';
import { account, naBeheer } from './samenwerken.js';
import { vraag } from './api.js';
import { gebruikersnaamVoor } from './scherm-inloggen.js';

const beheer = { geladen: false, laden: false, fout: null, gebruikers: [], teams: [], adres: null };

/** Bij het openen van het scherm: vers ophalen. */
export function vergeetBeheer() { beheer.geladen = false; beheer.fout = null; }

async function laad() {
  beheer.laden = true;
  try {
    neemOver(await vraag('api/beheer'));
    beheer.fout = null;
    // Het adres voor in de uitnodiging: het openbare adres als de server dat kent.
    vraag('api/status').then((st) => { beheer.adres = st.adres || null; }).catch(() => {});
  } catch (e) { beheer.fout = e.message; }
  beheer.laden = false;
  herteken();
}

function neemOver(r) {
  if (r.gebruikers) beheer.gebruikers = r.gebruikers;
  if (r.teams) beheer.teams = r.teams;
  beheer.geladen = true;
}

/** Een wijziging doorvoeren: bij succes de lijsten bijwerken, bij een fout die tonen. */
async function doe(pad, methode, data) {
  const r = await vraag(pad, { methode, data });
  neemOver(r);
  herteken();
  naBeheer();
  return r;
}

const naamVan = (id) => (beheer.gebruikers.find((g) => g.id === id) || {}).naam || '?';
const teamNaamVan = (id) => (beheer.teams.find((t) => t.id === id) || {}).naam || '?';

export function schermBeheer(ganaar) {
  const wrap = h('div', {});
  wrap.appendChild(h('button', { class: 'knop stil klein', style: { marginBottom: '6px', paddingLeft: '2px' },
    onclick: () => ganaar('team') }, '← Terug'));

  if (!account.gebruiker?.beheerder) {
    wrap.appendChild(h('div', { class: 'kaart' }, h('div', { class: 'leeg' }, 'Alleen een beheerder kan de club beheren.')));
    return wrap;
  }
  if (!beheer.geladen && !beheer.laden && !beheer.fout) laad();

  wrap.appendChild(h('div', { class: 'kaart' },
    h('h2', {}, 'Club beheren'),
    h('p', { class: 'uitleg', style: { margin: '0' } },
      'Maak trainers en teams aan en koppel ze aan elkaar. Een trainer ziet alleen zijn eigen teams; een beheerder ziet alles en kan dit scherm openen.')));

  if (beheer.fout) {
    wrap.appendChild(h('div', { class: 'melding hoog' }, h('span', { class: 'ico' }, '!'), h('span', { style: { flex: '1' } }, beheer.fout),
      h('button', { class: 'knop klein', onclick: () => { beheer.fout = null; laad(); } }, 'Opnieuw')));
    return wrap;
  }
  if (!beheer.geladen) {
    wrap.appendChild(h('div', { class: 'kaart' }, h('div', { class: 'leeg' }, 'Laden…')));
    return wrap;
  }

  // ---- teams
  wrap.appendChild(h('div', { class: 'tussenkop' }, `Teams · ${beheer.teams.length}`));
  const teams = h('div', { class: 'kaart' });
  if (!beheer.teams.length) teams.appendChild(h('div', { class: 'leeg', style: { padding: '12px' } }, 'Nog geen teams.'));
  for (const t of [...beheer.teams].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))) {
    teams.appendChild(h('div', { class: 'spelerrij', role: 'button', tabindex: '0', onclick: () => teamSheet(t, ganaar),
      onkeydown: (e) => { if (e.key === 'Enter') teamSheet(t, ganaar); } },
      h('div', { class: 'bal' }, teamInitialen(t.naam)),
      h('div', { class: 'naam' }, t.naam, h('small', {}, t.leden.length ? t.leden.map(naamVan).join(', ') : 'nog geen trainers')),
      t.id === account.teamId ? h('span', { class: 'vlag' }, 'OPEN') : null));
  }
  teams.appendChild(h('button', { class: 'knop breed', style: { marginTop: '10px' }, onclick: () => teamSheet(null, ganaar) },
    icoon('plus', 18), 'Team'));
  wrap.appendChild(teams);

  // ---- trainers
  wrap.appendChild(h('div', { class: 'tussenkop' }, `Trainers · ${beheer.gebruikers.length}`));
  const mensen = h('div', { class: 'kaart' });
  for (const g of [...beheer.gebruikers].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))) {
    mensen.appendChild(h('div', { class: 'spelerrij', role: 'button', tabindex: '0', onclick: () => gebruikerSheet(g),
      onkeydown: (e) => { if (e.key === 'Enter') gebruikerSheet(g); } },
      h('div', { class: 'bal' }, initialen(g.naam)),
      h('div', { class: 'naam' }, g.naam,
        h('small', {}, `${g.gebruikersnaam} · ${g.teams.length ? g.teams.map(teamNaamVan).join(', ') : 'geen team'}`)),
      g.beheerder ? h('span', { class: 'vlag' }, 'BEHEERDER') : null));
  }
  mensen.appendChild(h('button', { class: 'knop breed', style: { marginTop: '10px' }, onclick: () => gebruikerSheet(null) },
    icoon('plus', 18), 'Trainer'));
  wrap.appendChild(mensen);
  return wrap;
}

// ------------------------------------------------------------------- hulp
/** Een rij aan/uit-chips, bv. welke trainers bij een team horen. */
function kiesRij(opties, gekozen) {
  const set = new Set(gekozen);
  const rij = h('div', { class: 'chiprij' });
  for (const o of opties) {
    const knop = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(set.has(o.id)),
      onclick: () => {
        if (set.has(o.id)) set.delete(o.id); else set.add(o.id);
        knop.setAttribute('aria-pressed', String(set.has(o.id)));
      } }, h('i', { class: 'dot' }), o.naam);
    rij.appendChild(knop);
  }
  if (!opties.length) rij.appendChild(h('span', { class: 'mini' }, 'Nog niets om uit te kiezen.'));
  return { rij, gekozen: () => [...set] };
}

function foutVak() { return h('p', { class: 'fout', role: 'alert' }); }

async function probeer(fout, actie) {
  fout.textContent = '';
  try { await actie(); } catch (e) { fout.textContent = e.message; }
}

// ------------------------------------------------------------------- teams
function teamSheet(team, ganaar) {
  toonSheet(team ? team.naam : 'Nieuw team', (c, sluit) => {
    const naam = h('input', { type: 'text', value: team ? team.naam : '', placeholder: 'JO9-1' });
    const leden = kiesRij(beheer.gebruikers, team ? team.leden : [account.gebruiker.id]);
    const fout = foutVak();
    c.appendChild(h('label', { class: 'veld' }, h('span', {}, 'Teamnaam'), naam));
    c.appendChild(h('div', { class: 'tussenkop', style: { marginTop: '4px' } }, 'Trainers van dit team'));
    c.appendChild(leden.rij);
    c.appendChild(h('p', { class: 'mini', style: { marginTop: '8px' } }, 'Zij zien dit team in de app en kunnen er samen aan werken, ook tegelijk tijdens de wedstrijd.'));
    c.appendChild(fout);
    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '10px' } },
      team ? h('button', { class: 'knop gevaar', onclick: () => {
        sluit();
        bevestig(`${team.naam} verwijderen?`,
          'Het team verdwijnt voor alle trainers, met spelers en archief. Op de server blijft een kopie bewaard.',
          () => doe(`api/teams/${team.id}`, 'DELETE').then(() => melding('Team verwijderd')).catch((e) => melding(e.message)),
          { knop: 'Verwijderen', gevaar: true });
      } }, 'Verwijderen') : null,
      team && team.id !== account.teamId && team.leden.includes(account.gebruiker.id)
        ? h('button', { class: 'knop', onclick: () => { sluit(); naBeheer(team.id); ganaar('team'); } }, 'Openen') : null,
      h('button', { class: 'knop primair', style: { flex: '2' }, onclick: () => probeer(fout, async () => {
        if (team) {
          await doe(`api/teams/${team.id}`, 'PATCH', { naam: naam.value, leden: leden.gekozen() });
          melding('Team bijgewerkt');
        } else {
          const r = await doe('api/teams', 'POST', { naam: naam.value, leden: leden.gekozen() });
          melding(`${r.team.naam} aangemaakt`);
        }
        sluit();
      }) }, team ? 'Opslaan' : 'Aanmaken')));
  });
}

// ---------------------------------------------------------------- trainers
// Leesbaar en toch lastig te raden. De server laat na tien foute pogingen
// een kwartier niemand meer proberen, dus meer is niet nodig.
const WOORDEN = ['bal', 'doel', 'kop', 'net', 'veld', 'gras', 'fluit', 'hoek', 'lat', 'paal', 'wissel', 'spits',
  'keeper', 'corner', 'pass', 'volley', 'bank', 'shirt', 'aftrap', 'rust', 'penalty', 'sprint', 'libero', 'stopper',
  'kopbal', 'hakje', 'panna', 'lob', 'schot', 'redding', 'zijlijn', 'middenstip', 'dribbel', 'voorzet', 'uittrap', 'tackle'];
export function maakWachtwoord() {
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${WOORDEN[r[0] % WOORDEN.length]}-${WOORDEN[r[1] % WOORDEN.length]}-${1000 + (r[2] % 9000)}`;
}

function gebruikerSheet(g) {
  const ikZelf = g && g.id === account.gebruiker.id;
  toonSheet(g ? g.naam : 'Nieuwe trainer', (c, sluit) => {
    const naam = h('input', { type: 'text', value: g ? g.naam : '', autocomplete: 'off', placeholder: 'Dennis de Vries' });
    const gebruikersnaam = h('input', { type: 'text', value: g ? g.gebruikersnaam : '', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    const wachtwoord = h('input', { type: 'text', value: g ? '' : maakWachtwoord(), autocomplete: 'off', spellcheck: 'false',
      placeholder: g ? 'laat leeg om niet te wijzigen' : '' });
    const teams = kiesRij(beheer.teams, g ? g.teams : (account.teamId ? [account.teamId] : []));
    let beheerder = g ? !!g.beheerder : false;
    const beheerderKnop = h('button', { class: 'schakel', type: 'button', 'aria-pressed': String(beheerder), 'aria-label': 'Beheerder',
      disabled: ikZelf, onclick: () => { beheerder = !beheerder; beheerderKnop.setAttribute('aria-pressed', String(beheerder)); } }, h('i', {}));
    const fout = foutVak();

    let zelfGekozen = !!g;
    gebruikersnaam.addEventListener('input', () => { zelfGekozen = true; });
    naam.addEventListener('input', () => { if (!zelfGekozen) gebruikersnaam.value = gebruikersnaamVoor(naam.value); });

    c.appendChild(h('div', { class: 'rij2' },
      h('label', { class: 'veld' }, h('span', {}, 'Naam'), naam),
      h('label', { class: 'veld' }, h('span', {}, 'Gebruikersnaam'), gebruikersnaam)));
    c.appendChild(h('label', { class: 'veld' }, h('span', {}, g ? 'Nieuw wachtwoord' : 'Wachtwoord'),
      h('div', { style: { display: 'flex', gap: '8px' } }, wachtwoord,
        h('button', { class: 'knop klein', type: 'button', style: { flex: 'none' }, onclick: () => { wachtwoord.value = maakWachtwoord(); } }, 'Nieuw'))));
    c.appendChild(h('div', { class: 'tussenkop', style: { marginTop: '4px' } }, 'Teams'));
    c.appendChild(teams.rij);
    c.appendChild(h('div', { class: 'strook', style: { marginTop: '8px' } },
      h('div', { class: 'kop2' }, 'Beheerder', h('small', {}, ikZelf ? 'Je kunt jezelf geen beheerder af maken' : 'Mag trainers en teams beheren, en ziet alle teams')),
      beheerderKnop));
    c.appendChild(fout);
    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '10px' } },
      g && !ikZelf ? h('button', { class: 'knop gevaar', onclick: () => {
        sluit();
        bevestig(`${g.naam} verwijderen?`, 'Het account verdwijnt en is meteen uitgelogd. De teams en hun gegevens blijven staan.',
          () => doe(`api/gebruikers/${g.id}`, 'DELETE').then(() => melding('Trainer verwijderd')).catch((e) => melding(e.message)),
          { knop: 'Verwijderen', gevaar: true });
      } }, 'Verwijderen') : null,
      h('button', { class: 'knop primair', style: { flex: '2' }, onclick: () => probeer(fout, async () => {
        const gegevens = { naam: naam.value, gebruikersnaam: gebruikersnaam.value, beheerder, teams: teams.gekozen() };
        if (wachtwoord.value) gegevens.wachtwoord = wachtwoord.value;
        const r = g ? await doe(`api/gebruikers/${g.id}`, 'PATCH', gegevens) : await doe('api/gebruikers', 'POST', gegevens);
        sluit();
        if (gegevens.wachtwoord) uitnodiging(r.gebruiker, gegevens.wachtwoord, !g);
        else melding('Opgeslagen');
      }) }, g ? 'Opslaan' : 'Aanmaken')));
  });
}

/** Wat je de nieuwe trainer stuurt: adres, gebruikersnaam en wachtwoord in één berichtje. */
function uitnodiging(g, wachtwoord, nieuw) {
  const adres = beheer.adres || account.server || '';
  const teams = beheer.gebruikers.find((x) => x.id === g.id)?.teams.map(teamNaamVan) || [];
  const tekst = [
    nieuw ? `Hoi ${g.naam.split(' ')[0]}, je hebt een account voor Het Wisselschema.` : `Hoi ${g.naam.split(' ')[0]}, je hebt een nieuw wachtwoord voor Het Wisselschema.`,
    '',
    `Adres: ${adres}`,
    `Gebruikersnaam: ${g.gebruikersnaam}`,
    `Wachtwoord: ${wachtwoord}`,
    teams.length ? `Team: ${teams.join(', ')}` : null,
    '',
    'Tip: zet de pagina op je beginscherm, dan start hij als een app.',
  ].filter((r) => r !== null).join('\n');

  toonSheet(nieuw ? 'Trainer aangemaakt' : 'Wachtwoord gewijzigd', (c, sluit) => {
    c.appendChild(h('p', { class: 'uitleg' }, 'Stuur dit naar de trainer, bijvoorbeeld via de groepsapp. Het wachtwoord zie je hierna niet meer terug.'));
    if (/\/api\/hassio_ingress\//.test(adres)) {
      c.appendChild(h('div', { class: 'melding midden' }, h('span', { class: 'ico' }, '!'),
        h('span', {}, 'Dit is het adres binnen Home Assistant; daar kan een trainer zonder Home Assistant-account niet bij. Vul in Home Assistant bij de app de optie public_url in, of pas het adres hieronder aan.')));
    }
    const vak = h('textarea', { style: { minHeight: '250px' }, value: tekst, spellcheck: 'false' });
    c.appendChild(vak);
    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '10px' } },
      navigator.share ? h('button', { class: 'knop', onclick: async () => {
        try { await navigator.share({ text: vak.value }); } catch (e) { /* afgebroken */ }
      } }, 'Versturen') : null,
      h('button', { class: 'knop primair', style: { flex: '2' }, onclick: async () => {
        melding(await kopieer(vak.value) ? 'Gekopieerd' : 'Kopiëren lukte niet - selecteer de tekst zelf');
      } }, 'Kopiëren'),
      h('button', { class: 'knop', onclick: sluit }, 'Klaar')));
  });
}
