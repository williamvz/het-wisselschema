# Op Home Assistant zetten

Er zijn drie manieren, oplopend in moeite. Ze sluiten elkaar niet uit: de app
is hetzelfde bestand, alleen de plek waar hij vandaan komt verschilt.

> **Belangrijk:** de app werkt altijd offline door, ook als Home Assistant
> onbereikbaar is. Wat je op het veld hebt ingevoerd staat in je browser en
> wordt bij de eerstvolgende verbinding alsnog naar de server gestuurd, en
> samengevoegd met wat je medetrainer intussen deed.

---

## 1. Zonder Home Assistant

Open `index.html`. Klaar. Op je telefoon: via "Zet op beginscherm" gedraagt
hij zich als een app.

Dit is de veiligste route voor langs de lijn, want er kan niets misgaan met
verbindingen. Nadeel: je team staat alleen op dát apparaat.

---

## 2. Als los bestand op Home Assistant

De snelste manier om hem op je Pi te krijgen, zonder add-on.

```bash
# op de Raspberry Pi, of via de Samba-/Studio Code Server-add-on
mkdir -p /config/www/wisselschema
cp index.html /config/www/wisselschema/index.html
```

De app staat nu op `https://<jouw-home-assistant>/local/wisselschema/index.html`.

Wil je hem in de zijbalk van Home Assistant, zet dit in `configuration.yaml`
en herstart:

```yaml
panel_iframe:
  wisselschema:
    title: Wisselschema
    icon: mdi:soccer
    url: /local/wisselschema/index.html
    require_admin: false
```

Gegevens blijven per apparaat in de browser staan; er zijn geen accounts en
er is geen samenwerken. Daarvoor is route 3.

---

## 3. Als add-on, met accounts en teams

Nu staan je teams op de Pi, werk je met je medetrainer tegelijk aan
hetzelfde team, en kun je de app met de rest van de club delen.

```bash
npm run build                                    # vult addon/www/index.html
cp -r deploy/homeassistant/addon /addons/wisselschema
```

Heb je geen Node bij de hand? Kopieer dan `index.html` uit de wortel van de
repository met de hand naar `deploy/homeassistant/addon/www/index.html`. Het
is hetzelfde bestand; de add-on-map bevat verder alleen de server
(`server.mjs` en `club.mjs`) en de Docker-configuratie.

Daarna in Home Assistant: **Instellingen → Add-ons → Add-on store → ⋮ →
Repositories vernieuwen**. "Het Wisselschema" verschijnt onder *Local add-ons*.
Installeren, starten, en **Show in sidebar** aanzetten. Had je de add-on al,
kies dan **Herbouwen** (rebuild): versie 2 is de versie met accounts.

### De eerste keer

1. Open de add-on en ga naar het tabblad **Logboek**. Daar staat een regel
   `Inrichtcode: XXXX-XXXX`.
2. Open de app (via de zijbalk). Hij vraagt om die code, je naam, een
   gebruikersnaam en een wachtwoord. Dat account wordt de **beheerder**.
3. Stond er van de vorige versie al een team op de server, dan wordt dat je
   eerste team, met spelers, archief en seizoenssaldo. Het oude bestand blijft
   bewaard als `state-voor-accounts.json`.

### Trainers en teams

Tik rechtsboven op je initialen en kies **Club beheren**.

- **Team** — naam, en welke trainers erbij horen. Zij zien het team in de app
  en kunnen er samen aan werken, ook tegelijk tijdens de wedstrijd.
- **Trainer** — naam, gebruikersnaam, wachtwoord (de app bedenkt er een) en
  teams. Na het aanmaken krijg je een berichtje met adres, gebruikersnaam en
  wachtwoord om door te sturen via de groepsapp.
- **Beheerder** — een trainer die ook dit scherm mag openen en alle teams
  ziet. Maak er gerust een tweede, voor als jij er niet bent.

Een trainer die zijn wachtwoord kwijt is, geef je onder Club beheren een
nieuw; zijn oude sessies vervallen dan meteen. Wie de app al zonder account
gebruikte, vindt na het inloggen onder **Team → Bestand** de knop om het team
van zijn telefoon over te nemen.

### Samen tijdens de wedstrijd

Log op beide telefoons in en open hetzelfde team. Rechtsboven zie je wie er
verder meekijkt, en een stip: groen is alles verstuurd, oranje is nog onderweg,
grijs is geen verbinding. Geen verbinding is geen probleem: je werkt gewoon
door, en zodra er weer bereik is gaat alles alsnog mee.

### Opties

| Optie            | Standaard | Betekenis |
|------------------|-----------|-----------|
| `public_url`     | leeg      | Het adres waarop trainers de app bereiken, bv. `https://wisselschema.williamvanzweden.nl/`. Komt in het berichtje voor een nieuwe trainer. Zonder deze optie staat daar het adres waarop jij de app open hebt, en via de zijbalk is dat een adres binnen Home Assistant. |
| `allow_cors`     | `true`    | Laat de losse `index.html` (route 1) ook met deze server verbinden: vul in de app onder **Archief → Samenwerken** het adres in en log in. Zet op `false` als je dat niet wilt. |
| `reset_password` | `false`   | Zie hieronder. |

### Wachtwoord van de beheerder kwijt

Is er een tweede beheerder, dan geeft die je een nieuw wachtwoord. Anders:

1. Zet de optie `reset_password` aan en start de add-on opnieuw.
2. In het logboek staat nu een regel met `Herstelcode`, met daarachter een
   code als `XXXX-XXXX`.
3. Tik in de app op **Wachtwoord vergeten?**, vul de code, je gebruikersnaam
   en een nieuw wachtwoord in. De code werkt één keer.
4. Zet `reset_password` weer uit.

### Waar staan de gegevens

In de map `/data` van de add-on, en dus in de back-ups van Home Assistant:

- `club.json` — gebruikers, teams en sessies. Wachtwoorden alleen als
  scrypt-hash, sessies alleen als hash van het token.
- `teams/<id>.json` — per team de spelers, de wedstrijd en het archief. Een
  verwijderd team wordt niet weggegooid maar opzijgezet als
  `<id>.verwijderd-<tijd>.json`.

Zet je een back-up terug, dan nemen de telefoons die over zodra ze weer
verbinding hebben; alleen wat een telefoon nog niet had verstuurd, komt erbij.
Is een teambestand ooit onleesbaar, dan maakt de server er geen leeg team van:
het logboek meldt het, de telefoons werken met hun eigen kopie door, en na het
terugzetten van een back-up is het team er weer.

---

## Een eigen domein: `wisselschema.williamvanzweden.nl`

Om de app met de club te delen, moet hij buiten je huis bereikbaar zijn. Zet
eerst de add-on uit route 3 aan. Daarna twee mogelijkheden.

De app heeft zijn eigen accounts: zonder inloggen kom je niet bij de teams,
ook niet via de directe poort. Wel moet het adres **https** zijn, anders gaan
wachtwoorden onversleuteld over de lijn. Beide recepten hieronder regelen dat.

### Via Cloudflare Tunnel (aanbevolen)

Geen poorten openzetten, werkt ook achter CGNAT, en je krijgt meteen een
geldig certificaat.

1. Installeer de **Cloudflare Tunnel**-add-on (repository
   `https://github.com/brenner-tobias/ha-addons`).
2. Maak in Cloudflare een tunnel en wijs `wisselschema.williamvanzweden.nl`
   naar `http://homeassistant:8099`.
3. Zet in de add-on-configuratie van Het Wisselschema de poort `8099/tcp`
   aan, zodat de tunnel erbij kan.
4. Vul bij de optie `public_url` het adres in:
   `https://wisselschema.williamvanzweden.nl/`.

Wil je er nog een slot extra op, dan kan Cloudflare Access ervoor (gratis voor
kleine aantallen gebruikers). Dan moet iedere trainer daar ook doorheen; voor
een club is de inlog van de app meestal genoeg.

### Via Nginx Proxy Manager

1. Installeer de **Nginx Proxy Manager**-add-on.
2. Zet poort 80 en 443 door op je router naar de Pi.
3. Maak een DNS-A-record voor `wisselschema.williamvanzweden.nl`.
4. Maak een Proxy Host naar `homeassistant:8099`, met een Let's Encrypt-certificaat
   en **Force SSL** aan.
5. Vul bij de optie `public_url` het adres in.

Een *Access List* met gebruikersnaam en wachtwoord is niet meer nodig. Heb je
er al een, dan werkt de app er gewoon achter: hij gebruikt voor zijn eigen
inlog een eigen kop en zit de wachtwoordvraag van Nginx niet in de weg.

---

## Werkt het?

```bash
curl http://<pi>:8099/health          # -> ok
curl http://<pi>:8099/api/status      # -> {"app":"het-wisselschema","ingericht":true,...}
```

Ziet de app de server, dan vraagt hij om in te loggen. Daarna staat onder
**Archief → Samenwerken** met welke server je verbonden bent, en met wie je
het team deelt. Valt de verbinding weg, dan werkt de app gewoon door - je
raakt niets kwijt.
