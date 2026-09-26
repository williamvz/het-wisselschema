// Toestand, opslag en tijd.
//
// Alles draait lokaal, zodat de app langs de lijn ook zonder netwerk werkt.
// Zonder account is localStorage de enige opslag. Met een account komen de
// teamgegevens van de server; dan neemt samenwerken.js het bewaren van het
// team over, en houdt deze module alleen bij wat er in het geheugen staat.

import { planWedstrijd, herplan, wisselUitgevoerd, maakBlokken, totaleSpeeltijd } from '../lib/schedule.js';
import { FORMATIONS, getFormation, formationsForSize } from '../lib/formations.js';
import { voegSamen } from '../lib/samenvoegen.js';

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

// ---------------------------------------------------------------------- tijd
// Met een server rekent de klok in servertijd. Dan lopen twee telefoons
// gelijk, ook als de ene een halve minuut verkeerd staat. Zonder server is
// het verschil nul.
const tijd = { verschil: 0 };
export function zetKlokVerschil(ms) { tijd.verschil = Number.isFinite(ms) ? ms : 0; }
export function klokVerschil() { return tijd.verschil; }
export const nu = () => Date.now() + tijd.verschil;

// Hertekenen gebeurt pas in de volgende frame. Dat is niet alleen zuiniger,
// het voorkomt ook een venijnig probleem: een tik op een knop laat eerst het
// invoerveld zijn focus verliezen, dat vuurt `change`, en als we daarop meteen
// de hele DOM herbouwen is de knop verdwenen voordat de klik hem bereikt.
//
// Wijzigingen van een andere telefoon wachten bovendien tot je klaar bent met
// typen: anders verdwijnt het veld onder je vingers.
let meldingGepland = false;
let wachtOpTypen = false;
function meldLuisteraars({ vanAfstand = false } = {}) {
  if (vanAfstand && aanHetTypen()) {
    if (!wachtOpTypen) {
      wachtOpTypen = true;
      document.activeElement.addEventListener('blur', () => { wachtOpTypen = false; meldLuisteraars(); }, { once: true });
    }
    return;
  }
  if (meldingGepland) return;
  meldingGepland = true;
  const uitvoeren = () => { meldingGepland = false; for (const l of luisteraars) l(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(uitvoeren);
  else setTimeout(uitvoeren, 0);
}

function aanHetTypen() {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el || !el.closest || !el.closest('#app')) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'file'].includes(el.type);
}

/** Opnieuw tekenen zonder dat er iets aan de gegevens verandert (bv. inloggen gelukt). */
export function herteken() { meldLuisteraars(); }

/** Enige route waarlangs de toestand verandert: muteren, bewaren, hertekenen. */
export function wijzig(fn, opties = {}) {
  // Met een account ook bij gewone stappen vergelijken: dan staat de stip in
  // de kopbalk meteen op "nog niet verstuurd", en niet pas als de
  // verzending begint.
  const voor = opties.terugdraaibaar || teamOpslag ? teamJson() : null;
  const tijden = tijdInfo();
  const uitkomst = fn(S);
  tijdstempels(tijden, opties);
  if (voor !== null) {
    const na = teamJson();
    if (na !== voor) {
      if (opties.terugdraaibaar) {
        momenten.push({ voor, na, wedstrijdId: S.wedstrijd?.id ?? null });
        if (momenten.length > 40) momenten.shift();
      }
      if (teamOpslag) teamOpslag.gewijzigd();
    }
  }
  teller += 1;
  S.gewijzigdOp = Date.now();
  planCache = null;
  bewaarLater();
  meldLuisteraars();
  return uitkomst;
}

// Als twee telefoons allebei de klok of het schema veranderden, wint de
// laatste (zie samenvoegen.js). Daarvoor onthoudt de wedstrijd wanneer dat
// was. Automatisch, zodat geen enkele knop het kan vergeten.
//
// Behalve wat de klok vanzelf doet (`vanzelf`): stoppen aan het eind van een
// periode is geen beslissing van een trainer. Een telefoon die een tijd
// offline stond en de oude klok zelf heeft laten doorlopen, mag daarmee
// niet winnen van wat een collega intussen echt met de klok deed.
function tijdInfo() {
  const w = S.wedstrijd;
  return w ? { id: w.id, klok: JSON.stringify(w.klok ?? null), schema: JSON.stringify([w.blokken ?? null, w.pins ?? null]) } : null;
}
function tijdstempels(voor, { vanzelf = false } = {}) {
  const w = S.wedstrijd;
  if (!w) return;
  const nieuw = !voor || voor.id !== w.id;
  if (w.klok && !vanzelf && (nieuw || JSON.stringify(w.klok) !== voor.klok)) w.klok = { ...w.klok, bijgewerkt: nu() };
  if (nieuw || JSON.stringify([w.blokken ?? null, w.pins ?? null]) !== voor.schema) w.planMs = nu();
}

// ------------------------------------------------------------- teamgegevens
// Het deel van de toestand dat bij een team hoort en met een server wordt
// gedeeld. Instellingen en het scherm waar je staat zijn van dit apparaat.
const teamJson = () => JSON.stringify({ team: S.team, wedstrijd: S.wedstrijd ?? null, archief: S.archief });
export function teamDeel() { return JSON.parse(teamJson()); }

function zetTeam(bron) {
  // Altijd een eigen kopie: wat er binnenkomt, is ook de basis waarmee de
  // samenwerkmodule vergelijkt. Deelden ze een object, dan veranderde de
  // basis stilletjes mee en werd een nieuwe goal nooit verstuurd.
  const doc = JSON.parse(JSON.stringify(bron));
  const team = doc.team && typeof doc.team === 'object' ? doc.team : {};
  S.team = { ...team, naam: team.naam || 'Mijn team', spelers: Array.isArray(team.spelers) ? team.spelers : [] };
  S.wedstrijd = doc.wedstrijd ?? null;
  S.archief = Array.isArray(doc.archief) ? doc.archief : [];
}

/**
 * Vervangt de teamgegevens: bij het openen van een ander team, of met wat er
 * van een andere telefoon binnenkwam (`vanAfstand`). Dat laatste is geen
 * eigen stap: ongedaan maken blijft dan gewoon werken.
 */
export function laadTeamDeel(doc, { vanAfstand = false } = {}) {
  const wedstrijdId = S.wedstrijd?.id ?? null;
  zetTeam(doc);
  // Een ander team, of een andere wedstrijd van een collega: wat je eerder
  // deed, is dan niet meer terug te draaien.
  if (!vanAfstand || (S.wedstrijd?.id ?? null) !== wedstrijdId) momenten.length = 0;
  teller += 1;
  planCache = null;
  bewaarLater();
  meldLuisteraars({ vanAfstand });
}

// ------------------------------------------------------------- ongedaan maken
// Per stap de teamgegevens ervoor en erna. Terugdraaien is samenvoegen: haal
// weg wat deze stap veranderde, en laat staan wat er daarna gebeurde - ook
// als dat de goal van een collega op een andere telefoon was.
const momenten = [];
// Alleen stappen in de wedstrijd die nu open staat: na het afronden van de
// vorige draai je die niet meer terug vanuit de nieuwe.
const actueel = (m) => m.wedstrijdId === (S.wedstrijd?.id ?? null);
export function kanTerug() { return momenten.length > 0 && actueel(momenten[momenten.length - 1]); }
export function draaiTerug() {
  const m = momenten.pop();
  if (!m) return false;
  if (!actueel(m)) { momenten.length = 0; return false; }
  const tijden = tijdInfo();
  zetTeam(voegSamen(JSON.parse(m.na), JSON.parse(m.voor), teamDeel()));
  tijdstempels(tijden);
  teller += 1; planCache = null; bewaarLater();
  meldLuisteraars();
  return true;
}

// -------------------------------------------------------------------- opslag
// Met een account neemt samenwerken.js het bewaren van het team over. Wat er
// lokaal stond, blijft dan onaangeroerd in localStorage staan, en komt
// terug na het uitloggen.
let teamOpslag = null;
let lokaal = null;

export function gebruikTeamOpslag(opslag) {
  if (opslag && !teamOpslag) lokaal = JSON.parse(JSON.stringify(exporteer()));
  if (!opslag && teamOpslag && lokaal) {
    zetTeam(lokaal);
    momenten.length = 0;
    planCache = null;
    teller += 1;
  }
  teamOpslag = opslag || null;
}

/** De gegevens die op dit apparaat stonden van voor het inloggen (of null). */
export function lokaleGegevens() { return teamOpslag ? lokaal : null; }

/** Staat er een team van de server open? Dan is de teamnaam die van de club. */
export function metServer() { return !!teamOpslag; }

let bewaarTimer = null;
function bewaarLater() {
  clearTimeout(bewaarTimer);
  bewaarTimer = setTimeout(bewaarNu, 250);
}
export function bewaarNu() {
  clearTimeout(bewaarTimer);
  try {
    localStorage.setItem(SLEUTEL, JSON.stringify(teamOpslag ? { ...lokaal, instellingen: S.instellingen } : exporteer()));
  } catch (e) { /* privémodus of vol: de app werkt door, alleen zonder onthouden */ }
  if (teamOpslag) teamOpslag.bewaar();
}
export function exporteer() {
  return { versie: VERSIE, team: S.team, wedstrijd: S.wedstrijd, archief: S.archief, instellingen: S.instellingen, gewijzigdOp: S.gewijzigdOp };
}
export function neemOver(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.team) {
    S.team = {
      // Een back-up terugzetten in een clubteam hernoemt dat team niet.
      naam: teamOpslag ? S.team.naam : (data.team.naam || 'Mijn team'),
      spelers: (data.team.spelers || []).map((p) => ({ ...nieuweSpeler(), ...p })),
    };
  }
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
  const sec = k.loopt && k.sindsMs ? k.verstreken + (nu() - k.sindsMs) / 1000 : k.verstreken;
  return Math.max(0, Math.min(sec, totaleSpeeltijd(w)));
}
export function klokStart() {
  wijzig((s) => { s.wedstrijd.klok = { ...s.wedstrijd.klok, loopt: true, sindsMs: nu(), pauzeReden: null };
    if (s.wedstrijd.status === 'opzet') s.wedstrijd.status = 'bezig'; });
}
export function klokPauze(reden = null) {
  wijzig((s) => { s.wedstrijd.klok = { ...s.wedstrijd.klok, verstreken: klokStand(s.wedstrijd), loopt: false, sindsMs: null, pauzeReden: reden }; });
}
/** Periode afgelopen: klok precies op de grens zetten en stoppen, in één stap. */
export function klokAutoPauze(grens, reden) {
  wijzig((s) => {
    s.wedstrijd.klok = { ...s.wedstrijd.klok, verstreken: grens, loopt: false, sindsMs: null, pauzeReden: reden, laatsteGrens: grens };
  }, { vanzelf: true });
}
export function klokZet(sec) {
  wijzig((s) => {
    const w = s.wedstrijd;
    const nieuw = Math.max(0, sec);
    // Wie de klok verzet, heeft de grenzen tot daar zelf al gehad: niet
    // meteen weer stoppen op een grens waar je net overheen sprong.
    w.klok = { ...w.klok, verstreken: nieuw, sindsMs: w.klok.loopt ? nu() : null, laatsteGrens: vorigeGrens(w, nieuw) };
  });
}

const vorigeGrens = (w, t) => Math.floor(t / (w.periodeMin * 60)) * w.periodeMin * 60;

/**
 * Moet de klok nu vanzelf stoppen, omdat hij over het eind van een periode
 * liep? Dan die grens, anders null. Ook als de telefoon even in je zak zat
 * en de grens al een tijdje voorbij is: de scheidsrechter floot toen ook.
 */
export function periodeGrens(w, t = klokStand(w)) {
  if (!w || !w.klok || !w.klok.loopt || !(w.periodeMin > 0)) return null;
  const grens = Math.min(totaleSpeeltijd(w), vorigeGrens(w, t));
  const gehad = w.klok.laatsteGrens ?? vorigeGrens(w, w.klok.verstreken || 0);
  return grens > 0 && grens > gehad ? grens : null;
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
