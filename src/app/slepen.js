// Slepen om te ruilen: pak een speler in het veld of op de bank en laat hem
// los op een ander. Werkt met vinger en muis (pointer events); de
// drag-and-drop van de browser zelf doet niets op een telefoon.
//
// Alles met een `data-speler` in de houder is te slepen en is een plek om op
// los te laten. Wie alleen tikt, krijgt gewoon de klik: het ruilscherm blijft
// werken voor wie niet wil slepen.

import { h } from './ui.js';

const DREMPEL = 8; // pixels voordat een tik een sleep wordt
const VASTHOUDEN = 260; // ms indrukken voordat een vinger gaat slepen; daarvoor is het scrollen

/**
 * @param {Element} houder
 * @param {object}  opties { mag(a, b): mag a met b ruilen?, opRuil(a, b), label(id): tekst op het balletje }
 */
export function maakSleepbaar(houder, { mag, opRuil, label }) {
  houder.classList.add('sleepbaar');
  houder.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const bron = e.target.closest('[data-speler]');
    if (!bron || !houder.contains(bron)) return;
    const id = bron.getAttribute('data-speler');
    const start = { x: e.clientX, y: e.clientY };
    let bal = null;
    let doel = null;
    // Met een vinger begint slepen pas na even vasthouden. Wie meteen beweegt,
    // scrolt de pagina of het schema; zo blijft horizontaal scrollen gewoon werken.
    const aanraking = e.pointerType === 'touch';
    let klaarVoorSleep = !aanraking;
    const timer = aanraking ? setTimeout(() => {
      klaarVoorSleep = true;
      bron.classList.add('vastgehouden');
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* niet overal beschikbaar */ } }
    }, VASTHOUDEN) : null;
    // Zodra het slepen loopt mag de pagina niet meer meescrollen.
    const blokkeerScroll = (ev) => { if (klaarVoorSleep) ev.preventDefault(); };
    if (aanraking) window.addEventListener('touchmove', blokkeerScroll, { passive: false });

    const zetDoel = (el) => {
      if (el === doel) return;
      doel?.classList.remove('sleepdoel');
      doel = el;
      doel?.classList.add('sleepdoel');
    };

    const beweeg = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!bal) {
        const afstand = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
        if (afstand < DREMPEL) return;
        if (!klaarVoorSleep) { opruimen(); return; } // te vroeg bewogen: dit is scrollen
        bal = h('div', { class: 'sleepbal', 'aria-hidden': 'true' }, label(id));
        document.body.appendChild(bal);
        bron.classList.add('gesleept');
        houder.classList.add('bezig-met-slepen');
      }
      ev.preventDefault();
      bal.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
      const onder = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-speler]');
      const ander = onder && houder.contains(onder) ? onder.getAttribute('data-speler') : null;
      zetDoel(ander && ander !== id && mag(id, ander) ? onder : null);
    };

    const opruimen = () => {
      clearTimeout(timer);
      bron.classList.remove('vastgehouden');
      window.removeEventListener('pointermove', beweeg);
      window.removeEventListener('pointerup', klaar);
      window.removeEventListener('pointercancel', klaar);
      window.removeEventListener('touchmove', blokkeerScroll);
    };

    const klaar = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      opruimen();
      if (!bal) return; // een gewone tik: de klik doet de rest
      bal.remove();
      bron.classList.remove('gesleept');
      houder.classList.remove('bezig-met-slepen');
      // De klik die na het loslaten nog komt, hoort bij het slepen.
      const slik = (c) => { c.stopPropagation(); c.preventDefault(); };
      houder.addEventListener('click', slik, { capture: true, once: true });
      setTimeout(() => houder.removeEventListener('click', slik, { capture: true }), 0);
      const naar = doel?.getAttribute('data-speler');
      zetDoel(null);
      if (ev.type === 'pointerup' && naar) opRuil(id, naar);
    };

    window.addEventListener('pointermove', beweeg, { passive: false });
    window.addEventListener('pointerup', klaar);
    window.addEventListener('pointercancel', klaar);
  });
  return houder;
}
