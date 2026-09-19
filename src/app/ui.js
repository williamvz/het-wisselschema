// Minimale UI-gereedschapskist. Geen framework: de app is klein genoeg om
// de DOM gewoon opnieuw op te bouwen, en dat scheelt een halve megabyte.

export function h(tag, props = {}, ...kinderen) {
  const el = document.createElement(tag);
  vulIn(el, props, kinderen);
  return el;
}

export function svgEl(tag, props = {}, ...kinderen) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  hangAan(el, kinderen);
  return el;
}

function vulIn(el, props, kinderen) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'type' || k === 'placeholder') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  hangAan(el, kinderen);
}

function hangAan(el, kinderen) {
  for (const k of kinderen.flat(4)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const leegmaken = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ------------------------------------------------------------------ opmaak
export const mmss = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const minuten = (sec) => `${Math.round(sec / 60)}`;
export const minutenTekst = (sec) => `${Math.round(sec / 60)} min`;
export const saldoTekst = (sec) => {
  const m = Math.round(sec / 60);
  return m === 0 ? '0' : (m > 0 ? `+${m}` : `${m}`);
};

export function initialen(naam) {
  const d = String(naam || '').trim().split(/\s+/);
  if (!d[0]) return '?';
  return (d.length > 1 ? d[0][0] + d[d.length - 1][0] : d[0].slice(0, 2)).toUpperCase();
}
export const voornaam = (naam) => String(naam || '').trim().split(/\s+/)[0] || '?';

export const datumTekst = (iso) => {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch (e) { return iso; }
};

// ------------------------------------------------------------------ iconen
const PADEN = {
  team: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.3a3.5 3.5 0 0 1 0 6.5',
  opzet: 'M4 7h16M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2M4 7v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7M9 3v3m6-3v3M8 12h8m-8 4h5',
  schema: 'M4 5h16M4 5v14M4 5a0 0 0 0 0 0 0m16 0v14M4 19h16M9.5 5v14M14.5 5v14M4 12h16',
  live: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3.5 2',
  archief: 'M4 8h16M5 8V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2M6 8v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8M10 12h4',
  tandwiel: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.4-3a8.4 8.4 0 0 0-.16-1.6l2.1-1.6-2-3.5-2.5 1a8.4 8.4 0 0 0-2.8-1.6L14.6 2h-4l-.44 2.7a8.4 8.4 0 0 0-2.8 1.6l-2.5-1-2 3.5 2.1 1.6a8.4 8.4 0 0 0 0 3.2l-2.1 1.6 2 3.5 2.5-1a8.4 8.4 0 0 0 2.8 1.6l.44 2.7h4l.44-2.7a8.4 8.4 0 0 0 2.8-1.6l2.5 1 2-3.5-2.1-1.6c.1-.52.16-1.06.16-1.6Z',
  terug: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  plus: 'M12 5v14M5 12h14',
  deel: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0L8 7m4-4 4 4',
  vernieuw: 'M20 11a8 8 0 1 0-.6 3M20 5v6h-6',
  fluit: 'M12 3v4m0 0a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm-2.5 7h5',
};
export function icoon(naam, grootte = 21) {
  return svgEl('svg', { viewBox: '0 0 24 24', width: grootte, height: grootte, fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    svgEl('path', { d: PADEN[naam] || PADEN.schema }));
}

// ------------------------------------------------------------------ sheets
let openSheet = null;
export function sluitSheet() {
  if (openSheet) { openSheet.remove(); openSheet = null; document.body.style.overflow = ''; }
}
export function toonSheet(titel, bouwInhoud, { breed = false } = {}) {
  sluitSheet();
  const paneel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': titel });
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) sluitSheet(); } }, paneel);
  paneel.appendChild(h('div', { class: 'greep' }));
  if (titel) paneel.appendChild(h('h2', { style: { marginBottom: '12px' } }, titel));
  const inhoud = h('div', {});
  paneel.appendChild(inhoud);
  bouwInhoud(inhoud, sluitSheet);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  openSheet = overlay;
  const eerste = paneel.querySelector('input, button, select, textarea');
  if (eerste && !('ontouchstart' in window)) setTimeout(() => eerste.focus(), 30);
  return sluitSheet;
}

export function bevestig(titel, tekst, opBevestigd, { knop = 'Ja, doen', gevaar = false } = {}) {
  toonSheet(titel, (c, sluit) => {
    c.appendChild(h('p', { class: 'uitleg', style: { fontSize: '.95rem', marginBottom: '16px' } }, tekst));
    c.appendChild(h('div', { class: 'knoprij' },
      h('button', { class: 'knop', onclick: sluit }, 'Annuleren'),
      h('button', { class: `knop ${gevaar ? 'gevaar' : 'primair'}`, onclick: () => { sluit(); opBevestigd(); } }, knop)));
  });
}

// ------------------------------------------------------------------ melding
let toastTimer = null;
export function melding(tekst) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', style: {
      position: 'fixed', left: '50%', bottom: '86px', transform: 'translateX(-50%)', zIndex: '70',
      background: 'var(--tekst)', color: 'var(--bg)', padding: '11px 18px', borderRadius: '11px',
      fontSize: '.88rem', fontWeight: '600', boxShadow: 'var(--schaduw)', maxWidth: '86vw', textAlign: 'center',
      pointerEvents: 'none', // anders blijft de onzichtbare balk tikken opvangen
    } });
    document.body.appendChild(el);
  }
  el.textContent = tekst;
  el.style.transition = '';
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 2600);
}

// ------------------------------------------------------------------ signalen
let audioCtx = null;
export function piep({ aantal = 2, hoog = 880 } = {}) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    for (let i = 0; i < aantal; i++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const t = audioCtx.currentTime + i * 0.26;
      o.frequency.value = hoog; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.22);
    }
  } catch (e) { /* geluid is een extraatje, geen voorwaarde */ }
}
export function tril(patroon = [120, 60, 120]) {
  try { if (navigator.vibrate) navigator.vibrate(patroon); } catch (e) { /* niet overal beschikbaar */ }
}

// -------------------------------------------------------- scherm aan houden
let wakeLock = null;
export async function houdSchermAan(aan) {
  try {
    if (aan && 'wakeLock' in navigator) {
      if (!wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    } else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* browser wil niet, ook prima */ }
}

export function downloadBestand(naam, inhoud, type = 'application/json') {
  const blob = new Blob([inhoud], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: naam });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function kopieer(tekst) {
  try { await navigator.clipboard.writeText(tekst); return true; }
  catch (e) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = tekst; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}
