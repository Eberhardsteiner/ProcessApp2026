import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, PlayCircle, ShieldCheck } from 'lucide-react';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { runBenchmarkSuite, type BenchmarkCaseResult, type BenchmarkSuiteResult } from './benchmarkLab';

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

      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warnhinweise der Engine</p>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-700">
            {result.warnings.slice(0, 3).map(warning => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function BenchmarkPanel() {
  const [result, setResult] = useState<BenchmarkSuiteResult | null>(null);
  const [running, setRunning] = useState(false);

  function handleRunSuite() {
    setRunning(true);
    window.requestAnimationFrame(() => {
      const next = runBenchmarkSuite();
      setResult(next);
      setRunning(false);
    });
  }

  const tone = result ? getStatusTone(result.status) : null;

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
          {running ? 'Prüfung läuft…' : result ? 'Erneut lokal prüfen' : 'Lokal prüfen'}
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
            Geprüft werden nicht nur Schritte, sondern auch Reibungssignale, Rollen, Systeme und Belegstellen.
          </p>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-violet-900">
            <Gauge className="h-4 w-4" />
            <p className="text-sm font-semibold">So lesen Sie das Ergebnis</p>
          </div>
          <ul className="space-y-1 text-sm leading-relaxed text-slate-700">
            <li>• <strong>stabil</strong>: der Referenzfall wird lokal bereits gut erkannt</li>
            <li>• <strong>beobachten</strong>: brauchbar, aber mit sichtbaren Lücken</li>
            <li>• <strong>kritisch</strong>: deutlicher Rückschritt oder zu schwache Erkennung</li>
          </ul>
        </div>
      </div>

      {result ? (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 space-y-2 ${tone?.panel ?? 'border-slate-200 bg-slate-50'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-slate-900">{result.headline}</p>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone?.badge ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                {tone?.icon}
                {tone?.label ?? 'offen'}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{result.summary}</p>
            <div className="grid gap-2 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">Durchschnitt</p>
                <p className="text-lg font-bold text-slate-800">{result.overallScore}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">stabil</p>
                <p className="text-lg font-bold text-slate-800">{result.passedCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">beobachten</p>
                <p className="text-lg font-bold text-slate-800">{result.attentionCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">Engine</p>
                <p className="text-sm font-semibold text-slate-800 mt-1">{result.engineVersion}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {result.results.map(caseResult => (
              <ResultCard key={caseResult.id} result={caseResult} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed">
          Starten Sie die lokale Prüfung, wenn Sie sehen möchten, wie robust die aktuelle Analyseengine auf festen Referenzfällen arbeitet.
        </div>
      )}
    </CollapsibleCard>
  );
}
