# Phase 2 – Generalisierter Quellen-Router

## Was eingeführt wurde

- Neuer, expliziter Router vor der Ableitung: `src/import/sourceRouter.ts`
- Router-Klassen:
  - `structured-procedure`
  - `semi-structured-procedure`
  - `narrative-case`
  - `mixed-document`
  - `eventlog-table`
  - `weak-raw-table`
- Router-Kontext wird produktiv weitergereicht über:
  - `ProcessMiningObservationCase.routingContext`
  - `DerivationSummary.routingContext`
  - Export-JSON (`analysisResults.routing`)

## Defensive Logik

- Schwache/mehrdeutige Signale werden bewusst auf `weak-raw-table` heruntergeroutet.
- Eventlog-Routing erfolgt nur bei kombinierter Evidenz aus Tabellencharakter, Zeitstempeldichte und Fall-/ID-Kohärenz.
- Keine harte Optimierung auf bekannte Fälle, sondern allgemeine Verteilungs- und Strukturmerkmale.

## Harte Pfadentscheidung vor Analyse

- In `deriveProcessArtifactsFromText` wird der Router **vor** Structured/Semi/Narrative-Auswertung aufgerufen.
- Der gewählte Routerpfad steuert explizit, welche Analysepfade zuerst bzw. überhaupt versucht werden.
- Bei `weak-raw-table` wird defensiv keine aggressive Strukturableitung erzwungen.

## Export-Transparenz

- Routing wird im Qualitäts-Export sichtbar:
  - `routingClass`
  - `routingConfidence`
  - `routingSignals`
  - `fallbackReason` (falls vorhanden)
