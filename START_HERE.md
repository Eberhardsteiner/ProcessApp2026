# Start hier

## Projekt lokal starten

```bash
npm ci
npm run dev
```

## Produktivmodus vs. QA-/Dev-Modus

- **Standard-Build:** zeigt nur den operativen Pfad **Upload → Analyse → Prüfen → Export**.
- **Nicht sichtbar im Standard-Build:** Self-Test, Benchmark-, Release-, Governance-, Collaboration-, Security-, Pilot-, Acceptance- und Connector-Flächen.
- **QA-/Dev-Modus aktivieren:** `VITE_ENABLE_QA_SURFACES=1 npm run dev`
- **Optional in einer bewusst aktivierten Sitzung:** `?qa=1`
- **Technische Trennung:** Produktivdaten liegen in `version.sidecar.processMiningAssistedV2`, QA-/Dev-Daten separat in `version.sidecar.processMiningAssistedV2Qa`.
- **Lazy Loading:** QA-Flächen werden nur bei aktivem QA-/Dev-Modus nachgeladen und nicht im Standardpfad gerendert.
- **Export-JSON:** nutzt nur den Core-Analysezustand und bleibt als externes Bewertungsartefakt erhalten.

## Quellen-Router (Phase 2)

- Vor der eigentlichen Analyse klassifiziert der produktive Router Quellen defensiv in:
  `structured-procedure`, `semi-structured-procedure`, `narrative-case`, `mixed-document`, `eventlog-table`, `weak-raw-table`
- Der Routing-Kontext läuft produktiv mit:
  `routingClass`, `routingConfidence`, `routingSignals`, `fallbackReason`
- Dokumente/Freitexte laufen über [src/ui/assistedMiningV2/documentDerivation.ts](C:/Users/eberh/Documents/GitHub/ProcessApp2026/src/ui/assistedMiningV2/documentDerivation.ts)
- Tabellen werden vor dem starken Eventlog-Pfad über [src/import/sourceRouter.ts](C:/Users/eberh/Documents/GitHub/ProcessApp2026/src/import/sourceRouter.ts) geprüft und in [src/ui/assistedMiningV2/tableEventPipeline.ts](C:/Users/eberh/Documents/GitHub/ProcessApp2026/src/ui/assistedMiningV2/tableEventPipeline.ts) defensiv bestätigt oder abgerüstet
- Der Export zeigt die Routing-Entscheidung direkt in `context.sourceRouting` und zusätzlich im `lastDerivationSummary.routingContext`

## Evidenzbasierte Extraktion (Phase 3)

- Schritte, Rollen und Systeme laufen produktiv zuerst über das gemeinsame Kandidatenmodell in [src/ui/assistedMiningV2/evidenceModel.ts](C:/Users/eberh/Documents/GitHub/ProcessApp2026/src/ui/assistedMiningV2/evidenceModel.ts).
- Ein finaler Kernschritt braucht einen Evidenzanker und ein lokales Kontextfenster; schwache Fragmente werden als `support-only`, `issue-signal`, `friction-signal`, `governance-note` oder `weak-raw-fragment` gehalten.
- Die Dokumentableitung in [src/ui/assistedMiningV2/documentDerivation.ts](C:/Users/eberh/Documents/GitHub/ProcessApp2026/src/ui/assistedMiningV2/documentDerivation.ts) und der Tabellenpfad in [src/ui/assistedMiningV2/tableEventPipeline.ts](C:/Users/eberh/Documents/GitHub/ProcessApp2026/src/ui/assistedMiningV2/tableEventPipeline.ts) erzeugen zuerst Kandidaten und finalisieren Kernschritte erst nach Evidenzprüfung.
- Narrative Restableitung in [src/ui/assistedMiningV2/narrativeParsing.ts](C:/Users/eberh/Documents/GitHub/ProcessApp2026/src/ui/assistedMiningV2/narrativeParsing.ts) führt Nicht-Schritte nicht mehr direkt in den Kernprozess, sondern als Support-/Signalspur.
- Der operative Export enthält die Evidenztransparenz jetzt explizit über `lastDerivationSummary.extractionCandidates`, `lastDerivationSummary.candidateReview` und `sourceMaterial.extractionCandidates`.

## Standardprüfung

```bash
npm run typecheck
npm run build
```

## Optionale QA-/Release-Prüfungen

Nur gezielt außerhalb des Standardpfads verwenden:

```bash
npm run bundle:summary
npm run benchmark:pm
npm run benchmark:pm:strict
npm run pilot:check
npm run integration:check
npm run connector:check
npm run adapter:check
npm run security:check
npm run acceptance:check
npm run release:check
npm run governance:check
npm run hardening:check
npm run collaboration:check
```

## Hinweise

- Die ZIP enthält bewusst keine `node_modules`.
- Nach dem Entpacken deshalb einmal `npm ci` ausführen.
- Der Assisted-Process-Mining-Arbeitsstand kann weiterhin als JSON gesichert und wieder geladen werden.
- Der Block **"Analysezustand als JSON exportieren"** bleibt im operativen Arbeitsbereich verfügbar.

## Qualitätscheck-Export

Vorgehen:

1. Eigenes Dokument oder eigenen Fall auswerten.
2. Den aktuellen Analysezustand als JSON exportieren oder kopieren.
3. Das JSON extern zur Qualitätsbewertung verwenden.
