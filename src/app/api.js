// Praten met de server (de Home Assistant-add-on, of een andere installatie
// van deploy/homeassistant/addon/server.mjs).
//
// Alles loopt via `vraag`. Die zet het token in de kop, maakt van elke fout
// een ApiFout met een tekst die je zo kunt tonen, en houdt het verschil
// tussen de klok van deze telefoon en die van de server bij.

import { zetKlokVerschil, klokVerschil } from './store.js';

export class ApiFout extends Error {
  constructor(status, bericht, data = null) {
    super(bericht);
    this.status = status; // 0 = geen verbinding
    this.data = data;
  }
}

const staat = { server: null, token: null, klokGemeten: false };

/** Basisadres van de server, eindigend op '/'. */
export function zetServer(adres) { staat.server = adres || null; }
export function zetToken(token) { staat.token = token || null; }

/** Het adres van deze pagina, als die van een webserver komt (en niet van schijf). */
export function paginaServer() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  return new URL('.', location.href).toString();
}

/** Maakt van wat iemand intypt een bruikbaar basisadres, of null. */
export function normaliseerAdres(invoer) {
  let a = String(invoer || '').trim();
  if (!a) return null;
  if (!/^https?:\/\//i.test(a)) a = `${/^(localhost|127\.|10\.|192\.168\.)/.test(a) ? 'http' : 'https'}://${a}`;
  try {
    const url = new URL(a);
    // Een oud synchronisatieadres (…/api/state) of een verwijzing naar de app zelf.
    url.pathname = url.pathname.replace(/\/api(\/state)?\/?$/, '/').replace(/[^/]*\.html$/, '');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = ''; url.hash = '';
    return url.toString();
  } catch (e) { return null; }
}

/**
 * @param {string} pad    relatief aan de server, bv. 'api/ik'
 * @param {object} opties { methode, data, signaal, wacht (s, voor long polling), tijdslimiet (ms) }
 */
export async function vraag(pad, { methode = 'GET', data, signaal, wacht = 0, tijdslimiet = 15000 } = {}) {
  if (!staat.server) throw new ApiFout(0, 'Er is geen server ingesteld.');
  const ctrl = new AbortController();
  const limiet = setTimeout(() => ctrl.abort(), tijdslimiet + wacht * 1000);
  const afbreken = () => ctrl.abort();
  if (signaal) signaal.addEventListener('abort', afbreken);

  const koppen = { accept: 'application/json' };
  if (data !== undefined) koppen['content-type'] = 'application/json';
  if (staat.token) koppen['x-wissel-sessie'] = staat.token;

  const t0 = Date.now();
  let r, json = null;
  try {
    r = await fetch(new URL(pad, staat.server), {
      method: methode, headers: koppen, cache: 'no-store', signal: ctrl.signal,
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    if (r.status !== 204) json = await r.json().catch(() => null);
  } catch (e) {
    const fout = new ApiFout(0, 'Geen verbinding met de server.');
    fout.afgebroken = !!(signaal && signaal.aborted);
    throw fout;
  } finally {
    clearTimeout(limiet);
    if (signaal) signaal.removeEventListener('abort', afbreken);
  }
  // Bij long polling zegt de reistijd niets over de klok: niet meten.
  if (json && typeof json.nu === 'number' && !wacht) meetKlok(json.nu, t0, Date.now());
  if (!r.ok) throw new ApiFout(r.status, (json && json.fout) || `De server gaf een fout (${r.status}).`, json);
  return json || {};
}

/**
 * Voor als de app wordt gesloten: nog één keer versturen, zonder op antwoord
 * te wachten. `keepalive` laat het verzoek doorlopen als de pagina al weg is.
 */
export function vraagBijAfsluiten(pad, methode, data) {
  if (!staat.server) return;
  const tekst = JSON.stringify(data);
  if (tekst.length > 60000) return; // browsers weigeren grotere keepalive-verzoeken
  try {
    fetch(new URL(pad, staat.server), {
      method: methode, keepalive: true, body: tekst,
      headers: { 'content-type': 'application/json', ...(staat.token ? { 'x-wissel-sessie': staat.token } : {}) },
    }).catch(() => {});
  } catch (e) { /* dan de volgende keer */ }
}

// De server stuurt bij elk antwoord zijn klok mee. De helft van de reistijd
// is de beste schatting van wanneer hij die las. Snelle metingen tellen het
// zwaarst; na een paar verzoeken zit het verschil ruim binnen een seconde.
function meetKlok(serverNu, t0, t1) {
  const reistijd = t1 - t0;
  if (reistijd > 3000) return;
  const schatting = serverNu - (t0 + t1) / 2;
  const gewicht = staat.klokGemeten ? (reistijd < 300 ? 0.3 : 0.1) : 1;
  staat.klokGemeten = true;
  zetKlokVerschil(Math.round(klokVerschil() * (1 - gewicht) + schatting * gewicht));
}

/** Na uitloggen weer rekenen met de eigen klok. */
export function vergeetKlok() { staat.klokGemeten = false; zetKlokVerschil(0); }
