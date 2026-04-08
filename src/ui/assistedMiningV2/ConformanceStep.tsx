import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Scale,
  ChevronDown,
  ChevronRight,
  FileCheck,
} from 'lucide-react';
import type {
  ProcessMiningAssistedV2State,
  ProcessMiningConformanceSummary,
  ProcessVersion,
} from '../../domain/process';
import type { CaptureDraftStep } from '../../domain/capture';
import { computeV2Conformance } from './conformance';
import type { V2ConformanceResult } from './conformance';
import { DeviationCard, NoDeviationsMessage } from './DeviationCard';
import { formatCaseCountShare, getAnalysisModeLabel } from './pmShared';
import { buildConformanceNarrative } from './stepNarratives';
import { StepNarrativePanel } from './StepNarrativePanel';
import { StepInsightPanel } from './StepInsightPanel';
import { StepGuardCard } from './StepGuardCard';
import { StepActionBar } from './StepActionBar';
import { StepStageHeader } from './StepStageHeader';
import { StepMetricGrid } from './StepMetricGrid';

interface Props {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onNext: () => void;
  onBack: () => void;
}

function buildSummaryFromResult(
  result: V2ConformanceResult,
  notes: string,
): ProcessMiningConformanceSummary {
  return {
    checkedSteps: result.targetSteps.length,
    deviationCount: result.topDeviations.length,
    deviationNotes: result.topDeviations.map(deviation => deviation.description),
    analysisMode: result.analysisMode,
    sampleNotice: result.sampleNotice,
    notes,
    updatedAt: result.computedAt,
  };
}

function getHappyPath(version: ProcessVersion): CaptureDraftStep[] | undefined {
  const captureDraft = (version.sidecar as unknown as Record<string, unknown>)?.captureDraft;
  if (captureDraft && typeof captureDraft === 'object' && 'happyPath' in captureDraft) {
    const happyPath = (captureDraft as Record<string, unknown>).happyPath;
    if (Array.isArray(happyPath) && happyPath.length > 0) return happyPath as CaptureDraftStep[];
  }
  return undefined;
}

export function ConformanceStep({ state, version, onChange, onNext, onBack }: Props) {
  const [result, setResult] = useState<V2ConformanceResult | null>(null);
  const [notes, setNotes] = useState(state.conformanceSummary?.notes ?? '');
  const [ran, setRan] = useState(!!state.conformanceSummary);
  const [showCaseDetails, setShowCaseDetails] = useState(false);

  const happyPath = getHappyPath(version);
  const coreProcess = state.discoverySummary?.topSteps ?? [];
  const hasTarget = (happyPath && happyPath.length > 0) || coreProcess.length > 0;
  const stepObservations = useMemo(
    () => state.observations.filter(observation => observation.kind === 'step'),
    [state.observations],
  );

  function runConformance() {
    const nextResult = computeV2Conformance({
      cases: state.cases,
      observations: state.observations,
      captureHappyPath: happyPath,
      coreProcess,
      lastDerivationSummary: state.lastDerivationSummary,
    });
    setResult(nextResult);
    setRan(true);
    onChange({ conformanceSummary: buildSummaryFromResult(nextResult, notes) });
  }

  function saveNotes() {
    const baseResult = displayResult;
    if (!baseResult) return;
    onChange({ conformanceSummary: buildSummaryFromResult(baseResult, notes) });
  }


  useEffect(() => {
    if (!ran && hasTarget && stepObservations.length > 0) {
      runConformance();
    }
  }, [hasTarget, ran, stepObservations.length]);

  const displayResult = result ?? (
    ran || state.conformanceSummary
      ? computeV2Conformance({
          cases: state.cases,
          observations: state.observations,
          captureHappyPath: happyPath,
          coreProcess,
          lastDerivationSummary: state.lastDerivationSummary,
        })
      : null
  );

  if (stepObservations.length === 0) {
    return (
      <StepGuardCard
        title="Soll-Abgleich noch nicht bereit"
        body="Bevor ein Soll-Abgleich Sinn ergibt, braucht die App zuerst erkannte Prozessschritte aus mindestens einer ausgewerteten Quelle."
        nextLabel="Zuerst in Schritt 1 eine Quelle automatisch auswerten"
        onBack={onBack}
      />
    );
  }

  if (!hasTarget) {
    return (
      <StepGuardCard
        title="Soll-Basis fehlt noch"
        body="Für den Soll-Abgleich braucht die App entweder einen Happy Path aus der Prozesserfassung oder die in Schritt 2 erkannte Hauptlinie."
        nextLabel="Zuerst Kernprozess erkennen oder Happy Path ergänzen"
        onBack={onBack}
      />
    );
  }

  const targetSource = happyPath && happyPath.length > 0 ? 'capture-draft' : 'core-process';
  const targetStepsDisplay =
    happyPath && happyPath.length > 0
      ? happyPath.slice().sort((a, b) => a.order - b.order).map(step => step.label)
      : coreProcess;

  const isProcessDraft = displayResult?.analysisMode === 'process-draft';
  const isExploratory = displayResult?.analysisMode === 'exploratory-mining';
  const primaryDeviation = displayResult?.topDeviations[0];
  const insightText = displayResult
    ? primaryDeviation
      ? primaryDeviation.description
      : isProcessDraft
      ? 'Im aktuell ausgewerteten Entwurf zeigt sich keine dominierende Soll-Abweichung.'
      : 'Aktuell zeigt sich keine klar dominierende Soll-Abweichung.'
    : '';
  const nextActionText = displayResult
    ? happyPath && happyPath.length > 0
      ? 'Nutzen Sie Schritt 4, um die wichtigsten Abweichungen als konkrete Verbesserungshebel oder Friktionen zu bewerten.'
      : 'Ein gepflegter Happy Path im Capture-Teil macht den Soll-Abgleich belastbarer. Bis dahin dient die Hauptlinie aus Schritt 2 als Vergleich.'
    : '';
  const metricCards = displayResult
    ? isProcessDraft
      ? [
          { label: 'Sollschritte', value: displayResult.targetSteps.length },
          { label: 'Erkannte Schritte', value: stepObservations.length },
          { label: 'Abweichungstypen', value: displayResult.topDeviations.length },
          { label: 'Vergleichsart', value: 'Entwurf vs Soll' },
        ]
      : isExploratory
      ? [
          { label: 'Fälle verglichen', value: displayResult.totalCases },
          { label: 'Passend zum Soll', value: `${displayResult.conformantCases} von ${Math.max(displayResult.totalCases, 1)}` },
          { label: 'Mit Abweichung', value: `${displayResult.nonConformantCases} von ${Math.max(displayResult.totalCases, 1)}` },
          { label: 'Abweichungstypen', value: displayResult.topDeviations.length },
        ]
      : [
          { label: 'Fälle verglichen', value: displayResult.totalCases },
          { label: 'Konform', value: `${displayResult.conformantPct} %` },
          { label: 'Abweichend', value: `${displayResult.nonConformantPct} %` },
          { label: 'Abweichungstypen', value: displayResult.topDeviations.length },
        ]
    : [];

  return (
    <div className="space-y-6">
      <StepStageHeader
        title="Mit Soll abgleichen"
        description="Die erkannten Abläufe werden mit einem Soll-Prozess verglichen. Wenn bereits ein Happy Path aus der Prozesserfassung vorliegt, wird dieser verwendet. Sonst dient der in Schritt 2 abgeleitete Kernprozess als Vergleichsbasis."
        helpKey="pmv2.conformance"
        tone={targetSource === 'capture-draft' ? 'emerald' : 'blue'}
        badges={(
          <>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${targetSource === 'capture-draft' ? 'border-white/90 bg-white/90 text-emerald-800' : 'border-white/90 bg-white/90 text-blue-800'}`}>
              {targetSource === 'capture-draft' ? 'Happy Path als Soll' : 'Hauptlinie als Soll'}
            </span>
            <span className="rounded-full border border-white/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700">
              {stepObservations.length} erkannte Schritte im Vergleich
            </span>
          </>
        )}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <FileCheck className="w-4 h-4 text-slate-400" />
          <span className="font-medium">Vergleichsgrundlage:</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              targetSource === 'capture-draft'
                ? 'bg-green-100 text-green-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {targetSource === 'capture-draft'
              ? 'Happy Path aus der Prozesserfassung'
              : 'Kernprozess aus Schritt 2'}
          </span>
        </div>

        {targetStepsDisplay.length > 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <ol className="flex flex-wrap gap-2 items-center">
              {targetStepsDisplay.map((step, index) => (
                <li key={index} className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500">{index + 1}.</span>
                  <span className="text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-0.5">
                    {step}
                  </span>
                  {index < targetStepsDisplay.length - 1 && <span className="text-slate-300 text-xs">→</span>}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            Noch kein Soll-Prozess vorhanden. Führen Sie zuerst Schritt 2 aus oder legen Sie einen Happy Path in der Prozesserfassung an.
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={runConformance}
          disabled={!hasTarget || stepObservations.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ran ? (
            <>
              <RefreshCw className="w-4 h-4" />
              Erneut vergleichen
            </>
          ) : (
            <>
              <Scale className="w-4 h-4" />
              Abgleich durchführen
            </>
          )}
        </button>
        <p className="text-xs leading-relaxed text-slate-500">
          {targetSource === 'capture-draft'
            ? 'Der gepflegte Happy Path dient hier als Soll-Basis.'
            : 'Noch kein Happy Path vorhanden. Die Hauptlinie aus Schritt 2 dient vorerst als Soll-Basis.'}
        </p>
      </div>

      {displayResult && (
        <div className="space-y-5">
          <StepInsightPanel
            insight={insightText}
            nextAction={nextActionText}
            tone={primaryDeviation ? 'amber' : 'green'}
          />

          <StepNarrativePanel
            title="Wie der Soll-Abgleich zu lesen ist"
            narrative={buildConformanceNarrative(displayResult)}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-800">{getAnalysisModeLabel(displayResult.analysisMode)}</p>
            <p className="mt-1 text-slate-600 leading-relaxed">{displayResult.sampleNotice}</p>
          </div>

          <StepMetricGrid
            items={metricCards.map(metric => ({
              label: metric.label,
              value: metric.value,
              tone: metric.label === 'Konform' ? 'green' : metric.label === 'Abweichend' ? 'red' : metric.label === 'Abweichungstypen' ? 'amber' : metric.label === 'Vergleichsart' ? 'violet' : 'slate',
            }))}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-800 text-sm">
                  {displayResult.conformantCases} {displayResult.conformantCases === 1 ? 'Fall passt' : 'Fälle passen'} zum Soll
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  {isProcessDraft
                    ? (displayResult.conformantCases > 0
                        ? 'Der aktuell ausgewertete Entwurf deckt sich an diesen Stellen mit dem Soll-Prozess.'
                        : 'Im ausgewerteten Entwurf gibt es keine vollständig passenden Fälle.')
                    : isExploratory
                    ? `${formatCaseCountShare({ count: displayResult.conformantCases, total: displayResult.totalCases, mode: displayResult.analysisMode })} folgen dem Soll-Prozess vollständig.`
                    : (displayResult.conformantPct === 100
                        ? 'Alle Fälle stimmen mit dem Soll überein.'
                        : `${displayResult.conformantPct} % der beobachteten Fälle folgen dem Soll-Prozess vollständig.`)}
                </p>
              </div>
            </div>
            <div className="flex gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 text-sm">
                  {displayResult.nonConformantCases} {displayResult.nonConformantCases === 1 ? 'Fall weicht ab' : 'Fälle weichen ab'}
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  {displayResult.nonConformantCases === 0
                    ? 'Keine Abweichungen erkannt.'
                    : isProcessDraft
                    ? 'Der ausgewertete Dokument- oder Fallentwurf weicht in einzelnen Punkten vom Soll-Prozess ab.'
                    : isExploratory
                    ? `${formatCaseCountShare({ count: displayResult.nonConformantCases, total: displayResult.totalCases, mode: displayResult.analysisMode })} weichen vom Soll ab.`
                    : `${displayResult.nonConformantPct} % der Fälle weichen vom Soll ab.`}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">Häufigste Abweichungen</h3>
            {displayResult.topDeviations.length === 0 ? (
              <NoDeviationsMessage hasTarget={hasTarget} />
            ) : (
              <div className="space-y-2">
                {displayResult.topDeviations.map((deviation, index) => (
                  <DeviationCard
                    key={`${deviation.type}-${deviation.affectedStep}-${index}`}
                    deviation={deviation}
                    rank={index + 1}
                    totalCases={displayResult.totalCases}
                    analysisMode={displayResult.analysisMode}
                  />
                ))}
              </div>
            )}
          </div>

          {displayResult.caseResults.length > 1 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowCaseDetails(show => !show)}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                {showCaseDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Details pro Fall anzeigen
              </button>
              {showCaseDetails && (
                <div className="space-y-1.5">
                  {displayResult.caseResults.map(caseResult => {
                    const caseName = state.cases.find(caseItem => caseItem.id === caseResult.caseId)?.name ?? caseResult.caseId;
                    return (
                      <div
                        key={caseResult.caseId}
                        className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 text-sm ${
                          caseResult.isConformant
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                      >
                        {caseResult.isConformant ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className={`font-medium ${caseResult.isConformant ? 'text-green-800' : 'text-red-800'}`}>
                            {caseName}
                          </p>
                          {!caseResult.isConformant && caseResult.deviations.length > 0 && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {caseResult.deviations.length} {caseResult.deviations.length === 1 ? 'Abweichung' : 'Abweichungen'}: {caseResult.deviations.slice(0, 3).map(deviation => `„${deviation.step}”`).join(', ')}
                              {caseResult.deviations.length > 3 ? ` +${caseResult.deviations.length - 3} weitere` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Eigene Notizen zum Abgleich</label>
            <textarea
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
              placeholder={isProcessDraft
                ? 'Welche Abweichungen sind echte Probleme und welche ergeben sich nur daraus, dass bislang erst ein Entwurf oder ein Einzelfall vorliegt?'
                : 'Was erklärt die Abweichungen? Gibt es Ausnahmeregelungen oder bekannte Probleme?'}
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
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${displayResult.topDeviations.length > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {displayResult.topDeviations.length > 0 ? 'Abweichungen sichtbar' : 'Soll-Abgleich ruhig'}
          </span>
        ) : undefined}
        summary={
          displayResult
            ? (displayResult.topDeviations.length > 0
                ? 'Die wichtigsten Soll-Abweichungen sind sichtbar. Im nächsten Schritt können Sie daraus konkrete Verbesserungshebel ableiten.'
                : 'Es zeigen sich aktuell keine dominanten Soll-Abweichungen. Im nächsten Schritt prüft die App dennoch gezielt auf Reibungen und Hotspots.')
            : 'Sobald ein Soll-Abgleich vorliegt, können die wichtigsten Abweichungen als Verbesserungshebel weiterverarbeitet werden.'
        }
        onBack={onBack}
        onNext={onNext}
        nextLabel="Verbesserungen erkennen"
        nextDisabled={!displayResult}
      />
    </div>
  );
}
