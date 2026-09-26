// De Home Assistant-add-on van begin tot eind: hij serveert de app, je richt
// hem in vanuit de browser, en een tweede apparaat ziet na inloggen
// hetzelfde team.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { startServer, EXE, INRICHTCODE } from './server-hulp.mjs';

const POORT = 8137;
const MAP = '.tmptest-data';

test('inrichten in de browser, en een tweede apparaat ziet na inloggen hetzelfde team', async (t) => {
  const s = await startServer({ poort: POORT, map: MAP });
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(async () => { await browser.close(); await s.stop(); });
  const fouten = [];

  const p = await (await browser.newContext()).newPage();
  p.on('pageerror', (e) => fouten.push(String(e)));
  await p.goto(`${s.basis}/`);
  await p.waitForSelector('text=Beheerder aanmaken');
  await p.getByLabel('Inrichtcode').fill(INRICHTCODE.toLowerCase());
  await p.getByLabel('Je naam').fill('William van Zweeden');
  assert.equal(await p.getByLabel('Gebruikersnaam').inputValue(), 'william', 'gebruikersnaam volgt de voornaam');
  await p.getByLabel('Wachtwoord').fill('geheim-123');
  await p.getByRole('button', { name: 'Beheerder aanmaken' }).click();

  // Nog geen team: de beheerder maakt er meteen een.
  await p.waitForSelector('text=Maak je eerste team');
  await p.getByLabel('Teamnaam').fill('JO9-1');
  await p.getByRole('button', { name: 'Team aanmaken' }).click();
  await p.waitForSelector('text=Nog geen spelers');
  await p.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await p.waitForSelector('text=Noud');
  await p.waitForSelector('.accountknop .stip.ok', { timeout: 5000 });
  assert.ok((await p.locator('.kop .titel strong').textContent()).includes('JO9-1'));

  // Het team staat op de server.
  const club = JSON.parse(await readFile(`${MAP}/club.json`, 'utf8'));
  assert.equal(club.teams.length, 1);
  const doc = JSON.parse(await readFile(`${MAP}/teams/${club.teams[0].id}.json`, 'utf8'));
  assert.equal(doc.delen.team.data.spelers.length, 7, 'team staat op de server');

  // Een tweede apparaat logt in en ziet hetzelfde.
  const p2 = await (await browser.newContext()).newPage();
  p2.on('pageerror', (e) => fouten.push(String(e)));
  await p2.goto(`${s.basis}/`);
  await p2.waitForSelector('text=Log in om je team te openen');
  await p2.getByLabel('Gebruikersnaam').fill('william');
  await p2.getByLabel('Wachtwoord').fill('fout-wachtwoord');
  await p2.getByRole('button', { name: 'Inloggen' }).click();
  await p2.waitForSelector('text=Onbekende gebruikersnaam of verkeerd wachtwoord');
  await p2.getByLabel('Wachtwoord').fill('geheim-123');
  await p2.getByRole('button', { name: 'Inloggen' }).click();
  await p2.waitForSelector('.spelerrij');
  assert.equal(await p2.locator('.spelerrij').count(), 7, 'tweede apparaat ziet hetzelfde team');

  // Na herladen meteen weer binnen, zonder opnieuw in te loggen.
  await p2.reload();
  await p2.waitForSelector('.spelerrij');
  assert.equal(await p2.locator('.spelerrij').count(), 7);

  assert.deepEqual(fouten, [], 'geen fouten in de console');
});
