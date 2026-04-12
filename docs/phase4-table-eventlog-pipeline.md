# Phase 4 – Eigenständige Tabellen-/Eventlog-Pipeline

## Neue Kernbausteine

- `src/ui/assistedMiningV2/tableEventPipeline.ts`
  - Tabellenprofil aus Inhalten und Verteilungen
  - Schema-Inferenz je Spalte mit Konfidenz, Supporting/Conflicting Signals
  - Eventlog-Eignungsprüfung (Activity + Case-ID + Ordnungsanker)
  - Eventlog-Normalisierung bei erfüllter Mindeststruktur
  - defensiver `weak-raw-table`-Fallback bei unzureichender Struktur

## Mindeststruktur für Eventlog-Mining

Eventlog-Pfad nur bei:
- belastbarer Activity-Spalte
- belastbarer Case-ID-Spalte
- belastbarem Ordnungsanker (timestamp/index)
- ohne kritische Konflikte im Mapping

Andernfalls:
- explizit `weak-raw-table`
- nur signalhafte, evidenzverankerte Hinweise
- keine scheinpräzisen Kernschritte aus Rohzeilen

## Exporttransparenz

`DerivationSummary.tablePipeline` enthält:
- `pipelineMode`
- `tableProfile`
- `inferredSchema`
- `eventlogEligibility`
- `rowEvidenceStats`
- optional `traceStats`
- optional `weakTableSignals`
