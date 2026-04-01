import { AlertCircle, CheckCircle2, Compass, Lightbulb, Route, ShieldAlert } from 'lucide-react';
import type { ProcessVersion } from '../../domain/process';
import type { ProcessMiningAssistedV2State } from './types';
import { computeV2Conformance } from './conformance';
import { computeV2Discovery } from './discovery';
import { computeV2Enhancement } from './enhancement';
import { getAnalysisModeLabel } from './pmShared';
import { HelpPopover } from '../components/HelpPopover';
import { computeDomainInsights } from './domainInsights';
import { DomainInsightPanel } from './DomainInsightPanel';

interface Props {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
}

function getHappyPath(version?: ProcessVersion): string[] {
  return (
    version?.sidecar.captureDraft?.happyPath
      ?.slice()
      .sort((a, b) => a.order - b.order)
      .map(step => step.label)
      .filter(Boolean) ?? []
  );
}

function joinPreview(steps: string[], limit = 4): string {
  if (steps.length === 0) return 'Noch keine tragfähige Schrittfolge erkannt.';
  const visible = steps.slice(0, limit).join(' → ');
  return steps.length > limit ? `${visible} → …` : visible;
}

export function LocalAnalysisDigestPanel({ state, version }: Props) {
  const stepObservations = state.observations.filter(observation => observation.kind === 'step');
  if (stepObservations.length === 0) {
    return null;
  }

  const discovery = computeV2Discovery({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: state.lastDerivationSummary,
  });
  const happyPath = getHappyPath(version);
  const conformance = computeV2Conformance({
    cases: state.cases,
    observations: state.observations,
    captureHappyPath: version?.sidecar.captureDraft?.happyPath,
    coreProcess: discovery.coreProcess,
    lastDerivationSummary: state.lastDerivationSummary,
  });
  const enhancement = computeV2Enhancement({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: state.lastDerivationSummary,
  });

  const firstDeviation = conformance.topDeviations[0];
  const firstHotspot = enhancement.hotspots[0];
  const quality = state.qualitySummary;
  const domainInsights = computeDomainInsights({ cases: state.cases, observations: state.observations, lastDerivationSummary: state.lastDerivationSummary });
  const analysisModeLabel = getAnalysisModeLabel(discovery.analysisMode);
  const stepCount = quality?.stepObservationCount ?? stepObservations.length;
  const sourceCount = quality?.totalCases ?? state.cases.length;
  const realTimeCount = quality?.observationsWithRealTime ?? 0;

  let dataGapText = `${sourceCount} ${sourceCount === 1 ? 'Quelle' : 'Quellen'} mit ${stepCount} erkannten Schritten.`;
  if ((quality?.unclearLabelCount ?? 0) > 0) {
    dataGapText += ` ${quality?.unclearLabelCount} Schrittbezeichnungen sollten noch kurz vereinheitlicht werden.`;
  } else if (realTimeCount === 0) {
    dataGapText += ' Es liegen noch keine echten Zeitangaben vor.';
  } else {
    dataGapText += ` ${realTimeCount} Zeitangaben erlauben bereits erste zeitbezogene Hinweise.`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-slate-700">
            <Compass className="h-4 w-4 text-cyan-600" />
            <p className="text-sm font-semibold">Sofortauswertung ohne KI</p>
            <HelpPopover helpKey="pmv2.digest" ariaLabel="Hilfe: Sofortauswertung ohne KI" />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
            Die App fasst hier zusammen, was lokal bereits erkannt wurde. Dadurch sehen Sie vor dem Feinschliff sofort,
            welche Hauptlinie, welche Soll-Hinweise und welche Reibungen sich schon jetzt abzeichnen.
          </p>
        </div>
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {analysisModeLabel}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
          <div className="flex items-center gap-2 text-cyan-800">
            <Route className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Erkannte Hauptlinie</h3>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-900 leading-relaxed">{joinPreview(discovery.coreProcess)}</p>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            {discovery.analysisMode === 'process-draft'
              ? 'Die Schrittfolge ist derzeit als Prozessentwurf zu lesen.'
              : `${discovery.variants.length} Varianten wurden lokal erkannt.`}
          </p>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex items-center gap-2 text-violet-800">
            <ShieldAlert className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Wichtigster Soll-Hinweis</h3>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-900 leading-relaxed">
            {firstDeviation
              ? firstDeviation.description
              : happyPath.length > 0
              ? 'Der erste Soll-Abgleich zeigt aktuell keine klar dominierende Abweichung.'
              : 'Noch kein Happy Path hinterlegt. Der Soll-Abgleich nutzt deshalb vorerst den lokal erkannten Kernprozess.'}
          </p>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            {happyPath.length > 0 ? 'Vergleichsbasis: Happy Path aus der Prozesserfassung.' : 'Vergleichsbasis: lokal erkannte Hauptlinie.'}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Lightbulb className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Deutlichster Reibungspunkt</h3>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-900 leading-relaxed">
            {firstHotspot ? firstHotspot.headline : 'Noch kein dominanter Hotspot erkennbar.'}
          </p>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            {firstHotspot ? firstHotspot.detail : 'Mit weiteren Fällen oder klareren Zeitangaben werden Verbesserungshebel meist präziser.'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-slate-700">
            {(quality?.unclearLabelCount ?? 0) > 0 || realTimeCount === 0 ? (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            <h3 className="text-sm font-semibold">Datenlage</h3>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-900 leading-relaxed">{dataGapText}</p>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">{discovery.sampleNotice}</p>
        </div>
      </div>

      <DomainInsightPanel insights={domainInsights} compact />
    </div>
  );
}
