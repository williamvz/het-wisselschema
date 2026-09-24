// Rooktest in een echte browser: bouwt het gebouwde index.html op, klikt de
// hele flow door en controleert wat er op het scherm staat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const URL = pathToFileURL(resolve('index.html')).href;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 900 } });
  const pagina = await ctx.newPage();
  const fouten = [];
  pagina.on('pageerror', (e) => fouten.push(String(e)));
  pagina.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
  await pagina.goto(URL);
  await pagina.waitForSelector('#app .kaart');
  return { pagina, fouten, ctx };
}

test('de app start, bouwt een schema en overleeft een uitval', async (t) => {
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(() => browser.close());
  const { pagina, fouten } = await open(browser);

  // --- team
  await pagina.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await pagina.waitForSelector('text=Daan');
  assert.equal(await pagina.locator('.spelerrij').count(), 7, 'zeven spelers in het team');

  // --- wedstrijd klaarzetten
  await pagina.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
  await pagina.getByRole('button', { name: 'Nieuwe wedstrijd' }).click();
  await pagina.waitForSelector('text=Wie speelt er vandaag?');
  const gekozen = await pagina.locator('.chip[aria-pressed="true"]').count();
  assert.equal(gekozen, 7, 'iedereen staat standaard aan');

  await pagina.getByRole('button', { name: 'Maak het wisselschema' }).click();
  await pagina.waitForSelector('table.schema');

  // --- schema controleren
  const rijen = await pagina.locator('table.schema tbody tr').count();
  assert.equal(rijen, 7, 'zeven spelers in het raster');
  const kolommen = await pagina.locator('table.schema thead th').count();
  assert.equal(kolommen, 6, 'speler + 4 kwarten + totaal');

  const veldCellen = await pagina.locator('table.schema .cel:not(.bank):not(.weg)').count();
  assert.equal(veldCellen, 24, '4 kwarten x 6 veldplekken');
  const bankCellen = await pagina.locator('table.schema .cel.bank').count();
  assert.equal(bankCellen, 4, 'elk kwart precies één bankzitter');

  // het veld wordt getekend
  assert.ok(await pagina.locator('svg.veld').first().isVisible(), 'veld is zichtbaar');
  assert.equal(await pagina.locator('svg.veld .pion').count(), 6, 'zes pionnen op het veld');

  // --- live
  await pagina.getByRole('button', { name: 'Wedstrijd starten' }).click();
  await pagina.waitForSelector('.klok');
  assert.equal(await pagina.locator('.klok').textContent(), '0:00');

  await pagina.getByRole('button', { name: '▶ Aftrap' }).click();
  await pagina.waitForTimeout(1200);
  const naStart = await pagina.locator('.klok').textContent();
  assert.notEqual(naStart, '0:00', `klok loopt (${naStart})`);

  // --- score bijhouden
  const veldVoorGoal = (await pagina.locator('svg.veld .naam').allTextContents()).map((x) => x.trim());
  await pagina.getByRole('button', { name: '⚽ Goal' }).click();
  await pagina.getByRole('button', { name: '⚽ Goal' }).click();
  await pagina.getByRole('button', { name: 'Tegengoal' }).click();
  await pagina.waitForTimeout(100);
  assert.equal(await pagina.locator('.stand').getAttribute('aria-label'), 'Stand 2 tegen 1');
  assert.equal(await pagina.locator('.goalchip').count(), 3, 'drie doelpunten in de lijst');

  // tik op een doelpunt: je ziet wie er stond, en kunt hem weghalen
  await pagina.locator('.goalchip').last().click();
  const opVeldTekst = await pagina.locator('.overlay').textContent();
  assert.ok(veldVoorGoal.every((n) => opVeldTekst.includes(n)), 'toont de opstelling op dat moment');
  await pagina.locator('.overlay').getByRole('button', { name: 'Weghalen' }).click();
  await pagina.waitForTimeout(100);
  assert.equal(await pagina.locator('.stand').getAttribute('aria-label'), 'Stand 2 tegen 0');

  // --- onverwachte uitval
  await pagina.getByRole('button', { name: /Speler kan niet verder/ }).click();
  await pagina.waitForSelector('text=Wie kan niet verder?');
  const eerste = pagina.locator('.overlay .spelerrij').first();
  const naamUit = (await eerste.locator('.naam').textContent()).split('\n')[0].trim();
  await eerste.click();
  await pagina.waitForSelector('.overlay .wissel');
  const uitvalTekst = await pagina.locator('.overlay').textContent();
  assert.ok(uitvalTekst.includes('eraf'), 'toont wie eraf gaat');
  await pagina.getByRole('button', { name: 'Duidelijk' }).click();

  // de uitgevallen speler staat niet meer op het veld
  await pagina.waitForTimeout(200);
  const opVeld = await pagina.locator('svg.veld .naam').allTextContents();
  assert.ok(!opVeld.includes(naamUit.split(' ')[0]), `${naamUit} staat niet meer opgesteld`);
  assert.equal(await pagina.locator('svg.veld .pion').count(), 6, 'nog steeds zes spelers op het veld');

  // --- afronden
  await pagina.getByRole('button', { name: 'Wedstrijd afronden' }).click();
  await pagina.locator('.overlay').getByRole('button', { name: 'Afronden' }).click();
  await pagina.waitForSelector('text=Instellingen');
  assert.ok((await pagina.locator('#app').textContent()).includes('Speeltijd'), 'archief toont de speeltijd');
  assert.ok((await pagina.locator('#app').textContent()).includes('2-0 · '), 'archief toont de eindstand');
  assert.ok(await pagina.locator('#app .saldo.plus').count() >= 6, 'wie in het veld stond heeft een plus');

  assert.deepEqual(fouten, [], 'geen fouten in de console');
});

test('een tik op de knop werkt direct, ook vlak na het typen in een veld', async (t) => {
  // Regressie: het invoerveld vuurt bij het wegklikken een change-event. Werd
  // daarop meteen de hele DOM herbouwd, dan verdween de knop onder de vinger
  // vandaan en moest je twee keer tikken.
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(() => browser.close());
  const { pagina } = await open(browser);

  await pagina.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await pagina.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
  await pagina.getByRole('button', { name: 'Nieuwe wedstrijd' }).click();
  await pagina.waitForSelector('text=Wie speelt er vandaag?');

  await pagina.locator('#app input[type=text]').first().fill('SV Voorbeeld');
  await pagina.getByRole('button', { name: 'Maak het wisselschema' }).click();

  await pagina.waitForSelector('table.schema', { timeout: 4000 });
  assert.ok((await pagina.locator('.kop .titel small').textContent()).includes('SV Voorbeeld'),
    'de ingetypte tegenstander is ook bewaard');
});

test('gegevens overleven het herladen van de pagina', async (t) => {
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(() => browser.close());
  const ctx = await browser.newContext();
  const pagina = await ctx.newPage();
  await pagina.goto(URL);
  await pagina.waitForSelector('#app .kaart');
  await pagina.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await pagina.waitForSelector('text=Noud');
  await pagina.waitForTimeout(400);

  await pagina.reload();
  await pagina.waitForSelector('#app .kaart');
  assert.equal(await pagina.locator('.spelerrij').count(), 7, 'team staat er na herladen nog');
  assert.ok((await pagina.locator('.kop .titel strong').textContent()).includes('JO9-1'));
});

test('het schema is te delen via een link die zichzelf uitpakt', async (t) => {
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(() => browser.close());
  const { pagina } = await open(browser);

  await pagina.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await pagina.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
  await pagina.getByRole('button', { name: 'Nieuwe wedstrijd' }).click();
  await pagina.getByRole('button', { name: 'Maak het wisselschema' }).click();
  await pagina.waitForSelector('table.schema');
  await pagina.locator('#app').getByRole('button', { name: 'Delen' }).click();
  await pagina.waitForSelector('.overlay input[readonly]');
  const link = await pagina.locator('.overlay input[readonly]').inputValue();
  assert.ok(link.includes('#z=') || link.includes('#j='), 'link bevat het ingepakte schema');

  // in een schone browser openen
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(link);
  await p2.waitForSelector('.overlay table.schema');
  assert.equal(await p2.locator('.overlay table.schema tbody tr').count(), 7, 'ontvanger ziet alle zeven spelers');
  await p2.locator('.overlay').getByRole('button', { name: 'Overnemen' }).click();
  await p2.waitForSelector('#app table.schema');
  assert.equal(await p2.locator('#app table.schema tbody tr').count(), 7, 'schema is overgenomen');
});

test('een lopende wedstrijd wordt niet per ongeluk gewist vanuit het opzetscherm', async (t) => {
  // Regressie: één tik op een spelerchip in het opzetscherm gooide eerder het
  // hele schema weg, inclusief de al gespeelde tijd.
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(() => browser.close());
  const { pagina } = await open(browser);

  await pagina.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await pagina.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
  await pagina.getByRole('button', { name: 'Nieuwe wedstrijd' }).click();
  await pagina.getByRole('button', { name: 'Maak het wisselschema' }).click();
  await pagina.waitForSelector('table.schema');
  await pagina.getByRole('button', { name: 'Wedstrijd starten' }).click();
  await pagina.getByRole('button', { name: '▶ Aftrap' }).click();
  await pagina.waitForTimeout(900);

  // terug naar de opzet en een speler uitvinken
  await pagina.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
  await pagina.waitForSelector('text=Deze wedstrijd loopt');
  await pagina.locator('#app .chip[aria-pressed="true"]').first().click();

  // er hoort eerst gevraagd te worden
  await pagina.waitForSelector('text=De wedstrijd is bezig');
  await pagina.locator('.overlay').getByRole('button', { name: 'Annuleren' }).click();

  // het schema staat er nog en de klok loopt door
  await pagina.locator('nav').getByRole('button', { name: 'Schema' }).click();
  await pagina.waitForSelector('table.schema');
  assert.equal(await pagina.locator('table.schema tbody tr').count(), 7, 'schema is intact');
  await pagina.locator('nav').getByRole('button', { name: 'Live' }).click();
  await pagina.waitForSelector('.klok');
  assert.notEqual(await pagina.locator('.klok').textContent(), '0:00', 'de gespeelde tijd is bewaard');
});
