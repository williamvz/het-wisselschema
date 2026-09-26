// Maakt de schermafdrukken in docs/beeld/. Vereist `npm install` en een
// gebouwde index.html. Draai met: npm run schermafdrukken
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: EXE });
const ctx = await b.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,300)));
await p.goto(pathToFileURL(resolve('index.html')).href);
await p.waitForSelector('#app .kaart');
const shot = async (n) => { await p.waitForTimeout(350); await p.screenshot({ path: `docs/beeld/${n}.png` }); console.log('  ' + n); };

await p.getByRole('button', { name: 'Voorbeeldteam' }).click();
await p.waitForTimeout(300); await shot('1-team');

await p.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
await p.getByRole('button', { name: 'Nieuwe wedstrijd' }).click();
await p.locator('#app input[type=text]').first().fill('SV Voorbeeld');
await p.waitForTimeout(200); await shot('2-opzet');

await p.getByRole('button', { name: 'Maak het wisselschema' }).click();
await p.waitForSelector('table.schema');
await shot('3-schema');
await p.evaluate(() => window.scrollTo(0, 620));
await shot('4-schema-veld');

await p.getByRole('button', { name: 'Wedstrijd starten' }).click();
await p.waitForSelector('.klok');
await p.getByRole('button', { name: '▶ Aftrap' }).click();
await p.waitForTimeout(1200);
await p.evaluate(() => window.scrollTo(0, 0));
await shot('5-live');

await p.getByRole('button', { name: /Speler kan niet verder/ }).click();
await p.waitForSelector('text=Wie kan niet verder?');
await shot('6-uitval-kiezen');
await p.locator('.overlay .spelerrij').nth(1).click();
await p.waitForSelector('.overlay .wissel');
await shot('7-uitval-instructie');
await p.getByRole('button', { name: 'Duidelijk' }).click();
await p.waitForTimeout(300);
await p.evaluate(() => window.scrollTo(0, 0));
await shot('8-live-na-uitval');

// donkere variant
const ctx2 = await b.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 1, colorScheme: 'dark' });
const p2 = await ctx2.newPage();
await p2.goto(pathToFileURL(resolve('index.html')).href);
await p2.waitForSelector('#app .kaart');
await p2.getByRole('button', { name: 'Voorbeeldteam' }).click();
await p2.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
await p2.getByRole('button', { name: 'Nieuwe wedstrijd' }).click();
await p2.getByRole('button', { name: 'Maak het wisselschema' }).click();
await p2.waitForSelector('table.schema');
await p2.waitForTimeout(350);
await p2.screenshot({ path: 'docs/beeld/9-donker.png' }); console.log('  9-donker');

// ---- samen, met de server van de add-on
const MAP = '.tmptest-beeld';
const POORT = 8197;
await rm(MAP, { recursive: true, force: true });
const server = spawn(process.execPath, ['deploy/homeassistant/addon/server.mjs'], {
  env: { ...process.env, PORT: String(POORT), WWW_DIR: 'deploy/homeassistant/addon/www', DATA_DIR: MAP, WISSELSCHEMA_INRICHTCODE: 'BEEL-DEN1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((klaar) => server.stdout.on('data', (d) => { if (String(d).includes('Inrichtcode')) klaar(); }));
const basis = `http://127.0.0.1:${POORT}`;
const api = async (pad, methode = 'GET', data, token) => (await fetch(basis + pad, {
  method: methode, body: data && JSON.stringify(data),
  headers: { 'content-type': 'application/json', ...(token ? { 'x-wissel-sessie': token } : {}) },
})).json();
try {
  const w = await api('/api/inrichten', 'POST', { code: 'BEEL-DEN1', naam: 'William van Zweeden', gebruikersnaam: 'william', wachtwoord: 'geheim-123' });
  const { team } = await api('/api/teams', 'POST', { naam: 'JO9-1', leden: [w.gebruiker.id] }, w.token);
  const { team: jo11 } = await api('/api/teams', 'POST', { naam: 'JO11-2', leden: [] }, w.token);
  await api('/api/gebruikers', 'POST', { naam: 'Dennis de Vries', gebruikersnaam: 'dennis', wachtwoord: 'bal-doel-1234', teams: [team.id] }, w.token);
  await api('/api/gebruikers', 'POST', { naam: 'Sanne Bakker', gebruikersnaam: 'sanne', wachtwoord: 'bal-doel-1234', teams: [jo11.id] }, w.token);

  const telefoon = async (naam, wachtwoord) => {
    const ctx = await b.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 1 });
    const t = await ctx.newPage();
    t.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,300)));
    await t.goto(`${basis}/`);
    await t.getByLabel('Gebruikersnaam').fill(naam);
    await t.getByLabel('Wachtwoord').fill(wachtwoord);
    return t;
  };
  const W = await telefoon('william', 'geheim-123');
  await W.waitForTimeout(300); await W.screenshot({ path: 'docs/beeld/10-inloggen.png' }); console.log('  10-inloggen');
  await W.getByRole('button', { name: 'Inloggen' }).click();
  await W.waitForSelector('.kop .teamknop');
  await W.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await W.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
  await W.getByRole('button', { name: 'Nieuwe wedstrijd' }).click();
  await W.locator('#app input[type=text]').first().fill('SV Voorbeeld');
  await W.getByRole('button', { name: 'Maak het wisselschema' }).click();
  await W.getByRole('button', { name: 'Wedstrijd starten' }).click();
  await W.getByRole('button', { name: '▶ Aftrap' }).click();

  const D = await telefoon('dennis', 'bal-doel-1234');
  await D.getByRole('button', { name: 'Inloggen' }).click();
  await D.waitForSelector('.kop .teamknop');
  await D.locator('nav').getByRole('button', { name: 'Live' }).click();
  await D.waitForSelector('.scorekaart');
  await D.getByRole('button', { name: '⚽ Goal' }).click();
  await D.waitForSelector('.kop .aanwezig', { timeout: 35000 });
  await D.waitForTimeout(1500);
  await D.evaluate(() => window.scrollTo(0, 0));
  await D.screenshot({ path: 'docs/beeld/11-samen.png' }); console.log('  11-samen');

  await W.locator('.accountknop').click();
  await W.locator('.overlay').getByRole('button', { name: 'Club beheren' }).click();
  await W.waitForSelector('text=Trainers ·');
  await W.waitForTimeout(400);
  await W.screenshot({ path: 'docs/beeld/12-beheer.png' }); console.log('  12-beheer');
} finally {
  server.kill();
  await rm(MAP, { recursive: true, force: true });
}
await b.close();
