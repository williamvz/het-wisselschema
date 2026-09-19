// Laadt elk bronbestand als echte ES-module. Dat vangt niet alleen syntaxfouten
// maar ook verkeerde importpaden en ontbrekende exports - `node --check` niet.
//
// Alleen src/: de scripts in build/ hebben bijwerkingen (bouwen, browser
// starten) en horen niet zomaar geladen te worden. Die worden gedekt door
// `npm run build` en `npm test`.
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const bestanden = [];
const loop = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) loop(p);
    else if (/\.m?js$/.test(n)) bestanden.push(p);
  }
};
for (const d of (process.argv.slice(2).length ? process.argv.slice(2) : ['src'])) loop(d);

let fouten = 0;
for (const p of bestanden.sort()) {
  try { await import(pathToFileURL(resolve(p)).href); }
  catch (e) { console.error(`FOUT ${p}\n     ${e.message.split('\n')[0]}`); fouten++; }
}
console.log(fouten ? `\n${fouten} bestand(en) met fouten` : `${bestanden.length} bestanden laden correct`);
process.exit(fouten ? 1 : 0);
