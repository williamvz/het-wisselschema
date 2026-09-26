// Server voor Het Wisselschema: serveert de app en bewaart de teams van een
// hele club. Trainers loggen in, zien hun eigen teams, en werken samen aan
// hetzelfde schema - ook tijdens de wedstrijd, op twee telefoons tegelijk.
// Geen afhankelijkheden: alleen wat er in Node zelf zit.
//
// Open
//   GET  /                          de app
//   GET  /health                    'ok'
//   GET  /api/status                is dit een wisselschema-server, en al ingericht?
//   POST /api/inrichten             eerste beheerder aanmaken, met de code uit het logboek
//   POST /api/inloggen              -> { token, gebruiker, teams }
//   POST /api/herstellen            nieuw wachtwoord met de herstelcode uit het logboek
//                                   (alleen als de optie reset_password aan staat)
// Ingelogd (token in de kop x-wissel-sessie)
//   POST /api/uitloggen
//   GET  /api/ik                    -> { gebruiker, teams }
//   POST /api/ik/wachtwoord         eigen wachtwoord wijzigen
//   GET  /api/teams/:id?na=&wacht=  teamgegevens die na versie `na` veranderd zijn. Met
//                                   `wacht` blijft het verzoek openstaan tot er iets
//                                   verandert (long polling), hooguit 25 seconden.
//   PUT  /api/teams/:id             { basisVersie, delen } - 409 als iemand je voor was
// Beheerder
//   GET  /api/beheer                alle gebruikers en teams
//   POST /api/gebruikers            PATCH|DELETE /api/gebruikers/:id
//   POST /api/teams                 PATCH|DELETE /api/teams/:id

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { Club, Fout, publiek } from './club.mjs';

const POORT = Number(process.env.PORT || 8099);
const WWW = process.env.WWW_DIR || '/opt/wisselschema/www';
const DATA = process.env.DATA_DIR || '/data';
const MAX = 4 * 1024 * 1024; // 4 MB is ruim voor een heel seizoen
const LANGSTE_WACHT = 25;    // seconden; ruim binnen de time-outs van proxy's

const opties = (() => {
  try { return JSON.parse(readFileSync(join(DATA, 'options.json'), 'utf8')); }
  catch { return {}; }
})();
const CORS = opties.allow_cors !== false;
const PUBLIEK_ADRES = String(opties.public_url || process.env.PUBLIC_URL || '').trim() || null;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

const club = await new Club(DATA, {
  log,
  inrichtcode: process.env.WISSELSCHEMA_INRICHTCODE,
  herstelcode: process.env.WISSELSCHEMA_HERSTELCODE || opties.reset_password === true,
}).laad();

// ------------------------------------------------------------------ hulpjes
function corsKoppen(req, res) {
  if (!CORS) return;
  // De losse index.html (van een ander adres, of van schijf) mag ook
  // verbinden. Dat is veilig: er gaat geen cookie mee, alleen een token dat
  // de app zelf in de kop zet.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, x-wissel-sessie');
  res.setHeader('access-control-max-age', '600');
  if (req.headers['access-control-request-private-network']) res.setHeader('access-control-allow-private-network', 'true');
}

async function leesLichaam(req) {
  const stukken = [];
  let n = 0;
  for await (const s of req) {
    n += s.length;
    if (n > MAX) throw new Fout(413, 'Dat is te veel gegevens in één keer.');
    stukken.push(s);
  }
  const tekst = Buffer.concat(stukken).toString('utf8');
  if (!tekst.trim()) return {};
  try { return JSON.parse(tekst); } catch { throw new Fout(400, 'Dit is geen geldige JSON.'); }
}

/** JSON terug, altijd met de klok van de server erbij: zo lopen de telefoons gelijk. */
function stuur(res, status, data = {}) {
  if (res.headersSent || res.writableEnded || res.destroyed) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ ...data, nu: Date.now() }));
}

const inlogAntwoord = ({ token, gebruiker }) => ({ token, gebruiker: publiek(gebruiker), teams: club.teamsVoor(gebruiker) });

// ------------------------------------------------------------------ routes
const ROUTES = [];
const route = (methode, patroon, fn, soort = 'ingelogd') => ROUTES.push({ methode, patroon, fn, soort });

route('GET', /^\/api\/status$/, async () => {
  const oud = club.ingericht ? null : await club.oudeGegevens();
  return {
    app: 'het-wisselschema', api: 2, ingericht: club.ingericht, adres: PUBLIEK_ADRES, herstellen: !!club.herstelcode,
    oudTeam: oud && { naam: oud.naam, spelers: oud.spelers, wedstrijden: oud.wedstrijden },
  };
}, 'open');

route('POST', /^\/api\/inrichten$/, async ({ body }) => inlogAntwoord(await club.richtIn(body)), 'open');

route('POST', /^\/api\/inloggen$/, async ({ body }) =>
  inlogAntwoord(await club.logIn(body.gebruikersnaam, body.wachtwoord)), 'open');

route('POST', /^\/api\/herstellen$/, async ({ body }) => inlogAntwoord(await club.herstelWachtwoord(body)), 'open');

route('POST', /^\/api\/uitloggen$/, async ({ sessie }) => { await club.logUit(sessie); return {}; });

route('GET', /^\/api\/ik$/, async ({ gebruiker }) => ({ gebruiker: publiek(gebruiker), teams: club.teamsVoor(gebruiker) }));

route('POST', /^\/api\/ik\/wachtwoord$/, async ({ body, gebruiker, sessie }) => {
  await club.wijzigEigenWachtwoord(gebruiker, body.huidig, body.nieuw, sessie);
  return {};
});

route('GET', /^\/api\/teams\/([a-z0-9]+)$/, async ({ res, params: [id], query, gebruiker }) => {
  if (!club.magTeam(gebruiker, id)) throw new Fout(club.bestaatTeam(id) ? 403 : 404, 'Je hebt geen toegang tot dit team.');
  club.zie(id, gebruiker);
  const na = Math.max(0, Math.floor(Number(query.get('na')) || 0));
  const wacht = Math.min(LANGSTE_WACHT, Math.max(0, Number(query.get('wacht')) || 0));
  let doc = await club.doc(id);

  // Is de app al bij, dan wachten we tot er iets verandert.
  if (wacht > 0 && na > 0 && na === doc.versie) {
    const { belofte, stop } = club.wacht(id, na, wacht * 1000, gebruiker.id);
    let weg = false;
    res.on('close', () => { weg = true; stop(); });
    await belofte;
    if (weg) return null;
    if (!club.magTeam(gebruiker, id)) throw new Fout(404, 'Dit team bestaat niet meer.');
    doc = await club.doc(id);
    club.zie(id, gebruiker);
  }
  return { ...club.delenSinds(doc, na), aanwezig: club.aanwezig(id, gebruiker.id) };
});

route('PUT', /^\/api\/teams\/([a-z0-9]+)$/, async ({ res, params: [id], body, gebruiker }) => {
  if (!club.magTeam(gebruiker, id)) throw new Fout(club.bestaatTeam(id) ? 403 : 404, 'Je hebt geen toegang tot dit team.');
  const basisVersie = Number(body.basisVersie);
  if (!Number.isInteger(basisVersie) || basisVersie < 0) throw new Fout(400, 'De basisversie ontbreekt.');
  club.zie(id, gebruiker);
  const uit = await club.bewaarDelen(id, basisVersie, body.delen, gebruiker);
  const aanwezig = club.aanwezig(id, gebruiker.id);
  if (uit.conflict) {
    stuur(res, 409, { fout: 'Iemand anders was je net voor.', ...uit.conflict, aanwezig });
    return null;
  }
  return { versie: uit.versie, aanwezig };
});

// ---- beheer
const beheerOverzicht = () => ({
  gebruikers: club.data.gebruikers.map((g) => ({ ...publiek(g), teams: club.teamIdsVan(g.id) })),
  teams: club.data.teams.map((t) => ({ id: t.id, naam: t.naam, leden: [...t.leden] })),
});

route('GET', /^\/api\/beheer$/, async () => beheerOverzicht(), 'beheerder');

route('POST', /^\/api\/gebruikers$/, async ({ body }) => {
  const g = await club.maakGebruiker(body);
  log(`gebruiker aangemaakt: ${g.gebruikersnaam}`);
  return { gebruiker: publiek(g), ...beheerOverzicht() };
}, 'beheerder');

route('PATCH', /^\/api\/gebruikers\/([a-z0-9]+)$/, async ({ params: [id], body, sessie }) => {
  const g = await club.wijzigGebruiker(id, body, sessie);
  return { gebruiker: publiek(g), ...beheerOverzicht() };
}, 'beheerder');

route('DELETE', /^\/api\/gebruikers\/([a-z0-9]+)$/, async ({ params: [id], gebruiker }) => {
  await club.verwijderGebruiker(id, gebruiker);
  return beheerOverzicht();
}, 'beheerder');

route('POST', /^\/api\/teams$/, async ({ body }) => {
  const t = await club.maakTeam({ naam: body.naam, leden: body.leden || [] });
  log(`team aangemaakt: ${t.naam}`);
  return { team: { id: t.id, naam: t.naam, leden: t.leden }, ...beheerOverzicht() };
}, 'beheerder');

route('PATCH', /^\/api\/teams\/([a-z0-9]+)$/, async ({ params: [id], body }) => {
  await club.wijzigTeam(id, body);
  return beheerOverzicht();
}, 'beheerder');

route('DELETE', /^\/api\/teams\/([a-z0-9]+)$/, async ({ params: [id] }) => {
  await club.verwijderTeam(id);
  return beheerOverzicht();
}, 'beheerder');

async function api(req, res, pad) {
  corsKoppen(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

  if (pad === '/api/state') {
    // De opslag van voor de accounts. Een oude app die hier nog schrijft,
    // mag niets overschrijven.
    stuur(res, 410, { fout: 'Deze server werkt nu met accounts. Herlaad de app om in te loggen.' });
    return;
  }

  const passend = ROUTES.filter((r) => r.patroon.test(pad));
  if (!passend.length) throw new Fout(404, 'Onbekend adres.');
  const r = passend.find((x) => x.methode === req.method);
  if (!r) {
    res.setHeader('allow', [...new Set(passend.map((x) => x.methode)), 'OPTIONS'].join(', '));
    throw new Fout(405, 'Deze methode kan hier niet.');
  }

  const url = new URL(req.url, 'http://x');
  const ctx = { req, res, params: r.patroon.exec(pad).slice(1), query: url.searchParams, body: {} };
  if (req.method !== 'GET' && req.method !== 'DELETE') ctx.body = await leesLichaam(req);
  if (!ctx.body || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) throw new Fout(400, 'Verwacht een JSON-object.');

  if (r.soort !== 'open') {
    const s = club.sessie(req.headers['x-wissel-sessie']);
    if (!s) throw new Fout(401, 'Je bent niet (meer) ingelogd.');
    ctx.gebruiker = s.gebruiker;
    ctx.sessie = s.sessie;
    if (r.soort === 'beheerder' && !s.gebruiker.beheerder) throw new Fout(403, 'Alleen een beheerder kan dit.');
  }

  const antwoord = await r.fn(ctx);
  if (antwoord !== null) stuur(res, 200, antwoord);
}

// ------------------------------------------------------------------ server
const server = createServer(async (req, res) => {
  let pad;
  try { pad = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400, { 'content-type': 'text/plain' }).end('fout'); return; }

  try {
    if (pad === '/api' || pad.startsWith('/api/')) { await api(req, res, pad); return; }

    if (pad === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return; }

    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }

    // statische bestanden, met bescherming tegen uitbreken uit de map
    const relatief = normalize(pad === '/' ? '/index.html' : pad).replace(/^(\.\.[/\\])+/, '');
    const bestand = join(WWW, relatief);
    if (!bestand.startsWith(WWW)) { res.writeHead(403).end(); return; }
    if (!existsSync(bestand)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('niet gevonden'); return; }

    const ext = bestand.slice(bestand.lastIndexOf('.'));
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin',
    });
    res.end(req.method === 'HEAD' ? undefined : await readFile(bestand));
  } catch (e) {
    const status = e instanceof Fout ? e.status : 500;
    if (status >= 500) log('fout:', e.stack || e.message);
    if (pad.startsWith('/api')) stuur(res, status, { fout: status >= 500 ? 'Er ging iets mis op de server.' : e.message });
    else if (!res.headersSent) res.writeHead(status, { 'content-type': 'text/plain' }).end('fout');
  }
});

server.listen(POORT, '0.0.0.0', () => {
  log(`Het Wisselschema luistert op poort ${POORT}`);
  log(`app uit ${WWW}, opslag in ${DATA}, cors ${CORS ? 'aan' : 'uit'}`);
  if (!club.ingericht) {
    log('Er zijn nog geen accounts. Open de app en maak de eerste beheerder aan.');
    log(`Inrichtcode: ${club.inrichtcode}`);
  } else {
    if (club.herstelcode) {
      log(`Herstelcode voor een vergeten wachtwoord (werkt één keer): ${club.herstelcode}`);
      log('Zet de optie reset_password hierna weer uit.');
    }
    log(`${club.data.gebruikers.length} gebruiker(s), ${club.data.teams.length} team(s)`);
  }
});

for (const sein of ['SIGTERM', 'SIGINT']) {
  process.on(sein, () => {
    log('afsluiten');
    club.stopWachten(); // wachtende verzoeken meteen beantwoorden
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
