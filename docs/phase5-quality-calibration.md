# Phase 5 – Modusabhängige Qualitätskalibrierung

## Aktive Bewertungsprofile

- `process-draft`
- `comparison`
- `eventlog-table`
- `weak-raw-table`

## Was je Profil variiert

- Gewichte je Qualitätsdimension
- zulässige Evidenzarten
- Blockerregeln
- Interpretation von `documentTypeDetection`, `structureFidelity`, `evidenceCoverage`, `conservativeHandling`

## Nachschärfungen

- `stepClarity` bewertet semantische Brauchbarkeit (Aktivitätscharakter, Fragmentfreiheit, Ausschluss schwacher Kurzlabels) statt nur formaler Glätte.
- `evidenceCoverage` rechnet modusabhängig:
  - dokument-/vergleichsnah: Text-/Fallanker
  - eventlog-table: Zeilenanker + Mappingkonfidenz + Eventabdeckung
  - weak-raw-table: Signal-/Cluster-Evidenz statt erzwungener Prozessschritte
- `conservativeHandling` bewertet Overclaiming differenziert und ist nicht mehr pauschal hoch.

## Exporttransparenz

`analysisResults.qualityAssessment` enthält zusätzlich:
- `scoringProfile`
- `scoringReasons`
- `blockerReasons`
- `confidenceAdjustments`
