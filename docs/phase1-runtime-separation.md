# Phase 1 – Trennung Produktlogik vs. Prüflogik

## Technische Trennung

- Zentrale Laufzeitsteuerung über `src/config/runtimeMode.ts`.
- QA-/Dev-Surfaces sind **standardmäßig aus** und nur explizit aktivierbar:
  - `VITE_ENABLE_QA_SURFACES=1`
  - oder URL-Flag `?qa=1`
  - in lokaler Entwicklung zusätzlich über `import.meta.env.DEV`.

## Standard-Build (sichtbar)

- Operativer Hauptpfad: Upload → Analyse → Prüfen → Export.
- Keine Self-Test-Ansicht im regulären Einstieg.
- Keine Freigabe-/Release-Check-Surface im Standardpfad von Schritt 5.
- Kein Integritäts-Diagnosepanel im Standardpfad.

## QA-/Dev-Build (explizit aktiv)

- Self-Test-View in `App.tsx`.
- Release-Readiness-Surface in `AugmentationStep.tsx`.
- Integritäts-/Diagnosepanel in `AssistedMiningWorkbench.tsx`.
- Release-Stability-Berechnung im Workspace-Overview.

## Unverändert

- Fachliche Extraktionslogik, semantische Analyse und Scoring wurden nicht umgebaut.
- Export-JSON bleibt erhalten und weiter nutzbar als externes Bewertungsartefakt.
