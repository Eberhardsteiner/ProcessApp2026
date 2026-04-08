import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Search,
  GitBranch,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ProcessMiningAssistedV2State, ProcessMiningDiscoverySummary } from '../../domain/process';
import { computeV2Discovery, formatShare } from './discovery';
import type { V2DiscoveryResult } from './discovery';
import { VariantCard } from './VariantCard';
import { formatCaseCountShare, getAnalysisModeLabel } from './pmShared';
import { buildDiscoveryNarrative } from './stepNarratives';
import { StepNarrativePanel } from './StepNarrativePanel';
import { StepInsightPanel } from './StepInsightPanel';
import { StepGuardCard } from './StepGuardCard';
import { StepActionBar } from './StepActionBar';
import { StepStageHeader } from './StepStageHeader';
import { StepMetricGrid } from './StepMetricGrid';

interface Props {
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onNext: () => void;
  onBack: () => void;
}

function buildSummaryFromResult(
  result: V2DiscoveryResult,
  notes: string,
): ProcessMiningDiscoverySummary {
  return {
    caseCount: result.totalCases,
    variantCount: result.variants.length,
    mainVariantShare: result.coreProcessCaseCoverage,
    topSteps: result.coreProcess,
    analysisMode: result.analysisMode,
    sampleNotice: result.sampleNotice,
    notes,
    updatedAt: result.computedAt,
  };
}

export function DiscoveryStep({ state, onChange, onNext, onBack }: Props) {
  const [result, setResult] = useState<V2DiscoveryResult | null>(null);
  const [notes, setNotes] = useState(state.discoverySummary?.notes ?? '');
  const [showAllVariants, setShowAllVariants] = useState(false);
  const [showLoops, setShowLoops] = useState(false);
  const [ran, setRan] = useState(!!state.discoverySummary);

  const stepObservations = useMemo(
    () => state.observations.filter(observation => observation.kind === 'step'),
    [state.observations],
  );

  function runDiscovery() {
    const nextResult = computeV2Discovery({
      cases: state.cases,
      observations: state.observations,
      lastDerivationSummary: state.lastDerivationSummary,
    });
    setResult(nextResult);
    setRan(true);
    onChange({ discoverySummary: buildSummaryFromResult(nextResult, notes) });
  }

  function saveNotes() {
    const baseResult = displayResult;
    if (!baseResult) return;
    onChange({ discoverySummary: buildSummaryFromResult(baseResult, notes) });
  }


  useEffect(() => {
    if (!ran && stepObservations.length > 0) {
      runDiscovery();
    }
  }, [ran, stepObservations.length]);

  const displayResult = result ?? (
    ran || state.discoverySummary
      ? computeV2Discovery({
          cases: state.cases,
          observations: state.observations,
          lastDerivationSummary: state.lastDerivationSummary,
        })
      : null
  );

  const visibleVariants = showAllVariants
    ? (displayResult?.variants ?? [])
    : (displayResult?.variants ?? []).slice(0, 3);

  const isProcessDraft = displayResult?.analysisMode === 'process-draft';
  const isExploratory = displayResult?.analysisMode === 'exploratory-mining';
  const insightText = displayResult
    ? isProcessDraft
      ? `Aus ${Math.max(displayResult.totalCases, 1)} ${Math.max(displayResult.totalCases, 1) === 1 ? 'Quelle' : 'Quellen'} wurden ${displayResult.coreProcess.length} Hauptschritte zu einem ersten Prozessentwurf verdichtet.`
      : isExploratory
      ? `${formatCaseCountShare({ count: displayResult.coreProcessCaseCount, total: displayResult.totalCases, mode: displayResult.analysisMode })} folgen derselben Hauptlinie. ${displayResult.variants.length > 1 ? `${displayResult.variants.length} Varianten wurden als vorsichtige Vergleichsbasis erkannt.` : 'Zusätzliche Varianten spielen aktuell nur eine untergeordnete Rolle.'}`
      : `${formatShare(displayResult.coreProcessCaseCoverage)} der Fälle folgen derselben Hauptlinie. ${displayResult.variants.length > 1 ? `${displayResult.variants.length} Varianten wurden zusätzlich erkannt.` : 'Zusätzliche Varianten spielen aktuell nur eine untergeordnete Rolle.'}`
    : '';
  const nextActionText = displayResult
    ? isProcessDraft
      ? 'Prüfen Sie in Schritt 3, wo der Prozessentwurf vom hinterlegten Soll-Prozess abweicht und welche Lücken noch offen sind.'
      : displayResult.variants.length > 1
      ? 'Nutzen Sie Schritt 3, um die häufigsten Varianten und Abweichungen gezielt mit dem Soll-Prozess zu vergleichen.'
      : 'Gehen Sie zu Schritt 3 und prüfen Sie, ob die erkannte Hauptlinie sauber zum Happy Path passt.'
    : '';

  if (stepObservations.length === 0) {
    return (
      <StepGuardCard
        title="Kernprozess noch nicht bereit"
        body="Für Discovery braucht die App zuerst mindestens eine automatisch ausgewertete Quelle mit erkannten Prozessschritten."
        nextLabel="Zuerst in Schritt 1 einen Fall beschreiben oder ein Dokument auswerten"
        onBack={onBack}
      />
    );
  }

  const metricCards = displayResult
    ? isProcessDraft
      ? [
          { label: 'Quellen ausgewertet', value: displayResult.totalCases || state.cases.length },
          { label: 'Erkannte Hauptschritte', value: displayResult.coreProcess.length },
          { label: 'Analysemodus', value: 'Entwurf' },
          { label: 'Schritte gesamt', value: displayResult.totalStepObservations },
        ]
      : isExploratory
      ? [
          { label: 'Fälle analysiert', value: displayResult.totalCases },
          { label: 'Varianten erkannt', value: displayResult.variants.length },
          { label: 'Hauptlinie', value: `${displayResult.coreProcessCaseCount} von ${Math.max(displayResult.totalCases, 1)} Fällen` },
          { label: 'Erkannte Schritte', value: displayResult.totalStepObservations },
        ]
      : [
          { label: 'Fälle analysiert', value: displayResult.totalCases },
          { label: 'Varianten erkannt', value: displayResult.variants.length },
          { label: 'Kernprozess-Abdeckung', value: formatShare(displayResult.coreProcessCaseCoverage) },
          { label: 'Erkannte Schritte', value: displayResult.totalStepObservations },
        ]
    : [];

  return (
    <div className="space-y-6">
      <StepStageHeader
        title="Kernprozess erkennen"
        description="Die automatisch erkannten Schritte werden zu einem verständlichen Ablauf verdichtet. Bei nur einem Dokument oder einem einzelnen Fall entsteht zunächst ein Prozessentwurf. Erst mit mehreren Fällen werden Varianten und Häufigkeiten wirklich belastbar."
        helpKey="pmv2.discovery"
        tone={isProcessDraft ? 'violet' : 'blue'}
        actions={(
          <button
            type="button"
            onClick={runDiscovery}
            disabled={stepObservations.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ran ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Erneut analysieren
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Kernprozess erkennen
              </>
            )}
          </button>
        )}
        badges={(
          <>
            <span className="rounded-full border border-white/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700">
              {stepObservations.length} erkannte Schritte bereit
            </span>
            <span className="rounded-full border border-white/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700">
              {Math.max(state.cases.length, new Set(stepObservations.map(o => o.sourceCaseId).filter(Boolean)).size)} {Math.max(state.cases.length, new Set(stepObservations.map(o => o.sourceCaseId).filter(Boolean)).size) === 1 ? 'Quelle' : 'Quellen'}
            </span>
          </>
        )}
        footer={
          stepObservations.length === 0
            ? 'Kehren Sie zu Schritt 1 zurück und werten Sie mindestens einen Fall oder ein Dokument aus.'
            : !ran
            ? `${stepObservations.length} erkannte Schritte stehen bereits für die Verdichtung bereit.`
            : 'Sie können die Verdichtung jederzeit erneut anstoßen, wenn sich Ihre Quellenbasis geändert hat.'
        }
      />

      {displayResult && (
        <div className="space-y-5">
          <StepInsightPanel
            insight={insightText}
            nextAction={nextActionText}
            tone={isProcessDraft ? 'violet' : 'blue'}
          />

          <StepNarrativePanel
            title="Was die Analyse in Schritt 2 aussagt"
            narrative={buildDiscoveryNarrative(displayResult)}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-800">{getAnalysisModeLabel(displayResult.analysisMode)}</p>
            <p className="mt-1 text-slate-600 leading-relaxed">{displayResult.sampleNotice}</p>
          </div>

          <StepMetricGrid
            items={metricCards.map(metric => ({
              label: metric.label,
              value: metric.value,
              tone: metric.label === 'Kernprozess-Abdeckung' ? 'blue' : metric.label === 'Erkannte Schritte' ? 'cyan' : 'slate',
            }))}
          />

          {displayResult.coreProcess.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-600" />
                {isProcessDraft ? 'Erkannter Prozessentwurf' : 'Wie läuft der Prozess meistens ab?'}
              </h3>
              <div className="bg-blue-50 border border-blue-300 rounded-xl p-4">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-3">
                  {isProcessDraft
                    ? 'Aus dem ausgewerteten Material abgeleitete Hauptschritte'
                    : isExploratory
                    ? `Hauptlinie — sichtbar in ${displayResult.coreProcessCaseCount} von ${Math.max(displayResult.totalCases, 1)} Fällen`
                    : `Kernprozess — tritt in ${formatShare(displayResult.coreProcessCaseCoverage)} der Fälle auf`}
                </p>
                <ol className="space-y-2">
                  {displayResult.coreProcess.map((step, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="mt-0.5 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-sm text-slate-800 leading-relaxed pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                {isProcessDraft && (
                  <p className="mt-4 text-xs text-blue-700 leading-relaxed">
                    Diese Schrittfolge stammt aus einem einzelnen Dokument oder Fall. Sie ist ein gut prüfbarer Erstentwurf,
                    aber noch keine statistische Aussage über den Standardablauf im Unternehmen.
                  </p>
                )}
              </div>
            </div>
          )}

          {!isProcessDraft && displayResult.variants.length > 1 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-slate-500" />
                Welche Varianten gibt es?
              </h3>
              <div className="space-y-2">
                {visibleVariants.map((variant, index) => (
                  <VariantCard key={variant.id} variant={variant} rank={index + 1} analysisMode={displayResult.analysisMode} totalCases={displayResult.totalCases} />
                ))}
              </div>
              {displayResult.variants.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllVariants(show => !show)}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {showAllVariants ? (
                    <><ChevronDown className="w-3.5 h-3.5" /> Weniger anzeigen</>
                  ) : (
                    <><ChevronRight className="w-3.5 h-3.5" /> {displayResult.variants.length - 3} weitere Varianten anzeigen</>
                  )}
                </button>
              )}
            </div>
          )}

          {displayResult.loops.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowLoops(show => !show)}
                className="flex items-center gap-2 font-semibold text-slate-700 text-sm"
              >
                {showLoops ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <RotateCcw className="w-4 h-4 text-orange-500" />
                Wiederholungen erkannt ({displayResult.loops.length})
              </button>
              {showLoops && (
                <div className="space-y-1.5 pl-4">
                  {displayResult.loops.map((loop, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span className="text-sm text-orange-800">
                        „{loop.label}" wird in {loop.count} {loop.count === 1 ? 'Quelle' : 'Quellen'} wiederholt.
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Eigene Notizen zum erkannten Prozess
            </label>
            <textarea
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
              placeholder={isProcessDraft
                ? 'Was wirkt am abgeleiteten Prozessentwurf plausibel? Wo sollte nachgeschärft oder mit weiteren Fällen ergänzt werden?'
                : 'Was fällt Ihnen beim erkannten Kernprozess auf? Gibt es etwas Unerwartetes?'}
              value={notes}
              onChange={event => setNotes(event.target.value)}
              onBlur={saveNotes}
            />
          </div>
        </div>
      )}

      <StepActionBar
        summaryTitle="Was als Nächstes sinnvoll ist"
        statusBadge={displayResult ? (
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${isProcessDraft ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            {isProcessDraft ? 'Prozessentwurf' : 'Discovery bereit'}
          </span>
        ) : undefined}
        summary={
          displayResult
            ? (isProcessDraft
                ? 'Der aktuelle Entwurf ist verdichtet. Prüfen Sie als Nächstes, wo er vom Soll-Prozess abweicht und welche Lücken noch offen sind.'
                : displayResult.variants.length > 1
                ? 'Die Hauptlinie und ihre Varianten sind erkannt. Der nächste Schritt ist der Abgleich mit dem Soll-Prozess.'
                : 'Die Hauptlinie ist erkannt. Als Nächstes lohnt sich der Soll-Abgleich.')
            : 'Sobald eine Discovery vorliegt, führt die App Sie automatisch in den Soll-Abgleich weiter.'
        }
        onBack={onBack}
        onNext={onNext}
        nextLabel="Mit Soll abgleichen"
        nextDisabled={!displayResult || displayResult.coreProcess.length === 0}
      />
    </div>
  );
}
