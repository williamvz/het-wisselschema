# Het Wisselschema

Een wisselschema-assistent voor jeugdvoetbal. Je zet je team klaar, vinkt aan
wie er vandaag zijn, en de app maakt een schema waarin iedereen ongeveer even
lang speelt. Tijdens de wedstrijd loopt er een klok mee die zegt wanneer je
moet wisselen, en wie erin en eruit gaat.

En als een speler halverwege niet meer kan — geblesseerd, of gewoon op — dan
herberekent de app het schema vanaf dat moment, met behoud van alles wat al
gespeeld is.

**Alles zit in één bestand.** Open `index.html` en het werkt. Geen installatie,
geen account, geen internet nodig.

<p align="center">
  <img src="docs/beeld/3-schema.png" width="30%" alt="Het wisselschema als raster">
  <img src="docs/beeld/5-live.png" width="30%" alt="De wedstrijdklok met opstelling">
  <img src="docs/beeld/7-uitval-instructie.png" width="30%" alt="Instructie bij een onverwachte uitval">
</p>

## Wat het doet

- **Team beheren** — namen plakken uit een appje, of een lijst uploaden. Per
  speler: rugnummer, of hij kan keepen, en voorkeursposities.
- **Wedstrijd klaarzetten** — wie is er vandaag, welke speelvorm (4-, 6-, 7-,
  8- of 11-tal), hoeveel perioden van hoeveel minuten, en welke opstelling.
- **Schema maken** — zo eerlijk mogelijk verdeeld, met een echte keeper in elk
  blok, keepersbeurten verdeeld, en niemand twee blokken achter elkaar op de bank.
- **Zelf bijsturen** — tik op een vakje om twee spelers te ruilen. Dat blok
  ligt dan vast en de rest wordt eromheen opnieuw verdeeld.
- **Live meelopen** — klok per periode, aftelling tot de volgende wissel,
  geluid en trilsignaal, en het scherm blijft aan.
- **Onverwachte wissel** — één knop, kies de speler, en je krijgt meteen te
  horen wie erin komt en wie doorschuift. De rest van de wedstrijd wordt
  opnieuw verdeeld over wie er nog staat.
- **Seizoenssaldo** — na afloop wordt bijgehouden wie voor- of achterloopt op
  de gemiddelde speeltijd. Bij het volgende schema krijgt wie achterloopt
  voorrang.
- **Delen** — het hele schema past in een link. De ontvanger heeft geen app en
  geen server nodig. Of kopieer het als platte tekst voor de groepsapp.

## Aan de slag

```bash
git clone https://github.com/williamvz/het-wisselschema
cd het-wisselschema
open index.html          # of dubbelklik erop
```

In de app: **Team → Voorbeeldteam** om meteen te kunnen spelen.

Op je telefoon: open het bestand en kies "Zet op beginscherm". Daarna start
hij als een gewone app, ook zonder bereik.

## Op Home Assistant

Zie [`deploy/homeassistant/README.md`](deploy/homeassistant/README.md). Kort:

1. **Los bestand** — `index.html` in `/config/www/` en een `panel_iframe` in
   je configuratie. Vijf minuten werk, geen synchronisatie.
2. **Als add-on** — kopieer `deploy/homeassistant/addon` naar `/addons/`. De
   app verschijnt in de zijbalk achter je Home Assistant-inlog, en je team
   staat op de Pi in plaats van alleen op je telefoon. De app ontdekt de
   server zelf; instellen hoeft niet.

Voor een eigen domein staat er een recept voor Cloudflare Tunnel en voor
Nginx Proxy Manager bij, inclusief wat je daarbij over beveiliging moet weten.

## Hoe het schema tot stand komt

Het probleem wordt in twee lagen opgelost. Dat maakt het niet alleen
oplosbaar, maar vooral uitlegbaar aan de ouder die vraagt waarom zijn kind
maar drie kwart speelde.

**Laag 1 — wie speelt er?** Speeltijd is een verdelingsvraag over de hele
wedstrijd. Elke speler krijgt een doelaantal minuten, evenredig aan hoe lang
hij beschikbaar is. Een greedy startoplossing plus local search minimaliseert
de kwadratische afwijking van dat doel, met strafpunten voor twee blokken
bankzitten op rij en voor een blok zonder keeper. Meerdere herstarts, beste
uitkomst wint.

**Laag 2 — waar staat iedereen?** Positie is een vraag per blok, en een exact
oplosbaar toewijzingsprobleem: het
[Hongaars algoritme](src/lib/hungarian.js) over een kostenmatrix van speler
tegen positie. Kosten voor een positie buiten je voorkeur, korting voor
blijven staan waar je stond. Die korting is bewust zwaar: bij een uitval
verschuiven er gemiddeld **0,6** spelers van positie, niet het halve elftal.
Langs de lijn wil je "Daan op doel, Finn erin" kunnen roepen.

**Herplannen** werkt doordat een blok op elk moment doormidden geknipt kan
worden. Valt er iemand uit op minuut 23, dan wordt kwart 2 twee deelblokken:
0-23 staat vast als gespeelde historie, 23-30 gaat de nieuwe verdeling in.
Wat al gespeeld is telt gewoon mee in de eerlijkheidsberekening, dus het
schema compenseert vanzelf.

## Ontwikkelen

```bash
npm install        # alleen nodig voor de tests
npm run build      # src/ -> index.html (één bestand, geen bundler-afhankelijkheid)
npm test           # 29 tests: motor, browser en add-on
npm run check      # laadt alle modules, vangt import- en syntaxfouten
npm run serve      # draait de add-on-server lokaal op poort 8099
```

```
src/lib/        de motor, zonder DOM: opstellingen, Hongaars algoritme, planner
src/app/        de schermen, in gewoon DOM zonder framework
build/build.mjs bundelt alles tot één index.html
test/           motortests, browsertests (Playwright) en add-on-tests
deploy/         Home Assistant: add-on en handleiding
```

De motor in `src/lib/` kent geen DOM en draait net zo goed in Node. Daar zit
het meeste denkwerk, en daarom het meeste testwerk: eerlijke verdeling,
keepersbeurten, te weinig spelers, late binnenkomers, uitvallers, en een
wissel die twee minuten te laat wordt uitgevoerd.

`index.html` staat in de repository omdat dat het product is — je moet hem
kunnen downloaden en openen zonder iets te installeren. Hij wordt gemaakt door
`npm run build`; pas hem niet met de hand aan.

## Aantekeningen

- Alle gegevens blijven in je browser (`localStorage`), tenzij je zelf een
  synchronisatieadres invult. Er gaat niets naar buiten.
- Gelijke speeltijd is in de KNVB-jeugd tot en met JO12 het uitgangspunt. De
  app is daarop ingesteld. Er is een schuif om accent op basisspelers te
  leggen, met een waarschuwing erbij; hij staat standaard dicht.
- Geen afhankelijkheden in de app zelf. `playwright-core` is er alleen voor
  de tests.

## Licentie

MIT, zie [LICENSE](LICENSE).
