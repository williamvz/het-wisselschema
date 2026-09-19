// De romp: kopbalk, schermkeuze, navigatie en het opstarten.

import { h, icoon, leegmaken, toonSheet, melding, houdSchermAan, minutenTekst, voornaam, datumTekst } from './ui.js';
import { S, wijzig, abonneer, laadLokaal, startSync, plan, klokStand, leesDeelLink, nieuweSpeler, nieuweWedstrijd, bewaarNu } from './store.js';
import { getFormation } from '../lib/formations.js';
import { totaleSpeeltijd } from '../lib/schedule.js';
import { schermTeam } from './scherm-team.js';
import { schermOpzet } from './scherm-opzet.js';
import { schermSchema } from './scherm-schema.js';
import { schermLive, tikLive, actiefBlokIndex } from './scherm-live.js';
import { schermArchief } from './scherm-archief.js';

const SCHERMEN = [
  { id: 'team', naam: 'Team', ico: 'team' },
  { id: 'opzet', naam: 'Wedstrijd', ico: 'opzet' },
  { id: 'schema', naam: 'Schema', ico: 'schema' },
  { id: 'live', naam: 'Live', ico: 'live' },
  { id: 'archief', naam: 'Archief', ico: 'archief' },
];

let wortel = null;

export function ganaar(scherm) {
  wijzig((s) => { s.ui.scherm = scherm; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function ondertitel() {
  const w = S.wedstrijd;
  if (!w) return `${S.team.spelers.length} speler${S.team.spelers.length === 1 ? '' : 's'}`;
  const tegen = w.tegenstander ? `${w.thuis ? 'thuis tegen' : 'uit bij'} ${w.tegenstander}` : datumTekst(w.datum);
  return `${tegen} · ${getFormation(w.formationId).naam}`;
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
  wortel.appendChild(h('header', { class: 'kop' },
    h('div', { class: 'merk', 'aria-hidden': 'true' }, 'W'),
    h('div', { class: 'titel' },
      h('strong', {}, S.team.naam),
      h('small', {}, ondertitel()))));

  const scherm = S.ui.scherm || 'team';
  const inhoud =
    scherm === 'team' ? schermTeam()
    : scherm === 'opzet' ? schermOpzet(ganaar)
    : scherm === 'schema' ? schermSchema(ganaar)
    : scherm === 'live' ? schermLive(ganaar, render)
    : schermArchief();
  wortel.appendChild(inhoud);

  const open = wisselStaatOpen();
  const nav = h('nav', { class: 'nav niet-printen', 'aria-label': 'Hoofdnavigatie' });
  for (const s of SCHERMEN) {
    nav.appendChild(h('button', {
      'aria-current': scherm === s.id ? 'page' : null,
      onclick: () => ganaar(s.id),
    }, icoon(s.ico), s.id === 'live' && open ? h('span', { class: 'punt' }) : null, s.naam));
  }
  document.getElementById('nav')?.remove();
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

  const spelers = (data.s || []).map(([id, naam, nummer, keeper, posities]) =>
    ({ ...nieuweSpeler(naam), id, nummer: nummer || '', keeper: !!keeper, posities: (posities || '').split('').filter(Boolean) }));
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

    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '16px' } },
      h('button', { class: 'knop', onclick: sluit }, 'Alleen bekijken'),
      h('button', { class: 'knop primair', style: { flex: '2' }, onclick: () => {
        wijzig((s) => {
          s.team.naam = data.t || s.team.naam;
          for (const sp of spelers) if (!s.team.spelers.some((q) => q.id === sp.id)) s.team.spelers.push(sp);
          const w = nieuweWedstrijd();
          Object.assign(w, {
            datum: data.w.d, tegenstander: data.w.o, formationId: data.w.f,
            periodes: data.w.p, periodeMin: data.w.m, blokkenPerPeriode: data.w.b,
            speelvorm: formatie.speelvorm, selectie: data.w.sel || spelers.map((x) => x.id),
            blokken: blokken.map(([van, tot, opstelling], i) => ({
              id: `gd${i}`, periode: Math.floor(van / (data.w.m * 60)), deel: 0,
              vanSec: van, totSec: tot, vast: false, opstelling: opstelling || {}, bank: [],
            })),
          });
          w.pins = Object.fromEntries(w.blokken.map((b) => [b.id, b.opstelling]));
          s.wedstrijd = w;
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
  render();

  const gedeeld = await verwerkDeelLink();
  if (!gedeeld) startSync().then((ok) => { if (ok) render(); });

  setInterval(() => { if (S.ui.scherm === 'live' && S.wedstrijd) tikLive(); }, 250);

  // Terugkomen uit de achtergrond: de klok loopt door op wandkloktijd, dus
  // even bijwerken zodat het scherm meteen weer klopt.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { tikLive(); houdSchermAan(S.instellingen.schermAan && S.ui.scherm === 'live' && !!S.wedstrijd?.klok?.loopt); }
  });
  window.addEventListener('pagehide', bewaarNu);
  window.addEventListener('beforeunload', (e) => {
    if (S.wedstrijd?.klok?.loopt) { bewaarNu(); e.preventDefault(); e.returnValue = ''; }
  });

  abonneer(render);
}
