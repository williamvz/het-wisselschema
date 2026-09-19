// Scherm: het wisselschema. Raster om in één oogopslag te zien wie wanneer
// speelt, plus per blok de opstelling en de wisselinstructie.

import { h, icoon, toonSheet, melding, minutenTekst, mmss, kopieer, bevestig, voornaam } from './ui.js';
import { S, wijzig, plan, genereer, deelLink, klokStart } from './store.js';
import { getFormation, slotsForCount } from '../lib/formations.js';
import { tekenVeld } from './veld.js';

let gekozenBlok = 0;

export function blokLabel(blok, w) {
  const p = `K${blok.periode + 1}`;
  return w.blokkenPerPeriode > 1 ? `${p}${'abcd'[blok.deel] || blok.deel + 1}` : p;
}

export function schermSchema(ganaar) {
  const w = S.wedstrijd;
  if (!w || !w.blokken) {
    return h('div', { class: 'kaart' }, h('div', { class: 'leeg' },
      h('p', {}, 'Er is nog geen schema.'),
      h('button', { class: 'knop primair', onclick: () => ganaar('opzet') }, 'Wedstrijd klaarzetten')));
  }

  const p = plan();
  const formatie = getFormation(w.formationId);
  const spelers = w.selectie.map((id) => S.team.spelers.find((q) => q.id === id)).filter(Boolean);
  const wrap = h('div', {});

  // ---- waarschuwingen
  if (p.waarschuwingen.length) {
    const doos = h('div', { style: { marginBottom: '12px' } });
    for (const m of p.waarschuwingen) {
      doos.appendChild(h('div', { class: `melding ${m.ernst}` },
        h('span', { class: 'ico' }, m.ernst === 'hoog' ? '!' : m.ernst === 'midden' ? '!' : 'i'),
        h('span', {}, m.tekst)));
    }
    wrap.appendChild(doos);
  }

  // ---- raster
  const kaart = h('div', { class: 'kaart' });
  kaart.appendChild(h('div', { class: 'kaart-kop' },
    h('h2', {}, 'Wisselschema'),
    h('span', { class: 'mini' }, `${w.periodes * w.periodeMin} min`)));
  kaart.appendChild(h('div', { class: 'schema-wrap' }, rasterTabel(w, p, spelers, formatie)));
  kaart.appendChild(h('p', { class: 'uitleg', style: { marginTop: '10px', marginBottom: '0' } },
    'Tik op een vakje om iemand te ruilen. Een dikke rand betekent dat je het blok zelf hebt vastgezet.'));
  wrap.appendChild(kaart);

  // ---- blok voor blok
  gekozenBlok = Math.min(gekozenBlok, p.blokken.length - 1);
  const kiezer = h('div', { class: 'segment', style: { marginBottom: '12px', overflowX: 'auto' } });
  p.blokken.forEach((b, i) => {
    kiezer.appendChild(h('button', { 'aria-pressed': String(i === gekozenBlok),
      style: { minWidth: '58px', flex: 'none' },
      onclick: () => { gekozenBlok = i; hertekenDetail(); } },
      blokLabel(b, w), h('small', { style: { display: 'block', fontSize: '.64rem', opacity: '.7' } },
        `${Math.round(b.vanSec / 60)}-${Math.round(b.totSec / 60)}`)));
  });
  wrap.appendChild(kiezer);

  const detail = h('div', {});
  wrap.appendChild(detail);
  const hertekenDetail = () => {
    detail.replaceChildren(blokDetail(w, p, spelers, formatie, gekozenBlok));
    [...kiezer.children].forEach((k, i) => k.setAttribute('aria-pressed', String(i === gekozenBlok)));
  };
  hertekenDetail();

  // ---- acties
  wrap.appendChild(h('div', { class: 'knoprij niet-printen', style: { marginTop: '14px' } },
    h('button', { class: 'knop', onclick: () => { genereer({ nieuweSeed: true }); melding('Nieuw schema gemaakt'); } },
      icoon('vernieuw', 18), 'Andere variant'),
    h('button', { class: 'knop', onclick: deelSheet }, icoon('deel', 18), 'Delen'),
    h('button', { class: 'knop', onclick: () => window.print() }, 'Printen')));

  wrap.appendChild(h('button', { class: 'knop primair breed groot niet-printen', style: { marginTop: '10px' },
    onclick: () => {
      if (w.status === 'opzet') wijzig((s) => { s.wedstrijd.status = 'bezig'; });
      ganaar('live');
    } }, icoon('live', 20), w.status === 'bezig' ? 'Terug naar de wedstrijd' : 'Wedstrijd starten'));
  return wrap;
}

// ------------------------------------------------------------------- raster
function rasterTabel(w, p, spelers, formatie) {
  const kopRij = h('tr', {}, h('th', { class: 'sp' }, 'Speler'),
    ...p.blokken.map((b) => h('th', {}, blokLabel(b, w),
      h('small', { style: { display: 'block', fontWeight: '500', opacity: '.75' } }, `${Math.round(b.vanSec / 60)}'`))),
    h('th', {}, 'Tot.'));

  const lijf = h('tbody', {});
  for (const st of p.statistieken) {
    const speler = spelers.find((q) => q.id === st.spelerId);
    const cellen = p.blokken.map((b, i) => {
      const slotId = Object.keys(b.opstelling).find((sid) => b.opstelling[sid] === st.spelerId);
      const slot = slotId ? formatie.slots.find((s) => s.id === slotId) : null;
      const gepind = !!(w.pins || {})[b.id];
      const speeltNiet = !kanSpelen(w, st.spelerId, b);
      const knop = h('button', {
        class: `cel ${slot ? slot.role : speeltNiet ? 'weg' : 'bank'}${gepind ? ' vast' : ''}`,
        disabled: b.vast,
        title: `${st.naam} · ${blokLabel(b, w)}`,
        onclick: () => ruilSheet(w, p, i, st.spelerId),
      }, slot ? slot.label : speeltNiet ? '–' : 'bank');
      return h('td', {}, knop);
    });
    lijf.appendChild(h('tr', {},
      h('td', { class: 'sp' }, voornaam(st.naam)),
      ...cellen,
      h('td', { class: 'tot' }, minutenTekst(st.speelSec))));
  }
  return h('table', { class: 'schema' }, h('thead', {}, kopRij), lijf);
}

const kanSpelen = (w, spelerId, blok) => {
  const v = (w.beschikbaar || {})[spelerId] || {};
  const midden = (blok.vanSec + blok.totSec) / 2;
  return (v.vanaf ?? 0) <= midden && (v.tot ?? Infinity) >= midden;
};

// -------------------------------------------------------------- blokdetail
function blokDetail(w, p, spelers, formatie, i) {
  const blok = p.blokken[i];
  const wissel = p.wissels.find((x) => x.blokIndex === i);
  const kaart = h('div', { class: 'kaart' });

  kaart.appendChild(h('div', { class: 'kaart-kop' },
    h('h3', {}, `${blokLabel(blok, w)} · ${Math.round(blok.vanSec / 60)}-${Math.round(blok.totSec / 60)} min`),
    (w.pins || {})[blok.id]
      ? h('button', { class: 'knop klein stil', onclick: () => wijzig((s) => { delete s.wedstrijd.pins[blok.id]; }) }, 'Losmaken')
      : null,
    blok.vast ? h('span', { class: 'vlag' }, 'GESPEELD') : null));

  if (wissel && (wissel.eruit.length || wissel.erin.length || wissel.verplaatst.length)) {
    kaart.appendChild(wisselKaart(wissel));
  } else if (i === 0) {
    kaart.appendChild(h('p', { class: 'uitleg' }, 'Beginopstelling.'));
  }

  kaart.appendChild(tekenVeld(blok, S.team.spelers, w.formationId, {
    opTik: blok.vast ? null : (spelerId) => ruilSheet(w, p, i, spelerId),
  }));

  const opVeld = new Set(Object.values(blok.opstelling));
  const bank = spelers.filter((q) => !opVeld.has(q.id));
  if (bank.length) {
    kaart.appendChild(h('div', { class: 'tussenkop' }, 'Op de bank'));
    kaart.appendChild(h('div', { class: 'chiprij' },
      ...bank.map((q) => {
        const uit = !kanSpelen(w, q.id, blok);
        return h('button', { class: 'chip', disabled: blok.vast || uit,
          style: uit ? { opacity: '.45' } : {},
          onclick: () => ruilSheet(w, p, i, q.id) },
          h('i', { class: 'dot' }), q.naam, uit ? h('span', { class: 'mini' }, '· niet inzetbaar') : null);
      })));
  }
  return kaart;
}

function wisselKaart(wissel) {
  const doos = h('div', { class: 'wissel' });
  doos.appendChild(h('div', { class: 'wanneer' }, `Wissel op ${mmss(wissel.opSec)}`));
  for (const x of wissel.eruit) {
    doos.appendChild(h('div', { class: 'beweging uit' }, h('span', { class: 'pijl' }, '↓'),
      h('b', {}, x.naam), h('span', {}, `van ${x.van}`)));
  }
  for (const x of wissel.erin) {
    doos.appendChild(h('div', { class: 'beweging erin' }, h('span', { class: 'pijl' }, '↑'),
      h('b', {}, x.naam), h('span', {}, `naar ${x.naar}`)));
  }
  for (const x of wissel.verplaatst) {
    doos.appendChild(h('div', { class: 'beweging schuif' }, h('span', { class: 'pijl' }, '↔'),
      h('b', {}, x.naam), h('span', {}, `${x.van} → ${x.naar}`)));
  }
  return doos;
}

// ---------------------------------------------------------------- handmatig
/** Ruil twee spelers binnen één blok en zet dat blok daarmee vast. */
export function ruilSheet(w, p, blokIndex, spelerId) {
  const blok = p.blokken[blokIndex];
  if (blok.vast) { melding('Dit blok is al gespeeld'); return; }

  const ik = S.team.spelers.find((q) => q.id === spelerId);
  const mijnSlot = Object.keys(blok.opstelling).find((sid) => blok.opstelling[sid] === spelerId);
  const anderen = w.selectie
    .map((id) => S.team.spelers.find((q) => q.id === id))
    .filter((q) => q && q.id !== spelerId && kanSpelen(w, q.id, blok));

  toonSheet(`${ik.naam} ruilen`, (c, sluit) => {
    c.appendChild(h('p', { class: 'uitleg' }, mijnSlot
      ? `Staat nu opgesteld in ${blokLabel(blok, w)}. Kies met wie je ruilt.`
      : `Zit in ${blokLabel(blok, w)} op de bank. Kies wie eruit gaat.`));
    const lijst = h('div', {});
    for (const q of anderen) {
      const zijnSlot = Object.keys(blok.opstelling).find((sid) => blok.opstelling[sid] === q.id);
      const formatie = getFormation(w.formationId);
      const label = zijnSlot ? (formatie.slots.find((s) => s.id === zijnSlot) || {}).label : 'bank';
      if (!mijnSlot && !zijnSlot) continue; // twee bankzitters ruilen heeft geen effect
      lijst.appendChild(h('button', { class: 'spelerrij', style: { width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--rand)' },
        onclick: () => { ruil(w, blok, spelerId, q.id); sluit(); melding(`${ik.naam} en ${q.naam} geruild`); } },
        h('div', { class: 'bal' }, label),
        h('div', { class: 'naam' }, q.naam)));
    }
    c.appendChild(lijst);
    if (!lijst.children.length) c.appendChild(h('div', { class: 'leeg' }, 'Niemand om mee te ruilen.'));
  });
}

function ruil(w, blok, a, b) {
  wijzig((s) => {
    const m = s.wedstrijd;
    const i = m.blokken.findIndex((x) => x.id === blok.id);
    if (i < 0) return;
    const opstelling = { ...m.blokken[i].opstelling };
    const slotA = Object.keys(opstelling).find((sid) => opstelling[sid] === a);
    const slotB = Object.keys(opstelling).find((sid) => opstelling[sid] === b);
    if (slotA && slotB) { opstelling[slotA] = b; opstelling[slotB] = a; }
    else if (slotA) opstelling[slotA] = b;
    else if (slotB) opstelling[slotB] = a;
    m.blokken[i] = { ...m.blokken[i], opstelling };
    // Vastzetten, anders draait de volgende herberekening de ruil meteen terug.
    m.pins = { ...m.pins, [blok.id]: opstelling };
  }, { terugdraaibaar: true });
}

// -------------------------------------------------------------------- delen
function deelSheet() {
  toonSheet('Schema delen', async (c, sluit) => {
    c.appendChild(h('p', { class: 'uitleg' },
      'Het hele schema zit in de link verpakt. Wie hem opent ziet precies dit schema - er komt geen server aan te pas.'));
    const link = await deelLink();
    const veld = h('input', { type: 'text', value: link, readonly: true, onclick: (e) => e.target.select() });
    c.appendChild(veld);
    c.appendChild(h('p', { class: 'mini', style: { marginTop: '6px' } }, `${link.length} tekens`));
    c.appendChild(h('div', { class: 'knoprij', style: { marginTop: '12px' } },
      navigator.share ? h('button', { class: 'knop primair', onclick: async () => {
        try { await navigator.share({ title: 'Wisselschema', text: `Wisselschema ${S.team.naam}`, url: link }); sluit(); }
        catch (e) { /* gebruiker brak af */ }
      } }, 'Versturen') : null,
      h('button', { class: 'knop', onclick: async () => {
        melding(await kopieer(link) ? 'Link gekopieerd' : 'Kopiëren lukte niet - selecteer de tekst zelf');
      } }, 'Kopiëren'),
      h('button', { class: 'knop', onclick: () => { sluit(); tekstSheet(); } }, 'Als tekst')));
  });
}

/** Platte tekst voor in de groepsapp - vaak handiger dan een link. */
function tekstSheet() {
  const w = S.wedstrijd;
  const p = plan();
  const formatie = getFormation(w.formationId);
  const regels = [`${S.team.naam}${w.tegenstander ? ` - ${w.tegenstander}` : ''} (${w.datum})`, ''];
  p.blokken.forEach((b) => {
    const slots = slotsForCount(formatie, Object.keys(b.opstelling).length);
    const opstelling = slots.filter((s) => b.opstelling[s.id])
      .map((s) => `${s.label} ${voornaam((S.team.spelers.find((q) => q.id === b.opstelling[s.id]) || {}).naam)}`);
    const opVeld = new Set(Object.values(b.opstelling));
    const bank = w.selectie.filter((id) => !opVeld.has(id))
      .map((id) => voornaam((S.team.spelers.find((q) => q.id === id) || {}).naam));
    regels.push(`${blokLabel(b, w)} (${Math.round(b.vanSec / 60)}-${Math.round(b.totSec / 60)} min)`);
    regels.push(`  ${opstelling.join(', ')}`);
    if (bank.length) regels.push(`  bank: ${bank.join(', ')}`);
  });
  regels.push('', 'Speeltijd:');
  for (const st of p.statistieken) regels.push(`  ${voornaam(st.naam)}: ${minutenTekst(st.speelSec)}`);
  const tekst = regels.join('\n');

  toonSheet('Als tekst', (c) => {
    c.appendChild(h('textarea', { readonly: true, style: { minHeight: '260px', fontFamily: 'ui-monospace, monospace', fontSize: '.8rem' }, value: tekst }));
    c.appendChild(h('button', { class: 'knop primair breed', style: { marginTop: '10px' },
      onclick: async () => melding(await kopieer(tekst) ? 'Gekopieerd' : 'Kopiëren lukte niet') }, 'Kopiëren'));
  });
}
