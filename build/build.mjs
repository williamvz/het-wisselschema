// Bouwt alle bronbestanden tot één zelfstandig HTML-bestand.
//
// Er is bewust geen bundler-afhankelijkheid: `node build/build.mjs` is genoeg.
// De modules worden in afhankelijkheidsvolgorde in een kleine loader gewikkeld.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ICOON_SVG } from './icoon.mjs';

const WORTEL = resolve(process.argv[2] || '.');
const SRC = join(WORTEL, 'src');
const INGANG = join(SRC, 'app/main.js');
const UIT = join(WORTEL, 'index.html');

const sleutel = (pad) => relative(SRC, pad).split('\\').join('/');

/** Zet ES-module-syntaxis om naar een fabrieksfunctie met __mod()-aanroepen. */
function bewerk(bron, pad) {
  const exports = new Map(); // naar buiten => lokaal
  let js = bron;

  js = js.replace(/^import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"];?$/gm, (_, namen, bronPad) => {
    const stukken = namen.split(',').map((n) => n.trim()).filter(Boolean).map((n) => {
      const m = /^(\S+)\s+as\s+(\S+)$/.exec(n);
      return m ? `${m[1]}: ${m[2]}` : n;
    });
    return `const { ${stukken.join(', ')} } = __mod(${JSON.stringify(losOp(bronPad, pad))});`;
  });
  js = js.replace(/^import\s+\*\s+as\s+(\S+)\s+from\s+['"]([^'"]+)['"];?$/gm,
    (_, naam, bronPad) => `const ${naam} = __mod(${JSON.stringify(losOp(bronPad, pad))});`);
  js = js.replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?$/gm,
    (_, naam, bronPad) => `const ${naam} = __mod(${JSON.stringify(losOp(bronPad, pad))}).default;`);

  js = js.replace(/^export\s+(async\s+)?function\s+(\w+)/gm, (_, asyncWoord, naam) => {
    exports.set(naam, naam);
    return `${asyncWoord || ''}function ${naam}`;
  });
  js = js.replace(/^export\s+(const|let|var)\s+(\w+)/gm, (_, soort, naam) => {
    exports.set(naam, naam);
    return `${soort} ${naam}`;
  });
  js = js.replace(/^export\s+class\s+(\w+)/gm, (_, naam) => { exports.set(naam, naam); return `class ${naam}`; });
  js = js.replace(/^export\s+\{([^}]*)\};?$/gm, (_, namen) => {
    for (const n of namen.split(',').map((x) => x.trim()).filter(Boolean)) {
      const m = /^(\S+)\s+as\s+(\S+)$/.exec(n);
      if (m) exports.set(m[2], m[1]); else exports.set(n, n);
    }
    return '';
  });

  if (/^export\s+default/m.test(js)) throw new Error(`${pad}: export default wordt niet ondersteund`);
  if (/^\s*(import|export)\s/m.test(js)) {
    const rest = js.split('\n').filter((r) => /^\s*(import|export)\s/.test(r));
    throw new Error(`${pad}: onverwerkte module-syntaxis:\n  ${rest.join('\n  ')}`);
  }
  const teruggave = [...exports.entries()].map(([naar, lokaal]) => (naar === lokaal ? naar : `${naar}: ${lokaal}`));
  return `${js}\nreturn { ${teruggave.join(', ')} };`;
}

function losOp(bronPad, vanafBestand) {
  return sleutel(resolve(dirname(vanafBestand), bronPad));
}

// --- afhankelijkheidsgraaf in topologische volgorde
const modules = new Map();
function verzamel(pad) {
  const k = sleutel(pad);
  if (modules.has(k)) return;
  modules.set(k, null); // markeer als bezig (cycli zijn geen probleem: __mod is lui)
  const bron = readFileSync(pad, 'utf8');
  for (const m of bron.matchAll(/^import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/gm)) {
    verzamel(resolve(dirname(pad), m[1]));
  }
  modules.set(k, bewerk(bron, pad));
}
verzamel(INGANG);

const loader = `(() => {
'use strict';
const __defs = Object.create(null);
const __cache = Object.create(null);
function __mod(naam) {
  if (__cache[naam]) return __cache[naam];
  const maker = __defs[naam];
  if (!maker) throw new Error('onbekende module: ' + naam);
  return (__cache[naam] = maker());
}
${[...modules.entries()].map(([k, body]) => `__defs[${JSON.stringify(k)}] = function () {\n${body}\n};`).join('\n')}
const app = __mod(${JSON.stringify(sleutel(INGANG))});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', app.start);
else app.start();
})();`;

// --- pictogram en manifest, inline zodat er geen los bestand nodig is
const icoonUrl = `data:image/svg+xml,${encodeURIComponent(ICOON_SVG.replace(/\n/g, ''))}`;
const manifest = {
  name: 'Het Wisselschema', short_name: 'Wisselschema', start_url: '.', scope: '.',
  display: 'standalone', background_color: '#f1f4f2', theme_color: '#10794a', lang: 'nl',
  description: 'Maakt en bewaakt het wisselschema van een jeugdvoetbalteam.',
  icons: [{ src: icoonUrl, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
};

const html = readFileSync(join(SRC, 'shell.html'), 'utf8')
  .replace('__CSS__', () => readFileSync(join(SRC, 'styles.css'), 'utf8').trim())
  .replace('__JS__', () => loader)
  .replace(/__ICOON__/g, () => icoonUrl)
  .replace('__MANIFEST__', () => `data:application/json,${encodeURIComponent(JSON.stringify(manifest))}`);

if (html.includes('</script>', html.indexOf('<script')) === false) throw new Error('script-tag niet afgesloten');
writeFileSync(UIT, html);

// Dezelfde app in de add-on, zodat die map op zichzelf te installeren is.
// Hij staat ook in git: Home Assistant bouwt de app rechtstreeks uit deze
// repository en draait daarbij geen `npm run build`.
const ADDON_WWW = join(WORTEL, 'deploy/homeassistant/addon/www');
mkdirSync(ADDON_WWW, { recursive: true });
writeFileSync(join(ADDON_WWW, 'index.html'), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`index.html gebouwd uit ${modules.size} modules - ${kb} kB`);
console.log(`ook gekopieerd naar ${relative(WORTEL, ADDON_WWW)}/index.html`);
