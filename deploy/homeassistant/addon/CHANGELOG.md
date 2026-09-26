# Wijzigingen

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
