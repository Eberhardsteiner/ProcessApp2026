import { CheckCircle2, Map, Rocket } from 'lucide-react';
import { COMPLETED_PHASES, NEXT_PHASES } from '../../config/productRoadmap';
import { APP_VERSION_LABEL } from '../../config/release';
import { ReleaseRoadmapPopover } from './ReleaseRoadmapPopover';

export function ProductRoadmapPanel() {
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Map className="h-5 w-5 text-cyan-600" />
            <h2 className="text-lg font-semibold text-slate-900">Produktstand und Roadmap</h2>
            <ReleaseRoadmapPopover ariaLabel="Produktstand und Roadmap öffnen" />
          </div>
          <p className="text-sm leading-relaxed text-slate-600 max-w-3xl">
            Die Weiterentwicklung läuft bewusst in kleinen, stabilen Schritten. So bleiben Übersichtlichkeit,
            Bedienbarkeit und lokale Analysefähigkeit im Vordergrund.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          Stand {APP_VERSION_LABEL}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-slate-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold">Bisher umgesetzt</h3>
          </div>
          <ol className="mt-3 space-y-2">
            {COMPLETED_PHASES.map(entry => (
              <li key={`${entry.versionLabel}-${entry.phase}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {entry.versionLabel} · {entry.phase}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-800">{entry.title}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-slate-800">
            <Rocket className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-semibold">Als Nächstes</h3>
          </div>
          <div className="mt-3 space-y-3">
            {NEXT_PHASES.length > 0 ? (
              NEXT_PHASES.map(entry => (
                <div key={entry.phase} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{entry.phase}</p>
                  <p className="mt-1 text-sm font-medium text-slate-800">{entry.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{entry.summary}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <p className="text-sm font-medium text-emerald-900">Die aktuell geplante Roadmap ist mit Phase 31 vollständig umgesetzt.</p>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800">Weitere Ausbauschritte wären ab jetzt nur noch bewusst beauftragte Anschlussphasen.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
