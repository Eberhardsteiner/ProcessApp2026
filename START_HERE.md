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
npm run adapter:check
npm run security:check
npm run acceptance:check
npm run release:check
npm run governance:check
npm run hardening:check
npm run collaboration:check
```

## Wichtige Hinweise

- Die ZIP ist bewusst schlank und enthält keine `node_modules`.
- Nach dem Entpacken muss deshalb einmal `npm ci` laufen.
- Der Assisted-Process-Mining-Arbeitsstand kann in der App als JSON gesichert und später wieder geladen werden.
- In Schritt 1 prüft die neue Import-Gesundheit, ob Dokumente, Freitexte und Tabellen bereits tragfähige Prozessschritte liefern oder noch nachgeschärft werden sollten.
- In Schritt 5 zeigt die App jetzt Betriebsgrenzen und optionale Integrationswege mit vorbereiteten JSON-Profilen für Copy/Paste, API-Proxy oder externe Weiterverarbeitung.
- Connector-Pakete ergänzen jetzt strukturierte Bundle-Wege für Ticket-Handover, BI, KI-/API-Proxy und Governance-Archiv.
- Die Integrationswerkbank führt diese Bundle-Wege jetzt mit Verträgen, Exchange Packages und kontrolliert übernommenen Rückmeldungen weiter.
- Phase 30 bündelt Schritt 5 zusätzlich in einen klaren Freigabefluss: Bericht, Governance, Pilot-Paket, Connector-Pakete und Arbeitsstand-Sicherung.
- Phase 31 ergänzt dazu eine ruhige Freigabe-Assistenz mit Governance-Reife, Prioritäten und Trend zum letzten gemerkten Governance-Stand.
- Phase 32 härtet den Arbeitsstand zusätzlich gegen beschädigte Zustände, veraltete Folgeartefakte und Save-Fehler.
- Phase 33 zieht Schrittköpfe, Aktionsleisten und Schnellzugriffe zu einem ruhigeren, einheitlicheren Bedienmuster zusammen.
- Phase 36 ergänzt nun Kommentare, Team-Notizen und eine Auditspur direkt im Assisted Process Mining, damit Review und Freigabe nachvollziehbarer werden.
- Phase 37 zieht daraus nun eine reale Integrationsschicht mit strukturierten Verträgen und Receipt-Roundtrip.
- Phase 38 ergänzt einen sichtbaren Sicherheits-, Datenschutz- und Deployment-Rahmen mit lokalem Security-Check sowie exportierbarem Profil für Datenschutz, IT oder Pilotleitung.
- Phase 39 schließt den aktuellen Kernplan mit einer formalen Abnahmehilfe, Entscheidungsvorlage und einem lokalen Acceptance-Check ab.
- In Schritt 5 steht jetzt zusätzlich ein Pilot-Paket als ZIP oder JSON bereit, das Bericht, Governance und Arbeitsstand zusammen bündelt.
- `npm run bundle:summary` zeigt nach einem Build die größten Artefakte, damit Performance-Pflege nachvollziehbar bleibt.

## Nützliche Prüfungen

```bash
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

## Qualitätscheck-Export in der App

Im Assisted Process Mining gibt es oben im Arbeitsbereich den Block **"Analysezustand als JSON exportieren"**.

Vorgehen:
1. eigenes Testdokument oder Fall in der App auswerten
2. den Analysezustand als JSON exportieren oder kopieren
3. die JSON-Datei extern zur Qualitätsbewertung weitergeben

