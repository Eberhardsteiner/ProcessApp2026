import { ChevronDown, ChevronRight, Compass, Database, Route, Sparkles } from 'lucide-react';
import type { ProcessVersion } from '../../domain/process';
import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step } from './types';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';
import { MINING_STEPS } from './types';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  currentStep: ProcessMiningAssistedV2Step;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}

export function MiningWorkspaceOverview({
  state,
  version,
  currentStep,
  detailsOpen,
  onToggleDetails,
}: Props) {
  const readiness = computeMiningReadiness({ state, version });
  const reviewSuggestionCount = buildReviewOverview({ cases: state.cases, observations: state.observations }).suggestionCount;
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount });
  const currentStepIndex = MINING_STEPS.findIndex(step => step.id === currentStep);
  const currentStepDef = MINING_STEPS[currentStepIndex];
  const quality = state.qualitySummary;
  const sources = quality?.totalCases ?? state.cases.length;
  const steps = quality?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length;
  const issues = quality?.issueObservationCount ?? state.observations.filter(item => item.kind === 'issue').length;
  const realTimes = quality?.observationsWithRealTime ?? state.observations.filter(item => item.timestampQuality === 'real').length;
  const primaryNextAction = readiness.nextActions[0] ?? 'Sie können im aktuellen Schritt direkt weiterarbeiten.';

  const stats = [
    { label: 'Quellen', value: sources, hint: sources === 1 ? 'ein Fall oder Dokument' : 'Fälle oder Dokumente' },
    { label: 'Erkannte Schritte', value: steps, hint: 'lokal ohne KI' },
    { label: 'Reibungssignale', value: issues, hint: 'als Hinweise auf Probleme' },
    { label: 'Zeitangaben', value: realTimes, hint: realTimes > 0 ? 'für Zeit-Hotspots nutzbar' : 'aktuell nicht belastbar' },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-slate-700">
            <Compass className="w-4 h-4 text-cyan-600" />
            <p className="text-sm font-semibold">Arbeitsbereich auf einen Blick</p>
            <HelpPopover helpKey="pmv2.workspace" ariaLabel="Hilfe: Arbeitsbereich" />
            <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
              Schritt {currentStepIndex + 1} von {MINING_STEPS.length}
            </span>
            <span className="rounded-full bg-cyan-50 border border-cyan-200 px-2.5 py-0.5 text-[11px] font-medium text-cyan-800">
              {readiness.analysisModeLabel}
            </span>
            <span className="rounded-full bg-violet-50 border border-violet-200 px-2.5 py-0.5 text-[11px] font-medium text-violet-800">
              {maturity.levelLabel}
            </span>
            {state.reportSnapshot && (
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
                Bericht bereit
              </span>
            )}
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">{currentStepDef?.label}</p>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed max-w-3xl">
              {currentStepDef?.description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleDetails}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
        >
          {detailsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {detailsOpen ? 'Analyse-Überblick einklappen' : 'Analyse-Überblick anzeigen'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-cyan-800">
            <Route className="w-4 h-4" />
            <p className="text-sm font-semibold">Was jetzt sinnvoll ist</p>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{primaryNextAction}</p>
          <p className="text-xs text-slate-600 leading-relaxed">
            {readiness.summary}
          </p>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-violet-800">
            <Sparkles className="w-4 h-4" />
            <p className="text-sm font-semibold">Aktuelle Einordnung</p>
          </div>
          <p className="text-sm font-medium text-slate-900">{readiness.headline}</p>
          <p className="text-xs text-slate-600 leading-relaxed">
            {readiness.cautionNotes[0] ?? 'Die Datenbasis wirkt im aktuellen Schritt unkritisch.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Database className="w-3.5 h-3.5" />
              <p className="text-xs">{stat.label}</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-800">{stat.value}</p>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{stat.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
