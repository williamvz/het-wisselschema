// Het speelveld als SVG. Staand formaat, eigen doel onderaan - zoals je er
// als coach zelf naar kijkt vanaf de zijlijn.

import { svgEl, initialen, voornaam } from './ui.js';
import { getFormation, slotsForCount } from '../lib/formations.js';

const B = 100, H = 150; // veldafmetingen in tekeneenheden
const vx = (x) => x;
const vy = (y) => H - (y / 100) * H;

function belijning() {
  const l = (props) => svgEl('rect', { class: 'lijn', ...props });
  return [
    // Gras loopt door tot buiten de lijnen, zodat namen die net achter het doel
    // vallen (de keeper) op groen staan in plaats van op de kaartachtergrond.
    svgEl('rect', { class: 'gras-b', x: -9, y: -6, width: B + 18, height: H + 24 }),
    // grasbanen
    ...[0, 1, 2, 3, 4, 5].map((i) => svgEl('rect', {
      class: i % 2 ? 'gras-b' : 'gras-a', x: 0, y: (i * H) / 6, width: B, height: H / 6,
    })),
    l({ x: 0.5, y: 0.5, width: B - 1, height: H - 1, rx: 1 }),
    svgEl('line', { class: 'lijn', x1: 0, y1: H / 2, x2: B, y2: H / 2 }),
    svgEl('circle', { class: 'lijn', cx: B / 2, cy: H / 2, r: 13 }),
    svgEl('circle', { cx: B / 2, cy: H / 2, r: 1.1, fill: 'rgba(255,255,255,.5)' }),
    // eigen helft (onder)
    l({ x: 22, y: H - 22, width: 56, height: 22 }),
    l({ x: 37, y: H - 8, width: 26, height: 8 }),
    // helft tegenstander (boven)
    l({ x: 22, y: 0, width: 56, height: 22 }),
    l({ x: 37, y: 0, width: 26, height: 8 }),
    // doelen
    svgEl('rect', { x: 42, y: H, width: 16, height: 2.6, fill: 'rgba(255,255,255,.75)' }),
    svgEl('rect', { x: 42, y: -2.6, width: 16, height: 2.6, fill: 'rgba(255,255,255,.75)' }),
  ];
}

const ROLKLEUR = { K: 'var(--rol-K)', V: 'var(--rol-V)', M: 'var(--rol-M)', A: 'var(--rol-A)' };

/**
 * @param {object} blok        blok met `opstelling`
 * @param {Array}  spelers     alle spelers (voor naam en rugnummer)
 * @param {string} formationId
 * @param {object} opties      { markeer:Set<id>, opTik(spelerId, slotId), toonNamen }
 */
export function tekenVeld(blok, spelers, formationId, opties = {}) {
  const formatie = getFormation(formationId);
  const opstelling = blok?.opstelling || {};
  const bezet = Object.keys(opstelling);
  const slots = slotsForCount(formatie, bezet.length).filter((s) => opstelling[s.id]);
  const zoek = (id) => spelers.find((p) => p.id === id);
  const markeer = opties.markeer || new Set();

  const pionnen = slots.map((slot) => {
    const speler = zoek(opstelling[slot.id]);
    if (!speler) return null;
    const cx = vx(slot.x), cy = vy(slot.y);
    const uitgelicht = markeer.has(speler.id);
    const groep = svgEl('g', {
      style: opties.opTik ? 'cursor:pointer' : '',
      onclick: opties.opTik ? () => opties.opTik(speler.id, slot.id) : null,
      role: opties.opTik ? 'button' : null,
      'aria-label': `${speler.naam}, ${slot.label}`,
    },
      uitgelicht ? svgEl('circle', { cx, cy, r: 11.5, fill: 'none', stroke: '#fff', 'stroke-width': 1.6, opacity: .9 }) : null,
      svgEl('circle', { class: 'pion', cx, cy, r: 8.2, fill: ROLKLEUR[slot.role] || '#555' }),
      svgEl('text', { class: 'nr', x: cx, y: cy }, speler.nummer || initialen(speler.naam)),
      opties.toonNamen === false ? null : svgEl('text', { class: 'naam', x: cx, y: cy + 14.5 }, voornaam(speler.naam)),
      svgEl('text', { class: 'pos', x: cx, y: cy - 10.6 }, slot.label));
    return groep;
  }).filter(Boolean);

  return svgEl('svg', {
    class: 'veld', viewBox: `-9 -6 ${B + 18} ${H + 24}`, role: 'img',
    'aria-label': `Opstelling ${formatie.naam}`,
  }, ...belijning(), ...pionnen);
}

/** Klein veldje om een opstelling te kiezen: alleen stippen, geen namen. */
export function tekenMiniVeld(formationId, grootte = 62) {
  const f = getFormation(formationId);
  return svgEl('svg', { viewBox: `-6 -6 ${B + 12} ${H + 12}`, width: grootte, height: grootte * 1.44,
    class: 'veld', 'aria-hidden': 'true' },
    svgEl('rect', { class: 'gras-a', x: 0, y: 0, width: B, height: H }),
    svgEl('line', { class: 'lijn', x1: 0, y1: H / 2, x2: B, y2: H / 2 }),
    ...f.slots.map((s) => svgEl('circle', { cx: vx(s.x), cy: vy(s.y), r: 6.5, fill: ROLKLEUR[s.role] })));
}
