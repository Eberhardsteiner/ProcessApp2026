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
```

## Wichtige Hinweise

- Die ZIP ist bewusst schlank und enthält keine `node_modules`.
- Nach dem Entpacken muss deshalb einmal `npm ci` laufen.
- Der Assisted-Process-Mining-Arbeitsstand kann in der App als JSON gesichert und später wieder geladen werden.
- Für einen schnellen Test ohne eigenes Material stehen lokale Beispielpakete im Assisted Process Mining bereit.
- `npm run bundle:summary` zeigt nach einem Build die größten Artefakte, damit Performance-Pflege nachvollziehbar bleibt.
