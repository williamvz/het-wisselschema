# Wijzigingen

## 2.2.0

- Wedstrijden zijn nu echte, losse wedstrijden. Onder **Wedstrijden** staat
  een lijst van wat er gepland staat. Met **Nieuwe wedstrijd** vul je
  tegenstander, datum, aanvang en thuis/uit in, en tik je op **Opslaan**.
  Daarna staat hij meteen bij je medetrainers in de lijst, en krijgen zij
  een melding.
- Meerdere wedstrijden vooruit plannen kan. Twee trainers die tegelijk een
  wedstrijd toevoegen, krijgen er allebei een; voorheen was er per team maar
  één plek en verdween er dan een.
- Bovenaan een wedstrijd zie je of alles is opgeslagen. Wat je daarna
  aanpast, wordt vanzelf opgeslagen.
- Werk je in de ene wedstrijd en je collega in de andere, dan merk je niets
  van elkaar. Tijdens de wedstrijd zelf werk je samen zoals voorheen.
- Spelers ruilen door te slepen. Bij een blok in het schema sleep je een
  speler naar een ander: binnen het veld, of van en naar de bank. Tikken en
  kiezen met wie je ruilt kan nog steeds.
- Ook tijdens de wedstrijd: sleep in het live-scherm een bankspeler op een
  veldspeler om nu te wisselen, of twee veldspelers om ze van plek te laten
  ruilen. Wat al gespeeld is blijft staan, de rest van het schema past zich
  aan, en met Ongedaan draai je het terug.
- Geen wissels, geen wisselopties. Zijn er niet meer spelers dan plekken in
  het veld, dan vraagt de app niet naar wisselmomenten. Tijdens de wedstrijd
  telt de klok dan af naar de rust in plaats van naar een wissel. Er komt ook
  geen wisselalarm voor een moment waarop niets verandert, en dat geldt ook
  als er wel een bank is.
- De klok in het live-scherm telt af: hoeveel er nog over is van de periode,
  zoals op het scorebord. Bij **Bijstellen** is +1 min dus een minuut meer op
  de klok.
- Na de update: herlaad de app op alle telefoons. Een oude versie kan niets
  meer aan de wedstrijden veranderen, en de server zet de wedstrijd die al
  klaarstond vanzelf in de nieuwe lijst.

## 2.1.0

- Gastspeler: doet er iemand van een ander team mee, dan zet je die bij
  **Wedstrijd** (of tijdens de wedstrijd bij **Speler erbij**) alleen in deze
  wedstrijd. Hij speelt mee in het schema, staat daarna in het archief, maar
  komt niet in je team en krijgt geen seizoenssaldo.
- Uitgelogd is echt uitgelogd. Geldt je sessie niet meer (bijvoorbeeld na een
  nieuw wachtwoord), dan zie je het team pas weer na opnieuw inloggen, ook na
  herladen. Wat nog niet verstuurd was, gaat daarna alsnog mee.
- Wachtwoord wijzigen: nieuw wachtwoord twee keer invullen, en een
  bevestiging die blijft staan tot je op Klaar tikt. De wachtwoordbeheerder
  van je telefoon onthoudt het nieuwe wachtwoord.
- Clubbeheer heeft een eigen tabblad **Club**, alleen voor beheerders. In de
  teamkeuze staan je eigen teams los van de andere teams van de club.

## 2.0.1

- Bouwt weer op de huidige Home Assistant. Die geeft bij het bouwen geen
  basis-image meer mee; de app gebruikt nu zelf het officiële Node-image
  (Node 22 op Alpine), zonder extra pakketten.
- Alleen nog voor 64-bits apparaten (aarch64 en amd64): de 32-bits varianten
  zijn in Home Assistant verouderd.

## 2.0.0

- Accounts en teams. Een beheerder maakt trainers en teams aan en koppelt ze
  aan elkaar; iedere trainer ziet alleen zijn eigen teams.
- Samenwerken tijdens de wedstrijd: een goal, een wissel of de klok staat
  binnen een tel op elke telefoon. Zonder bereik werk je door; daarna wordt
  alles samengevoegd.
- Eerste keer inrichten met een code uit het logboek. Een team dat al op de
  server stond, wordt het eerste team.
- Nieuwe opties `public_url` en `reset_password`.
- Te installeren door deze repository toe te voegen aan de App Store.

## 1.0.0

- Eerste versie: het wisselschema, live meelopen, uitval en score, met opslag
  op de server.
