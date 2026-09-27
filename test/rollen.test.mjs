// Trainer en beheerder: wat ieder te zien krijgt, het eigen wachtwoord
// wijzigen, en wat er gebeurt met een telefoon waarvan de sessie niet meer
// geldt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startServer, api, richtIn, EXE } from './server-hulp.mjs';

const POORT = 8140;
const MAP = '.tmptest-rollen';

async function telefoon(browser, basis, gebruikersnaam, wachtwoord, fouten) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fouten.push(`${gebruikersnaam}: ${e}`));
  await p.goto(`${basis}/`);
  await p.getByLabel('Gebruikersnaam').fill(gebruikersnaam);
  await p.getByLabel('Wachtwoord').fill(wachtwoord);
  await p.getByRole('button', { name: 'Inloggen', exact: true }).click();
  await p.waitForSelector('.kop .teamknop');
  return { p, ctx };
}

const tabs = (p) => p.locator('nav button').allTextContents();

test('trainer en beheerder, wachtwoord wijzigen, en een sessie die niet meer geldt', async (t) => {
  const s = await startServer({ poort: POORT, map: MAP });
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(async () => { await browser.close(); await s.stop(); });
  const fouten = [];

  const w = await richtIn(s.basis);
  const { team } = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO9-1', leden: [w.gebruiker.id] } });
  await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO11-2', leden: [] } });
  const { gebruiker: dennis } = await api(s.basis, '/api/gebruikers', { methode: 'POST', token: w.token,
    data: { naam: 'Dennis', gebruikersnaam: 'dennis', wachtwoord: 'bal-doel-1234', teams: [team.id] } });

  // --- de beheerder heeft een eigen tab voor de club; de trainer niet
  const william = await telefoon(browser, s.basis, 'william', 'geheim-123', fouten);
  const W = william.p;
  assert.deepEqual(await tabs(W), ['Team', 'Wedstrijd', 'Schema', 'Live', 'Archief', 'Club']);
  await W.locator('nav').getByRole('button', { name: 'Club' }).click();
  await W.waitForSelector('text=Trainers · 2');
  assert.equal(await W.locator('.kop .titel strong').textContent(), 'Clubbeheer', 'de kop zegt dat je in het clubbeheer zit');
  assert.equal(await W.locator('.kop .teamknop').count(), 0, 'in het clubbeheer kies je geen team');

  // In de teamkeuze staan je eigen teams los van de rest van de club.
  await W.locator('nav').getByRole('button', { name: 'Team' }).click();
  await W.locator('.kop .teamknop').click();
  await W.waitForSelector('text=Andere teams van de club');
  const teamkeuze = await W.locator('.overlay').textContent();
  assert.ok(teamkeuze.indexOf('JO9-1') < teamkeuze.indexOf('Andere teams van de club'));
  assert.ok(teamkeuze.indexOf('JO11-2') > teamkeuze.indexOf('Andere teams van de club'));
  await W.locator('.overlay').click({ position: { x: 5, y: 5 } });

  const D = (await telefoon(browser, s.basis, 'dennis', 'bal-doel-1234', fouten)).p;
  assert.deepEqual(await tabs(D), ['Team', 'Wedstrijd', 'Schema', 'Live', 'Archief'], 'een trainer ziet geen Club-tab');

  // --- eigen wachtwoord wijzigen: fouten in het formulier, en een duidelijke bevestiging
  await W.locator('.accountknop').click();
  await W.getByRole('button', { name: 'Wachtwoord wijzigen' }).click();
  assert.equal(await W.getByLabel('Gebruikersnaam').inputValue(), 'william', 'voor de wachtwoordbeheerder');
  await W.getByLabel('Huidig wachtwoord').fill('geheim-123');
  await W.locator('input[name=new-password]').fill('nieuw-geheim-1');
  await W.getByLabel('Nieuw wachtwoord, nog een keer').fill('nieuw-geheim-2');
  await W.getByRole('button', { name: 'Wachtwoord wijzigen' }).click();
  await W.waitForSelector('text=De twee nieuwe wachtwoorden zijn niet hetzelfde');
  await W.getByLabel('Huidig wachtwoord').fill('verkeerd-wachtwoord');
  await W.getByLabel('Nieuw wachtwoord, nog een keer').fill('nieuw-geheim-1');
  await W.getByLabel('Nieuw wachtwoord, nog een keer').press('Enter');
  await W.waitForSelector('text=Je huidige wachtwoord klopt niet');
  await W.getByLabel('Huidig wachtwoord').fill('geheim-123');
  await W.getByLabel('Huidig wachtwoord').press('Enter');
  await W.waitForSelector('text=Je wachtwoord is gewijzigd');
  await W.getByRole('button', { name: 'Klaar' }).click();
  assert.equal((await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'william', wachtwoord: 'geheim-123' } })).status, 401);
  assert.equal((await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'william', wachtwoord: 'nieuw-geheim-1' } })).status, 200);
  await W.waitForSelector('.accountknop .stip.ok', { timeout: 5000 });
  assert.equal(await W.locator('text=Je bent uitgelogd').count(), 0, 'wie het wachtwoord wijzigde, blijft zelf ingelogd');

  // --- Dennis werkt offline door; intussen krijgt hij een nieuw wachtwoord
  await D.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await D.waitForSelector('.accountknop .stip.ok', { timeout: 6000 });
  await D.context().setOffline(true);
  await D.locator('.spelerrij', { hasText: 'Finn' }).click();
  await D.getByRole('button', { name: 'Verwijderen' }).click();
  await D.getByRole('button', { name: 'Verwijderen' }).click();
  await D.waitForFunction(() => document.querySelectorAll('.spelerrij').length === 6);
  const wt = (await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'william', wachtwoord: 'nieuw-geheim-1' } })).token;
  await api(s.basis, `/api/gebruikers/${dennis.id}`, { methode: 'PATCH', token: wt, data: { wachtwoord: 'nieuw-voor-dennis' } });
  await D.context().setOffline(false);

  // Weer bereik: de server kent zijn sessie niet meer. Dan is het team weg van het scherm.
  await D.waitForSelector('text=Je bent uitgelogd', { timeout: 40000 });
  assert.equal(await D.locator('nav').count(), 0, 'geen tabs meer');
  assert.equal(await D.locator('.kop').count(), 0, 'geen teamnaam meer');
  assert.equal(await D.locator('.spelerrij').count(), 0, 'geen spelers meer');
  assert.equal(await D.getByLabel('Gebruikersnaam').inputValue(), 'dennis');
  await D.waitForSelector('text=gaat na het inloggen alsnog mee');

  // Ook niet na herladen.
  await D.reload();
  await D.waitForSelector('text=Je bent uitgelogd');
  assert.equal(await D.locator('nav').count(), 0);

  // Opnieuw inloggen: wat nog niet verstuurd was, gaat alsnog mee.
  await D.getByLabel('Wachtwoord').fill('nieuw-voor-dennis');
  await D.getByRole('button', { name: 'Inloggen', exact: true }).click();
  await D.waitForSelector('.kop .teamknop');
  await D.waitForSelector('.accountknop .stip.ok', { timeout: 6000 });
  assert.equal(await D.locator('.spelerrij').count(), 6);
  await W.waitForFunction(() => document.querySelectorAll('.spelerrij').length === 6, null, { timeout: 6000 });

  assert.deepEqual(fouten, [], 'geen fouten in de console');
});
