// Test de Home Assistant-add-on: serveert hij de app, en bewaart en herstelt
// hij de toestand over browsers heen?
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { rm, readFile } from 'node:fs/promises';
import { once } from 'node:events';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const POORT = 8137;
const DATA = '.tmptest-data';

async function startServer() {
  await rm(DATA, { recursive: true, force: true });
  const proces = spawn(process.execPath, ['deploy/homeassistant/addon/server.mjs'], {
    env: { ...process.env, PORT: String(POORT), WWW_DIR: 'deploy/homeassistant/addon/www', DATA_DIR: DATA },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await once(proces.stdout, 'data'); // eerste logregel betekent: luistert
  return proces;
}

test('de add-on serveert de app en bewaart het team op de server', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(async () => { await browser.close(); server.kill(); await rm(DATA, { recursive: true, force: true }); });

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const fouten = [];
  p.on('pageerror', (e) => fouten.push(String(e)));
  await p.goto(`http://127.0.0.1:${POORT}/`);
  await p.waitForSelector('#app .kaart');

  await p.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await p.waitForSelector('text=Noud');
  await p.waitForTimeout(2200); // de app duwt met vertraging naar de server

  const opSchijf = JSON.parse(await readFile(`${DATA}/state.json`, 'utf8'));
  assert.equal(opSchijf.team.spelers.length, 7, 'team staat op de server');
  assert.equal(opSchijf.team.naam, 'JO9-1');

  // Een tweede apparaat (schone browser, geen localStorage) haalt het op.
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`http://127.0.0.1:${POORT}/`);
  await p2.waitForSelector('.spelerrij');
  assert.equal(await p2.locator('.spelerrij').count(), 7, 'tweede apparaat ziet hetzelfde team');
  assert.ok((await p2.locator('.kop .titel strong').textContent()).includes('JO9-1'));

  assert.deepEqual(fouten, [], 'geen fouten in de console');
});

test('de server weigert onzin en laat geen bestanden buiten de map lezen', async (t) => {
  const server = await startServer();
  t.after(async () => { server.kill(); await rm(DATA, { recursive: true, force: true }); });
  const basis = `http://127.0.0.1:${POORT}`;

  assert.equal((await fetch(`${basis}/api/state`, { method: 'PUT', body: 'geen json' })).status, 400);
  assert.equal((await fetch(`${basis}/api/state`, { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(`${basis}/../../etc/passwd`)).status, 404);
  assert.equal((await fetch(`${basis}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`)).status, 404);
  assert.equal((await fetch(`${basis}/health`)).status, 200);

  const r = await fetch(`${basis}/api/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"a":1}' });
  assert.equal(r.status, 204);
  assert.deepEqual(await (await fetch(`${basis}/api/state`)).json(), { a: 1 });
});
