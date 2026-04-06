# Qualitätsreport

Der Qualitätsreport bündelt die technische Funktionsfähigkeit, die fünf Referenzdokumente,
die lokale Referenzbibliothek und die Produktreife in einem gemeinsamen Report.

## Start

```bash
npm run quality:report
```

## Ausgaben

Die Routine erzeugt drei Dateien unter `reports/`:

- `quality-report.json`
- `quality-report.md`
- `quality-report.csv`

Zusätzlich werden zeitgestempelte Archivkopien derselben Dateien angelegt.

## Bewertungsblöcke

- technische Funktionsfähigkeit
- fünf Referenzdokumente unterschiedlicher Güte
- Referenzbibliothek und Regression
- Produktreife und Übergabekette

## Referenzdokumente

Die fünf Referenzdokumente dienen als feste Sicht auf unterschiedliche Materialqualitäten:

1. hochqualitatives Soll-Dokument
2. gute narrative Fallserie
3. Mischdokument mittlerer Qualität
4. schwaches Eventlog mit Lücken
5. sehr schwache Rohnotizen / Exportfragmente

Für schwaches Material wird ausdrücklich vorsichtiges Verhalten belohnt, nicht Scheingenauigkeit.
