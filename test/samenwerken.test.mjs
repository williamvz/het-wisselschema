// Twee trainers, twee telefoons, één wedstrijd. William heeft de klok en de
// wissels, Dennis houdt de score bij - en soms tikken ze tegelijk, of heeft
// een van de twee even geen bereik.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startServer, api, richtIn, EXE } from './server-hulp.mjs';

const POORT = 8139;
const MAP = '.tmptest-samen';

async function telefoon(browser, basis, gebruikersnaam, wachtwoord, fouten) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fouten.push(`${gebruikersnaam}: ${e}`));
  // De browser meldt zelf elk mislukt verzoek. Zonder bereik is dat de
  // bedoeling, en een 409 is het gewone "iemand was je net voor" waarna de
  // app samenvoegt en opnieuw verstuurt.
  p.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|status of 409/.test(m.text())) fouten.push(`${gebruikersnaam}: ${m.text()}`);
  });
  await p.goto(`${basis}/`);
  await p.getByLabel('Gebruikersnaam').fill(gebruikersnaam);
  await p.getByLabel('Wachtwoord').fill(wachtwoord);
  await p.getByRole('button', { name: 'Inloggen' }).click();
  await p.waitForSelector('.kop .teamknop');
  return { p, ctx };
}

const stand = (p) => p.locator('.stand').getAttribute('aria-label');
async function wachtOpStand(p, verwacht, ms = 6000) {
  await p.waitForFunction((v) => document.querySelector('.stand')?.getAttribute('aria-label') === v, verwacht, { timeout: ms });
}
const naarLive = (p) => p.locator('nav').getByRole('button', { name: 'Live' }).click();

test('twee trainers houden samen een wedstrijd bij, ook als er even geen bereik is', async (t) => {
  const s = await startServer({ poort: POORT, map: MAP });
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(async () => { await browser.close(); await s.stop(); });
  const fouten = [];

  // De beheerder zet de club klaar (hier via de API; de schermen zelf zijn in sync.test).
  const w = await richtIn(s.basis);
  const { team } = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO9-1', leden: [w.gebruiker.id] } });
  await api(s.basis, '/api/gebruikers', { methode: 'POST', token: w.token,
    data: { naam: 'Dennis', gebruikersnaam: 'dennis', wachtwoord: 'bal-doel-1234', teams: [team.id] } });

  const william = await telefoon(browser, s.basis, 'william', 'geheim-123', fouten);
  const dennis = await telefoon(browser, s.basis, 'dennis', 'bal-doel-1234', fouten);
  const W = william.p, D = dennis.p;

  // --- William zet het team neer; Dennis ziet het binnen een paar tellen
  await W.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await D.waitForFunction(() => document.querySelectorAll('.spelerrij').length === 7, null, { timeout: 6000 });

  // --- en ziet dat Dennis meekijkt
  await W.waitForSelector('.kop .aanwezig', { timeout: 35000 });
  assert.match(await W.locator('.kop .aanwezig').getAttribute('aria-label'), /Dennis/);

  // --- William maakt het schema en start de wedstrijd
  await W.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
  await W.getByRole('button', { name: 'Nieuwe wedstrijd' }).click();
  await W.getByRole('button', { name: 'Maak het wisselschema' }).click();
  await W.waitForSelector('table.schema');
  await W.getByRole('button', { name: 'Wedstrijd starten' }).click();
  await W.getByRole('button', { name: '▶ Aftrap' }).click();

  // --- Dennis ziet dezelfde klok lopen
  await naarLive(D);
  await D.waitForFunction(() => {
    const k = document.querySelector('.klok');
    return k && k.textContent !== '0:00' && !k.classList.contains('pauze');
  }, null, { timeout: 6000 });
  const seconden = async (p) => {
    const [m, s2] = (await p.locator('.klok').textContent()).split(':').map(Number);
    return m * 60 + s2;
  };
  const [kw, kd] = await Promise.all([seconden(W), seconden(D)]);
  assert.ok(Math.abs(kw - kd) <= 1, `de klokken lopen gelijk (${kw} en ${kd})`);

  // --- Dennis scoort; William ziet het
  await D.getByRole('button', { name: '⚽ Goal' }).click();
  await wachtOpStand(W, 'Stand 1 tegen 0');

  // --- tegelijk tikken: niets gaat verloren
  await Promise.all([
    W.getByRole('button', { name: 'Tegengoal' }).click(),
    D.getByRole('button', { name: '⚽ Goal' }).click(),
  ]);
  await wachtOpStand(W, 'Stand 2 tegen 1');
  await wachtOpStand(D, 'Stand 2 tegen 1');

  // --- Dennis heeft even geen bereik
  await dennis.ctx.setOffline(true);
  await D.getByRole('button', { name: '⚽ Goal' }).click();
  await wachtOpStand(D, 'Stand 3 tegen 1');
  await D.waitForSelector('.accountknop .stip.uit', { timeout: 8000 });
  // intussen haalt William een speler eruit
  await W.getByRole('button', { name: /Speler kan niet verder/ }).click();
  await W.locator('.overlay .spelerrij').first().click();
  await W.waitForSelector('.overlay .wissel');
  await W.getByRole('button', { name: 'Duidelijk' }).click();
  assert.equal(await stand(W), 'Stand 2 tegen 1', 'William heeft de goal van Dennis nog niet');

  // --- weer bereik: beide wijzigingen staan op beide telefoons
  await dennis.ctx.setOffline(false);
  await wachtOpStand(W, 'Stand 3 tegen 1', 10000);
  await D.waitForFunction(() => document.body.textContent.includes('uit de wedstrijd gehaald')
    || [...document.querySelectorAll('.chip')].some((c) => c.textContent.includes('eruit')), null, { timeout: 10000 });
  await W.waitForSelector('.accountknop .stip.ok', { timeout: 8000 });
  await D.waitForSelector('.accountknop .stip.ok', { timeout: 8000 });
  const opVeld = async (p) => (await p.locator('svg.veld .naam').allTextContents()).sort().join();
  assert.equal(await opVeld(D), await opVeld(W), 'dezelfde opstelling op beide telefoons');

  // --- de klok stilzetten ziet de ander ook
  await W.getByRole('button', { name: '⏸ Pauze' }).click();
  await D.waitForSelector('.klok.pauze', { timeout: 6000 });

  assert.deepEqual(fouten, [], 'geen fouten in de console');
});

test('ongedaan maken draait alleen je eigen stap terug', async (t) => {
  const s = await startServer({ poort: POORT, map: MAP });
  const browser = await chromium.launch({ executablePath: EXE });
  t.after(async () => { await browser.close(); await s.stop(); });
  const fouten = [];

  const w = await richtIn(s.basis);
  const { team } = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO9-1', leden: [w.gebruiker.id] } });
  await api(s.basis, '/api/gebruikers', { methode: 'POST', token: w.token,
    data: { naam: 'Dennis', gebruikersnaam: 'dennis', wachtwoord: 'bal-doel-1234', teams: [team.id] } });
  const { p: W } = await telefoon(browser, s.basis, 'william', 'geheim-123', fouten);
  const { p: D } = await telefoon(browser, s.basis, 'dennis', 'bal-doel-1234', fouten);

  await W.getByRole('button', { name: 'Voorbeeldteam' }).click();
  await W.locator('nav').getByRole('button', { name: 'Wedstrijd' }).click();
  await W.getByRole('button', { name: 'Nieuwe wedstrijd' }).click();
  await W.getByRole('button', { name: 'Maak het wisselschema' }).click();
  await W.getByRole('button', { name: 'Wedstrijd starten' }).click();
  await W.getByRole('button', { name: '▶ Aftrap' }).click();
  await naarLive(D);
  await D.waitForSelector('.scorekaart', { timeout: 6000 });

  // William haalt iemand eruit, Dennis scoort daarna, William draait zijn uitval terug.
  const voor = (await W.locator('svg.veld .naam').allTextContents()).sort().join();
  await W.getByRole('button', { name: /Speler kan niet verder/ }).click();
  await W.locator('.overlay .spelerrij').first().click();
  await W.waitForSelector('.overlay .wissel');
  await W.getByRole('button', { name: 'Duidelijk' }).click();
  await D.getByRole('button', { name: '⚽ Goal' }).click();
  await wachtOpStand(W, 'Stand 1 tegen 0');
  await W.getByRole('button', { name: 'Ongedaan' }).click();

  await wachtOpStand(D, 'Stand 1 tegen 0');
  assert.equal(await stand(W), 'Stand 1 tegen 0', 'de goal van Dennis blijft staan');
  await D.waitForFunction((v) => [...document.querySelectorAll('svg.veld .naam')].map((x) => x.textContent).sort().join() === v, voor, { timeout: 6000 });
  assert.equal((await W.locator('svg.veld .naam').allTextContents()).sort().join(), voor, 'de uitval is teruggedraaid');
  assert.deepEqual(fouten, []);
});
