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
```

Der Release-Check fasst jetzt fünf lokale Kernprüfungen zusammen:
- Goldfälle und Regression
- Pilotlauf und Berichtskette
- Importpfade und Integrationsrahmen
- Connector- und Exportpakete
- Freigabe-Assistenz und Governance-Auswertung

## Wie der Status zu lesen ist

- **Noch nicht freigabefähig**: wichtige Grundlagen fehlen noch
- **Stabilisierung läuft**: der Stand ist gut nutzbar, sollte aber noch zusammengezogen werden
- **Gut für Review und Pilotvorbereitung**: Bericht, Governance und Pilotvorbereitung greifen schon sinnvoll ineinander
- **Gut für Freigabe und Pilotbetrieb**: der Stand wirkt geschlossen und belastbar

## Wichtiger Grundsatz

Connector-Pakete bleiben optional. Die lokale Analyse bleibt der führende Kern. Exporte, Review-Hilfen und Integrationsprofile werden bewusst und sichtbar erzeugt, nicht still im Hintergrund synchronisiert.
