# Phase E – Mischdokumente als eigener Pfad

## Ziel
Mischdokumente laufen nicht länger über reine Narrative- oder Tabellenlogik, sondern über einen eigenen Segmentpfad.

## Umsetzung
- eigener Mixed-Document-Pfad in `documentDerivation.ts`
- explizite Segmenttypen:
  - `process-core`
  - `quote`
  - `question`
  - `review-note`
  - `table`
  - `governance-note`
- Kernschritte werden nur aus `process-core`-Segmenten verdichtet
- Zitate, Fragen, Review-Notizen, Tabellen und Governance-Hinweise bleiben als Support- oder Signalebene erhalten
- `DerivationSummary` enthält jetzt zusätzlich `mixedDocumentSegments`
- `LocalEngineProfilePanel` zeigt Segmentverteilung und Beispielsegmente an

## Wirkung
- T05 kann Prozesskern und Signaltabelle getrennt führen
- T06 kann vermuteten Ablauf und Governance-Hinweise parallel sichtbar halten
- der bisherige Ein-Schritt-Kollaps bei Mischdokumenten wird reduziert
