# Phase 3 – Evidenzbasierte Extraktion

## Kernbausteine

- Einheitliche Kandidatenmodellierung in `domain/process.ts` (`ExtractionCandidate`).
- Kandidaten werden aus Beobachtungen mit Evidenzanker + Kontextfenster aufgebaut.
- Kernschritte werden nur aus Kandidaten mit `status=merged` finalisiert.

## Zulassungsregeln für Kernschritte

Ein Schrittkandidat wird verworfen, wenn mindestens eines zutrifft:
- Evidenzanker zu kurz oder fehlt
- nur schwaches Kurzlabel (z. B. Mail/Notiz/Hinweis/Ticket)
- kein stabiler Aktivitätscharakter im lokalen Kontext

## Lokale Rollen-/Systemverankerung

- Rollen- und Systemkandidaten werden pro Schrittkontext erzeugt.
- Schwache Zuordnungen ohne Evidenzanker werden auf `support-only` herabgestuft.

## Exporttransparenz

- Export enthält jetzt neben Routing auch `extractionEvidence`:
  - Kandidatenstatistik
  - zurückgehaltene/verworfenen Kandidaten inkl. Grund und Evidenzanker
