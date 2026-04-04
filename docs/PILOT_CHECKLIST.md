# Pilot-Checkliste für Assisted Process Mining

## 1. Materialbasis prüfen
- Mindestens zwei Quellen oder Fälle vorhanden
- Erkannte Hauptschritte plausibel
- Wichtige Belegstellen sichtbar

## 2. Lokale Analyse prüfen
- Discovery wurde ausgeführt
- Soll-Abgleich zeigt verständliche Hinweise
- Verbesserungsanalyse liefert sinnvolle Hotspots

## 3. Verständlichkeit prüfen
- Bericht lokal erzeugt
- Mindestens eine Übergabe für Management und Team angesehen
- Hilfetexte an den zentralen Bereichen kurz geprüft

## 4. Arbeitsstand sichern
- PM-Arbeitsstand als JSON exportieren
- Wiederherstellung einmal testweise prüfen

## 5. Technische Mindestprüfung
```bash
npm run typecheck
npm run build
npm run benchmark:pm
npm run pilot:check
```
