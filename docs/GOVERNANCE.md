# Governance, Review und Freigabe

## Ziel

Der Governance-Bereich im Assisted Process Mining macht nachvollziehbar,
- welche Entscheidungen noch offen sind,
- welche Punkte bereits in Prüfung sind,
- ob eine Freigabe noch zur aktuellen Analysebasis passt,
- und welche nächste Aktion den Freigabepfad am stärksten stabilisiert.

## Kernbausteine in der App

- Governance-Überblick
- Review- und Freigabepfad
- Freigabe-Assistenz und Governance-Auswertung
- Vergleichbare Governance-Stände
- Review-Vorlagen
- Governance-Notiz und Exporte
- Entscheidungslog

## Freigabe-Assistenz

Die Freigabe-Assistenz verdichtet lokal:
- Governance-Reife
- aktive und überfällige Entscheidungen
- fehlende Owner oder Termine
- Review-Dauer
- Freigabezustand
- Trend zum letzten gemerkten Governance-Stand

Sie ersetzt kein Review, hilft aber dabei, Review und Freigabe ruhiger zu steuern.

## Lokale Prüfungen

```bash
npm run governance:check
npm run release:check
```

Der Governance-Check prüft vorbereitete Szenarien für Review, Freigabe und notwendige erneute Bestätigung nach Änderungen.
