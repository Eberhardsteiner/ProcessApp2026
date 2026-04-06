import { useMemo, useState } from 'react';
import { BookOpen, FlaskConical, Gauge, Layers3, PlayCircle, Search, ShieldCheck, TrendingUp } from 'lucide-react';
import { HelpPopover } from '../components/HelpPopover';
import { getBenchmarkCoverageSummary, getDomainBenchmarkProfiles, type BenchmarkStatus } from './benchmarkLab';
import { getDomainLibraryEntries, type DomainQualityFocusKey } from './domainLibrary';
import type { SampleScenarioKey } from './sampleCases';

type FilterMode = 'all' | 'measured' | 'preview';

interface Props {
  onLoadSample: (key: SampleScenarioKey) => void;
}

const QUALITY_LABELS: Record<DomainQualityFocusKey, string> = {
  steps: 'Schritte',
  signals: 'Signale',
  roles: 'Rollen',
  systems: 'Systeme',
  evidence: 'Belege',
  mode: 'Modus',
};

function getStatusTone(status: BenchmarkStatus) {
  if (status === 'pass') {
    return {
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      label: 'stabil',
    };
  }
  if (status === 'attention') {
    return {
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
      label: 'beobachten',
    };
  }
  return {
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
    label: 'kritisch',
  };
}

function getScoreTone(score: number) {
  if (score >= 90) return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (score >= 75) return 'border-blue-200 bg-blue-50 text-blue-900';
  if (score > 0) return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export function DomainLibraryPanel({ onLoadSample }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const entries = useMemo(() => getDomainLibraryEntries(), []);
  const coverage = useMemo(() => getBenchmarkCoverageSummary(), []);
  const profiles = useMemo(() => getDomainBenchmarkProfiles(), []);
  const profileMap = useMemo(() => new Map(profiles.map(profile => [profile.key, profile])), [profiles]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries
      .filter(entry => {
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
      })
      .sort((left, right) => {
        const leftProfile = profileMap.get(left.key);
        const rightProfile = profileMap.get(right.key);
        const leftMeasured = Boolean(leftProfile?.measured || left.maturity === 'measured');
        const rightMeasured = Boolean(rightProfile?.measured || right.maturity === 'measured');
        if (leftMeasured !== rightMeasured) return leftMeasured ? -1 : 1;
        if (leftMeasured && rightMeasured && (leftProfile?.score ?? 0) !== (rightProfile?.score ?? 0)) {
          return (rightProfile?.score ?? 0) - (leftProfile?.score ?? 0);
        }
        return left.title.localeCompare(right.title, 'de');
      });
  }, [entries, filter, profileMap, query]);

  const measuredProfiles = profiles.filter(profile => profile.measured);
  const measuredCount = measuredProfiles.length;
  const previewCount = entries.filter(entry => entry.maturity === 'preview').length;
  const averageMeasuredScore = measuredProfiles.length > 0
    ? Math.round(measuredProfiles.reduce((sum, profile) => sum + profile.score, 0) / measuredProfiles.length)
    : 0;
  const weakestMeasuredProfile = measuredProfiles.slice().sort((a, b) => a.score - b.score)[0];

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
              Hier sehen Sie, welche Fachpakete lokal ohne KI bereits gut abgedeckt sind und wie belastbar die wichtigsten Qualitätsdimensionen je Fachfeld bereits wirken.
              Gemessene Pakete hängen am Benchmark. Vorschau-Pakete sind bewusst explorativ und helfen beim frühen Test neuer Fachfelder.
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

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-slate-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <p className="text-xs font-semibold uppercase tracking-wide">Gemessene Fachfelder</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{measuredCount}</p>
            <p className="text-[11px] leading-relaxed text-slate-500 mt-1">Goldfälle und Beispielpakete liefern dort bereits wiederholbare Benchmarks.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-slate-800">
              <Gauge className="h-4 w-4 text-blue-600" />
              <p className="text-xs font-semibold uppercase tracking-wide">Durchschnitt der gemessenen Domänen</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{averageMeasuredScore}/100</p>
            <p className="text-[11px] leading-relaxed text-slate-500 mt-1">Dieser Wert zeigt, wie breit die lokale Analyse über verschiedene Fachfelder hinweg trägt.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-slate-800">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              <p className="text-xs font-semibold uppercase tracking-wide">Nächster Pflegekandidat</p>
            </div>
            {weakestMeasuredProfile ? (
              <>
                <p className="mt-2 text-sm font-semibold text-slate-900">{weakestMeasuredProfile.label}</p>
                <p className="text-lg font-bold text-slate-900">{weakestMeasuredProfile.score}/100</p>
                <p className="text-[11px] leading-relaxed text-slate-500 mt-1">
                  {weakestMeasuredProfile.weakestDimension
                    ? `Am ehesten lohnt Feinschliff bei ${weakestMeasuredProfile.weakestDimension.label.toLowerCase()}.`
                    : 'Dieses Fachpaket sollte als Nächstes fachlich nachgeschärft werden.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Sobald gemessene Fachfelder vorliegen, erscheint hier der nächste Pflegekandidat.</p>
            )}
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
          const profile = profileMap.get(entry.key);
          const measured = Boolean(profile?.measured || entry.maturity === 'measured');
          const measuredCases = profile?.caseCount ?? entry.measuredCoverageCount ?? 0;
          const statusTone = profile ? getStatusTone(profile.status) : null;
          const focusMetrics = entry.qualityFocus
            .map(key => profile?.dimensionScores.find(item => item.key === key))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .slice(0, 4);

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
                      <>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getScoreTone(profile?.score ?? 0)}`}>
                          {profile?.score ?? 0}/100
                        </span>
                        {statusTone && (
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusTone.badge}`}>
                            {statusTone.label}
                          </span>
                        )}
                      </>
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

              {measured && profile ? (
                <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <div className="flex items-center gap-2 text-slate-800">
                      <Gauge className="h-4 w-4 text-blue-600" />
                      <p className="text-xs font-semibold uppercase tracking-wide">Qualitätsprofil</p>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">{profile.highlight}</p>
                    {focusMetrics.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {focusMetrics.map(metric => (
                          <div key={`${entry.key}-${metric.key}`} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{QUALITY_LABELS[metric.key]}</p>
                              <span className="text-sm font-semibold text-slate-900">{metric.score}/100</span>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{metric.note}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <div className="flex items-center gap-2 text-slate-800">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <p className="text-xs font-semibold uppercase tracking-wide">Benchmark-Basis</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-[11px] text-slate-500">Referenzfälle</p>
                        <p className="text-lg font-bold text-slate-900">{measuredCases}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{profile.goldCaseCount} Goldfälle · {profile.samplePackCount} Beispielpakete</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-[11px] text-slate-500">Stärkste Dimension</p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{profile.strongestDimension?.label ?? 'noch offen'}</p>
                        <p className="text-[11px] text-slate-500 mt-1">Schwächste Dimension: {profile.weakestDimension?.label ?? 'noch offen'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-violet-50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-violet-900">
                    <FlaskConical className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wide">Vorschau-Modus</p>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">Dieses Fachpaket ist vorbereitet, aber noch nicht mit Goldfällen gemessen. Nutzen Sie es für frühe Exploration, bevor Sie es in die harte Referenzbibliothek aufnehmen.</p>
                </div>
              )}

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
