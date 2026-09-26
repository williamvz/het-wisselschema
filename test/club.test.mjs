// De server met accounts: inrichten, inloggen, wie bij welk team mag, en hoe
// twee telefoons tegelijk hetzelfde team bijwerken zonder elkaar te overschrijven.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { startServer, api, richtIn, INRICHTCODE } from './server-hulp.mjs';

const POORT = 8138;
const MAP = '.tmptest-club';

async function metServer(t, opties = {}) {
  const s = await startServer({ poort: POORT, map: MAP, ...opties });
  t.after(() => s.stop());
  return s;
}

test('inrichten kan alleen met de code uit het logboek, en maar één keer', async (t) => {
  const s = await metServer(t);
  assert.ok(s.log().includes(`Inrichtcode: ${INRICHTCODE}`), 'de code staat in het logboek');

  let st = await api(s.basis, '/api/status');
  assert.equal(st.app, 'het-wisselschema');
  assert.equal(st.ingericht, false);

  const fout = await api(s.basis, '/api/inrichten', { methode: 'POST',
    data: { code: 'NOPE-NOPE', naam: 'Iemand', gebruikersnaam: 'iemand', wachtwoord: 'geheim-123' } });
  assert.equal(fout.status, 403);

  const goed = await richtIn(s.basis);
  assert.equal(goed.status, 200);
  assert.ok(goed.token);
  assert.equal(goed.gebruiker.beheerder, true);
  assert.equal(goed.gebruiker.wachtwoord, undefined, 'de hash gaat nooit naar buiten');

  st = await api(s.basis, '/api/status');
  assert.equal(st.ingericht, true);
  assert.equal((await richtIn(s.basis)).status, 409, 'een tweede keer mag niet');

  const club = JSON.parse(await readFile(`${MAP}/club.json`, 'utf8'));
  assert.ok(club.gebruikers[0].wachtwoord.startsWith('scrypt$'), 'wachtwoord gehasht');
  assert.ok(!JSON.stringify(club).includes(goed.token), 'het token zelf staat niet op schijf');
});

test('het team van voor de accounts wordt het eerste team', async (t) => {
  const oud = {
    versie: 1, gewijzigdOp: 5,
    team: { naam: 'JO9-1', spelers: [{ id: 's1', naam: 'Daan' }, { id: 's2', naam: 'Sem' }] },
    wedstrijd: null, archief: [{ id: 'w0', tegenstander: 'Vorige week' }],
    instellingen: { geluid: false },
  };
  const s = await metServer(t, { oud });
  const st = await api(s.basis, '/api/status');
  assert.deepEqual(st.oudTeam, { naam: 'JO9-1', spelers: 2, wedstrijden: 1 });

  const w = await richtIn(s.basis);
  assert.equal(w.teams.length, 1);
  assert.equal(w.teams[0].naam, 'JO9-1');

  const team = await api(s.basis, `/api/teams/${w.teams[0].id}?na=0`, { token: w.token });
  assert.equal(team.volledig, true);
  assert.equal(team.delen.team.spelers.length, 2);
  assert.equal(team.delen.archief.length, 1);
  assert.ok((await readdir(MAP)).includes('state-voor-accounts.json'), 'het oude bestand is bewaard');
  assert.equal((await api(s.basis, '/api/state')).status, 410, 'de oude opslag doet niets meer');
});

test('trainers zien alleen hun eigen teams; wie niet is ingelogd komt nergens bij', async (t) => {
  const s = await metServer(t);
  const w = await richtIn(s.basis);
  const jo9 = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO9-1', leden: [w.gebruiker.id] } });
  const jo11 = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO11-2', leden: [] } });
  const nieuw = await api(s.basis, '/api/gebruikers', { methode: 'POST', token: w.token,
    data: { naam: 'Dennis', gebruikersnaam: 'Dennis', wachtwoord: 'bal-doel-1234', teams: [jo9.team.id] } });
  assert.equal(nieuw.status, 200);
  assert.equal(nieuw.gebruiker.gebruikersnaam, 'dennis', 'kleine letters');

  assert.equal((await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'dennis', wachtwoord: 'fout' } })).status, 401);
  assert.equal((await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'niemand', wachtwoord: 'x' } })).status, 401);
  const d = await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'DENNIS', wachtwoord: 'bal-doel-1234' } });
  assert.equal(d.status, 200);
  assert.deepEqual(d.teams.map((x) => x.naam), ['JO9-1']);
  assert.deepEqual(d.teams[0].leden.map((x) => x.naam).sort(), ['Dennis', 'William van Zweeden']);

  assert.equal((await api(s.basis, `/api/teams/${jo9.team.id}`, { token: d.token })).status, 200);
  assert.equal((await api(s.basis, `/api/teams/${jo11.team.id}`, { token: d.token })).status, 403, 'niet van hem');
  assert.equal((await api(s.basis, '/api/teams/bestaatniet', { token: d.token })).status, 404);
  assert.equal((await api(s.basis, `/api/teams/${jo9.team.id}`)).status, 401, 'zonder token');
  assert.equal((await api(s.basis, `/api/teams/${jo9.team.id}`, { token: 'verzonnen' })).status, 401);
  assert.equal((await api(s.basis, '/api/beheer', { token: d.token })).status, 403, 'geen beheerder');
  assert.equal((await api(s.basis, '/api/gebruikers', { methode: 'POST', token: d.token, data: {} })).status, 403);

  // de beheerder ziet alles
  const ik = await api(s.basis, '/api/ik', { token: w.token });
  assert.equal(ik.teams.length, 2);
  assert.equal((await api(s.basis, `/api/teams/${jo11.team.id}`, { token: w.token })).status, 200);

  // uit het team gehaald: meteen geen toegang meer
  await api(s.basis, `/api/teams/${jo9.team.id}`, { methode: 'PATCH', token: w.token, data: { leden: [w.gebruiker.id] } });
  assert.equal((await api(s.basis, `/api/teams/${jo9.team.id}`, { token: d.token })).status, 403);

  // uitloggen maakt het token waardeloos
  await api(s.basis, '/api/uitloggen', { methode: 'POST', token: d.token });
  assert.equal((await api(s.basis, '/api/ik', { token: d.token })).status, 401);
});

test('twee telefoons: wie op een oude versie schrijft, krijgt terug wat er veranderde', async (t) => {
  const s = await metServer(t);
  const w = await richtIn(s.basis);
  const { team } = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO9-1', leden: [w.gebruiker.id] } });
  const pad = `/api/teams/${team.id}`;

  const begin = await api(s.basis, `${pad}?na=0`, { token: w.token });
  assert.equal(begin.versie, 1);
  assert.deepEqual(Object.keys(begin.delen).sort(), ['archief', 'team', 'wedstrijd']);
  const { tijdperk } = begin;
  assert.ok(tijdperk, 'de server zegt uit welk tijdperk deze versie is');

  const wedstrijd = { id: 'w1', doelpunten: [{ id: 'g1', wie: 'wij', sec: 60, opVeld: [] }] };
  const een = await api(s.basis, pad, { methode: 'PUT', token: w.token, data: { basisVersie: 1, tijdperk, delen: { wedstrijd } } });
  assert.equal(een.status, 200);
  assert.equal(een.versie, 2);

  // De andere telefoon schrijft nog op versie 1.
  const botsing = await api(s.basis, pad, { methode: 'PUT', token: w.token,
    data: { basisVersie: 1, tijdperk, delen: { team: { naam: 'JO9-1', spelers: [{ id: 's1', naam: 'Daan' }] } } } });
  assert.equal(botsing.status, 409);
  assert.equal(botsing.versie, 2);
  assert.deepEqual(Object.keys(botsing.delen), ['wedstrijd'], 'alleen wat sinds versie 1 veranderde');
  assert.deepEqual(botsing.delen.wedstrijd, wedstrijd);

  // Alleen de veranderde delen komen mee; wie bij is, krijgt niets.
  const sinds = await api(s.basis, `${pad}?na=2`, { token: w.token });
  assert.deepEqual(sinds.delen, {});
  assert.equal(sinds.volledig, false);

  // Een versie die de server niet kent (back-up teruggezet): alles komt mee.
  const onbekend = await api(s.basis, `${pad}?na=99`, { token: w.token });
  assert.equal(onbekend.volledig, true);
  assert.equal(onbekend.versie, 2);

  // Wie een tijdperk noemt dat de server niet kent (van voor een herstart),
  // krijgt alles terug, ook als het versienummer toevallig klopt.
  const oudTijdperk = await api(s.basis, pad, { methode: 'PUT', token: w.token, data: { basisVersie: 2, tijdperk: 'oud', delen: { archief: [] } } });
  assert.equal(oudTijdperk.status, 409);
  assert.equal(oudTijdperk.volledig, true);

  // De teamnaam uit de app wordt ook de naam in het beheer.
  await api(s.basis, pad, { methode: 'PUT', token: w.token, data: { basisVersie: 2, tijdperk, delen: { team: { naam: 'JO9-1 (zaterdag)', spelers: [] } } } });
  assert.equal((await api(s.basis, '/api/ik', { token: w.token })).teams[0].naam, 'JO9-1 (zaterdag)');

  // Onzin wordt geweigerd.
  assert.equal((await api(s.basis, pad, { methode: 'PUT', token: w.token, data: { basisVersie: 3, tijdperk, delen: { team: 'x' } } })).status, 400);
  assert.equal((await api(s.basis, pad, { methode: 'PUT', token: w.token, data: { basisVersie: 3, tijdperk, delen: { geheim: 1 } } })).status, 400);
  assert.equal((await api(s.basis, pad, { methode: 'PUT', token: w.token, data: { delen: {} } })).status, 400);
});

test('een wachtend verzoek komt terug zodra een ander iets bewaart, en ziet wie er meekijkt', async (t) => {
  const s = await metServer(t);
  const w = await richtIn(s.basis);
  const { team } = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO9-1', leden: [w.gebruiker.id] } });
  const d = await api(s.basis, '/api/gebruikers', { methode: 'POST', token: w.token,
    data: { naam: 'Dennis', gebruikersnaam: 'dennis', wachtwoord: 'bal-doel-1234', teams: [team.id] } });
  const dennis = await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'dennis', wachtwoord: 'bal-doel-1234' } });
  assert.equal(d.status, 200);
  const pad = `/api/teams/${team.id}`;

  const { tijdperk } = await api(s.basis, `${pad}?na=0`, { token: w.token });
  const start = Date.now();
  const wachten = api(s.basis, `${pad}?na=1&wacht=20`, { token: dennis.token });
  await new Promise((r) => setTimeout(r, 300));
  const bewaard = await api(s.basis, pad, { methode: 'PUT', token: w.token,
    data: { basisVersie: 1, tijdperk, delen: { wedstrijd: { id: 'w1', doelpunten: [] } } } });
  assert.deepEqual(bewaard.aanwezig.map((a) => a.naam), ['Dennis'], 'William ziet dat Dennis meekijkt');

  const antwoord = await wachten;
  assert.ok(Date.now() - start < 3000, 'kwam meteen terug, niet pas na 20 seconden');
  assert.equal(antwoord.versie, 2);
  assert.deepEqual(antwoord.delen.wedstrijd, { id: 'w1', doelpunten: [] });
  assert.deepEqual(antwoord.aanwezig.map((a) => a.naam), ['William van Zweeden']);

  // Zonder wijziging wacht hij tot de tijd om is, en zegt dan: niets nieuws.
  const t0 = Date.now();
  const niks = await api(s.basis, `${pad}?na=2&wacht=1`, { token: dennis.token });
  assert.ok(Date.now() - t0 >= 900);
  assert.deepEqual(niks.delen, {});
  assert.ok(typeof niks.nu === 'number', 'altijd de klok van de server erbij');
});

test('een nieuw wachtwoord zet de oude sessies buiten de deur', async (t) => {
  const s = await metServer(t);
  const w = await richtIn(s.basis);
  const d = await api(s.basis, '/api/gebruikers', { methode: 'POST', token: w.token,
    data: { naam: 'Dennis', gebruikersnaam: 'dennis', wachtwoord: 'bal-doel-1234' } });
  const sessie = await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'dennis', wachtwoord: 'bal-doel-1234' } });
  assert.equal((await api(s.basis, '/api/ik', { token: sessie.token })).status, 200);

  await api(s.basis, `/api/gebruikers/${d.gebruiker.id}`, { methode: 'PATCH', token: w.token, data: { wachtwoord: 'nieuw-wachtwoord-1' } });
  assert.equal((await api(s.basis, '/api/ik', { token: sessie.token })).status, 401, 'oude sessie is weg');
  assert.equal((await api(s.basis, '/api/ik', { token: w.token })).status, 200, 'de beheerder zelf blijft ingelogd');

  // zelf je wachtwoord wijzigen: alleen met het huidige
  const nu = await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'dennis', wachtwoord: 'nieuw-wachtwoord-1' } });
  assert.equal((await api(s.basis, '/api/ik/wachtwoord', { methode: 'POST', token: nu.token, data: { huidig: 'fout', nieuw: 'nog-een-keer-1' } })).status, 403);
  assert.equal((await api(s.basis, '/api/ik/wachtwoord', { methode: 'POST', token: nu.token, data: { huidig: 'nieuw-wachtwoord-1', nieuw: 'kort' } })).status, 400);
  assert.equal((await api(s.basis, '/api/ik/wachtwoord', { methode: 'POST', token: nu.token, data: { huidig: 'nieuw-wachtwoord-1', nieuw: 'nog-een-keer-1' } })).status, 200);
  assert.equal((await api(s.basis, '/api/ik', { token: nu.token })).status, 200, 'wie het zelf wijzigt, blijft ingelogd');
});

test('te veel foute wachtwoorden: een kwartier niet meer proberen', async (t) => {
  const s = await metServer(t);
  await richtIn(s.basis);
  const statussen = [];
  for (let i = 0; i < 11; i++) {
    statussen.push((await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'william', wachtwoord: `fout${i}` } })).status);
  }
  assert.deepEqual(statussen.slice(0, 10), Array(10).fill(401));
  assert.equal(statussen[10], 429);
  assert.equal((await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'william', wachtwoord: 'geheim-123' } })).status, 429,
    'ook het goede wachtwoord wacht even');
});

test('er blijft altijd een beheerder over, en gebruikersnamen zijn uniek', async (t) => {
  const s = await metServer(t);
  const w = await richtIn(s.basis);
  assert.equal((await api(s.basis, `/api/gebruikers/${w.gebruiker.id}`, { methode: 'PATCH', token: w.token, data: { beheerder: false } })).status, 409);
  assert.equal((await api(s.basis, `/api/gebruikers/${w.gebruiker.id}`, { methode: 'DELETE', token: w.token })).status, 409);
  assert.equal((await api(s.basis, '/api/gebruikers', { methode: 'POST', token: w.token,
    data: { naam: 'Nog een William', gebruikersnaam: 'William', wachtwoord: 'bal-doel-1234' } })).status, 409);
  assert.equal((await api(s.basis, '/api/gebruikers', { methode: 'POST', token: w.token,
    data: { naam: 'Kort', gebruikersnaam: 'kort', wachtwoord: '123' } })).status, 400);

  // een team weggooien: weg uit de lijst, maar het bestand staat nog opzij
  const { team } = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'Weg', leden: [] } });
  assert.equal((await api(s.basis, `/api/teams/${team.id}`, { methode: 'DELETE', token: w.token })).status, 200);
  assert.equal((await api(s.basis, `/api/teams/${team.id}`, { token: w.token })).status, 404);
  assert.ok((await readdir(`${MAP}/teams`)).some((f) => f.startsWith(`${team.id}.verwijderd-`)));
});

test('de server weigert onzin en laat geen bestanden buiten de map lezen', async (t) => {
  const s = await metServer(t);
  const b = s.basis;
  assert.equal((await fetch(`${b}/api/inloggen`, { method: 'POST', body: 'geen json' })).status, 400);
  assert.equal((await fetch(`${b}/api/status`, { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(`${b}/api/bestaatniet`)).status, 404);
  assert.equal((await fetch(`${b}/../../etc/passwd`)).status, 404);
  assert.equal((await fetch(`${b}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`)).status, 404);
  assert.equal((await fetch(`${b}/%E0%A4%A`)).status, 400);
  assert.equal((await fetch(`${b}/health`)).status, 200);
  const cors = await fetch(`${b}/api/ik`, { method: 'OPTIONS' });
  assert.equal(cors.status, 204);
  assert.match(cors.headers.get('access-control-allow-headers'), /x-wissel-sessie/);
});

test('wachtwoord kwijt: met de herstelcode uit het logboek, één keer', async (t) => {
  const s = await metServer(t, { env: { WISSELSCHEMA_HERSTELCODE: 'HERS-TEL2' } });
  const w = await richtIn(s.basis);
  assert.equal((await api(s.basis, '/api/status')).herstellen, true);
  assert.ok(s.log().includes('Inrichtcode'), 'zolang er niemand is, gaat inrichten voor');

  const herstel = (code, wachtwoord = 'nieuw-geheim-1') => api(s.basis, '/api/herstellen', { methode: 'POST',
    data: { code, gebruikersnaam: 'william', wachtwoord } });
  assert.equal((await herstel('FOUT-CODE')).status, 403);
  assert.equal((await herstel('hers-tel2', 'kort')).status, 400, 'een te kort wachtwoord kost de code niet');
  const goed = await herstel('hers-tel2');
  assert.equal(goed.status, 200);
  assert.ok(goed.token);
  assert.equal((await api(s.basis, '/api/ik', { token: w.token })).status, 401, 'oude sessies zijn weg');
  assert.equal((await herstel('hers-tel2')).status, 403, 'de code werkt maar één keer');
  assert.equal((await api(s.basis, '/api/status')).herstellen, false);
  const inlog = await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'william', wachtwoord: 'nieuw-geheim-1' } });
  assert.equal(inlog.status, 200);
});

// ------------------------------------------------ na de review: aanvallen en randgevallen

test('honderd pogingen tegelijk komen niet langs de teller', async (t) => {
  const s = await metServer(t);
  await richtIn(s.basis);
  const poging = (wachtwoord) => api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'william', wachtwoord } });
  const uitslagen = await Promise.all([...Array(100)].map((_, i) => poging(i === 99 ? 'geheim-123' : `fout-${i}`)));
  const statussen = uitslagen.map((u) => u.status);
  assert.ok(statussen.filter((x) => x === 401).length <= 10, `hooguit tien echte pogingen (${statussen.filter((x) => x === 401).length})`);
  assert.ok(statussen.filter((x) => x === 429 || x === 503).length >= 89, 'de rest wordt geweigerd');
  assert.notEqual(statussen[99], 200, 'het goede wachtwoord achteraan de rij komt er niet doorheen');
});

test('wie op één adres raadt, sluit de trainer op een ander adres niet buiten', async (t) => {
  const s = await metServer(t);
  await richtIn(s.basis);
  const poging = (wachtwoord, adres) => api(s.basis, '/api/inloggen', { methode: 'POST', adres, data: { gebruikersnaam: 'william', wachtwoord } });
  for (let i = 0; i < 10; i++) assert.equal((await poging(`fout-${i}`, '10.0.0.66')).status, 401);
  assert.equal((await poging('geheim-123', '10.0.0.66')).status, 429, 'de rader is geblokkeerd');
  assert.equal((await poging('geheim-123', '10.0.0.7')).status, 200, 'de trainer zelf kan er gewoon in');

  // Van veel adressen tegelijk raden loopt tegen het totaal aan.
  for (let a = 0; a < 5; a++) for (let i = 0; i < 10; i++) await poging(`fout-${a}-${i}`, `10.1.${a}.1`);
  assert.equal((await poging('geheim-123', '10.9.9.9')).status, 429, 'na vijftig foute pogingen in totaal is het even klaar');
});

test('onzinnige gebruikersnamen kosten niets en worden niet onthouden', async (t) => {
  const s = await metServer(t);
  await richtIn(s.basis);
  const t0 = Date.now();
  for (let i = 0; i < 30; i++) {
    const r = await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: `${'x'.repeat(8000)}${i}`, wachtwoord: 'x' } });
    assert.equal(r.status, 401);
  }
  assert.ok(Date.now() - t0 < 3000, 'zonder te rekenen afgewezen');
  const groot = await fetch(`${s.basis}/api/inloggen`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gebruikersnaam: 'x'.repeat(40000), wachtwoord: 'x' }) });
  assert.equal(groot.status, 413, 'inloggen hoeft nooit meer dan een paar kilobyte');
  assert.equal((await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'william', wachtwoord: 'geheim-123' } })).status, 200);
});

test('een map opvragen geeft netjes een 404 en laat de verbinding niet hangen', async (t) => {
  const s = await metServer(t);
  for (const pad of ['/%2F', '/%2e/', '//']) {
    const r = await fetch(`${s.basis}${pad}`, { signal: AbortSignal.timeout(3000) });
    assert.ok([200, 400, 404].includes(r.status), `${pad}: ${r.status}`);
    await r.arrayBuffer();
  }
});

test('een onleesbaar teambestand wordt nooit stilletjes een leeg team', async (t) => {
  let s = await metServer(t);
  const w = await richtIn(s.basis);
  const { team } = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO9-1', leden: [w.gebruiker.id] } });
  const pad = `/api/teams/${team.id}`;
  const bewaard = await api(s.basis, pad, { methode: 'PUT', token: w.token, data: { basisVersie: 1, tijdperk: (await api(s.basis, `${pad}?na=0`, { token: w.token })).tijdperk,
    delen: { team: { naam: 'JO9-1', spelers: [{ id: 'a', naam: 'Daan' }, { id: 'b', naam: 'Sem' }] } } } });
  assert.equal(bewaard.status, 200);
  const bestand = `${MAP}/teams/${team.id}.json`;
  const goed = await readFile(bestand, 'utf8');

  await s.stop({ opruimen: false });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(bestand, '{ dit is kapot');
  s = await startServer({ poort: POORT, map: MAP, schoon: false });
  t.after(() => s.stop());
  const sessie = await api(s.basis, '/api/inloggen', { methode: 'POST', data: { gebruikersnaam: 'william', wachtwoord: 'geheim-123' } });
  assert.equal((await api(s.basis, `${pad}?na=0`, { token: sessie.token })).status, 503);
  assert.equal((await api(s.basis, pad, { methode: 'PUT', token: sessie.token, data: { basisVersie: 1, delen: { archief: [] } } })).status, 503);
  assert.equal(await readFile(bestand, 'utf8'), '{ dit is kapot', 'het bestand is niet overschreven');

  // Bestand hersteld: het team is er weer, zonder herstart.
  await writeFile(bestand, goed);
  const terug = await api(s.basis, `${pad}?na=0`, { token: sessie.token });
  assert.equal(terug.status, 200);
  assert.equal(terug.delen.team.spelers.length, 2);
});

test('een ongeldige teamnaam verandert ook de leden niet', async (t) => {
  const s = await metServer(t);
  const w = await richtIn(s.basis);
  const { team } = await api(s.basis, '/api/teams', { methode: 'POST', token: w.token, data: { naam: 'JO9-1', leden: [w.gebruiker.id] } });
  assert.equal((await api(s.basis, `/api/teams/${team.id}`, { methode: 'PATCH', token: w.token, data: { leden: [], naam: '   ' } })).status, 400);
  const beheer = await api(s.basis, '/api/beheer', { token: w.token });
  assert.deepEqual(beheer.teams[0].leden, [w.gebruiker.id]);
});

test('elke wijziging krijgt haar eigen versie terug, ook als het schrijven traag is', async () => {
  // Rechtstreeks op de club, met een schijf die er 150 ms over doet.
  const { Club } = await import('../deploy/homeassistant/addon/club.mjs');
  const { rm: weg, mkdir: maak } = await import('node:fs/promises');
  const map = '.tmptest-traag';
  await weg(map, { recursive: true, force: true });
  await maak(map, { recursive: true });
  try {
    const club = await new Club(map, { inrichtcode: 'TEST-CODE' }).laad();
    const { gebruiker } = await club.richtIn({ code: 'TEST-CODE', naam: 'W', gebruikersnaam: 'william', wachtwoord: 'geheim-123' });
    const t = await club.maakTeam({ naam: 'JO9-1', leden: [gebruiker.id] });
    const echt = club.schrijf.bind(club);
    club.schrijf = async (pad, inhoud) => { await new Promise((r) => setTimeout(r, 150)); return echt(pad, inhoud); };

    const a = club.bewaarDelen(t.id, 1, { wedstrijd: { id: 'w1' } }, gebruiker, club.tijdperk);
    await new Promise((r) => setTimeout(r, 30));
    const b = club.bewaarDelen(t.id, 2, { archief: [{ id: 'x' }] }, gebruiker, club.tijdperk);
    assert.deepEqual([(await a).versie, (await b).versie], [2, 3], 'niet allebei 3');

    // Een wijziging uit een ander tijdperk (van voor een herstart) krijgt alles terug.
    const oud = await club.bewaarDelen(t.id, 3, { archief: [] }, gebruiker, 'ander-tijdperk');
    assert.equal(oud.conflict.volledig, true);
    assert.equal(oud.conflict.tijdperk, club.tijdperk);
  } finally {
    await weg(map, { recursive: true, force: true });
  }
});

test('de herstelcode werkt ook met verzoeken tegelijk maar één keer', async (t) => {
  const s = await metServer(t, { env: { WISSELSCHEMA_HERSTELCODE: 'HERS-TEL3' } });
  const w = await richtIn(s.basis);
  await api(s.basis, '/api/gebruikers', { methode: 'POST', token: w.token, data: { naam: 'Dennis', gebruikersnaam: 'dennis', wachtwoord: 'bal-doel-1234' } });
  const herstel = (gebruikersnaam) => api(s.basis, '/api/herstellen', { methode: 'POST',
    data: { code: 'HERS-TEL3', gebruikersnaam, wachtwoord: 'overgenomen-1' } });
  const [a, b] = await Promise.all([herstel('william'), herstel('dennis')]);
  assert.deepEqual([a.status, b.status].sort(), [200, 403]);
});
