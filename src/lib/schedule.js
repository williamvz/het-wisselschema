// De wisselschema-motor.
//
// Het schema wordt in twee lagen opgelost:
//
//   1. WIE speelt er in welk blok?  -> eerlijkheidsprobleem, opgelost met een
//      greedy startoplossing plus local search op een kostenfunctie.
//   2. WAAR staat iedereen?         -> toewijzingsprobleem, exact opgelost met
//      het Hongaars algoritme (speler x positie kostenmatrix).
//
// Die scheiding is belangrijk: speeltijd is een verdelingsvraag over de hele
// wedstrijd, positie is een vraag per blok. Samen oplossen maakt het onnodig
// hard en veel slechter uitlegbaar.
//
// Alles rekent in seconden vanaf de aftrap (alleen speeltijd, geen rust).

import { hungarian } from './hungarian.js';
import { getFormation, slotsForCount } from './formations.js';

export const STANDAARD_OPTIES = {
  eerlijkheid: 1,        // gewicht op kwadratische afwijking van de eerlijke speeltijd (per minuut^2)
  rustGewicht: 25,       // strafpunten als iemand twee blokken achter elkaar op de bank zit
  geenKeeperStraf: 500,  // strafpunten als er geen keeper op het veld staat
  vormAccent: 0,         // 0 = iedereen even veel, 1 = sterkte telt maximaal mee
  saldoGewicht: 0.6,     // hoe sterk het seizoenssaldo meeweegt (0 = niet)
  herstarts: 6,
  maxRondes: 12,
  seed: 20240101,
};

// ---------------------------------------------------------------- hulpjes

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let blokTeller = 0;
export function blokId() {
  blokTeller += 1;
  return `b${Date.now().toString(36)}${blokTeller.toString(36)}`;
}

const klem = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Beschikbaarheidsvenster van een speler, met defaults. */
export function venster(match, spelerId) {
  const v = (match.beschikbaar || {})[spelerId] || {};
  return { vanaf: v.vanaf ?? 0, tot: v.tot ?? Infinity };
}

/** Staat deze speler dit blok tot je beschikking? Getoetst op het midden van het blok. */
export function beschikbaarIn(match, spelerId, blok) {
  const v = venster(match, spelerId);
  const midden = (blok.vanSec + blok.totSec) / 2;
  return v.vanaf <= midden && v.tot >= midden;
}

export function totaleSpeeltijd(match) {
  return match.periodes * match.periodeMin * 60;
}

// ---------------------------------------------------------- blokken bouwen

/** Verse blokindeling op basis van kwarten en wisselmomenten per kwart. */
export function maakBlokken(match) {
  const perBlok = Math.round((match.periodeMin * 60) / match.blokkenPerPeriode);
  const blokken = [];
  let t = 0;
  for (let p = 0; p < match.periodes; p++) {
    for (let d = 0; d < match.blokkenPerPeriode; d++) {
      const laatste = d === match.blokkenPerPeriode - 1;
      const tot = laatste ? (p + 1) * match.periodeMin * 60 : t + perBlok;
      blokken.push({
        id: blokId(), periode: p, deel: d,
        vanSec: t, totSec: tot,
        vast: false, opstelling: {}, bank: [],
      });
      t = tot;
    }
  }
  return blokken;
}

/**
 * Splitst het blok waar tSec middenin valt in twee stukken. Het eerste stuk
 * houdt de opstelling (dat is immers wat er gespeeld is), het tweede stuk is
 * vrij om opnieuw in te vullen. Dit is de kern van het herplannen: een speler
 * die op minuut 23 uitvalt maakt van kwart 2 twee deelblokken.
 */
export function splitsOp(blokken, tSec, minStuk = 30) {
  const uit = [];
  for (const b of blokken) {
    if (tSec > b.vanSec + minStuk && tSec < b.totSec - minStuk) {
      uit.push({ ...b, totSec: tSec, opstelling: { ...b.opstelling }, bank: [...b.bank] });
      uit.push({ ...b, id: blokId(), deel: b.deel, vanSec: tSec, vast: false, opstelling: { ...b.opstelling }, bank: [...b.bank] });
    } else {
      uit.push({ ...b, opstelling: { ...b.opstelling }, bank: [...b.bank] });
    }
  }
  return uit;
}

/**
 * Alles wat voorbij is wordt historie: vast, niet meer herplanbaar.
 * De marge zorgt dat een blok dat toch al bijna afgelopen was volledig als
 * gespeeld telt, in plaats van met terugwerkende kracht te worden herschreven.
 */
export function vergrendelTot(blokken, tSec, marge = 30) {
  return blokken.map((b) => (b.totSec <= tSec + marge ? { ...b, vast: true } : b));
}

/**
 * Verschuift de grens tussen blok i en i+1 naar de werkelijke wisseltijd.
 * Je wisselt nooit precies op de seconde; dit houdt de boekhouding eerlijk
 * zonder de kwartgrenzen te verschuiven.
 */
export function verlegGrens(blokken, index, tSec) {
  if (index < 0 || index >= blokken.length - 1) return blokken;
  const onder = blokken[index].vanSec + 10;
  const boven = blokken[index + 1].totSec - 10;
  const t = klem(tSec, onder, boven);
  return blokken.map((b, i) => {
    if (i === index) return { ...b, totSec: t };
    if (i === index + 1) return { ...b, vanSec: t };
    return b;
  });
}

// ------------------------------------------------------- laag 1: wie speelt

function bepaalDoelen(match, spelers, blokken, capaciteit, opties) {
  const totaalVeldSec = blokken.reduce((s, b, i) => s + (b.totSec - b.vanSec) * capaciteit[i], 0);

  const sterktes = spelers.map((p) => p.sterkte ?? 3);
  const gemSterkte = sterktes.reduce((a, b) => a + b, 0) / (sterktes.length || 1);

  const gewichten = spelers.map((p) => {
    let g = blokken.reduce((s, b) => s + (beschikbaarIn(match, p.id, b) ? b.totSec - b.vanSec : 0), 0);
    // Accent op basisspelers: alleen als de coach de schuif bewust opendraait.
    g *= 1 + opties.vormAccent * (((p.sterkte ?? 3) - gemSterkte) / 4);
    return Math.max(0, g);
  });
  const somGewicht = gewichten.reduce((a, b) => a + b, 0) || 1;

  const doelen = new Map();
  spelers.forEach((p, i) => doelen.set(p.id, (totaalVeldSec * gewichten[i]) / somGewicht));

  // Seizoenssaldo als zacht duwtje: wie voorstaat speelt vandaag iets minder.
  // Begrensd op een half blok, zodat het nooit een hele wedstrijd scheeftrekt.
  if (opties.saldoGewicht > 0 && blokken.length) {
    const blokDuur = (blokken[0].totSec - blokken[0].vanSec) || 600;
    const maxCorr = blokDuur / 2;
    const ruw = spelers.map((p) => klem(-(p.saldoSec || 0) * opties.saldoGewicht, -maxCorr, maxCorr));
    const gem = ruw.reduce((a, b) => a + b, 0) / (ruw.length || 1);
    spelers.forEach((p, i) => doelen.set(p.id, doelen.get(p.id) + (ruw[i] - gem)));
  }
  return { doelen, totaalVeldSec };
}

function kostenVan(aanwezig, ctx) {
  const { blokken, spelers, doelen, opties, beschikbaarMatrix, heeftKeepers, capaciteit } = ctx;
  let c = 0;

  // 1. eerlijke speeltijd
  const gespeeld = new Map(spelers.map((p) => [p.id, 0]));
  for (let i = 0; i < blokken.length; i++) {
    const duur = blokken[i].totSec - blokken[i].vanSec;
    for (const id of aanwezig[i]) if (gespeeld.has(id)) gespeeld.set(id, gespeeld.get(id) + duur);
  }
  for (const p of spelers) {
    const dev = (gespeeld.get(p.id) - doelen.get(p.id)) / 60;
    c += opties.eerlijkheid * dev * dev;
  }

  // 2. niet twee blokken achter elkaar op de bank
  for (let s = 0; s < spelers.length; s++) {
    let reeks = 0;
    for (let i = 0; i < blokken.length; i++) {
      if (!beschikbaarMatrix[s][i]) { reeks = 0; continue; }
      if (aanwezig[i].has(spelers[s].id)) reeks = 0;
      else { reeks += 1; if (reeks >= 2) c += opties.rustGewicht; }
    }
  }

  // 3. er hoort een keeper op het veld te staan
  if (heeftKeepers) {
    for (let i = 0; i < blokken.length; i++) {
      if (capaciteit[i] <= 0) continue;
      let ok = false;
      for (const id of aanwezig[i]) {
        const p = spelers.find((q) => q.id === id);
        if (p && p.keeper) { ok = true; break; }
      }
      if (!ok) c += opties.geenKeeperStraf;
    }
  }
  return c;
}

function losWieOp(ctx, rng) {
  const { blokken, spelers, doelen, capaciteit, openIdx, gepind, beschikbaarMatrix } = ctx;
  const idx = new Map(spelers.map((p, i) => [p.id, i]));

  const startAanwezig = () => ctx.basisAanwezig.map((s) => new Set(s));

  const kandidatenVoor = (i) =>
    spelers.filter((p, s) => beschikbaarMatrix[s][i] && !gepind[i].has(p.id));

  // --- greedy startoplossing: wie het verst achterloopt komt erin
  const greedy = () => {
    const aanwezig = startAanwezig();
    const gespeeld = new Map(spelers.map((p) => [p.id, 0]));
    for (let i = 0; i < blokken.length; i++) {
      const duur = blokken[i].totSec - blokken[i].vanSec;
      if (!openIdx.includes(i)) {
        for (const id of aanwezig[i]) if (gespeeld.has(id)) gespeeld.set(id, gespeeld.get(id) + duur);
        continue;
      }
      const nodig = capaciteit[i] - aanwezig[i].size;
      const kand = kandidatenVoor(i)
        .filter((p) => !aanwezig[i].has(p.id))
        .map((p) => {
          const tekort = doelen.get(p.id) - gespeeld.get(p.id);
          const zatVorige = i > 0 && !aanwezig[i - 1].has(p.id) && beschikbaarMatrix[idx.get(p.id)][i - 1];
          return { p, score: tekort + (zatVorige ? duur * 0.75 : 0) + rng() * 30 };
        })
        .sort((a, b) => b.score - a.score);
      for (let k = 0; k < nodig && k < kand.length; k++) aanwezig[i].add(kand[k].p.id);
      for (const id of aanwezig[i]) if (gespeeld.has(id)) gespeeld.set(id, gespeeld.get(id) + duur);
    }
    return aanwezig;
  };

  const willekeurig = () => {
    const aanwezig = startAanwezig();
    for (const i of openIdx) {
      const kand = kandidatenVoor(i).filter((p) => !aanwezig[i].has(p.id));
      for (let k = kand.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [kand[k], kand[j]] = [kand[j], kand[k]];
      }
      const nodig = capaciteit[i] - aanwezig[i].size;
      for (let k = 0; k < nodig && k < kand.length; k++) aanwezig[i].add(kand[k].id);
    }
    return aanwezig;
  };

  // --- local search: ruil een veldspeler tegen een bankspeler zolang dat helpt
  const verbeter = (aanwezig) => {
    let beste = kostenVan(aanwezig, ctx);
    for (let ronde = 0; ronde < ctx.opties.maxRondes; ronde++) {
      let verbeterd = false;
      for (const i of openIdx) {
        const veld = [...aanwezig[i]].filter((id) => !gepind[i].has(id));
        const bank = kandidatenVoor(i).filter((p) => !aanwezig[i].has(p.id)).map((p) => p.id);
        for (const a of veld) {
          for (const b of bank) {
            if (!aanwezig[i].has(a) || aanwezig[i].has(b)) continue;
            aanwezig[i].delete(a); aanwezig[i].add(b);
            const k = kostenVan(aanwezig, ctx);
            if (k < beste - 1e-9) { beste = k; verbeterd = true; }
            else { aanwezig[i].delete(b); aanwezig[i].add(a); }
          }
        }
      }
      if (!verbeterd) break;
    }
    return beste;
  };

  let besteOpl = greedy();
  let besteKosten = verbeter(besteOpl);
  for (let r = 0; r < ctx.opties.herstarts; r++) {
    const kand = willekeurig();
    const k = verbeter(kand);
    if (k < besteKosten - 1e-9) { besteKosten = k; besteOpl = kand; }
  }
  return { aanwezig: besteOpl, kosten: besteKosten };
}

// ------------------------------------------------- laag 2: waar staat iedereen

function kiesKeepers(blokken, aanwezig, spelers, formatie, rng) {
  const heeftKeeperSlot = formatie.slots.some((s) => s.role === 'K');
  if (!heeftKeeperSlot) return { keeperPer: blokken.map(() => null), zonderKeeper: [] };

  const opId = new Map(spelers.map((p) => [p.id, p]));
  const telling = new Map();
  const keeperPer = [];
  const zonderKeeper = [];
  let vorige = null;

  for (let i = 0; i < blokken.length; i++) {
    const b = blokken[i];
    if (b.vast) {
      const keeperSlot = formatie.slots.find((s) => s.role === 'K');
      const id = b.opstelling[keeperSlot.id] || null;
      if (id) telling.set(id, (telling.get(id) || 0) + 1);
      keeperPer.push(id);
      vorige = id ? { id, periode: b.periode } : null;
      continue;
    }
    const opVeld = [...aanwezig[i]].map((id) => opId.get(id)).filter(Boolean);
    let kandidaten = opVeld.filter((p) => p.keeper);
    if (!kandidaten.length) { kandidaten = opVeld; if (opVeld.length) zonderKeeper.push(i); }
    if (!kandidaten.length) { keeperPer.push(null); continue; }

    const gescoord = kandidaten.map((p) => {
      let s = (telling.get(p.id) || 0) * 100;
      // binnen hetzelfde kwart niet van keeper wisselen
      if (vorige && vorige.id === p.id && vorige.periode === b.periode) s -= 1000;
      // en liever niet twee kwarten achter elkaar in het doel
      else if (vorige && vorige.id === p.id) s += 60;
      return { p, s: s + rng() * 5 };
    }).sort((a, b2) => a.s - b2.s);

    const keeper = gescoord[0].p;
    telling.set(keeper.id, (telling.get(keeper.id) || 0) + 1);
    keeperPer.push(keeper.id);
    vorige = { id: keeper.id, periode: b.periode };
  }
  return { keeperPer, zonderKeeper };
}

function wijsPositiesToe(blokken, aanwezig, spelers, formatie, keeperPer, gepind) {
  const opId = new Map(spelers.map((p) => [p.id, p]));
  const slotTelling = new Map(); // "spelerId|slotId" -> hoe vaak al
  let vorigeOpstelling = null;
  const uit = [];

  for (let i = 0; i < blokken.length; i++) {
    const b = blokken[i];
    if (b.vast) {
      for (const [slotId, pid] of Object.entries(b.opstelling)) {
        const k = `${pid}|${slotId}`;
        slotTelling.set(k, (slotTelling.get(k) || 0) + 1);
      }
      uit.push({ ...b });
      vorigeOpstelling = b.opstelling;
      continue;
    }

    const opVeld = [...aanwezig[i]];
    const slots = slotsForCount(formatie, opVeld.length);
    const pin = gepind[i];

    // Waar stond iedereen net? Zonder die referentie herverdeelt het algoritme
    // bij elke herberekening het hele elftal - dat is langs de lijn onwerkbaar.
    // Eerst het vorige blok (dat staat nu echt op het veld), anders wat er
    // voor dit blok al gepland stond.
    const eigenOud = Object.keys(b.opstelling).length ? b.opstelling : null;
    const referentie = vorigeOpstelling || eigenOud;

    // Gepinde spelers krijgen hun slot; de rest wordt exact toegewezen.
    const vastSlot = new Map();
    for (const [slotId, pid] of pin.entries()) if (opVeld.includes(pid)) vastSlot.set(pid, slotId);

    const vrijeSpelers = opVeld.filter((id) => !vastSlot.has(id));
    const bezet = new Set(vastSlot.values());
    const vrijeSlots = slots.filter((s) => !bezet.has(s.id));

    const n = Math.min(vrijeSpelers.length, vrijeSlots.length);
    const opstelling = {};
    for (const [pid, slotId] of vastSlot.entries()) opstelling[slotId] = pid;

    if (n > 0) {
      const matrix = vrijeSpelers.slice(0, n).map((pid) => {
        const p = opId.get(pid) || { posities: [] };
        return vrijeSlots.map((slot) => {
          let c = 0;
          if (slot.role === 'K') c += keeperPer[i] === pid ? 0 : 5000;
          else if (keeperPer[i] === pid) c += 5000;
          else {
            const voorkeur = p.posities || [];
            if (voorkeur.length) c += voorkeur.includes(slot.role) ? 0 : 18;
          }
          const vorigSlotId = referentie && Object.keys(referentie).find((sid) => referentie[sid] === pid);
          if (vorigSlotId === slot.id) {
            c -= 14; // blijven staan is bijna altijd beter dan een mooiere positie
          } else if (vorigSlotId) {
            const vorigSlot = formatie.slots.find((s) => s.id === vorigSlotId);
            if (vorigSlot && vorigSlot.role === slot.role) c -= 5;
          } else if (eigenOud && referentie !== eigenOud) {
            // Invaller: zet hem op de plek die voor dit blok al voor hem klaarlag.
            const gepland = Object.keys(eigenOud).find((sid) => eigenOud[sid] === pid);
            if (gepland === slot.id) c -= 6;
          }
          c += (slotTelling.get(`${pid}|${slot.id}`) || 0) * 1.5;
          return c;
        });
      });
      const toewijzing = hungarian(matrix);
      toewijzing.forEach((kolom, rij) => {
        if (kolom >= 0) opstelling[vrijeSlots[kolom].id] = vrijeSpelers[rij];
      });
    }

    for (const [slotId, pid] of Object.entries(opstelling)) {
      const k = `${pid}|${slotId}`;
      slotTelling.set(k, (slotTelling.get(k) || 0) + 1);
    }

    const opVeldSet = new Set(Object.values(opstelling));
    const bank = spelers.filter((p) => !opVeldSet.has(p.id)).map((p) => p.id);
    uit.push({ ...b, opstelling, bank });
    vorigeOpstelling = opstelling;
  }
  return uit;
}

// ------------------------------------------------------------- hoofdingang

/**
 * Bouwt (of herbouwt) het wisselschema.
 * Vaste blokken blijven onaangeroerd - dat is gespeelde historie.
 *
 * @param {object} match
 * @param {Array} alleSpelers  de complete selectie van het team
 * @returns {{blokken, waarschuwingen, statistieken, wissels, kosten}}
 */
export function planWedstrijd(match, alleSpelers, opties = {}) {
  const o = { ...STANDAARD_OPTIES, ...(match.opties || {}), ...opties };
  const formatie = getFormation(match.formationId);
  const spelers = (match.selectie || [])
    .map((id) => alleSpelers.find((p) => p.id === id))
    .filter(Boolean);

  let blokken = (match.blokken && match.blokken.length ? match.blokken : maakBlokken(match))
    .map((b) => ({ ...b, opstelling: { ...b.opstelling }, bank: [...(b.bank || [])] }));

  if (!spelers.length) {
    return { blokken, waarschuwingen: [{ ernst: 'info', tekst: 'Nog geen spelers geselecteerd voor deze wedstrijd.' }], statistieken: [], wissels: [], kosten: 0 };
  }

  const beschikbaarMatrix = spelers.map((p) => blokken.map((b) => beschikbaarIn(match, p.id, b)));
  const capaciteit = blokken.map((b, i) => {
    if (b.vast) return Object.keys(b.opstelling).length;
    const aantal = beschikbaarMatrix.reduce((s, rij) => s + (rij[i] ? 1 : 0), 0);
    return Math.min(formatie.slots.length, aantal);
  });

  const pinsPerBlok = blokken.map((b) => {
    const m = new Map();
    const pin = (match.pins || {})[b.id] || {};
    for (const [slotId, pid] of Object.entries(pin)) if (spelers.some((p) => p.id === pid)) m.set(slotId, pid);
    return m;
  });
  const gepind = pinsPerBlok.map((m) => new Set(m.values()));

  const basisAanwezig = blokken.map((b, i) => {
    if (b.vast) return new Set(Object.values(b.opstelling));
    return new Set(gepind[i]);
  });
  const openIdx = blokken.map((b, i) => (b.vast ? -1 : i)).filter((i) => i >= 0);

  const { doelen } = bepaalDoelen(match, spelers, blokken, capaciteit, o);
  const heeftKeepers = spelers.some((p) => p.keeper) && formatie.slots.some((s) => s.role === 'K');

  const ctx = { blokken, spelers, doelen, opties: o, beschikbaarMatrix, capaciteit, openIdx, gepind, basisAanwezig, heeftKeepers };
  const rng = mulberry32(o.seed);
  const { aanwezig, kosten } = losWieOp(ctx, rng);

  const { keeperPer, zonderKeeper } = kiesKeepers(blokken, aanwezig, spelers, formatie, rng);
  blokken = wijsPositiesToe(blokken, aanwezig, spelers, formatie, keeperPer, pinsPerBlok);

  const stats = statistieken(blokken, spelers, formatie);
  const waarschuwingen = maakWaarschuwingen({ match, blokken, spelers, formatie, stats, capaciteit, zonderKeeper, beschikbaarMatrix, doelen });

  return { blokken, waarschuwingen, statistieken: stats, wissels: wisselLijst(blokken, spelers, formatie), kosten };
}

// ------------------------------------------------------------- afgeleide info

export function statistieken(blokken, spelers, formatie) {
  const keeperSlots = new Set(formatie.slots.filter((s) => s.role === 'K').map((s) => s.id));
  const totaal = blokken.reduce((s, b) => s + (b.totSec - b.vanSec), 0);

  return spelers.map((p) => {
    let speelSec = 0, keeperSec = 0, blokkenGespeeld = 0, bankBlokken = 0, langsteBank = 0, reeks = 0;
    const perRol = { K: 0, V: 0, M: 0, A: 0 };
    for (const b of blokken) {
      const duur = b.totSec - b.vanSec;
      const slotId = Object.keys(b.opstelling).find((sid) => b.opstelling[sid] === p.id);
      if (slotId) {
        speelSec += duur; blokkenGespeeld += 1; reeks = 0;
        if (keeperSlots.has(slotId)) keeperSec += duur;
        const slot = formatie.slots.find((s) => s.id === slotId);
        if (slot) perRol[slot.role] += duur;
      } else {
        bankBlokken += 1; reeks += 1; langsteBank = Math.max(langsteBank, reeks);
      }
    }
    return {
      spelerId: p.id, naam: p.naam,
      speelSec, bankSec: totaal - speelSec, keeperSec,
      blokken: blokkenGespeeld, bankBlokken, langsteBankReeks: langsteBank, perRol,
    };
  }).sort((a, b) => b.speelSec - a.speelSec);
}

/** Per wisselmoment: wie eruit, wie erin, en wie er van positie verandert. */
export function wisselLijst(blokken, spelers, formatie) {
  const naam = new Map(spelers.map((p) => [p.id, p.naam]));
  const slotVan = (opst, pid) => Object.keys(opst).find((sid) => opst[sid] === pid);
  const label = (sid) => (formatie.slots.find((s) => s.id === sid) || {}).label || sid;

  const uit = [];
  for (let i = 1; i < blokken.length; i++) {
    const vorig = blokken[i - 1], nu = blokken[i];
    const vorigeSpelers = new Set(Object.values(vorig.opstelling));
    const nieuweSpelers = new Set(Object.values(nu.opstelling));

    const eruit = [...vorigeSpelers].filter((id) => !nieuweSpelers.has(id));
    const erin = [...nieuweSpelers].filter((id) => !vorigeSpelers.has(id));
    const verplaatst = [...nieuweSpelers]
      .filter((id) => vorigeSpelers.has(id) && slotVan(vorig.opstelling, id) !== slotVan(nu.opstelling, id))
      .map((id) => ({ spelerId: id, naam: naam.get(id), van: label(slotVan(vorig.opstelling, id)), naar: label(slotVan(nu.opstelling, id)) }));

    uit.push({
      blokIndex: i, blokId: nu.id, opSec: nu.vanSec, periode: nu.periode,
      eruit: eruit.map((id) => ({ spelerId: id, naam: naam.get(id), van: label(slotVan(vorig.opstelling, id)) })),
      erin: erin.map((id) => ({ spelerId: id, naam: naam.get(id), naar: label(slotVan(nu.opstelling, id)) })),
      verplaatst,
    });
  }
  return uit;
}

function maakWaarschuwingen({ match, blokken, spelers, formatie, stats, capaciteit, zonderKeeper }) {
  const w = [];
  const kwart = (b) => `kwart ${b.periode + 1}`;

  for (const i of zonderKeeper) {
    w.push({ ernst: 'hoog', tekst: `Geen echte keeper beschikbaar in ${kwart(blokken[i])} - er staat nu een veldspeler op doel.` });
  }
  blokken.forEach((b, i) => {
    if (!b.vast && capaciteit[i] > 0 && capaciteit[i] < formatie.slots.length) {
      w.push({ ernst: 'hoog', tekst: `Te weinig spelers in ${kwart(b)}: je speelt met ${capaciteit[i]} in plaats van ${formatie.slots.length}.` });
    }
  });

  // Spelers die uit de wedstrijd zijn gehaald of later aansloten tellen niet mee
  // in de eerlijkheidscontrole: hun korte speeltijd is een feit, geen planfout.
  const heleWedstrijd = totaleSpeeltijd(match);
  const deeltijd = new Set((match.selectie || []).filter((id) => {
    const v = venster(match, id);
    return v.tot < heleWedstrijd - 1 || v.vanaf > 1;
  }));

  const volledig = stats.filter((s) => s.speelSec > 0 && !deeltijd.has(s.spelerId));
  if (volledig.length > 1) {
    const max = volledig[0], laagste = volledig[volledig.length - 1];
    const verschilMin = (max.speelSec - laagste.speelSec) / 60;
    const blokDuur = blokken.length ? (blokken[0].totSec - blokken[0].vanSec) / 60 : 10;
    if (verschilMin > blokDuur * 1.2) {
      w.push({ ernst: 'midden', tekst: `Speeltijd loopt uiteen: ${max.naam} ${Math.round(max.speelSec / 60)} min, ${laagste.naam} ${Math.round(laagste.speelSec / 60)} min.` });
    }
  }
  for (const s of stats) {
    if (deeltijd.has(s.spelerId)) continue;
    if (s.speelSec === 0) w.push({ ernst: 'hoog', tekst: `${s.naam} komt in dit schema helemaal niet in actie.` });
    else if (s.langsteBankReeks >= 2) w.push({ ernst: 'midden', tekst: `${s.naam} zit ${s.langsteBankReeks} blokken achter elkaar op de bank.` });
  }

  for (const id of deeltijd) {
    const p = spelers.find((q) => q.id === id);
    if (!p) continue;
    const v = venster(match, id);
    const s = stats.find((x) => x.spelerId === id);
    const gespeeldMin = Math.round((s ? s.speelSec : 0) / 60);
    if (v.tot < heleWedstrijd - 1) {
      w.push({ ernst: 'info', tekst: `${p.naam} is op ${Math.round(v.tot / 60)} min uit de wedstrijd gehaald (${gespeeldMin} min gespeeld) - het schema is hierop aangepast.` });
    } else {
      w.push({ ernst: 'info', tekst: `${p.naam} sloot aan vanaf ${Math.round(v.vanaf / 60)} min (${gespeeldMin} min gespeeld).` });
    }
  }
  return w;
}


// ------------------------------------------------------ herplannen tijdens de wedstrijd

/**
 * Bevriest de wedstrijd op `opSec`, verwerkt de wijzigingen en plant de rest
 * opnieuw. Dit is de enige route waarlangs de wedstrijd tijdens het spelen
 * verandert - of het nu een geplande wissel, een blessure of een late
 * binnenkomer is.
 *
 * wijzigingen: [{ type: 'uit' | 'erin' | 'terug', spelerId }]
 *   uit   - speler stopt nu (blessure, moe, rode kaart)
 *   erin  - speler sluit nu aan (kwam te laat)
 *   terug - eerder uitgevallen speler kan toch weer verder
 */
export function herplan(match, alleSpelers, { opSec = 0, wijzigingen = [], opties = {} } = {}) {
  let blokken = match.blokken && match.blokken.length ? match.blokken : maakBlokken(match);
  if (opSec > 0) {
    blokken = splitsOp(blokken, opSec);
    blokken = vergrendelTot(blokken, opSec);
  }

  const beschikbaar = { ...(match.beschikbaar || {}) };
  const selectie = [...(match.selectie || [])];

  for (const wz of wijzigingen) {
    const huidig = beschikbaar[wz.spelerId] || {};
    if (wz.type === 'uit') {
      beschikbaar[wz.spelerId] = { vanaf: huidig.vanaf ?? 0, tot: opSec };
    } else if (wz.type === 'erin') {
      if (!selectie.includes(wz.spelerId)) selectie.push(wz.spelerId);
      beschikbaar[wz.spelerId] = { vanaf: opSec, tot: huidig.tot ?? Infinity };
    } else if (wz.type === 'terug') {
      beschikbaar[wz.spelerId] = { vanaf: huidig.vanaf ?? 0, tot: Infinity };
    }
  }

  const bijgewerkt = { ...match, blokken, beschikbaar, selectie };
  const resultaat = planWedstrijd(bijgewerkt, alleSpelers, opties);
  return { match: { ...bijgewerkt, blokken: resultaat.blokken }, ...resultaat };
}

/**
 * Registreert dat de wissel op de grens na `blokIndex` werkelijk op `tSec`
 * is uitgevoerd. Je wisselt nooit precies op de seconde; dit houdt de
 * speeltijdboekhouding eerlijk zonder de kwartgrenzen te verschuiven.
 */
export function wisselUitgevoerd(match, alleSpelers, blokIndex, tSec) {
  let blokken = verlegGrens(match.blokken, blokIndex, tSec);
  blokken = vergrendelTot(blokken, tSec);
  const bijgewerkt = { ...match, blokken };
  const resultaat = planWedstrijd(bijgewerkt, alleSpelers);
  return { match: { ...bijgewerkt, blokken: resultaat.blokken }, ...resultaat };
}

/** Welk blok is op tijdstip t aan de beurt? */
export function blokOp(blokken, tSec) {
  for (let i = 0; i < blokken.length; i++) {
    if (tSec < blokken[i].totSec || i === blokken.length - 1) return i;
  }
  return blokken.length - 1;
}
