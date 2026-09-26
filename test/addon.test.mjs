// Home Assistant bouwt de app rechtstreeks uit deze repository, zonder
// `npm run build`. Dus moet de map van de app op zichzelf compleet zijn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const MAP = 'deploy/homeassistant/addon';

test('de app voor Home Assistant is rechtstreeks uit de repository te bouwen', async () => {
  assert.match(await readFile('repository.yaml', 'utf8'), /^name: \S/m, 'repository.yaml met een naam');

  // Alles wat het Dockerfile kopieert, bestaat en wordt door git bewaard.
  const docker = await readFile(`${MAP}/Dockerfile`, 'utf8');
  const bronnen = [...docker.matchAll(/^COPY\s+(.+?)\s+\S+\s*$/gm)].flatMap((m) => m[1].split(/\s+/));
  assert.ok(bronnen.includes('www'), 'het Dockerfile kopieert de app');
  for (const bron of bronnen) {
    await access(`${MAP}/${bron}`);
    // check-ignore slaagt (exit 0) als git het bestand negeert; dat mag niet.
    assert.throws(() => execFileSync('git', ['check-ignore', '-q', '--no-index', `${MAP}/${bron}`], { stdio: 'ignore' }),
      `${bron} staat in .gitignore, maar Home Assistant heeft het nodig`);
  }
  assert.equal(await readFile(`${MAP}/www/index.html`, 'utf8'), await readFile('index.html', 'utf8'),
    'de app in de map van Home Assistant is dezelfde als index.html (npm run build)');

  // Wat Home Assistant bij de app laat zien, en een changelog bij de versie.
  const versie = /^version:\s*"?([\d.]+)"?\s*$/m.exec(await readFile(`${MAP}/config.yaml`, 'utf8'))?.[1];
  assert.ok(versie, 'config.yaml heeft een versie');
  assert.match(await readFile(`${MAP}/CHANGELOG.md`, 'utf8'), new RegExp(`^## ${versie.replace(/\./g, '\\.')}$`, 'm'),
    `CHANGELOG.md noemt versie ${versie}`);
  for (const f of ['icon.png', 'logo.png', 'README.md', 'DOCS.md']) await access(`${MAP}/${f}`);
});
