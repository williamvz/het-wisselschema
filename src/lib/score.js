// De stand bijhouden, en per speler tellen wat er gebeurde terwijl hij op
// het veld stond. Zonder DOM, zodat het ook in Node getest kan worden.
//
// Een doelpunt: { id, wie: 'wij' | 'zij', sec, opVeld: [spelerId, ...] }.
// `opVeld` is een momentopname: wie er stond toen de bal erin ging. Dat is
// genoeg voor de vraag langs de lijn: "met welke opstelling scoren we, en
// wanneer krijgen we er een tegen?"

export function stand(doelpunten = []) {
  let wij = 0, zij = 0;
  for (const d of doelpunten) { if (d.wie === 'wij') wij++; else if (d.wie === 'zij') zij++; }
  return { wij, zij };
}

/** Per speler: doelpunten voor en tegen terwijl hij in het veld stond. */
export function plusMin(doelpunten = []) {
  const uit = {};
  for (const d of doelpunten) {
    for (const id of d.opVeld || []) {
      const r = (uit[id] ||= { voor: 0, tegen: 0, saldo: 0 });
      if (d.wie === 'wij') r.voor++; else r.tegen++;
      r.saldo = r.voor - r.tegen;
    }
  }
  return uit;
}

/** Tussenstand na elk doelpunt, in volgorde van de klok. */
export function verloop(doelpunten = []) {
  let wij = 0, zij = 0;
  return [...doelpunten].sort((a, b) => a.sec - b.sec).map((d) => {
    if (d.wie === 'wij') wij++; else zij++;
    return { ...d, wij, zij };
  });
}

/** Minuut zoals op het wedstrijdformulier: een goal na 0:30 is in de 1e minuut. */
export const goalMinuut = (sec) => Math.max(1, Math.ceil(sec / 60));
