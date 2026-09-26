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

De snelste manier om hem op je Pi te krijgen, zonder app uit de App Store.

```bash
# op de Raspberry Pi, of via de Samba- of Studio Code Server-app
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

## 3. Als app uit de App Store, met accounts en teams

Nu staan je teams op de Pi, werk je met je medetrainer tegelijk aan
hetzelfde team, en kun je de app met de rest van de club delen.

Deze repository is ook een app-repository voor Home Assistant. In Home
Assistant: **Instellingen → Apps → App Store → ⋮ → Repositories** (in oudere
versies heet het *Add-ons* en *Add-on Store*), en voeg toe:

```
https://github.com/williamvz/het-wisselschema
```

Of met één klik:

[![Voeg de repository toe aan je Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fwilliamvz%2Fhet-wisselschema)

"Het Wisselschema" verschijnt dan in de App Store. Installeren, starten, en
**Toon in zijbalk** aanzetten. Home Assistant bouwt de app op je eigen
apparaat; dat duurt de eerste keer een paar minuten. Een nieuwe versie zie je
als update in Home Assistant.

<details>
<summary>Zonder de App Store: de map zelf kopiëren</summary>

Handig als je zelf aan de app werkt:

```bash
npm run build                                    # werkt addon/www/index.html bij
cp -r deploy/homeassistant/addon /addons/wisselschema
```

Daarna staat hij in de App Store onder *Local apps*. Na een nieuwe kopie kies
je bij de app **Herbouwen**.

</details>

Had je de app al als lokale app uit `/addons`? Dan is de app uit de
repository een nieuwe, met een eigen opslag. Hoe je je team meeneemt, staat
hieronder bij *De eerste keer*.

### De eerste keer

1. Open de app in Home Assistant en ga naar het tabblad **Logboek**. Daar
   staat een regel `Inrichtcode: XXXX-XXXX`.
2. Open de app (via de zijbalk). Hij vraagt om die code, je naam, een
   gebruikersnaam en een wachtwoord. Dat account wordt de **beheerder**.
3. Werkte je de lokale app uit `/addons` bij naar deze versie, dan wordt het
   team dat op de server stond je eerste team, met spelers, archief en
   seizoenssaldo. Het oude bestand blijft bewaard als
   `state-voor-accounts.json`.
4. Kwam je van de lokale app en installeerde je nu die uit de App Store, dan
   begint die leeg. Maak een team aan en kijk onder **Team → Bestand**: staat
   daar **Van dit apparaat**, dan neem je je oude team met één tik over.
   Anders open je eerst de oude app, kies je **Archief → Back-up downloaden**,
   en zet je dat bestand in de nieuwe terug via **Team → Bestand**. Daarna kun
   je de oude app verwijderen.

### Trainers en teams

Tik rechtsboven op je initialen en kies **Club beheren**. Dezelfde uitleg
staat ook in de app zelf, in het tabblad **Documentatie**.

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

1. Zet de optie `reset_password` aan en start de app opnieuw.
2. In het logboek staat nu een regel met `Herstelcode`, met daarachter een
   code als `XXXX-XXXX`.
3. Tik in de app op **Wachtwoord vergeten?**, vul de code, je gebruikersnaam
   en een nieuw wachtwoord in. De code werkt één keer.
4. Zet `reset_password` weer uit.

### Waar staan de gegevens

In de map `/data` van de app, en dus in de back-ups van Home Assistant:

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
eerst de app uit route 3 aan. Daarna twee mogelijkheden.

De app heeft zijn eigen accounts: zonder inloggen kom je niet bij de teams,
ook niet via de directe poort. Wel moet het adres **https** zijn, anders gaan
wachtwoorden onversleuteld over de lijn. Beide recepten hieronder regelen dat.

### Via Cloudflare Tunnel (aanbevolen)

Geen poorten openzetten, werkt ook achter CGNAT, en je krijgt meteen een
geldig certificaat.

1. Installeer de **Cloudflare Tunnel**-app (repository
   `https://github.com/brenner-tobias/ha-addons`).
2. Maak in Cloudflare een tunnel en wijs `wisselschema.williamvanzweden.nl`
   naar `http://homeassistant:8099`.
3. Zet in de configuratie van de app Het Wisselschema de poort `8099/tcp`
   aan, zodat de tunnel erbij kan.
4. Vul bij de optie `public_url` het adres in:
   `https://wisselschema.williamvanzweden.nl/`.

Wil je er nog een slot extra op, dan kan Cloudflare Access ervoor (gratis voor
kleine aantallen gebruikers). Dan moet iedere trainer daar ook doorheen; voor
een club is de inlog van de app meestal genoeg.

### Via Nginx Proxy Manager

1. Installeer de **Nginx Proxy Manager**-app.
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
