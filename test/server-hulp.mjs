// Start de server van de add-on in een eigen map, voor de tests.
import { spawn } from 'node:child_process';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';

export const INRICHTCODE = 'TEST-CODE';
export const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** `schoon: false` start op de gegevens die er al staan (een herstart). */
export async function startServer({ poort, map, oud = null, env = {}, schoon = true }) {
  if (schoon) {
    await rm(map, { recursive: true, force: true });
    await mkdir(map, { recursive: true });
  }
  if (oud) await writeFile(`${map}/state.json`, JSON.stringify(oud));
  const proces = spawn(process.execPath, ['deploy/homeassistant/addon/server.mjs'], {
    env: {
      ...process.env, PORT: String(poort), WWW_DIR: 'deploy/homeassistant/addon/www', DATA_DIR: map,
      WISSELSCHEMA_INRICHTCODE: INRICHTCODE, ...env,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let log = '';
  await new Promise((klaar, mis) => {
    const t = setTimeout(() => mis(new Error(`server startte niet:\n${log}`)), 8000);
    proces.stdout.on('data', (d) => {
      log += d;
      // de laatste regel die de server bij het starten schrijft
      if (/Inrichtcode: |gebruiker\(s\)/.test(log)) { clearTimeout(t); klaar(); }
    });
    proces.on('exit', (c) => { clearTimeout(t); mis(new Error(`server stopte (${c}):\n${log}`)); });
  });
  return {
    basis: `http://127.0.0.1:${poort}`,
    log: () => log,
    /** Stoppen; zonder `opruimen` blijven de gegevens staan voor een herstart. */
    async stop({ opruimen = true } = {}) {
      if (proces.exitCode === null) { proces.kill(); await once(proces, 'exit').catch(() => {}); }
      if (opruimen) await rm(map, { recursive: true, force: true });
    },
  };
}

/** Eén API-verzoek; geeft { status, ...json } terug. */
export async function api(basis, pad, { methode = 'GET', token, data, adres } = {}) {
  const koppen = {};
  if (adres) koppen['x-real-ip'] = adres;
  if (data !== undefined) koppen['content-type'] = 'application/json';
  if (token) koppen['x-wissel-sessie'] = token;
  const r = await fetch(basis + pad, { method: methode, headers: koppen, body: data !== undefined ? JSON.stringify(data) : undefined });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, ...json };
}

/** Richt een verse server in met beheerder William. */
export async function richtIn(basis) {
  return api(basis, '/api/inrichten', { methode: 'POST',
    data: { code: INRICHTCODE, naam: 'William van Zweeden', gebruikersnaam: 'william', wachtwoord: 'geheim-123' } });
}
