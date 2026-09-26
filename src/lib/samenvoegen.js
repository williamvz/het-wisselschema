// Twee trainers, twee telefoons, één team. Veranderen ze tegelijk iets, dan
// moeten beide wijzigingen blijven staan: een goal van de een mag niet
// verdwijnen omdat de ander net een wissel doorgaf.
//
// Dat is een driewegsamenvoeging. `basis` is de laatste stand die beide
// kanten kenden, `mijn` en `hun` zijn wat er daarna los van elkaar van
// gemaakt is. Wat maar aan één kant veranderde, komt er gewoon in. Waar
// beide kanten iets aan veranderden, wordt dieper gekeken:
//
//   objecten              per sleutel
//   lijsten met een id    per id: spelers, doelpunten, het archief. Twee
//                         nieuwe goals komen er dus allebei in.
//   lijsten met waarden   als verzameling: de selectie van een wedstrijd
//
// Wat dan nog botst, is een echt conflict: beide kanten gaven hetzelfde
// veld een andere waarde. Dan wint `mijn` - behalve bij de klok en het
// schema. Daar wint de laatste wijziging, ongeacht welke telefoon het eerst
// weer bereik had: wie een kwartier offline stond, mag bij terugkomst niet
// de wissel van zijn collega terugdraaien.
//
// Zonder DOM, zodat het in Node getest kan worden.

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const leeg = (x) => x === null || x === undefined;

/** Diepe gelijkheid, ongeacht de volgorde van sleutels. `null` en ontbreken tellen als gelijk. */
export function gelijk(a, b) {
  if (a === b) return true;
  if (leeg(a) || leeg(b)) return leeg(a) && leeg(b);
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!gelijk(a[i], b[i])) return false;
    return true;
  }
  if (isObject(a)) {
    if (!isObject(b)) return false;
    for (const k of Object.keys(a)) if (!gelijk(a[k], b[k])) return false;
    for (const k of Object.keys(b)) if (!(k in a) && !leeg(b[k])) return false;
    return true;
  }
  return false;
}

// Het schema (blokken en de vastgezette opstellingen) hoort bij elkaar en
// wordt nooit half van de een en half van de ander. De wedstrijd onthoudt
// in `planMs` wanneer het schema voor het laatst veranderde.
const SCHEMA = new Set(['blokken', 'pins', 'planMs']);

/**
 * @param basis  gemeenschappelijke voorganger (mag ontbreken)
 * @param mijn   deze kant
 * @param hun    de andere kant
 * @param pad    waar we zijn, bv. 'wedstrijd.klok' - voor de regels hierboven
 */
export function voegSamen(basis, mijn, hun, pad = '') {
  if (gelijk(mijn, hun)) return mijn;
  if (gelijk(basis, mijn)) return hun;
  if (gelijk(basis, hun)) return mijn;

  // Vanaf hier veranderden beide kanten iets.
  if (pad === 'wedstrijd') {
    const [b, m, h] = [basis?.id, mijn?.id, hun?.id];
    // Een afgeronde, weggegooide of nieuwe wedstrijd wint van bijwerken van
    // de oude: je voegt geen goal meer toe aan een wedstrijd die al in het
    // archief staat.
    if (m !== h) return m === b ? hun : mijn;
  }
  if (pad === 'wedstrijd.klok') {
    return (hun?.bijgewerkt || 0) > (mijn?.bijgewerkt || 0) ? hun : mijn;
  }
  if (isObject(mijn) && isObject(hun)) return voegObjectSamen(isObject(basis) ? basis : {}, mijn, hun, pad);
  if (Array.isArray(mijn) && Array.isArray(hun)) {
    const b = Array.isArray(basis) ? basis : [];
    if (metId(b) && metId(mijn) && metId(hun)) return voegLijstSamen(b, mijn, hun, pad);
    if (waarden(b) && waarden(mijn) && waarden(hun)) return voegVerzamelingSamen(b, mijn, hun);
  }
  return mijn;
}

function voegObjectSamen(basis, mijn, hun, pad) {
  // Bij de wedstrijd: wiens schema is het nieuwst?
  const schemaVanHun = pad === 'wedstrijd' && (hun.planMs || 0) > (mijn.planMs || 0);
  const uit = {};
  for (const k of new Set([...Object.keys(mijn), ...Object.keys(hun)])) {
    let v;
    if (pad === 'wedstrijd' && SCHEMA.has(k) && !gelijk(basis[k], mijn[k]) && !gelijk(basis[k], hun[k])) {
      v = schemaVanHun ? hun[k] : mijn[k];
    } else {
      v = voegSamen(basis[k], mijn[k], hun[k], pad ? `${pad}.${k}` : k);
    }
    if (v !== undefined) uit[k] = v;
  }
  return uit;
}

const metId = (lijst) => lijst.every((x) => isObject(x) && !leeg(x.id));
const waarden = (lijst) => lijst.every((x) => ['string', 'number', 'boolean'].includes(typeof x));

function voegLijstSamen(basis, mijn, hun, pad) {
  const B = new Map(basis.map((x) => [x.id, x]));
  const M = new Map(mijn.map((x) => [x.id, x]));
  const H = new Map(hun.map((x) => [x.id, x]));

  // De volgorde van `hun`, met wat alleen `mijn` heeft op de plek waar het
  // bij mij stond: een nieuw archiefstuk vooraan, een nieuwe speler achteraan.
  const volgorde = hun.map((x) => x.id);
  mijn.forEach((x, i) => {
    if (H.has(x.id) || volgorde.includes(x.id)) return;
    let j = i - 1;
    while (j >= 0 && !volgorde.includes(mijn[j].id)) j--;
    volgorde.splice(j < 0 ? 0 : volgorde.indexOf(mijn[j].id) + 1, 0, x.id);
  });

  const uit = [];
  for (const id of volgorde) {
    const [inB, inM, inH] = [B.has(id), M.has(id), H.has(id)];
    if (inM && inH) uit.push(voegSamen(B.get(id), M.get(id), H.get(id), `${pad}[]`));
    // Aan één kant weg: dan blijft hij alleen als hij nieuw is, of als de
    // andere kant hem intussen veranderde (bijwerken wint van weggooien).
    else if (inM) { if (!inB || !gelijk(B.get(id), M.get(id))) uit.push(M.get(id)); }
    else if (inH) { if (!inB || !gelijk(B.get(id), H.get(id))) uit.push(H.get(id)); }
  }
  return uit;
}

function voegVerzamelingSamen(basis, mijn, hun) {
  const [B, M, H] = [new Set(basis), new Set(mijn), new Set(hun)];
  const uit = [];
  for (const x of mijn) if (H.has(x) || !B.has(x)) uit.push(x); // tenzij de ander hem weghaalde
  for (const x of hun) if (!M.has(x) && !B.has(x)) uit.push(x);  // nieuw van de ander
  return [...new Set(uit)];
}
