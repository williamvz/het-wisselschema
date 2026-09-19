// Minimale statische server met een opslag-eindpunt, voor de Home Assistant-add-on.
// Geen afhankelijkheden: alleen wat er in Node zelf zit.
//
// GET  /            -> de app
// GET  /api/state   -> laatst bewaarde toestand (of {} )
// PUT  /api/state   -> toestand bewaren (atomair)

import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

const POORT = Number(process.env.PORT || 8099);
const WWW = process.env.WWW_DIR || '/opt/wisselschema/www';
const DATA = process.env.DATA_DIR || '/data';
const STAAT = join(DATA, 'state.json');
const MAX = 4 * 1024 * 1024; // 4 MB is ruim voor een heel seizoen

const opties = (() => {
  try { return JSON.parse(readFileSync(join(DATA, 'options.json'), 'utf8')); }
  catch { return {}; }
})();
const CORS = opties.allow_cors !== false;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

function corsKoppen(res) {
  if (!CORS) return;
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, PUT, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

async function leesLichaam(req) {
  const stukken = [];
  let n = 0;
  for await (const s of req) {
    n += s.length;
    if (n > MAX) throw new Error('te groot');
    stukken.push(s);
  }
  return Buffer.concat(stukken).toString('utf8');
}

const server = createServer(async (req, res) => {
  const pad = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  try {
    if (pad === '/api/state') {
      corsKoppen(res);
      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

      if (req.method === 'GET') {
        let inhoud = '{}';
        if (existsSync(STAAT)) inhoud = await readFile(STAAT, 'utf8');
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(inhoud);
        return;
      }

      if (req.method === 'PUT' || req.method === 'POST') {
        const ruw = await leesLichaam(req);
        JSON.parse(ruw); // weigeren wat geen geldige JSON is
        await mkdir(DATA, { recursive: true });
        const tijdelijk = `${STAAT}.${process.pid}.tmp`;
        await writeFile(tijdelijk, ruw, 'utf8');
        await rename(tijdelijk, STAAT); // atomair: nooit een half bestand
        log('toestand bewaard,', ruw.length, 'bytes');
        res.writeHead(204).end();
        return;
      }
      res.writeHead(405, { allow: 'GET, PUT, OPTIONS' }).end();
      return;
    }

    if (pad === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return; }

    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }

    // statische bestanden, met bescherming tegen uitbreken uit de map
    const relatief = normalize(pad === '/' ? '/index.html' : pad).replace(/^(\.\.[/\\])+/, '');
    const bestand = join(WWW, relatief);
    if (!bestand.startsWith(WWW)) { res.writeHead(403).end(); return; }
    if (!existsSync(bestand)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('niet gevonden'); return; }

    const ext = bestand.slice(bestand.lastIndexOf('.'));
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(bestand));
  } catch (e) {
    log('fout:', e.message);
    if (!res.headersSent) res.writeHead(e.message === 'te groot' ? 413 : 400, { 'content-type': 'text/plain' });
    res.end('fout');
  }
});

server.listen(POORT, '0.0.0.0', () => {
  log(`Het Wisselschema luistert op poort ${POORT}`);
  log(`app uit ${WWW}, opslag in ${STAAT}, cors ${CORS ? 'aan' : 'uit'}`);
});

for (const sein of ['SIGTERM', 'SIGINT']) {
  process.on(sein, () => { log('afsluiten'); server.close(() => process.exit(0)); });
}
