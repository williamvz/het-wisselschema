# Het Wisselschema

## De eerste keer

1. Start de app en open het tabblad **Logboek**. Daar staat een regel
   `Inrichtcode: XXXX-XXXX`.
2. Open de app via de zijbalk (zet **Toon in zijbalk** aan). Vul de code in, je
   naam, een gebruikersnaam en een wachtwoord. Dat account wordt de
   **beheerder**.
3. Maak je eerste team aan, of neem het team over dat je al had (zie hieronder).

## Trainers en teams

Tik rechtsboven op je initialen en kies **Club beheren**.

- **Team**: een naam, en welke trainers erbij horen. Zij zien het team in de
  app en kunnen er samen aan werken, ook tegelijk tijdens de wedstrijd.
- **Trainer**: naam, gebruikersnaam, wachtwoord (de app bedenkt er een) en
  teams. Na het aanmaken krijg je een berichtje met adres, gebruikersnaam en
  wachtwoord om door te sturen.
- **Beheerder**: een trainer die ook dit scherm mag openen en alle teams ziet.
  Maak er gerust een tweede, voor als jij er niet bent.

Rechtsboven zie je wie er verder meekijkt, en een stip: groen is alles
verstuurd, oranje is nog onderweg, grijs is geen verbinding. Zonder verbinding
werk je gewoon door; zodra er weer bereik is, gaat alles alsnog mee.

## Je team van vroeger meenemen

Gebruikte je de app al zonder account, of als lokale app uit de map `/addons`?
Dan heeft deze app een eigen, lege opslag. Je team neem je zo mee:

- Kijk na het inloggen onder **Team → Bestand**. Staat daar **Van dit
  apparaat**, dan staat je oude team nog in deze browser: één tik.
- Anders: open de oude app, kies **Archief → Back-up downloaden**, en zet dat
  bestand in de nieuwe terug via **Team → Bestand**.

Daarna kun je de oude app verwijderen.

## Opties

| Optie | Betekenis |
|---|---|
| `public_url` | Het adres waarop trainers de app bereiken, bijvoorbeeld `https://wisselschema.jouwclub.nl/`. Komt in het berichtje voor een nieuwe trainer. Zonder deze optie staat daar het adres waarop jij de app open hebt, en via de zijbalk is dat een adres binnen Home Assistant. |
| `allow_cors` | Laat de losse `index.html` (van een ander adres, of van schijf) ook met deze server verbinden. Inloggen blijft nodig. |
| `reset_password` | Wachtwoord van de beheerder kwijt? Zie hieronder. |

## Wachtwoord van de beheerder kwijt

Is er een tweede beheerder, dan geeft die je een nieuw wachtwoord. Anders:

1. Zet `reset_password` aan en start de app opnieuw.
2. In het logboek staat nu een regel met `Herstelcode`, met daarachter een
   code als `XXXX-XXXX`.
3. Tik in de app op **Wachtwoord vergeten?** en vul de code, je
   gebruikersnaam en een nieuw wachtwoord in. De code werkt één keer.
4. Zet `reset_password` weer uit.

## Delen met de club

Om de app buiten je huis bereikbaar te maken, zet je de poort `8099/tcp` aan en
zet je er een eigen domein met **https** voor, bijvoorbeeld met een Cloudflare
Tunnel. De app heeft zijn eigen accounts: zonder inloggen kom je niet bij de
teams. Het volledige recept staat in de
[handleiding op GitHub](https://github.com/williamvz/het-wisselschema/blob/main/deploy/homeassistant/README.md).

## Gegevens

Alles staat in de map `/data` van de app en gaat mee in de back-ups van Home
Assistant: `club.json` met gebruikers en teams (wachtwoorden alleen als hash),
en per team een bestand in `teams/`. Zet je een back-up terug, dan nemen de
telefoons die over zodra ze weer verbinding hebben.
