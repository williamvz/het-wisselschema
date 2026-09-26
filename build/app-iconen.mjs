// Maakt icon.png en logo.png voor de Home Assistant-app, uit hetzelfde
// pictogram als de app zelf. Vereist `npm install`. Draai met: npm run app-iconen
import { chromium } from 'playwright-core';
import { ICOON_SVG } from './icoon.mjs';

const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MAP = 'deploy/homeassistant/addon';
const b = await chromium.launch({ executablePath: EXE });
const p = await b.newPage({ deviceScaleFactor: 1 });

// Het pictogram, zoals in de lijst van de App Store.
await p.setViewportSize({ width: 128, height: 128 });
await p.setContent(`<body style="margin:0">${ICOON_SVG.replace('<svg ', '<svg width="128" height="128" ')}</body>`);
await p.screenshot({ path: `${MAP}/icon.png`, omitBackground: true });

// Het logo op de pagina van de app. Eigen groene achtergrond, zodat het in
// het lichte en het donkere thema van Home Assistant even goed leesbaar is.
await p.setViewportSize({ width: 250, height: 100 });
await p.setContent(`<body style="margin:0">
  <div style="width:250px;height:100px;border-radius:18px;background:#10794a;display:flex;align-items:center;gap:12px;padding:0 14px;box-sizing:border-box;
    font:800 21px/1.05 -apple-system,'Segoe UI',Roboto,'DejaVu Sans',Arial,sans-serif;color:#fff;letter-spacing:-.02em">
    ${ICOON_SVG.replace('<svg ', '<svg width="68" height="68" ')}
    <div>Het<br>Wisselschema</div>
  </div></body>`);
await p.screenshot({ path: `${MAP}/logo.png`, omitBackground: true });
await b.close();
console.log(`${MAP}/icon.png en logo.png gemaakt`);
