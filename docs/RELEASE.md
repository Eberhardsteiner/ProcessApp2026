# Freigabe, Stabilisierung und Governance-Auswertung

## Wofür dieser Stand gedacht ist

Phase 30 und Phase 31 schließen den letzten Schritt des Assisted Process Mining zu einem ruhigen Freigabeweg zusammen.

Die App führt jetzt sichtbar durch diese Reihenfolge:
1. Bericht und Übergaben auf den aktuellen Stand bringen
2. Review und Governance klären
3. Freigabe-Assistenz und Governance-Reife prüfen
4. Pilot-Paket bewusst exportieren
5. Connector-Pakete nur bei Bedarf ergänzen
6. Arbeitsstand sichern

## Lokale Checks für den letzten Schritt

```bash
npm run release:check
npm run governance:check
npm run hardening:check
npm run security:check
```

Der Release-Check fasst jetzt lokale Kernprüfungen für:
- Goldfälle und Regression
- Arbeitsstand-Härtung und Recovery
- Pilotlauf und Berichtskette
- Importpfade und Integrationsrahmen
- Connector- und Exportpakete
- Sicherheit, Datenschutz und Deployment
- Freigabe-Assistenz und Governance-Auswertung
- Zusammenarbeit und Auditspur

## Wie der Status zu lesen ist

- **Noch nicht freigabefähig**: wichtige Grundlagen fehlen noch
- **Stabilisierung läuft**: der Stand ist gut nutzbar, sollte aber noch zusammengezogen werden
- **Gut für Review und Pilotvorbereitung**: Bericht, Governance und Pilotvorbereitung greifen schon sinnvoll ineinander
- **Gut für Freigabe und Pilotbetrieb**: der Stand wirkt geschlossen und belastbar

## Wichtiger Grundsatz

Connector-Pakete bleiben optional. Die lokale Analyse bleibt der führende Kern. Exporte, Review-Hilfen und Integrationsprofile werden bewusst und sichtbar erzeugt, nicht still im Hintergrund synchronisiert.


## Phase 32 · Produkt-Härtung

Phase 32 ergänzt den Freigabeweg um einen zusätzlichen Härtungsblick:

- beschädigte oder widersprüchliche Arbeitsstände werden beim Laden automatisch stabilisiert
- veraltete Berichte und Folgeartefakte werden nicht auf leerer oder unpassender Basis stehen gelassen
- Save-Fehler bleiben sichtbar und können direkt erneut angestoßen werden
- ein eigener Hardening-Check prüft Recovery-Szenarien auch außerhalb der UI


## Phase 33 · UI-Konsolidierung und Bedienlogik

Phase 33 zieht die Bedienoberfläche im Assisted Process Mining weiter zusammen:

- Schrittkopf, Stepper und Speichern-Status folgen jetzt einem gemeinsamen, ruhigeren Muster
- Discovery, Soll-Abgleich, Verbesserungsanalyse und Ergebnisanreicherung nutzen einheitlichere Schrittköpfe und Kennzahlen
- Schnellzugriffe zeigen ihre Erläuterungen nur noch bei Bedarf, damit die Hauptstrecke sichtbar bleibt
- Aktionsleisten führen den nächsten sinnvollen Schritt klarer und konsistenter


## Phase 36 · Zusammenarbeit, Kommentare und Auditierbarkeit

Phase 36 ergänzt den Freigabeweg um eine ruhige Team- und Auditspur:

- Kommentare können direkt am Arbeitsstand, am Bericht, an Governance-Entscheidungen, Quellen oder Kernschritten erfasst werden
- wichtige Governance-Aktionen und die Berichtserzeugung laufen in eine nachvollziehbare Auditspur
- Zusammenarbeit bleibt optional und ruhig, wird aber im Arbeitsbereich und im Release-Check sichtbar


## Phase 38 · Sicherheit, Datenschutz und Deployment-Reife

Phase 38 ergänzt den letzten Schritt um einen sichtbaren Betriebsrahmen:

- Datenklassifikation, externe Wege, Aufbewahrung, Backups und Deployment-Ziel sind jetzt im Arbeitsstand dokumentierbar
- ein lokaler Sicherheits-Check prüft typische lokale, externe und Pilot-Szenarien
- Datenschutz, IT und Pilotleitung können ein Security-/Deployment-Profil oder ein Kurzbriefing direkt aus der App exportieren


## Phase 39 · Pilotbetrieb 3.0 und formale Abnahme

Phase 39 schließt den aktuellen Kernplan mit einer formalen Abnahmehilfe ab:

- eigener Bereich für Entscheidung, Checkliste, Erfolgskriterien und Risiken
- exportierbare Text- und JSON-Vorlage für Review, Pilotleitung oder Management
- gemerkte Abnahmestände mit Vergleich zur aktuellen Analysebasis
- lokaler Acceptance-Check als zusätzlicher Baustein im Release-Check
