import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, PlayCircle, ShieldCheck, TrendingUp, History, ListChecks } from 'lucide-react';
import type { ProcessMiningBenchmarkSnapshot } from '../../domain/process';
import { CollapsibleCard } from '../components/CollapsibleCard';
import {
  getBenchmarkCoverageSummary,
  runBenchmarkSuite,
  type BenchmarkCaseResult,
  type BenchmarkSuiteResult,
} from './benchmarkLab';
import { compareBenchmarkSnapshots, pushBenchmarkSnapshot, toBenchmarkSnapshot } from './benchmarkHistory';

interface Props {
  history?: ProcessMiningBenchmarkSnapshot[];
  onSaveHistory?: (next: ProcessMiningBenchmarkSnapshot[]) => void;
}

function getStatusTone(status: BenchmarkCaseResult['status'] | BenchmarkSuiteResult['status']) {
  if (status === 'pass') {
    return {
      badge: 'border-green-200 bg-green-50 text-green-800',
      panel: 'border-green-200 bg-green-50',
      icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
      label: 'stabil',
    };
  }
  if (status === 'attention') {
    return {
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
      panel: 'border-amber-200 bg-amber-50',
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      label: 'beobachten',
    };
  }
  return {
    badge: 'border-red-200 bg-red-50 text-red-800',
    panel: 'border-red-200 bg-red-50',
    icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
    label: 'kritisch',
  };
}

function ResultCard({ result }: { result: BenchmarkCaseResult }) {
  const tone = getStatusTone(result.status);

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${tone.panel}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900">{result.label}</p>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
              {tone.icon}
              {tone.label}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">{result.summary}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center shrink-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Score</p>
          <p className="text-xl font-bold text-slate-900">{result.score}</p>
        </div>
      </div>

      <p className="text-sm font-medium text-slate-900">{result.headline}</p>
      <p className="text-sm leading-relaxed text-slate-700">{result.detail}</p>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[11px] text-slate-500">Schritte</p>
          <p className="text-lg font-bold text-slate-800">{result.steps.hits.length}/{result.steps.expected.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[11px] text-slate-500">Signale</p>
          <p className="text-lg font-bold text-slate-800">{result.signals.hits.length}/{result.signals.expected.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[11px] text-slate-500">Rollen</p>
          <p className="text-lg font-bold text-slate-800">{result.roles.hits.length}/{result.roles.expected.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[11px] text-slate-500">Systeme</p>
          <p className="text-lg font-bold text-slate-800">{result.systems.hits.length}/{result.systems.expected.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[11px] text-slate-500">Belegstellen</p>
          <p className="text-lg font-bold text-slate-800">{result.evidencePct} %</p>
        </div>
      </div>

      {(result.steps.missing.length > 0 || result.signals.missing.length > 0 || result.roles.missing.length > 0 || result.systems.missing.length > 0) && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Noch nicht stabil genug</p>
          <div className="flex flex-wrap gap-2">
            {result.steps.missing.slice(0, 3).map(item => (
              <span key={`step-${item}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                Schritt: {item}
              </span>
            ))}
            {result.signals.missing.slice(0, 2).map(item => (
              <span key={`signal-${item}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                Signal: {item}
              </span>
            ))}
            {result.roles.missing.slice(0, 1).map(item => (
              <span key={`role-${item}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                Rolle: {item}
              </span>
            ))}
            {result.systems.missing.slice(0, 1).map(item => (
              <span key={`system-${item}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                System: {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SmallStatusBadge({ status }: { status: BenchmarkCaseResult['status'] | BenchmarkSuiteResult['status'] }) {
  const tone = getStatusTone(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
      {tone.icon}
      {tone.label}
    </span>
  );
}

export function BenchmarkPanel({ history = [], onSaveHistory }: Props) {
  const [result, setResult] = useState<BenchmarkSuiteResult | null>(null);
  const [running, setRunning] = useState(false);
  const coverage = result?.coverage ?? getBenchmarkCoverageSummary();
  const latestStored = history.length > 0 ? history[history.length - 1] : undefined;
  const previousStored = history.length > 1 ? history[history.length - 2] : undefined;
  const activeSnapshot = useMemo(
    () => (result ? toBenchmarkSnapshot(result) : latestStored),
    [latestStored, result],
  );
  const delta = useMemo(
    () => (activeSnapshot ? compareBenchmarkSnapshots(result ? latestStored : previousStored, activeSnapshot) : null),
    [activeSnapshot, latestStored, previousStored, result],
  );
  const strictGate = result?.strictGate ?? activeSnapshot?.strictGate;
  const activeDomainScores = result?.domainScores ?? activeSnapshot?.domainScores ?? [];
  const activeDimensionScores = result?.dimensionScores ?? activeSnapshot?.dimensionScores ?? [];
  const activeRecommendations = result?.recommendations ?? activeSnapshot?.recommendations ?? [];
  const activeWeakestCases = result?.weakestCases ?? activeSnapshot?.weakestCases ?? [];
  const recentRuns = useMemo(() => {
    if (result) {
      const snapshot = toBenchmarkSnapshot(result);
      const nextHistory = history.length > 0 && history[history.length - 1].computedAt === snapshot.computedAt
        ? history
        : pushBenchmarkSnapshot(history, snapshot);
      return nextHistory.slice(-4).reverse();
    }
    return history.slice(-4).reverse();
  }, [history, result]);

  function handleRunSuite() {
    setRunning(true);
    window.requestAnimationFrame(() => {
      const next = runBenchmarkSuite();
      setResult(next);
      if (onSaveHistory) {
        const snapshot = toBenchmarkSnapshot(next);
        onSaveHistory(pushBenchmarkSnapshot(history, snapshot));
      }
      setRunning(false);
    });
  }

  const tone = result ? getStatusTone(result.status) : activeSnapshot ? getStatusTone(activeSnapshot.status) : null;

  return (
    <CollapsibleCard
      title="Goldfälle & Regression"
      helpKey="pmv2.benchmark"
      description="Prüft die lokale Analyseengine mit festen Referenzfällen und macht grobe Regressionen früh sichtbar."
      defaultOpen={false}
      right={
        <button
          type="button"
          onClick={handleRunSuite}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <PlayCircle className="h-4 w-4" />
          {running ? 'Prüfung läuft…' : result || latestStored ? 'Erneut lokal prüfen' : 'Lokal prüfen'}
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-800">
            <ShieldCheck className="h-4 w-4 text-cyan-600" />
            <p className="text-sm font-semibold">Wofür diese Prüffälle gut sind</p>
          </div>
          <p className="text-sm leading-relaxed text-slate-700">
            Die Goldfälle laufen vollständig lokal in der App. Sie helfen uns, grobe Rückschritte früh zu sehen, wenn wir die Analyseengine weiterentwickeln.
          </p>
          <p className="text-sm leading-relaxed text-slate-700">
            Neu in Phase 22 ist der ruhigere Verlauf über mehrere Läufe hinweg. Dadurch werden lokale Verbesserungen und Rückschritte schneller sichtbar.
          </p>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-violet-900">
            <Gauge className="h-4 w-4" />
            <p className="text-sm font-semibold">So lesen Sie das Ergebnis</p>
          </div>
          <ul className="space-y-1 text-sm leading-relaxed text-slate-700">
            <li>• <strong>stabil</strong>: die Referenz wird lokal gut getroffen</li>
            <li>• <strong>beobachten</strong>: brauchbar, aber mit sichtbaren Spannungen</li>
            <li>• <strong>kritisch</strong>: klarer Rückschritt oder zu schwache Erkennung</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Referenzbibliothek auf einen Blick</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] text-slate-500">Referenzfälle</p>
              <p className="text-lg font-bold text-slate-900">{coverage.totalCases}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] text-slate-500">Goldfälle</p>
              <p className="text-lg font-bold text-slate-900">{coverage.goldCaseCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] text-slate-500">Beispielpakete</p>
              <p className="text-lg font-bold text-slate-900">{coverage.samplePackCount}</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            Die Bibliothek wächst jetzt bewusst über mehrere Fachfelder und Materialarten. So sehen wir schneller, ob lokale Verbesserungen breit tragen oder nur einen Einzelfall schöner machen.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Abgedeckte Fachfelder</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {coverage.domains.map(domain => (
              <div key={domain.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-800">{domain.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{domain.count}</p>
                <p className="text-[11px] leading-relaxed text-slate-500 mt-1">{domain.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeSnapshot ? (
        <div className="space-y-4">
          {recentRuns.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-slate-800">
                <History className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Verlauf der letzten Prüfungen</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {recentRuns.map((entry, index) => (
                  <div key={`${entry.computedAt}-${index}`} className={`rounded-lg border p-3 ${index === 0 ? 'border-cyan-200 bg-cyan-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">{index === 0 ? 'aktuell' : `Verlauf ${recentRuns.length - index}`}</p>
                      <SmallStatusBadge status={entry.status} />
                    </div>
                    <p className="mt-1 text-lg font-bold text-slate-900">{entry.overallScore}/100</p>
                    <p className="text-xs text-slate-600">{entry.passedCount} stabil · {entry.attentionCount} beobachten · {entry.failedCount} kritisch</p>
                    <p className="mt-1 text-[11px] text-slate-500">{new Date(entry.computedAt).toLocaleString('de-DE')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className={`rounded-xl border p-4 space-y-3 ${tone?.panel ?? 'border-slate-200 bg-slate-50'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-slate-900">{result?.headline ?? activeSnapshot.headline}</p>
              {tone && <SmallStatusBadge status={result?.status ?? activeSnapshot.status} />}
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{result?.summary ?? activeSnapshot.summary}</p>
            <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-6">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">Durchschnitt</p>
                <p className="text-lg font-bold text-slate-800">{activeSnapshot.overallScore}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">stabil</p>
                <p className="text-lg font-bold text-slate-800">{activeSnapshot.passedCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">beobachten</p>
                <p className="text-lg font-bold text-slate-800">{activeSnapshot.attentionCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">kritisch</p>
                <p className="text-lg font-bold text-slate-800">{activeSnapshot.failedCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">letzter Lauf</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{new Date(activeSnapshot.computedAt).toLocaleString('de-DE')}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">Engine</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{activeSnapshot.engineVersion}</p>
              </div>
            </div>
          </div>

          {delta && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-slate-800">
                <History className="h-4 w-4 text-slate-500" />
                <p className="text-sm font-semibold">Vergleich zum letzten Lauf</p>
              </div>
              <p className="text-sm leading-relaxed text-slate-700">{delta.summary}</p>
              {(delta.changedDomains.length > 0 || delta.changedDimensions.length > 0) && (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Veränderte Fachfelder</p>
                    {delta.changedDomains.length > 0 ? delta.changedDomains.slice(0, 4).map(item => (
                      <div key={item.label} className="flex items-center justify-between text-sm text-slate-700">
                        <span>{item.label}</span>
                        <span className={item.delta >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                          {item.previousScore} → {item.currentScore} ({item.delta >= 0 ? '+' : ''}{item.delta})
                        </span>
                      </div>
                    )) : <p className="text-sm text-slate-500">Keine sichtbare Veränderung.</p>}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Veränderte Qualitätsdimensionen</p>
                    {delta.changedDimensions.length > 0 ? delta.changedDimensions.slice(0, 4).map(item => (
                      <div key={item.label} className="flex items-center justify-between text-sm text-slate-700">
                        <span>{item.label}</span>
                        <span className={item.delta >= 0 ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                          {item.previousScore} → {item.currentScore} ({item.delta >= 0 ? '+' : ''}{item.delta})
                        </span>
                      </div>
                    )) : <p className="text-sm text-slate-500">Keine sichtbare Veränderung.</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {strictGate && (
            <div className={`rounded-xl border p-4 space-y-2 ${strictGate.pass ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center gap-2 text-slate-900">
                <ListChecks className={`h-4 w-4 ${strictGate.pass ? 'text-green-600' : 'text-amber-600'}`} />
                <p className="text-sm font-semibold">Strenger Qualitätscheck</p>
                <SmallStatusBadge status={strictGate.pass ? 'pass' : 'attention'} />
              </div>
              <p className="text-sm leading-relaxed text-slate-700">{strictGate.summary}</p>
              {strictGate.reasons.length > 0 && (
                <ul className="space-y-1 text-sm leading-relaxed text-slate-700">
                  {strictGate.reasons.slice(0, 4).map((reason: string) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2 text-slate-800">
                <TrendingUp className="h-4 w-4 text-cyan-600" />
                <p className="text-sm font-semibold">Fachfelder im Vergleich</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeDomainScores.map((domain: ProcessMiningBenchmarkSnapshot['domainScores'][number]) => (
                  <div key={domain.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{domain.label}</p>
                      <SmallStatusBadge status={domain.status} />
                    </div>
                    <p className="mt-1 text-lg font-bold text-slate-900">{domain.score}/100</p>
                    <p className="text-[11px] text-slate-500">{domain.count} Referenzfälle</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2 text-slate-800">
                <Gauge className="h-4 w-4 text-violet-600" />
                <p className="text-sm font-semibold">Qualitätsdimensionen</p>
              </div>
              <div className="space-y-2">
                {activeDimensionScores.map((item: ProcessMiningBenchmarkSnapshot['dimensionScores'][number]) => (
                  <div key={item.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">{item.label}</p>
                      <span className="text-sm font-semibold text-slate-900">{item.score}/100</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900">Empfohlene nächste Pflege</p>
              <ul className="space-y-2 text-sm leading-relaxed text-slate-700">
                {activeRecommendations.map((item: string) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900">Schwächste Referenzfälle aktuell</p>
              <div className="space-y-2">
                {activeWeakestCases.map((item: ProcessMiningBenchmarkSnapshot['weakestCases'][number]) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.label}</p>
                      <p className="text-[11px] text-slate-500">Fachfeld: {item.domain}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{item.score}/100</p>
                      <SmallStatusBadge status={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {result && (
            <div className="space-y-3">
              {result.results.map(caseResult => (
                <ResultCard key={caseResult.id} result={caseResult} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed">
          Starten Sie die lokale Prüfung, wenn Sie sehen möchten, wie robust die aktuelle Analyseengine auf festen Referenzfällen arbeitet.
        </div>
      )}
    </CollapsibleCard>
  );
}
