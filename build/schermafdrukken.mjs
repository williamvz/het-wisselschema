// Maakt de schermafdrukken in docs/beeld/. Vereist `npm install` en een
// gebouwde index.html. Draai met: npm run schermafdrukken
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
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
await b.close();
