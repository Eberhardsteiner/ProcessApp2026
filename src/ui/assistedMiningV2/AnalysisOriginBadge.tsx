// Kleines, ruhiges Herkunfts-Badge für ein Analyse-Ergebnis. Rein darstellend;
// getrieben aus summary.provenance. KEINE Analyse-Logik, ändert keine provenance-Werte.
//
// provenance === 'ai'        -> „Mit KI erstellt"
// 'local' / undefined        -> „Lokale Vorschau ohne KI" (+ Hinweis). undefined wird
//                               bewusst als „ohne KI" behandelt (ehrlicher Default).

interface Props {
  provenance?: 'local' | 'ai';
}

export function AnalysisOriginBadge({ provenance }: Props) {
  if (provenance === 'ai') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-xs font-medium text-violet-700">
        Mit KI erstellt
      </span>
    );
  }

  return (
    <span
      title="Ohne KI erstellt – für vollständigere Ergebnisse KI in den Einstellungen aktivieren."
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
    >
      Lokale Vorschau ohne KI
    </span>
  );
}
