// De gegevens van de club: gebruikers, teams, sessies, en per team de
// gegevens van het wisselschema. Alles staat in JSON-bestanden onder één map
// en wordt atomair weggeschreven: eerst een tijdelijk bestand, dan hernoemen.
// Geen database en geen afhankelijkheden - dit draait ook op een Raspberry Pi.
//
//   club.json         gebruikers, teams en sessies
//   teams/<id>.json   de gegevens van één team, in drie delen met elk een
//                     eigen versienummer (zie `DELEN`)
//
// Wachtwoorden worden met scrypt gehasht. Van een sessie bewaren we alleen
// een hash van het token: wie club.json in handen krijgt, kan er niet mee
// inloggen.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scrypt as scryptMetTerugroep, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptMetTerugroep);

/**
 * De gegevens van een team, in drie delen die los van elkaar veranderen.
 * Tijdens een wedstrijd verandert alleen `wedstrijd`; dan hoeft het archief
 * van een heel seizoen niet bij elke goal opnieuw over de lijn.
 */
export const DELEN = ['team', 'wedstrijd', 'archief'];

const MINUUT = 60 * 1000;
const DAG = 24 * 60 * MINUUT;
const SESSIEDUUR = 180 * DAG;
const POGINGVENSTER = 15 * MINUUT;
const MAX_POGINGEN = 10;
const AANWEZIG_MS = 45 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, lengte: 32 };

/** Fout met een HTTP-status en een tekst die de app zo kan tonen. */
export class Fout extends Error {
  constructor(status, bericht) { super(bericht); this.status = status; }
}

// ------------------------------------------------------------ hulpjes
const maakId = (voor) => `${voor}${randomBytes(5).toString('hex')}`;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

async function hashWachtwoord(wachtwoord) {
  const zout = randomBytes(16);
  const { N, r, p, lengte } = SCRYPT;
  const sleutel = await scrypt(wachtwoord.normalize('NFC'), zout, lengte, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${zout.toString('base64')}$${sleutel.toString('base64')}`;
}

async function wachtwoordKlopt(wachtwoord, opgeslagen) {
  const [soort, N, r, p, zout, hash] = String(opgeslagen).split('$');
  if (soort !== 'scrypt' || !zout || !hash) return false;
  const verwacht = Buffer.from(hash, 'base64');
  const sleutel = await scrypt(wachtwoord.normalize('NFC'), Buffer.from(zout, 'base64'), verwacht.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(sleutel, verwacht);
}

// Zonder 0/O, 1/I/L: de code wordt overgetypt uit een logboek.
const CODETEKENS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const schoneCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function maakCode() {
  return [...randomBytes(8)].map((b) => CODETEKENS[b % CODETEKENS.length]).join('');
}
function codeKlopt(invoer, code) {
  const a = createHash('sha256').update(schoneCode(invoer)).digest();
  const b = createHash('sha256').update(schoneCode(code)).digest();
  return !!code && timingSafeEqual(a, b);
}

function schoneNaam(naam, wat = 'naam') {
  const n = String(naam ?? '').trim().replace(/\s+/g, ' ');
  if (!n) throw new Fout(400, `Vul een ${wat} in.`);
  if (n.length > 60) throw new Fout(400, `Die ${wat} is te lang (hooguit 60 tekens).`);
  return n;
}

function schoneGebruikersnaam(naam) {
  const n = String(naam ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._@-]{1,39}$/.test(n)) {
    throw new Fout(400, 'Een gebruikersnaam is 2 tot 40 tekens: kleine letters, cijfers, punt, streepje of @.');
  }
  return n;
}

function controleerWachtwoord(wachtwoord) {
  if (typeof wachtwoord !== 'string' || wachtwoord.length < 8) throw new Fout(400, 'Een wachtwoord moet minstens 8 tekens lang zijn.');
  if (wachtwoord.length > 200) throw new Fout(400, 'Dat wachtwoord is te lang.');
}

/** Wat de app van een gebruiker mag zien: nooit de hash. */
export const publiek = (g) => ({ id: g.id, naam: g.naam, gebruikersnaam: g.gebruikersnaam, beheerder: !!g.beheerder });

/** Weigert teamgegevens die de app zou laten struikelen. */
export function controleerDelen(delen) {
  if (!delen || typeof delen !== 'object' || Array.isArray(delen)) throw new Fout(400, 'Er zijn geen teamgegevens meegestuurd.');
  for (const [deel, waarde] of Object.entries(delen)) {
    if (!DELEN.includes(deel)) throw new Fout(400, `Onbekend deel van de teamgegevens: ${deel}`);
    const object = waarde !== null && typeof waarde === 'object' && !Array.isArray(waarde);
    if (deel === 'team' && !(object && typeof waarde.naam === 'string' && Array.isArray(waarde.spelers))) {
      throw new Fout(400, 'Het team moet een naam en een lijst spelers hebben.');
    }
    if (deel === 'wedstrijd' && !(waarde === null || object)) throw new Fout(400, 'De wedstrijd is geen geldig object.');
    if (deel === 'archief' && !Array.isArray(waarde)) throw new Fout(400, 'Het archief moet een lijst zijn.');
  }
}

function leegDoc(naam, inhoud = {}) {
  const team = inhoud.team && Array.isArray(inhoud.team.spelers) ? inhoud.team : { spelers: [] };
  return {
    versie: 1,
    delen: {
      team: { versie: 1, data: { ...team, naam } },
      wedstrijd: { versie: 1, data: inhoud.wedstrijd ?? null },
      archief: { versie: 1, data: Array.isArray(inhoud.archief) ? inhoud.archief : [] },
    },
    gewijzigdOp: Date.now(),
  };
}

// ----------------------------------------------------------------- de club
export class Club {
  /**
   * @param {string} map          waar de bestanden staan (bij de add-on: /data)
   * @param {object} opties       { log, inrichtcode, herstelcode } - vaste codes
   *                              zijn handig voor tests en automatisering. Met
   *                              herstelcode `true` maakt de server er zelf een.
   */
  constructor(map, { log = () => {}, inrichtcode = null, herstelcode = null } = {}) {
    this.map = map;
    this.log = log;
    this.clubBestand = join(map, 'club.json');
    this.teamMap = join(map, 'teams');
    this.oudBestand = join(map, 'state.json'); // van voor de accounts
    this.data = { versie: 1, gebruikers: [], teams: [], sessies: [] };
    this.sessieIndex = new Map();
    this.docs = new Map();      // teamId -> teamgegevens, in het geheugen
    this.wachters = new Map();  // teamId -> Set van verzoeken die op een wijziging wachten
    this.gezien = new Map();    // teamId -> Map(gebruikerId -> tijdstip)
    this.pogingen = new Map();  // mislukte inlogpogingen
    this.schrijfRij = new Map();
    this.code = inrichtcode ? schoneCode(inrichtcode) : null;
    this.bezigMetInrichten = false;
    this.herstel = herstelcode === true ? maakCode() : herstelcode ? schoneCode(herstelcode) : null;
  }

  async laad() {
    await mkdir(this.teamMap, { recursive: true });
    if (existsSync(this.clubBestand)) {
      const data = JSON.parse(await readFile(this.clubBestand, 'utf8'));
      this.data = { versie: 1, gebruikers: [], teams: [], sessies: [], ...data };
      const voor = this.data.sessies.length;
      this.data.sessies = this.data.sessies.filter((s) => s.verloopt > Date.now());
      if (this.data.sessies.length !== voor) await this.bewaarClub();
    }
    this.sessieIndex = new Map(this.data.sessies.map((s) => [s.sleutel, s]));
    if (!this.ingericht && !this.code) this.code = maakCode();
    // Om te rekenen voor wie niet bestaat: dan duurt een verkeerde
    // gebruikersnaam even lang als een verkeerd wachtwoord.
    this.nepHash = await hashWachtwoord(randomBytes(12).toString('hex'));
    return this;
  }

  get ingericht() { return this.data.gebruikers.length > 0; }

  /** De code om de eerste beheerder aan te maken, zoals hij in het logboek staat. */
  get inrichtcode() {
    if (this.ingericht || !this.code) return null;
    return `${this.code.slice(0, 4)}-${this.code.slice(4)}`;
  }

  // ------------------------------------------------------------ inrichten
  /** Wat er aan gegevens van voor de accounts klaarstaat om over te nemen. */
  async oudeGegevens() {
    if (!existsSync(this.oudBestand)) return null;
    try {
      const staat = JSON.parse(await readFile(this.oudBestand, 'utf8'));
      const spelers = staat?.team?.spelers?.length || 0;
      const wedstrijden = staat?.archief?.length || 0;
      if (!spelers && !wedstrijden && !staat?.wedstrijd) return null;
      return { naam: staat.team?.naam || 'Mijn team', spelers, wedstrijden, staat };
    } catch (e) { return null; }
  }

  /** Maakt de eerste beheerder aan. Kan alleen zolang er nog niemand is. */
  async richtIn({ code, naam, gebruikersnaam, wachtwoord } = {}) {
    if (this.ingericht || this.bezigMetInrichten) throw new Fout(409, 'Deze server is al ingericht. Log in met je account.');
    this.controleerPogingen('inrichten');
    if (!codeKlopt(code, this.code)) {
      this.telFout('inrichten');
      throw new Fout(403, 'Die inrichtcode klopt niet. Je vindt hem in het logboek van de server.');
    }
    this.bezigMetInrichten = true;
    try {
      const g = await this.maakGebruiker({ naam, gebruikersnaam, wachtwoord, beheerder: true });
      const oud = await this.oudeGegevens();
      if (oud) {
        const t = await this.maakTeam({ naam: oud.naam, leden: [g.id] }, oud.staat);
        await rename(this.oudBestand, join(this.map, 'state-voor-accounts.json'));
        this.log(`bestaande gegevens overgezet naar team "${t.naam}"`);
      }
      this.code = null;
      this.log(`ingericht, beheerder: ${g.gebruikersnaam}`);
      return this.nieuweSessie(g);
    } finally {
      this.bezigMetInrichten = false;
    }
  }

  /** De eenmalige code om een vergeten wachtwoord te vervangen, als herstellen aan staat. */
  get herstelcode() {
    return this.herstel ? `${this.herstel.slice(0, 4)}-${this.herstel.slice(4)}` : null;
  }

  /**
   * Een nieuw wachtwoord met de herstelcode uit het logboek: voor de
   * beheerder die het zijne kwijt is. Wie bij het logboek kan, beheert de
   * server toch al. De code werkt één keer.
   */
  async herstelWachtwoord({ code, gebruikersnaam, wachtwoord } = {}) {
    this.controleerPogingen('herstellen');
    if (!this.herstel || !codeKlopt(code, this.herstel)) {
      this.telFout('herstellen');
      throw new Fout(403, 'Die herstelcode klopt niet, of herstellen staat niet aan.');
    }
    const naam = String(gebruikersnaam ?? '').trim().toLowerCase();
    const g = this.data.gebruikers.find((x) => x.gebruikersnaam === naam);
    if (!g) throw new Fout(404, `Er is geen gebruiker "${naam}".`);
    controleerWachtwoord(wachtwoord);
    await this.wijzigGebruiker(g.id, { wachtwoord }); // sluit ook alle sessies
    this.herstel = null;
    this.pogingen.delete(`inloggen:${naam}`);
    this.log(`wachtwoord hersteld voor ${naam}`);
    return this.nieuweSessie(g);
  }

  // ------------------------------------------------------------- sessies
  async logIn(gebruikersnaam, wachtwoord) {
    const naam = String(gebruikersnaam ?? '').trim().toLowerCase();
    const sleutel = `inloggen:${naam}`;
    this.controleerPogingen(sleutel);
    const g = this.data.gebruikers.find((x) => x.gebruikersnaam === naam);
    const klopt = await wachtwoordKlopt(String(wachtwoord ?? ''), g ? g.wachtwoord : this.nepHash);
    if (!g || !klopt) {
      this.telFout(sleutel);
      throw new Fout(401, 'Onbekende gebruikersnaam of verkeerd wachtwoord.');
    }
    this.pogingen.delete(sleutel);
    return this.nieuweSessie(g);
  }

  async nieuweSessie(g) {
    const token = randomBytes(32).toString('base64url');
    const s = { sleutel: hashToken(token), gebruikerId: g.id, aangemaakt: Date.now(), verloopt: Date.now() + SESSIEDUUR };
    this.data.sessies.push(s);
    this.sessieIndex.set(s.sleutel, s);
    await this.bewaarClub();
    return { token, gebruiker: g };
  }

  /** Bij een geldig token: { gebruiker, sessie }. Anders null. */
  sessie(token) {
    if (typeof token !== 'string' || !token || token.length > 200) return null;
    const s = this.sessieIndex.get(hashToken(token));
    if (!s) return null;
    if (s.verloopt <= Date.now()) { this.verwijderSessies((x) => x === s); return null; }
    const g = this.data.gebruikers.find((x) => x.id === s.gebruikerId);
    if (!g) return null;
    // Wie de app blijft gebruiken, blijft ingelogd. Hooguit eens per dag wegschrijven.
    if (s.verloopt - Date.now() < SESSIEDUUR - DAG) {
      s.verloopt = Date.now() + SESSIEDUUR;
      this.bewaarClub().catch((e) => this.log('sessie bewaren mislukt:', e.message));
    }
    return { gebruiker: g, sessie: s };
  }

  async logUit(sessie) {
    this.verwijderSessies((s) => s === sessie);
    await this.bewaarClub();
  }

  verwijderSessies(welke) {
    for (const s of this.data.sessies.filter(welke)) this.sessieIndex.delete(s.sleutel);
    this.data.sessies = this.data.sessies.filter((s) => !welke(s));
  }

  controleerPogingen(sleutel) {
    const p = this.pogingen.get(sleutel);
    if (p && Date.now() - p.sinds < POGINGVENSTER && p.aantal >= MAX_POGINGEN) {
      throw new Fout(429, 'Te veel mislukte pogingen. Probeer het over een kwartier opnieuw.');
    }
  }

  telFout(sleutel) {
    if (this.pogingen.size > 5000) {
      for (const [k, p] of this.pogingen) if (Date.now() - p.sinds >= POGINGVENSTER) this.pogingen.delete(k);
    }
    const p = this.pogingen.get(sleutel);
    if (!p || Date.now() - p.sinds >= POGINGVENSTER) this.pogingen.set(sleutel, { aantal: 1, sinds: Date.now() });
    else p.aantal += 1;
  }

  // ----------------------------------------------------------- gebruikers
  vindGebruiker(id) {
    const g = this.data.gebruikers.find((x) => x.id === id);
    if (!g) throw new Fout(404, 'Die gebruiker bestaat niet (meer).');
    return g;
  }

  aantalBeheerders() { return this.data.gebruikers.filter((g) => g.beheerder).length; }

  teamIdsVan(gebruikerId) {
    return this.data.teams.filter((t) => t.leden.includes(gebruikerId)).map((t) => t.id);
  }

  async maakGebruiker({ naam, gebruikersnaam, wachtwoord, beheerder = false, teams } = {}) {
    const schoon = { naam: schoneNaam(naam), gebruikersnaam: schoneGebruikersnaam(gebruikersnaam) };
    controleerWachtwoord(wachtwoord);
    const bezet = () => this.data.gebruikers.some((x) => x.gebruikersnaam === schoon.gebruikersnaam);
    if (bezet()) throw new Fout(409, `De gebruikersnaam "${schoon.gebruikersnaam}" is al in gebruik.`);
    const hash = await hashWachtwoord(wachtwoord);
    if (bezet()) throw new Fout(409, `De gebruikersnaam "${schoon.gebruikersnaam}" is al in gebruik.`);
    const g = { id: maakId('g'), ...schoon, beheerder: !!beheerder, wachtwoord: hash, aangemaakt: Date.now() };
    this.data.gebruikers.push(g);
    if (Array.isArray(teams)) this.zetTeamsVan(g.id, teams);
    await this.bewaarClub();
    return g;
  }

  /** `door` is de sessie van wie de wijziging doet; die blijft ingelogd. */
  async wijzigGebruiker(id, wijziging = {}, door = null) {
    const g = this.vindGebruiker(id);
    const nieuw = {};
    if (wijziging.naam !== undefined) nieuw.naam = schoneNaam(wijziging.naam);
    if (wijziging.gebruikersnaam !== undefined) {
      nieuw.gebruikersnaam = schoneGebruikersnaam(wijziging.gebruikersnaam);
      if (this.data.gebruikers.some((x) => x !== g && x.gebruikersnaam === nieuw.gebruikersnaam)) {
        throw new Fout(409, `De gebruikersnaam "${nieuw.gebruikersnaam}" is al in gebruik.`);
      }
    }
    if (wijziging.beheerder !== undefined) {
      nieuw.beheerder = !!wijziging.beheerder;
      if (!nieuw.beheerder && g.beheerder && this.aantalBeheerders() === 1) {
        throw new Fout(409, 'Er moet minstens één beheerder overblijven.');
      }
    }
    if (wijziging.wachtwoord !== undefined && wijziging.wachtwoord !== '') {
      controleerWachtwoord(wijziging.wachtwoord);
      nieuw.wachtwoord = await hashWachtwoord(wijziging.wachtwoord);
    }
    if (wijziging.teams !== undefined && !Array.isArray(wijziging.teams)) throw new Fout(400, 'Teams moet een lijst zijn.');

    Object.assign(g, nieuw);
    // Een nieuw wachtwoord sluit alle andere sessies: wie het oude kende, is eruit.
    if (nieuw.wachtwoord) this.verwijderSessies((s) => s.gebruikerId === g.id && s !== door);
    if (wijziging.teams) this.zetTeamsVan(g.id, wijziging.teams);
    await this.bewaarClub();
    return g;
  }

  /** Je eigen wachtwoord wijzigen: eerst het huidige, met dezelfde pogingenteller als inloggen. */
  async wijzigEigenWachtwoord(g, huidig, nieuw, sessie) {
    controleerWachtwoord(nieuw);
    const sleutel = `inloggen:${g.gebruikersnaam}`;
    this.controleerPogingen(sleutel);
    if (!(await wachtwoordKlopt(String(huidig ?? ''), g.wachtwoord))) {
      this.telFout(sleutel);
      throw new Fout(403, 'Je huidige wachtwoord klopt niet.');
    }
    await this.wijzigGebruiker(g.id, { wachtwoord: nieuw }, sessie);
  }

  async verwijderGebruiker(id, door) {
    const g = this.vindGebruiker(id);
    if (g.id === door.id) throw new Fout(409, 'Je kunt jezelf niet verwijderen.');
    if (g.beheerder && this.aantalBeheerders() === 1) throw new Fout(409, 'Er moet minstens één beheerder overblijven.');
    this.data.gebruikers = this.data.gebruikers.filter((x) => x !== g);
    for (const t of this.data.teams) t.leden = t.leden.filter((x) => x !== g.id);
    this.verwijderSessies((s) => s.gebruikerId === g.id);
    await this.bewaarClub();
  }

  zetTeamsVan(gebruikerId, teamIds) {
    const gewenst = new Set(teamIds);
    for (const t of this.data.teams) {
      const lid = t.leden.includes(gebruikerId);
      if (gewenst.has(t.id) && !lid) t.leden.push(gebruikerId);
      if (!gewenst.has(t.id) && lid) t.leden = t.leden.filter((x) => x !== gebruikerId);
    }
  }

  // ---------------------------------------------------------------- teams
  vindTeam(id) {
    const t = this.data.teams.find((x) => x.id === id);
    if (!t) throw new Fout(404, 'Dat team bestaat niet (meer).');
    return t;
  }

  bestaatTeam(id) { return this.data.teams.some((t) => t.id === id); }

  /** Beheerders mogen bij elk team, trainers bij de teams waar ze lid van zijn. */
  magTeam(g, teamId) {
    const t = this.data.teams.find((x) => x.id === teamId);
    return !!t && (g.beheerder || t.leden.includes(g.id));
  }

  /** De teams die iemand in de app ziet, met wie er lid is. */
  teamsVoor(g) {
    const naamVan = new Map(this.data.gebruikers.map((x) => [x.id, x.naam]));
    return this.data.teams
      .filter((t) => g.beheerder || t.leden.includes(g.id))
      .map((t) => ({
        id: t.id, naam: t.naam, lid: t.leden.includes(g.id),
        leden: t.leden.filter((id) => naamVan.has(id)).map((id) => ({ id, naam: naamVan.get(id) })),
      }))
      .sort((a, b) => (b.lid - a.lid) || a.naam.localeCompare(b.naam, 'nl'));
  }

  geldigeLeden(leden) {
    if (!Array.isArray(leden)) throw new Fout(400, 'Leden moet een lijst zijn.');
    const bestaand = new Set(this.data.gebruikers.map((g) => g.id));
    return [...new Set(leden)].filter((id) => bestaand.has(id));
  }

  async maakTeam({ naam, leden = [] } = {}, inhoud = {}) {
    const t = { id: maakId('t'), naam: schoneNaam(naam, 'teamnaam'), leden: this.geldigeLeden(leden), aangemaakt: Date.now() };
    this.docs.set(t.id, leegDoc(t.naam, inhoud || {}));
    await this.bewaarDoc(t.id);
    this.data.teams.push(t);
    await this.bewaarClub();
    return t;
  }

  async wijzigTeam(id, { naam, leden } = {}) {
    const t = this.vindTeam(id);
    if (leden !== undefined) t.leden = this.geldigeLeden(leden);
    if (naam !== undefined) {
      t.naam = schoneNaam(naam, 'teamnaam');
      // Ook in de teamgegevens, zodat de kop van de app meeverandert.
      const doc = await this.doc(id);
      const team = doc.delen.team.data || { spelers: [] };
      if (team.naam !== t.naam) await this.zetDelen(id, doc, { team: { ...team, naam: t.naam } }, null);
    }
    await this.bewaarClub();
    return t;
  }

  async verwijderTeam(id) {
    const t = this.vindTeam(id);
    this.data.teams = this.data.teams.filter((x) => x !== t);
    await this.bewaarClub();
    // Niet weggooien maar opzijzetten: een verkeerde tik moet te herstellen zijn.
    const pad = this.docPad(id);
    if (existsSync(pad)) await rename(pad, join(this.teamMap, `${id}.verwijderd-${Date.now()}.json`));
    this.docs.delete(id);
    for (const w of [...(this.wachters.get(id) || [])]) w.klaar(false);
    this.log(`team "${t.naam}" verwijderd`);
  }

  // -------------------------------------------------------- teamgegevens
  docPad(id) { return join(this.teamMap, `${id}.json`); }

  async doc(id) {
    if (this.docs.has(id)) return this.docs.get(id);
    let doc;
    try {
      doc = JSON.parse(await readFile(this.docPad(id), 'utf8'));
    } catch (e) {
      // Weg of onleesbaar: leeg beginnen in plaats van het team onbruikbaar te maken.
      doc = leegDoc(this.data.teams.find((t) => t.id === id)?.naam || 'Team');
    }
    // Twee verzoeken kunnen tegelijk hebben zitten lezen; de eerste wint.
    if (!this.docs.has(id)) this.docs.set(id, doc);
    return this.docs.get(id);
  }

  /**
   * De delen die na versie `na` zijn veranderd. Zonder `na`, of als de
   * vraagsteller een versie noemt die de server niet kent (teruggezette
   * back-up), komt alles mee.
   */
  delenSinds(doc, na = 0) {
    const volledig = !(na > 0) || na > doc.versie;
    const delen = {};
    for (const d of DELEN) if (volledig || doc.delen[d].versie > na) delen[d] = doc.delen[d].data;
    return { versie: doc.versie, delen, volledig };
  }

  /**
   * Bewaart wijzigingen, maar alleen als ze gebaseerd zijn op de huidige
   * versie. Anders: { conflict } met wat er sindsdien veranderd is, zodat de
   * app kan samenvoegen en het opnieuw kan proberen.
   */
  async bewaarDelen(teamId, basisVersie, delen, g) {
    controleerDelen(delen);
    const doc = await this.doc(teamId);
    // Vanaf hier geen await tot de versie is opgehoogd: twee verzoeken op
    // dezelfde basis kunnen dus nooit allebei slagen.
    if (basisVersie !== doc.versie) return { conflict: this.delenSinds(doc, basisVersie) };
    if (!Object.keys(delen).length) return { versie: doc.versie };
    await this.zetDelen(teamId, doc, delen, g);
    return { versie: doc.versie };
  }

  async zetDelen(teamId, doc, delen, g) {
    const versie = doc.versie + 1;
    for (const [deel, data] of Object.entries(delen)) doc.delen[deel] = { versie, data };
    doc.versie = versie;
    doc.gewijzigdOp = Date.now();
    doc.gewijzigdDoor = g ? g.id : null;

    // De teamnaam volgt wat de trainers in de app intypen.
    const t = this.data.teams.find((x) => x.id === teamId);
    const naam = typeof delen.team?.naam === 'string' ? delen.team.naam.trim().slice(0, 60) : '';
    if (t && naam && naam !== t.naam) {
      t.naam = naam;
      this.bewaarClub().catch((e) => this.log('club bewaren mislukt:', e.message));
    }
    this.meld(teamId, doc);
    await this.bewaarDoc(teamId);
  }

  // --------------------------------------------------- wachten en aanwezig
  /** Laat een verzoek wachten tot het team voorbij versie `na` is, of tot `ms` om is. */
  wacht(teamId, na, ms, gebruikerId) {
    if (!this.wachters.has(teamId)) this.wachters.set(teamId, new Set());
    const set = this.wachters.get(teamId);
    let w;
    const belofte = new Promise((resolve) => {
      w = {
        na, gebruikerId,
        klaar: (veranderd) => { clearTimeout(w.timer); set.delete(w); resolve(veranderd); },
      };
      w.timer = setTimeout(() => w.klaar(false), ms);
    });
    set.add(w);
    return { belofte, stop: () => w.klaar(false) };
  }

  meld(teamId, doc) {
    for (const w of [...(this.wachters.get(teamId) || [])]) if (doc.versie > w.na) w.klaar(true);
  }

  /** Bij afsluiten: iedereen die wacht een antwoord geven. */
  stopWachten() {
    for (const set of this.wachters.values()) for (const w of [...set]) w.klaar(false);
  }

  zie(teamId, g) {
    if (!this.gezien.has(teamId)) this.gezien.set(teamId, new Map());
    this.gezien.get(teamId).set(g.id, Date.now());
  }

  /** Wie er verder naar dit team kijkt: wachtend verzoek, of kort geleden gezien. */
  aanwezig(teamId, zelfId) {
    const ids = new Set();
    for (const [id, t] of this.gezien.get(teamId) || []) if (Date.now() - t < AANWEZIG_MS) ids.add(id);
    for (const w of this.wachters.get(teamId) || []) ids.add(w.gebruikerId);
    ids.delete(zelfId);
    return [...ids]
      .map((id) => this.data.gebruikers.find((g) => g.id === id))
      .filter(Boolean)
      .map((g) => ({ id: g.id, naam: g.naam }));
  }

  // --------------------------------------------------------------- opslag
  bewaarClub() { return this.schrijf(this.clubBestand, JSON.stringify(this.data, null, 1)); }
  bewaarDoc(id) { return this.schrijf(this.docPad(id), JSON.stringify(this.docs.get(id))); }

  /** Atomair, en per bestand één schrijver tegelijk: anders overschrijven twee
   *  snelle wijzigingen elkaars tijdelijke bestand. */
  async schrijf(pad, inhoud) {
    const vorige = this.schrijfRij.get(pad) || Promise.resolve();
    const deze = vorige.catch(() => {}).then(async () => {
      const tijdelijk = `${pad}.${process.pid}.tmp`;
      await writeFile(tijdelijk, inhoud, 'utf8');
      await rename(tijdelijk, pad);
    });
    this.schrijfRij.set(pad, deze);
    try { await deze; } finally { if (this.schrijfRij.get(pad) === deze) this.schrijfRij.delete(pad); }
  }
}
