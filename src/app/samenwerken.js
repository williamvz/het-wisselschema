// Samenwerken: inloggen, teams kiezen, en één team gelijk houden op meerdere
// telefoons.
//
// Elke telefoon heeft zijn eigen kopie van het team en past wijzigingen
// meteen toe; langs de lijn wacht je niet op een server. Daarna gaan ze naar
// de server, die per team een versienummer bijhoudt. Wie iets stuurt, zegt op
// welke versie het gebaseerd is. Was iemand anders je net voor, dan krijg je
// de nieuwe stand terug, voeg je samen (zie lib/samenvoegen.js) en stuur je
// opnieuw. Zo gaat er niets verloren, ook niet na een kwartier zonder bereik.
//
// Om wijzigingen van anderen snel te zien, staat er steeds één verzoek open
// (long polling): de server antwoordt zodra er iets verandert, of na 25
// seconden met "niets nieuws". Dat werkt door elke proxy heen, ook door de
// ingress van Home Assistant en door een Cloudflare-tunnel.

import { S, wijzig, herteken, gebruikTeamOpslag, laadTeamDeel, teamDeel, zetKlokVerschil, klokVerschil } from './store.js';
import { vraag, vraagBijAfsluiten, zetServer, zetToken, paginaServer, normaliseerAdres, vergeetKlok } from './api.js';
import { voegSamen, gelijk } from '../lib/samenvoegen.js';

const ACCOUNT = 'wisselschema.account';
const CACHE = 'wisselschema.team.';
const DELEN = ['team', 'wedstrijd', 'archief'];
const WACHT = 25; // seconden dat een verzoek op een wijziging mag wachten

/** Alles wat de schermen over het account en de verbinding moeten weten. */
export const account = {
  modus: 'lokaal',      // lokaal | verbinden | inrichten | inloggen | team
  server: null,         // basisadres van de server
  status: null,         // antwoord van api/status
  handmatig: false,     // server zelf ingevuld, niet de server van deze pagina
  gebruiker: null,      // { id, naam, gebruikersnaam, beheerder }
  teams: [],            // [{ id, naam, lid, leden: [{ id, naam }] }]
  teamId: null,
  verbinding: 'uit',    // uit | ok | offline
  onverstuurd: false,   // er staan wijzigingen klaar die de server nog niet heeft
  aanwezig: [],         // wie er verder naar dit team kijkt
  sessieVerlopen: false,
  melding: null,        // eenmalige mededeling bovenin
};

// De synchronisatie van het team dat open staat.
const ts = {
  teamId: null,
  basis: null,        // laatst bekende stand op de server
  versie: 0,
  bezig: false,       // er is een verzending onderweg
  timer: null,
  luisteraar: null,   // AbortController van het openstaande verzoek
  wekker: null,       // maakt een wachtende herhaalpoging meteen wakker
  generatie: 0,       // bij elk ander team +1: oude lussen stoppen dan vanzelf
  fouten: 0,
  geweigerd: false,   // de server wees de laatste wijziging af; niet blijven proberen
  wacht: WACHT,       // korter als een proxy lange verzoeken afkapt (en dat blijft zo)
};

const opslag = {
  bewaar() { bewaarCache(); planDuw(); },
  gewijzigd() { if (ts.teamId) zetOnverstuurd(true); },
};

// ------------------------------------------------------------ opslaan
function bewaarAccount() {
  try {
    localStorage.setItem(ACCOUNT, JSON.stringify({
      server: account.server, handmatig: account.handmatig, token: account.token,
      gebruiker: account.gebruiker, teams: account.teams, teamId: account.teamId, klokVerschil: klokVerschil(),
    }));
  } catch (e) { /* zonder opslag werkt het ook, alleen log je de volgende keer opnieuw in */ }
}

function leesAccount() {
  try { return JSON.parse(localStorage.getItem(ACCOUNT)); } catch (e) { return null; }
}

function wisCaches() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE)) localStorage.removeItem(k);
    }
  } catch (e) { /* niets aan te doen */ }
}

function leesCache(teamId) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE + teamId));
    if (c && c.gebruikerId === account.gebruiker?.id) return c;
  } catch (e) { /* onleesbaar: opnieuw ophalen */ }
  return null;
}

function bewaarCache() {
  if (!ts.teamId || account.modus !== 'team') return;
  const staat = teamDeel();
  try {
    localStorage.setItem(CACHE + ts.teamId, JSON.stringify({
      gebruikerId: account.gebruiker?.id, versie: ts.versie, staat,
      basis: ts.basis && gelijk(staat, ts.basis) ? 'zelfde' : ts.basis,
    }));
  } catch (e) { /* vol: de server heeft het, of krijgt het straks */ }
}

// ------------------------------------------------------------- opstarten
/**
 * Synchroon, vóór de eerste tekening: wie eerder inlogde, ziet meteen zijn
 * team - ook zonder bereik. De server wordt daarna op de achtergrond gevraagd.
 */
export function herstelAccount() {
  const a = leesAccount();
  if (a && a.token && a.server) {
    zetServer(a.server);
    zetToken(a.token);
    zetKlokVerschil(a.klokVerschil || 0);
    Object.assign(account, {
      modus: 'team', server: a.server, handmatig: !!a.handmatig, token: a.token,
      gebruiker: a.gebruiker, teams: a.teams || [],
    });
    gebruikTeamOpslag(opslag);
    const id = kiesStartTeam(a.teamId);
    if (id) openTeam(id);
    return;
  }
  if (eigenAdres()) account.modus = 'verbinden';
}

/** Op de achtergrond: de server zoeken, of het account bijwerken. */
export async function verbind() {
  if (account.modus === 'team') { await vernieuwIk(); return; }
  const adres = eigenAdres();
  if (!adres) { account.modus = 'lokaal'; herteken(); return; }
  await zoekServer(adres, { handmatig: !!normaliseerAdres(S.instellingen.syncUrl) });
}

function eigenAdres() {
  return normaliseerAdres(S.instellingen.syncUrl) || paginaServer();
}

async function zoekServer(adres, { handmatig = false } = {}) {
  zetServer(adres);
  let st = null;
  try { st = await vraag('api/status', { tijdslimiet: 6000 }); } catch (e) { st = null; }
  if (st && st.app === 'het-wisselschema' && st.api >= 2) {
    Object.assign(account, { server: adres, status: st, handmatig, modus: st.ingericht ? 'inloggen' : 'inrichten' });
    herteken();
    return true;
  }
  zetServer(null);
  vergeetKlok();
  account.modus = 'lokaal';
  herteken();
  return false;
}

/** Vanuit de instellingen: met een server verbinden. */
export async function verbindMet(invoer) {
  const adres = normaliseerAdres(invoer);
  if (!adres) return false;
  const ok = await zoekServer(adres, { handmatig: true });
  if (ok) wijzig((s) => { s.instellingen.syncUrl = adres; });
  return ok;
}

/** Terug naar alleen dit apparaat (als de server met de hand was ingevuld). */
export function terugNaarLokaal() {
  zetServer(null);
  vergeetKlok();
  Object.assign(account, { modus: 'lokaal', server: null, status: null, handmatig: false });
  wijzig((s) => { s.instellingen.syncUrl = ''; });
}

// ------------------------------------------------------------- inloggen
export async function inloggen(gebruikersnaam, wachtwoord) {
  naInloggen(await vraag('api/inloggen', { methode: 'POST', data: { gebruikersnaam, wachtwoord } }));
}

export async function inrichten(gegevens) {
  naInloggen(await vraag('api/inrichten', { methode: 'POST', data: gegevens }));
}

/** Wachtwoord kwijt: een nieuw met de herstelcode uit het logboek van de server. */
export async function herstellen(gegevens) {
  naInloggen(await vraag('api/herstellen', { methode: 'POST', data: gegevens }));
}

function naInloggen({ token, gebruiker, teams }) {
  // Opnieuw inloggen na een verlopen sessie: de wijzigingen van daarvoor
  // staan nog in de cache en gaan alsnog mee.
  const zelfde = account.gebruiker && account.gebruiker.id === gebruiker.id;
  if (!zelfde) wisCaches();
  zetToken(token);
  const vorigTeam = zelfde ? account.teamId : null;
  Object.assign(account, {
    modus: 'team', token, gebruiker, teams: teams || [], teamId: null,
    sessieVerlopen: false, melding: null,
  });
  if (!zelfde) S.ui.scherm = 'team';
  gebruikTeamOpslag(opslag);
  const id = kiesStartTeam(vorigTeam);
  bewaarAccount();
  if (id) openTeam(id); else { stopTeam(); herteken(); }
}

export async function uitloggen() {
  try { await vraag('api/uitloggen', { methode: 'POST', tijdslimiet: 4000 }); } catch (e) { /* toch lokaal uitloggen */ }
  stopTeam();
  wisCaches();
  try { localStorage.removeItem(ACCOUNT); } catch (e) { /* niets aan te doen */ }
  zetToken(null);
  vergeetKlok();
  Object.assign(account, {
    modus: account.server ? 'inloggen' : 'lokaal', token: null, gebruiker: null, teams: [], teamId: null,
    aanwezig: [], onverstuurd: false, verbinding: 'uit', sessieVerlopen: false, melding: null,
  });
  gebruikTeamOpslag(null); // de lokale gegevens komen terug
  S.ui.scherm = 'team';
  herteken();
}

export async function wijzigWachtwoord(huidig, nieuw) {
  await vraag('api/ik/wachtwoord', { methode: 'POST', data: { huidig, nieuw } });
}

/** Wie ben ik en welke teams zie ik - na inloggen, en als je het teamlijstje opent. */
export async function vernieuwIk() {
  if (account.modus !== 'team' || account.sessieVerlopen) return;
  try {
    const r = await vraag('api/ik');
    account.gebruiker = r.gebruiker;
    account.teams = r.teams || [];
    bewaarAccount();
    if (account.teamId && !account.teams.some((t) => t.id === account.teamId)) teamKwijt(account.teamId);
    else if (!account.teamId) { const id = kiesStartTeam(null); if (id) openTeam(id); }
    herteken();
  } catch (e) {
    if (e.status === 401) sessieVerlopen();
  }
}

function sessieVerlopen() {
  account.sessieVerlopen = true;
  ts.generatie += 1; // lussen stoppen; wat je nu doet blijft in de cache staan
  ts.luisteraar?.abort();
  herteken();
}

// ----------------------------------------------------------------- teams
function kiesStartTeam(voorkeur) {
  if (voorkeur && account.teams.some((t) => t.id === voorkeur)) return voorkeur;
  return (account.teams.find((t) => t.lid) || account.teams[0] || {}).id || null;
}

const teamNaam = (id) => (account.teams.find((t) => t.id === id) || {}).naam || 'Team';
const leegTeam = (naam) => ({ team: { naam, spelers: [] }, wedstrijd: null, archief: [] });

export function kiesTeam(id) {
  if (id === account.teamId) return;
  // Wat er nog klaarstond, gaat nog weg. Lukt dat niet, dan staat het in de
  // cache en gaat het mee als dit team weer open gaat.
  bewaarCache();
  duw();
  openTeam(id);
}

function openTeam(id) {
  stopTeam();
  ts.teamId = id;
  account.teamId = id;
  account.aanwezig = [];
  const c = leesCache(id);
  ts.basis = c ? (c.basis === 'zelfde' ? c.staat : c.basis) : null;
  ts.versie = c && ts.basis ? c.versie : 0;
  laadTeamDeel(c ? c.staat : leegTeam(teamNaam(id)));
  account.onverstuurd = !!(ts.basis && !gelijk(teamDeel(), ts.basis));
  bewaarAccount();
  luister(ts.generatie);
}

function stopTeam() {
  ts.generatie += 1;
  ts.luisteraar?.abort();
  ts.wekker?.();
  clearTimeout(ts.timer);
  Object.assign(ts, { teamId: null, basis: null, versie: 0, bezig: false, fouten: 0, geweigerd: false });
}

function teamKwijt(id) {
  const naam = teamNaam(id);
  account.teams = account.teams.filter((t) => t.id !== id);
  try { localStorage.removeItem(CACHE + id); } catch (e) { /* niets aan te doen */ }
  if (account.teamId === id) {
    stopTeam();
    account.teamId = null;
    const volgende = kiesStartTeam(null);
    if (volgende) openTeam(volgende);
    else laadTeamDeel(leegTeam(''));
  }
  bewaarAccount();
  account.melding = `Je hebt geen toegang meer tot ${naam}.`;
  herteken();
}

/** Na een wijziging in het beheer: teamlijst bijwerken en zo nodig een team openen. */
export async function naBeheer(nieuwTeamId = null) {
  await vernieuwIk();
  if (nieuwTeamId && account.teams.some((t) => t.id === nieuwTeamId)) kiesTeam(nieuwTeamId);
}

// ------------------------------------------------------------ ontvangen
function zetVerbinding(v) {
  if (account.verbinding !== v) { account.verbinding = v; herteken(); }
}

function zetOnverstuurd(v) {
  if (account.onverstuurd !== v) { account.onverstuurd = v; herteken(); }
}

function zetAanwezig(lijst) {
  if (!Array.isArray(lijst)) return;
  const namen = (l) => l.map((x) => x.id).sort().join();
  if (namen(lijst) !== namen(account.aanwezig)) { account.aanwezig = lijst; herteken(); }
}

/** Verwerkt een antwoord van de server: { versie, delen, volledig, aanwezig }. */
function verwerk(r) {
  zetAanwezig(r.aanwezig);
  if (typeof r.versie !== 'number' || !r.delen) return;
  if (!r.volledig && (!ts.basis || r.versie <= ts.versie)) return; // niets nieuws
  if (r.volledig && ts.basis && r.versie === ts.versie) return;

  const remote = r.volledig ? leegTeam(teamNaam(ts.teamId)) : { ...ts.basis };
  for (const d of DELEN) if (d in r.delen) remote[d] = r.delen[d];
  const mijn = teamDeel();

  let samen;
  if (ts.basis && r.versie < ts.versie) {
    // De server is teruggegaan (back-up teruggezet, of hij verloor iets):
    // wat deze telefoon heeft is leidend en gaat er opnieuw heen.
    samen = mijn;
  } else {
    // Nog nooit gesynchroniseerd: vergelijk met een leeg team, zodat wat hier
    // al werd ingevoerd blijft staan en ook naar de server gaat.
    samen = voegSamen(ts.basis || leegTeam(teamNaam(ts.teamId)), mijn, remote);
  }
  ts.basis = remote;
  ts.versie = r.versie;
  if (!gelijk(samen, mijn)) laadTeamDeel(samen, { vanAfstand: true });
  bewaarCache();
  if (!gelijk(samen, remote)) planDuw(0);
  else zetOnverstuurd(false);
}

// Houdt steeds één verzoek open dat terugkomt zodra er iets verandert.
async function luister(gen) {
  let direct = true;
  while (gen === ts.generatie) {
    const ctrl = new AbortController();
    ts.luisteraar = ctrl;
    const wacht = direct ? 0 : ts.wacht;
    const begin = Date.now();
    try {
      const r = await vraag(`api/teams/${ts.teamId}?na=${ts.basis ? ts.versie : 0}&wacht=${wacht}`, { signaal: ctrl.signal, wacht });
      if (gen !== ts.generatie) return;
      ts.fouten = 0;
      zetVerbinding('ok');
      verwerk(r);
      planDuw(0);
      direct = false;
      if (!ts.basis) await slaap(5000); // onbruikbaar antwoord: niet blijven hameren
    } catch (e) {
      if (gen !== ts.generatie) return;
      if (e.status === 401) { sessieVerlopen(); return; }
      if (e.status === 403 || e.status === 404) { teamKwijt(ts.teamId); return; }
      if (e.afgebroken) { direct = true; continue; } // bewust gewekt (terug uit de achtergrond): meteen opnieuw
      const open = (Date.now() - begin) / 1000;
      if (wacht && e.status === 0 && open > 5 && ts.fouten === 0) {
        // Lang open en dan afgebroken: vrijwel zeker een proxy met een
        // time-out. Voortaan korter wachten, en meteen opnieuw.
        ts.wacht = Math.min(ts.wacht, Math.max(5, Math.floor(open * 0.7)));
        ts.fouten = 1;
        continue;
      }
      direct = true;
      ts.fouten += 1;
      zetVerbinding('offline');
      await slaap(Math.min(30000, 1000 * 2 ** Math.min(ts.fouten - 1, 5)));
    }
  }
}

function slaap(ms) {
  return new Promise((klaar) => {
    const t = setTimeout(wakker, ms);
    function wakker() { clearTimeout(t); if (ts.wekker === wakker) ts.wekker = null; klaar(); }
    ts.wekker = wakker;
  });
}

/** Terug uit de achtergrond, of weer netwerk: niet wachten, meteen bijwerken. */
export function wek() {
  if (account.modus !== 'team' || !ts.teamId) return;
  ts.wekker?.();
  ts.luisteraar?.abort();
}

// ------------------------------------------------------------- versturen
function planDuw(ms = 300) {
  if (account.modus !== 'team' || !ts.basis || account.sessieVerlopen) return;
  clearTimeout(ts.timer);
  ts.timer = setTimeout(duw, ms);
}

function wijzigingen() {
  if (!ts.basis) return null;
  const mijn = teamDeel();
  const delen = {};
  for (const d of DELEN) if (!gelijk(mijn[d], ts.basis[d])) delen[d] = mijn[d];
  return Object.keys(delen).length ? delen : null;
}

async function duw() {
  if (ts.bezig || !ts.basis || account.sessieVerlopen) return;
  const delen = wijzigingen();
  if (!delen) { zetOnverstuurd(false); return; }
  zetOnverstuurd(true);
  if (ts.geweigerd && gelijk(delen, ts.geweigerd)) return;

  const gen = ts.generatie;
  const teamId = ts.teamId;
  const basisVersie = ts.versie;
  const verstuurd = { ...ts.basis, ...delen };
  ts.bezig = true;
  let opnieuw = 300;
  try {
    const r = await vraag(`api/teams/${teamId}`, { methode: 'PUT', data: { basisVersie, delen } });
    if (gen !== ts.generatie) return;
    if (r.versie > ts.versie) { ts.basis = verstuurd; ts.versie = r.versie; }
    ts.geweigerd = false;
    zetAanwezig(r.aanwezig);
    zetVerbinding('ok');
  } catch (e) {
    if (gen !== ts.generatie) return;
    if (e.status === 409 && e.data) { verwerk(e.data); opnieuw = 0; }
    else if (e.status === 401) sessieVerlopen();
    else if (e.status === 403 || e.status === 404) { teamKwijt(teamId); return; }
    else if (e.status === 0) { zetVerbinding('offline'); opnieuw = null; } // de luisterlus probeert het straks weer
    else { ts.geweigerd = delen; opnieuw = null; console.warn('Server weigerde de wijziging:', e.message); }
  } finally {
    if (gen === ts.generatie) {
      ts.bezig = false;
      bewaarCache();
      const nogIets = !!wijzigingen();
      zetOnverstuurd(nogIets);
      if (nogIets && opnieuw !== null) planDuw(opnieuw);
    }
  }
}

/** De app gaat dicht: nog één poging, zonder op antwoord te wachten. */
export function duwBijAfsluiten() {
  if (account.modus !== 'team' || !ts.teamId || ts.bezig || account.sessieVerlopen) return;
  const delen = wijzigingen();
  if (delen) vraagBijAfsluiten(`api/teams/${ts.teamId}`, 'PUT', { basisVersie: ts.versie, delen });
}
