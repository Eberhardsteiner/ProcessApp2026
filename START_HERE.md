# Start hier

## Projekt lokal starten

```bash
npm ci
npm run dev
```

## Vor dem Weitergeben kurz prüfen

```bash
npm run typecheck
npm run build
npm run bundle:summary
npm run benchmark:pm
npm run pilot:check
npm run integration:check
npm run connector:check
npm run release:check
npm run governance:check
```

## Wichtige Hinweise

- Die ZIP ist bewusst schlank und enthält keine `node_modules`.
- Nach dem Entpacken muss deshalb einmal `npm ci` laufen.
- Der Assisted-Process-Mining-Arbeitsstand kann in der App als JSON gesichert und später wieder geladen werden.
- In Schritt 1 prüft die neue Import-Gesundheit, ob Dokumente, Freitexte und Tabellen bereits tragfähige Prozessschritte liefern oder noch nachgeschärft werden sollten.
- In Schritt 5 zeigt die App jetzt Betriebsgrenzen und optionale Integrationswege mit vorbereiteten JSON-Profilen für Copy/Paste, API-Proxy oder externe Weiterverarbeitung.
- Connector-Pakete ergänzen jetzt strukturierte Bundle-Wege für Ticket-Handover, BI, KI-/API-Proxy und Governance-Archiv.
- Phase 30 bündelt Schritt 5 zusätzlich in einen klaren Freigabefluss: Bericht, Governance, Pilot-Paket, Connector-Pakete und Arbeitsstand-Sicherung.
- Phase 31 ergänzt dazu eine ruhige Freigabe-Assistenz mit Governance-Reife, Prioritäten und Trend zum letzten gemerkten Governance-Stand.
- Die aktuell geplante Roadmap ist mit Phase 31 vollständig umgesetzt.
- In Schritt 5 steht jetzt zusätzlich ein Pilot-Paket als ZIP oder JSON bereit, das Bericht, Governance und Arbeitsstand zusammen bündelt.
- Für einen schnellen Test ohne eigenes Material stehen lokale Beispielpakete im Assisted Process Mining bereit.
- `npm run bundle:summary` zeigt nach einem Build die größten Artefakte, damit Performance-Pflege nachvollziehbar bleibt.

## Nützliche Prüfungen

```bash
npm run benchmark:pm
npm run benchmark:pm:strict
npm run pilot:check
npm run integration:check
npm run connector:check
npm run release:check
npm run governance:check
```
