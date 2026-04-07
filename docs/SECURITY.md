# Sicherheit und Datenschutz im Assisted Process Mining

## Ziel

Ab v0.38 gibt es in Schritt 5 einen eigenen Bereich **"Sicherheit, Datenschutz und Deployment"**.
Er fasst den verantwortbaren Betriebsrahmen sichtbar zusammen, statt ihn nur implizit in Einstellungen oder Exporten zu verstecken.

## Was lokal bewertet wird

Die App prüft dabei ausschließlich lokal im Browser beziehungsweise im aktuellen Arbeitsstand:

- aktive externe Wege aus dem Setup
- optionale Außenwege wie Copy/Paste oder Exportprofile
- sensible Marker im Material, z. B.
  - E-Mail-Adressen
  - Telefonnummern
  - Serien-, Ticket-, Auftrags- oder Rechnungskennzeichen
- Aufbewahrung und Backup-Notizen
- Deployment-Ziel und Incident-/Betriebsansprechpartner
- dokumentierte letzte Prüfung des Sicherheitsprofils

## Ergebnisbild

Die Karte zeigt einen lokalen Score und eine Einordnung in drei Stufen:

- **Kontrollierter Betriebsrahmen**
- **Vor Einsatz kurz prüfen**
- **Noch nicht verantwortbar gefasst**

Diese Einordnung ersetzt keine formale Datenschutz- oder Sicherheitsprüfung, hilft aber dabei, den Arbeitsstand vor Pilot, Export oder Integrationsübergabe nachvollziehbar zu machen.

## Was bewusst nicht passiert

- keine automatische Freigabe externer Dienste
- keine stille Hintergrundübertragung
- keine automatische Anbindung an Drittsysteme
- keine automatische Löschung oder Verschlüsselung außerhalb des Browsers

Die App macht den Rahmen sichtbar und exportierbar. Die organisatorische Entscheidung bleibt bewusst beim Team.

## Export

Aus dem Sicherheitsbereich können zwei Artefakte erzeugt werden:

- **Security-/Deployment-Profil als JSON**
- **Kurzbriefing als Text**

Beides ist für Datenschutz, IT, Pilotleitung oder interne Review-Runden gedacht.

## Lokaler Check

```bash
npm run security:check
```

Dieser Check prüft typische lokale Szenarien für:

- lokalen Betrieb mit sichtbarer Prüfung
- externe Wege ohne ausreichende Freigabe
- betreuten Pilotbetrieb mit Restpunkten
