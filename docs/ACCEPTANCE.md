# Pilotbetrieb 3.0 und formale Abnahme

Ab **v0.39** gibt es im letzten Schritt des Assisted Process Mining einen eigenen Bereich für die formale Abnahme.

## Wozu der Bereich dient

Die App verdichtet den vorhandenen Arbeitsstand zu einer ruhigen Entscheidungsvorlage. Dabei werden sechs Bausteine sichtbar zusammengeführt:

- lokale Referenzbasis und Benchmark
- aktueller Bericht und Übergaben
- Governance und Review/Freigabe
- Sicherheit, Datenschutz und Deployment-Rahmen
- Pilotpaket und Pilotvorbereitung
- kurze formale Checkliste

## Was dort möglich ist

- formale Entscheidung festhalten
- Checkliste abhaken
- Erfolgskriterien, Risiken und Enablement notieren
- Abnahmestand merken
- Text- oder JSON-Vorlage exportieren
- Entscheidungsvorlage als Evidenz sichern

## Entscheidungen

Die App arbeitet mit vier ruhigen Entscheidungstypen:

- **Pilot gezielt fortsetzen**
- **Begrenzt freigeben**
- **Vor Freigabe nachschärfen**
- **Vorläufig stoppen**

Diese Entscheidung wird nicht automatisch gesetzt. Die App gibt nur eine Empfehlung auf Basis des aktuellen Arbeitsstands.

## Acceptance-Check

Zusätzlich gibt es einen lokalen Check:

```bash
npm run acceptance:check
```

Er prüft vorbereitete Szenarien für:

- tragfähige begrenzte Freigabe
- Pilot mit beobachtenswerten Restpunkten
- noch nicht abnahmereifen Stand

Der Check wird außerdem im `npm run release:check` mitgeführt.
