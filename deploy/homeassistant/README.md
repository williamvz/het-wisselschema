# Op Home Assistant zetten

Er zijn drie manieren, oplopend in moeite. Ze sluiten elkaar niet uit: de app
is hetzelfde bestand, alleen de plek waar hij vandaan komt verschilt.

> **Belangrijk:** de app werkt altijd offline door, ook als Home Assistant
> onbereikbaar is. Wat je op het veld hebt ingevoerd staat in je browser en
> wordt bij de eerstvolgende verbinding alsnog naar de server gestuurd.

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

Gegevens blijven per apparaat in de browser staan; er is geen synchronisatie.

---

## 3. Als add-on, met synchronisatie

Nu staat je team op de Pi, en zie je op je telefoon én je tablet hetzelfde.

```bash
npm run build                                    # vult addon/www/index.html
cp -r deploy/homeassistant/addon /addons/wisselschema
```

Heb je geen Node bij de hand? Kopieer dan `index.html` uit de wortel van de
repository met de hand naar `deploy/homeassistant/addon/www/index.html`. Het
is hetzelfde bestand; de add-on-map bevat verder alleen de server en de
Docker-configuratie.

Daarna in Home Assistant: **Instellingen → Add-ons → Add-on store → ⋮ →
Repositories vernieuwen**. "Het Wisselschema" verschijnt onder *Local add-ons*.
Installeren, starten, en **Show in sidebar** aanzetten.

De add-on draait via **ingress**: de app verschijnt in de zijbalk en zit
achter de gewone inlog van Home Assistant. De app merkt zelf dat er een
server is en gaat automatisch synchroniseren; je hoeft niets in te stellen.

De gegevens staan in één bestand, `/data/state.json` binnen de add-on. Dat
gaat mee in de back-ups van Home Assistant.

### Opties

| Optie        | Standaard | Betekenis |
|--------------|-----------|-----------|
| `allow_cors` | `true`    | Laat de losse `index.html` (route 1) ook naar deze server synchroniseren. Zet op `false` als je dat niet wilt. |

---

## Een eigen domein: `wisselschema.williamvanzweden.nl`

Zet eerst de add-on uit route 3 aan. Daarna twee mogelijkheden.

### Via Cloudflare Tunnel (aanbevolen)

Geen poorten openzetten, werkt ook achter CGNAT, en je krijgt meteen een
geldig certificaat.

1. Installeer de **Cloudflare Tunnel**-add-on (repository
   `https://github.com/brenner-tobias/ha-addons`).
2. Maak in Cloudflare een tunnel en wijs `wisselschema.williamvanzweden.nl`
   naar `http://homeassistant:8099`.
3. Zet in de add-on-configuratie van Het Wisselschema de poort `8099/tcp`
   aan, zodat de tunnel erbij kan.

> **Let op:** die directe poort zit *niet* achter de inlog van Home Assistant.
> Zet er Cloudflare Access voor (gratis voor kleine aantallen gebruikers), of
> accepteer dat iedereen met de link het wisselschema kan zien en aanpassen.
> Gaat het je alleen om delen, gebruik dan liever de deel-link uit de app:
> die bevat het hele schema en heeft helemaal geen server nodig.

### Via Nginx Proxy Manager

1. Installeer de **Nginx Proxy Manager**-add-on.
2. Zet poort 80 en 443 door op je router naar de Pi.
3. Maak een DNS-A-record voor `wisselschema.williamvanzweden.nl`.
4. Maak een Proxy Host naar `homeassistant:8099`, met een Let's Encrypt-certificaat.
5. Zet onder *Access List* een gebruikersnaam en wachtwoord, anders staat
   hij open.

---

## Werkt het?

```bash
curl http://<pi>:8099/health          # -> ok
curl http://<pi>:8099/api/state       # -> {} of je opgeslagen gegevens
```

Ziet de app de server, dan staat dat onderaan **Archief → Instellingen →
Synchroniseren**. Staat daar dat hij niet verbonden is, dan werkt de app
gewoon lokaal door - je raakt niets kwijt.
