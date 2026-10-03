// De romp: kopbalk, schermkeuze, navigatie en het opstarten.

import { h, icoon, leegmaken, toonSheet, sluitSheet, melding, houdSchermAan, minutenTekst, voornaam } from './ui.js';
import { S, wijzig, abonneer, laadLokaal, plan, klokStand, leesDeelLink, nieuweSpeler, nieuweWedstrijd, bewaarNu } from './store.js';
import { getFormation } from '../lib/formations.js';
import { account, herstelAccount, verbind, wek, duwBijAfsluiten } from './samenwerken.js';
import { kopbalk } from './kop.js';
import { schermTeam } from './scherm-team.js';
import { schermOpzet } from './scherm-opzet.js';
import { schermSchema } from './scherm-schema.js';
import { schermLive, tikLive, actiefBlokIndex } from './scherm-live.js';
import { schermArchief } from './scherm-archief.js';
import { schermVerbinden, schermInloggen, schermInrichten, schermSessieVerlopen, schermGeenTeam } from './scherm-inloggen.js';
import { schermBeheer, vergeetBeheer } from './scherm-beheer.js';

// Wat je als trainer doet: je team en de wedstrijden.
const SCHERMEN = [
  { id: 'team', naam: 'Team', ico: 'team' },
  { id: 'opzet', naam: 'Wedstrijden', ico: 'opzet' },
  { id: 'schema', naam: 'Schema', ico: 'schema' },
  { id: 'live', naam: 'Live', ico: 'live' },
  { id: 'archief', naam: 'Archief', ico: 'archief' },
];
// Wat je als beheerder doet: de club. Een eigen tab, alleen voor beheerders.
const BEHEER = { id: 'beheer', naam: 'Club', ico: 'club' };

let wortel = null;
let wasBinnen = false;

/** Mag je het team zien? Niet zolang je moet inloggen, of na een verlopen sessie. */
const binnen = () => !account.sessieVerlopen && !['verbinden', 'inloggen', 'inrichten'].includes(account.modus);

export function ganaar(scherm) {
  if (scherm === 'beheer') vergeetBeheer(); // altijd vers ophalen
  wijzig((s) => {
    // Nog geen wedstrijd: dan zie je de lijst, en dat blijft zo als een
    // collega er intussen een toevoegt.
    if (scherm === 'opzet' && !s.wedstrijd) s.ui.lijst = true;
    s.ui.scherm = scherm;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function wisselStaatOpen() {
  const w = S.wedstrijd;
  if (!w || !w.blokken || w.status !== 'bezig') return false;
  const p = plan();
  const i = actiefBlokIndex(p.blokken);
  return klokStand() >= p.blokken[i].totSec;
}

export function render() {
  const thema = S.instellingen.thema || 'auto';
  document.documentElement.dataset.thema = thema === 'auto' ? '' : thema;

  leegmaken(wortel);

  // Nog niet (of niet meer) binnen: een scherm zonder kopbalk en navigatie.
  if (!binnen()) {
    // Wat er nog openstond, hoort bij het team: dat moet ook weg.
    if (wasBinnen) sluitSheet();
    wasBinnen = false;
    wortel.appendChild(account.sessieVerlopen ? schermSessieVerlopen()
      : account.modus === 'verbinden' ? schermVerbinden()
      : account.modus === 'inloggen' ? schermInloggen() : schermInrichten());
    document.getElementById('nav')?.remove();
    houdSchermAan(false);
    return;
  }
  wasBinnen = true;

  let scherm = S.ui.scherm || 'team';
  const zonderTeam = account.modus === 'team' && !account.teamId;
  const beheerder = account.modus === 'team' && !!account.gebruiker?.beheerder;
  if (scherm === 'beheer' && !beheerder) scherm = 'team';

  for (const deel of kopbalk(scherm)) wortel.appendChild(deel);

  const inhoud =
    scherm === 'beheer' ? schermBeheer(ganaar)
    : zonderTeam ? schermGeenTeam()
    : scherm === 'team' ? schermTeam()
    : scherm === 'opzet' ? schermOpzet(ganaar)
    : scherm === 'schema' ? schermSchema(ganaar)
    : scherm === 'live' ? schermLive(ganaar, render)
    : schermArchief();
  wortel.appendChild(inhoud);

  // Zonder team valt er als trainer niets te doen; een beheerder kan wel naar de club.
  const tabs = [...(zonderTeam ? [] : SCHERMEN), ...(beheerder ? [BEHEER] : [])];
  document.getElementById('nav')?.remove();
  if (!tabs.length) {
    houdSchermAan(false);
    return;
  }

  const open = !zonderTeam && wisselStaatOpen();
  const nav = h('nav', { class: 'nav niet-printen', 'aria-label': 'Hoofdnavigatie' });
  for (const s of tabs) {
    if (s === BEHEER && tabs.length > 1) nav.appendChild(h('i', { class: 'scheiding', 'aria-hidden': 'true' }));
    nav.appendChild(h('button', {
      class: s === BEHEER ? 'beheertab' : null,
      'aria-current': scherm === s.id ? 'page' : null,
      onclick: () => {
        // Nog een keer op Wedstrijden tikken brengt je terug bij de lijst.
        if (s.id === 'opzet' && scherm === 'opzet') wijzig((st) => { st.ui.lijst = true; });
        ganaar(s.id);
      },
    }, icoon(s.ico), s.id === 'live' && open ? h('span', { class: 'punt' }) : null, s.naam));
  }
  nav.id = 'nav';
  document.body.appendChild(nav);

  houdSchermAan(S.instellingen.schermAan && scherm === 'live' && !!S.wedstrijd?.klok?.loopt);
}

// -------------------------------------------------------------- gedeelde link
async function verwerkDeelLink() {
  if (!location.hash || !/[#&][zj]=/.test(location.hash)) return false;
  let data;
  try { data = await leesDeelLink(location.hash); } catch (e) { return false; }
  if (!data || !data.w) return false;
  history.replaceState(null, '', location.pathname + location.search);

  const spelers = (data.s || []).map(([id, naam, nummer, keeper, posities, gast]) =>
    ({ ...nieuweSpeler(naam), id, nummer: nummer || '', keeper: !!keeper, posities: (posities || '').split('').filter(Boolean),
      ...(gast ? { gast: true } : {}) }));
  const formatie = getFormation(data.w.f);
  const naam = (id) => voornaam((spelers.find((q) => q.id === id) || {}).naam);

  toonSheet(`Gedeeld schema`, (c, sluit) => {
    c.appendChild(h('p', { class: 'uitleg' },
      `${data.t || 'Een team'}${data.w.o ? ` tegen ${data.w.o}` : ''} · ${data.w.d || ''} · ${formatie.naam}`));

    const blokken = data.w.bl || [];
    const kop = h('tr', {}, h('th', { class: 'sp' }, 'Speler'),
      ...blokken.map(([van]) => h('th', {}, `${Math.round(van / 60)}'`)), h('th', {}, 'Tot.'));
    const lijf = h('tbody', {});
    for (const sp of spelers) {
      let sec = 0;
      const cellen = blokken.map(([van, tot, opstelling]) => {
        const sid = Object.keys(opstelling || {}).find((k) => opstelling[k] === sp.id);
        const slot = sid ? formatie.slots.find((x) => x.id === sid) : null;
        if (slot) sec += tot - van;
        return h('td', {}, h('span', { class: `cel ${slot ? slot.role : 'bank'}`,
          style: { display: 'grid', placeItems: 'center', minHeight: '34px' } }, slot ? slot.label : 'bank'));
      });
      lijf.appendChild(h('tr', {}, h('td', { class: 'sp' }, voornaam(sp.naam)), ...cellen,
        h('td', { class: 'tot' }, minutenTekst(sec))));
    }
    c.appendChild(h('div', { class: 'schema-wrap' }, h('table', { class: 'schema' }, h('thead', {}, kop), lijf)));

    // Overnemen kan alleen als duidelijk is waar het heen gaat: dit apparaat,
    // of het team dat open staat.
    const kanOvernemen = account.modus === 'lokaal' || (binnen() && account.modus === 'team' && !!account.teamId);
    if (kanOvernemen && account.modus === 'team') {
      c.appendChild(h('p', { class: 'mini', style: { marginTop: '10px' } }, `Overnemen zet dit schema als nieuwe wedstrijd klaar bij ${S.team.naam}.`));
    }
    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '16px' } },
      h('button', { class: 'knop', onclick: sluit }, kanOvernemen ? 'Alleen bekijken' : 'Sluiten'),
      !kanOvernemen ? null : h('button', { class: 'knop primair', style: { flex: '2' }, onclick: () => {
        wijzig((s) => {
          // Een clubteam heet zoals de club het noemt; lokaal nemen we de naam over.
          if (account.modus !== 'team') s.team.naam = data.t || s.team.naam;
          // Gastspelers horen bij de wedstrijd, niet bij het team.
          for (const sp of spelers) if (!sp.gast && !s.team.spelers.some((q) => q.id === sp.id)) s.team.spelers.push(sp);
          const w = nieuweWedstrijd();
          Object.assign(w, {
            datum: data.w.d, tegenstander: data.w.o, formationId: data.w.f,
            periodes: data.w.p, periodeMin: data.w.m, blokkenPerPeriode: data.w.b,
            speelvorm: formatie.speelvorm, selectie: data.w.sel || spelers.map((x) => x.id),
            gasten: spelers.filter((x) => x.gast),
            blokken: blokken.map(([van, tot, opstelling], i) => ({
              id: `gd${i}`, periode: Math.floor(van / (data.w.m * 60)), deel: 0,
              vanSec: van, totSec: tot, vast: false, opstelling: opstelling || {}, bank: [],
            })),
          });
          w.pins = Object.fromEntries(w.blokken.map((b) => [b.id, b.opstelling]));
          s.wedstrijd = w; // een nieuwe wedstrijd in de lijst, naast wat er al gepland stond
          s.ui.lijst = false;
          s.ui.scherm = 'schema';
        }, { terugdraaibaar: true });
        sluit();
        melding('Schema overgenomen');
      } }, 'Overnemen')));
  });
  return true;
}

// --------------------------------------------------------------------- start
export async function start() {
  wortel = document.getElementById('app');
  laadLokaal();
  herstelAccount(); // wie eerder inlogde, ziet meteen zijn team - ook zonder bereik
  abonneer(render);
  render();

  // Eerst weten of er een server is: een gedeeld schema overnemen kan pas
  // als duidelijk is in welk team het terechtkomt.
  if (account.modus === 'verbinden') await verbind();
  else verbind();
  await verwerkDeelLink();

  setInterval(() => { if (S.ui.scherm === 'live' && S.wedstrijd && binnen()) tikLive(); }, 250);

  // Terugkomen uit de achtergrond: de klok loopt door op wandkloktijd, dus
  // even bijwerken zodat het scherm meteen weer klopt. En wat de anderen
  // intussen deden, meteen ophalen in plaats van op het volgende antwoord
  // van de server te wachten.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      wek();
      if (!binnen()) return;
      tikLive();
      houdSchermAan(S.instellingen.schermAan && S.ui.scherm === 'live' && !!S.wedstrijd?.klok?.loopt);
    }
  });
  window.addEventListener('online', wek);
  window.addEventListener('pagehide', () => { bewaarNu(); duwBijAfsluiten(); });
  window.addEventListener('beforeunload', (e) => {
    if (S.wedstrijd?.klok?.loopt) { bewaarNu(); e.preventDefault(); e.returnValue = ''; }
  });
}
