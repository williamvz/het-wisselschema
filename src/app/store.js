// Toestand, opslag en synchronisatie.
//
// Alles draait lokaal. localStorage is de waarheid; een server (de Home
// Assistant-add-on) is optioneel en wordt alleen gebruikt als hij er is.
// Zo blijft de app langs de lijn werken zonder netwerk.

import { planWedstrijd, herplan, wisselUitgevoerd, maakBlokken, totaleSpeeltijd } from '../lib/schedule.js';
import { FORMATIONS, getFormation, formationsForSize } from '../lib/formations.js';

export const SLEUTEL = 'wisselschema.v1';
export const VERSIE = 1;

export function uid(pre = 'x') {
  return `${pre}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const vandaag = () => new Date().toISOString().slice(0, 10);

export function nieuweSpeler(naam = '') {
  return { id: uid('s'), naam, nummer: '', keeper: false, posities: [], sterkte: 3, saldoSec: 0, actief: true };
}

export function nieuweWedstrijd(vorige = null) {
  return {
    id: uid('w'), datum: vandaag(), tegenstander: '', thuis: true,
    formationId: vorige?.formationId ?? '6-1-2-2-1',
    // Speelvorm volgt uit de opstelling, anders lopen ze uiteen als je een
    // wedstrijd overneemt uit het archief (dat bewaart alleen de opstelling).
    speelvorm: getFormation(vorige?.formationId ?? '6-1-2-2-1').speelvorm,
    periodes: vorige?.periodes ?? 4,
    periodeMin: vorige?.periodeMin ?? 15,
    blokkenPerPeriode: vorige?.blokkenPerPeriode ?? 1,
    selectie: [], beschikbaar: {}, blokken: null, pins: {},
    opties: { seed: Math.floor(Math.random() * 1e6), vormAccent: 0, saldoGewicht: 0.6 },
    status: 'opzet',
    klok: { loopt: false, verstreken: 0, sindsMs: null, pauzeReden: null },
    gebeurtenissen: [],
    doelpunten: [],
  };
}

const leeg = () => ({
  versie: VERSIE,
  team: { naam: 'Mijn team', spelers: [] },
  wedstrijd: null,
  archief: [],
  instellingen: { thema: 'auto', geluid: true, trillen: true, schermAan: true, syncUrl: '' },
  ui: { scherm: 'team' },
  gewijzigdOp: 0,
});

export const S = leeg();
let teller = 0;
const luisteraars = new Set();

export function abonneer(fn) { luisteraars.add(fn); return () => luisteraars.delete(fn); }
export function stempel() { return teller; }

// Hertekenen gebeurt pas in de volgende frame. Dat is niet alleen zuiniger,
// het voorkomt ook een venijnig probleem: een tik op een knop laat eerst het
// invoerveld zijn focus verliezen, dat vuurt `change`, en als we daarop meteen
// de hele DOM herbouwen is de knop verdwenen voordat de klik hem bereikt.
let meldingGepland = false;
function meldLuisteraars() {
  if (meldingGepland) return;
  meldingGepland = true;
  const uitvoeren = () => { meldingGepland = false; for (const l of luisteraars) l(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(uitvoeren);
  else setTimeout(uitvoeren, 0);
}

/** Enige route waarlangs de toestand verandert: muteren, bewaren, hertekenen. */
export function wijzig(fn, opties = {}) {
  if (opties.terugdraaibaar) bewaarMoment();
  const uitkomst = fn(S);
  teller += 1;
  S.gewijzigdOp = Date.now();
  planCache = null;
  bewaarLater();
  meldLuisteraars();
  return uitkomst;
}

// ------------------------------------------------------------- ongedaan maken
const momenten = [];
function bewaarMoment() {
  if (!S.wedstrijd) return;
  momenten.push(JSON.stringify({ wedstrijd: S.wedstrijd, spelers: S.team.spelers }));
  if (momenten.length > 40) momenten.shift();
}
export function kanTerug() { return momenten.length > 0; }
export function draaiTerug() {
  const m = momenten.pop();
  if (!m) return false;
  const d = JSON.parse(m);
  S.wedstrijd = d.wedstrijd;
  S.team.spelers = d.spelers;
  teller += 1; planCache = null; bewaarLater();
  meldLuisteraars();
  return true;
}

// -------------------------------------------------------------------- opslag
let bewaarTimer = null;
function bewaarLater() {
  clearTimeout(bewaarTimer);
  bewaarTimer = setTimeout(bewaarNu, 250);
}
export function bewaarNu() {
  try {
    localStorage.setItem(SLEUTEL, JSON.stringify(exporteer()));
  } catch (e) { /* privémodus of vol: de app werkt door, alleen zonder onthouden */ }
  duwNaarServer();
}
export function exporteer() {
  return { versie: VERSIE, team: S.team, wedstrijd: S.wedstrijd, archief: S.archief, instellingen: S.instellingen, gewijzigdOp: S.gewijzigdOp };
}
export function neemOver(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.team) S.team = { naam: data.team.naam || 'Mijn team', spelers: (data.team.spelers || []).map((p) => ({ ...nieuweSpeler(), ...p })) };
  if ('wedstrijd' in data) S.wedstrijd = data.wedstrijd;
  if (data.archief) S.archief = data.archief;
  if (data.instellingen) S.instellingen = { ...S.instellingen, ...data.instellingen };
  S.gewijzigdOp = data.gewijzigdOp || Date.now();
  planCache = null;
  return true;
}
export function laadLokaal() {
  try {
    const ruw = localStorage.getItem(SLEUTEL);
    if (ruw) neemOver(JSON.parse(ruw));
  } catch (e) { /* onleesbaar: we beginnen schoon in plaats van te crashen */ }
}

// ---------------------------------------------------------------- server-sync
// Wordt alleen actief als er echt iets luistert op het sync-adres. Faalt stil.
export const sync = { actief: false, adres: null, bezig: false, laatst: null, fout: null };

function syncAdres() {
  const eigen = (S.instellingen.syncUrl || '').trim();
  if (eigen) return eigen.replace(/\/$/, '');
  if (typeof location !== 'undefined' && /^https?:/.test(location.protocol)) {
    return new URL('api/state', location.href.replace(/[^/]*$/, '')).toString();
  }
  return null;
}

export async function startSync() {
  const adres = syncAdres();
  if (!adres) return false;
  try {
    const r = await fetch(adres, { headers: { accept: 'application/json' } });
    if (!r.ok) return false;
    const opAfstand = await r.json();
    sync.actief = true; sync.adres = adres; sync.laatst = Date.now();
    if (opAfstand && (opAfstand.gewijzigdOp || 0) > (S.gewijzigdOp || 0)) {
      neemOver(opAfstand);
      teller += 1;
      meldLuisteraars();
    } else {
      duwNaarServer();
    }
    return true;
  } catch (e) { sync.fout = String(e.message || e); return false; }
}

let duwTimer = null;
function duwNaarServer() {
  if (!sync.actief || !sync.adres) return;
  clearTimeout(duwTimer);
  duwTimer = setTimeout(async () => {
    sync.bezig = true;
    try {
      await fetch(sync.adres, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(exporteer()) });
      sync.laatst = Date.now(); sync.fout = null;
    } catch (e) { sync.fout = String(e.message || e); }
    sync.bezig = false;
  }, 1200);
}

// ----------------------------------------------------------------- planning
let planCache = null;
export function plan() {
  if (!S.wedstrijd) return null;
  if (!planCache) planCache = planWedstrijd(S.wedstrijd, S.team.spelers);
  return planCache;
}

/** Zet het schema vast in de wedstrijd zelf (zodat historie bewaard blijft). */
export function leginSchema() {
  const p = plan();
  if (p) S.wedstrijd.blokken = p.blokken;
}

export function genereer({ nieuweSeed = false } = {}) {
  wijzig((s) => {
    if (!s.wedstrijd) return;
    if (nieuweSeed) s.wedstrijd.opties.seed = Math.floor(Math.random() * 1e6);
    s.wedstrijd.blokken = maakBlokken(s.wedstrijd);
    s.wedstrijd.pins = {};
    planCache = null;
    const p = planWedstrijd(s.wedstrijd, s.team.spelers);
    s.wedstrijd.blokken = p.blokken;
  });
}

export function herplanNu(opSec, wijzigingen = []) {
  wijzig((s) => {
    const res = herplan(s.wedstrijd, s.team.spelers, { opSec, wijzigingen });
    s.wedstrijd = { ...s.wedstrijd, ...res.match };
  }, { terugdraaibaar: true });
}

export function bevestigWissel(blokIndex, opSec) {
  wijzig((s) => {
    const res = wisselUitgevoerd(s.wedstrijd, s.team.spelers, blokIndex, opSec);
    s.wedstrijd = { ...s.wedstrijd, ...res.match };
  }, { terugdraaibaar: true });
}

// -------------------------------------------------------------------- score
/**
 * Noteer een doelpunt op de huidige klokstand, met wie er op dat moment in
 * het veld stond. Dat is het blok dat nog niet is afgetekend: zolang een
 * wissel niet is uitgevoerd, staat de oude opstelling er echt nog.
 */
export function noteerGoal(wie) {
  wijzig((s) => {
    const w = s.wedstrijd;
    if (!w) return;
    const blokken = plan()?.blokken || w.blokken || [];
    const i = blokken.findIndex((b) => !b.vast);
    const blok = blokken[i < 0 ? blokken.length - 1 : i];
    w.doelpunten = [...(w.doelpunten || []), {
      id: uid('g'), wie, sec: Math.round(klokStand(w)),
      opVeld: blok ? Object.values(blok.opstelling).filter(Boolean) : [],
    }];
  }, { terugdraaibaar: true });
}

export function schrapGoal(id) {
  wijzig((s) => {
    if (s.wedstrijd) s.wedstrijd.doelpunten = (s.wedstrijd.doelpunten || []).filter((d) => d.id !== id);
  }, { terugdraaibaar: true });
}

// --------------------------------------------------------------------- klok
export function klokStand(w = S.wedstrijd) {
  if (!w) return 0;
  const k = w.klok;
  const sec = k.loopt && k.sindsMs ? k.verstreken + (Date.now() - k.sindsMs) / 1000 : k.verstreken;
  return Math.max(0, Math.min(sec, totaleSpeeltijd(w)));
}
export function klokStart() {
  wijzig((s) => { s.wedstrijd.klok = { ...s.wedstrijd.klok, loopt: true, sindsMs: Date.now(), pauzeReden: null };
    if (s.wedstrijd.status === 'opzet') s.wedstrijd.status = 'bezig'; });
}
export function klokPauze(reden = null) {
  wijzig((s) => { s.wedstrijd.klok = { verstreken: klokStand(s.wedstrijd), loopt: false, sindsMs: null, pauzeReden: reden }; });
}
/** Periode afgelopen: klok precies op de grens zetten en stoppen, in één stap. */
export function klokAutoPauze(grens, reden) {
  wijzig((s) => {
    s.wedstrijd.klok = { verstreken: grens, loopt: false, sindsMs: null, pauzeReden: reden, laatsteGrens: grens };
  });
}
export function klokZet(sec) {
  wijzig((s) => { s.wedstrijd.klok = { ...s.wedstrijd.klok, verstreken: Math.max(0, sec), sindsMs: s.wedstrijd.klok.loopt ? Date.now() : null }; });
}

// ---------------------------------------------------------------- archiveren
/** Sluit de wedstrijd af en verwerk de speeltijd in het seizoenssaldo. */
export function rondAf() {
  wijzig((s) => {
    const w = s.wedstrijd;
    if (!w) return;
    const p = planWedstrijd(w, s.team.spelers);
    const gemiddeld = p.statistieken.reduce((a, x) => a + x.speelSec, 0) / (p.statistieken.length || 1);
    for (const st of p.statistieken) {
      const speler = s.team.spelers.find((q) => q.id === st.spelerId);
      if (speler) speler.saldoSec = Math.round((speler.saldoSec || 0) + (st.speelSec - gemiddeld));
    }
    s.archief.unshift({
      id: w.id, datum: w.datum, tegenstander: w.tegenstander, thuis: w.thuis,
      formationId: w.formationId, periodes: w.periodes, periodeMin: w.periodeMin,
      statistieken: p.statistieken, blokken: w.blokken, selectie: w.selectie,
      doelpunten: w.doelpunten || [],
    });
    s.archief = s.archief.slice(0, 60);
    s.wedstrijd = null;
    s.ui.scherm = 'archief';
  }, { terugdraaibaar: true });
}

// ------------------------------------------------------------------ delen
/** Comprimeert het team + schema in een URL-fragment, zodat je het kunt appen. */
export async function deelLink() {
  const kern = {
    t: S.team.naam,
    s: S.team.spelers.filter((p) => (S.wedstrijd?.selectie || []).includes(p.id))
      .map((p) => [p.id, p.naam, p.nummer, p.keeper ? 1 : 0, (p.posities || []).join('')]),
    w: S.wedstrijd && {
      d: S.wedstrijd.datum, o: S.wedstrijd.tegenstander, f: S.wedstrijd.formationId,
      p: S.wedstrijd.periodes, m: S.wedstrijd.periodeMin, b: S.wedstrijd.blokkenPerPeriode,
      sel: S.wedstrijd.selectie, bl: (S.wedstrijd.blokken || []).map((x) => [x.vanSec, x.totSec, x.opstelling]),
    },
  };
  const json = JSON.stringify(kern);
  let bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'function') {
    try {
      const cs = new CompressionStream('deflate-raw');
      const stroom = new Blob([bytes]).stream().pipeThrough(cs);
      bytes = new Uint8Array(await new Response(stroom).arrayBuffer());
      return `${schoonAdres()}#z=${naarBase64Url(bytes)}`;
    } catch (e) { /* val terug op onverpakt */ }
  }
  return `${schoonAdres()}#j=${naarBase64Url(bytes)}`;
}

export async function leesDeelLink(hash) {
  const m = /[#&](z|j)=([A-Za-z0-9\-_]+)/.exec(hash || '');
  if (!m) return null;
  let bytes = vanBase64Url(m[2]);
  if (m[1] === 'z') {
    const ds = new DecompressionStream('deflate-raw');
    bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

const schoonAdres = () => (typeof location === 'undefined' ? '' : location.href.split('#')[0]);
function naarBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function vanBase64Url(t) {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export { FORMATIONS, getFormation, formationsForSize, totaleSpeeltijd };
