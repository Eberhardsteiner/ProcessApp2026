import { useMemo, useState } from 'react';
import { BookOpen, FlaskConical, Layers3, PlayCircle, Search, ShieldCheck } from 'lucide-react';
import { HelpPopover } from '../components/HelpPopover';
import { getBenchmarkCoverageSummary } from './benchmarkLab';
import { getDomainLibraryEntries } from './domainLibrary';
import type { SampleScenarioKey } from './sampleCases';

type FilterMode = 'all' | 'measured' | 'preview';

interface Props {
  onLoadSample: (key: SampleScenarioKey) => void;
}

export function DomainLibraryPanel({ onLoadSample }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const entries = useMemo(() => getDomainLibraryEntries(), []);
  const coverage = useMemo(() => getBenchmarkCoverageSummary(), []);
  const coverageMap = useMemo(
    () => new Map(coverage.domains.map(domain => [domain.key, domain.count])),
    [coverage.domains],
  );

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter(entry => {
      if (filter !== 'all' && entry.maturity !== filter) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        entry.title,
        entry.summary,
        entry.note,
        ...entry.focus,
        ...entry.typicalRoles,
        ...entry.typicalSystems,
        ...entry.typicalSignals,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [entries, filter, query]);

  const measuredCount = entries.filter(entry => entry.maturity === 'measured').length;
  const previewCount = entries.filter(entry => entry.maturity === 'preview').length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-slate-800">
              <BookOpen className="h-4 w-4 text-violet-600" />
              <p className="text-sm font-semibold">Domänenbibliothek</p>
              <HelpPopover helpKey="pmv2.domainLibrary" ariaLabel="Hilfe: Domänenbibliothek" />
            </div>
            <p className="text-xs leading-relaxed text-slate-600 max-w-3xl">
              Hier sehen Sie, welche Fachpakete lokal ohne KI bereits gut abgedeckt sind und welche als neue Explorationspakete bereitstehen.
              Gemessene Pakete hängen bereits am Benchmark. Vorschau-Pakete sind bewusst experimenteller, aber direkt nutzbar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
              {measuredCount} gemessen
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-800">
              {previewCount} Vorschau
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700">
              {coverage.totalCases} Referenzfälle im Benchmark
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Fachpaket, Rolle, System oder Signal suchen"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'Alle'],
              ['measured', 'Gemessen'],
              ['preview', 'Vorschau'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === value
                    ? 'border-blue-200 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredEntries.map(entry => {
          const measuredCases = coverageMap.get(entry.key as never) ?? entry.measuredCoverageCount ?? 0;
          const measured = entry.maturity === 'measured';
          return (
            <div key={entry.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${measured ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-violet-200 bg-violet-50 text-violet-800'}`}>
                      {measured ? 'gemessen' : 'Vorschau'}
                    </span>
                    {measured ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                        {measuredCases} Referenzfälle
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                        noch nicht im Benchmark
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">{entry.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onLoadSample(entry.sampleKey)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${measured ? 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100' : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'}`}
                >
                  <PlayCircle className="h-4 w-4" />
                  {measured ? 'Beispiel laden' : 'Vorschau laden'}
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-slate-800">
                    <Layers3 className="h-4 w-4 text-blue-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide">Typische Prozessanker</p>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {entry.focus.map(item => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-slate-800">
                    {measured ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <FlaskConical className="h-4 w-4 text-violet-600" />}
                    <p className="text-xs font-semibold uppercase tracking-wide">Einordnung</p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{entry.note}</p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rollen</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{entry.typicalRoles.join(' · ')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Systeme</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{entry.typicalSystems.join(' · ')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Typische Signale</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{entry.typicalSignals.join(' · ')}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredEntries.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
          Für diesen Suchbegriff ist aktuell kein Fachpaket hinterlegt. Versuchen Sie Rollen, Systeme oder ein typisches Signal.
        </div>
      )}
    </div>
  );
}
