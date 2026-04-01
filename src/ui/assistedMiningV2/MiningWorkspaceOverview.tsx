import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Compass, Database, Route, Sparkles } from 'lucide-react';
import type { ProcessVersion } from '../../domain/process';
import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step } from './types';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';
import { MINING_STEPS } from './types';
import { computeStepFlow } from './stepFlow';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  currentStep: ProcessMiningAssistedV2Step;
  detailsOpen: boolean;
  consistencyNotice?: string[];
  onToggleDetails: () => void;
}

export function MiningWorkspaceOverview({
  state,
  version,
  currentStep,
  detailsOpen,
  consistencyNotice = [],
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
  const stepFlow = computeStepFlow({ state, version });

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

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-slate-700">
          <Route className="w-4 h-4 text-violet-600" />
          <p className="text-sm font-semibold">Status der Arbeitsschritte</p>
          <HelpPopover helpKey="pmv2.flow" ariaLabel="Hilfe: Status der Arbeitsschritte" />
        </div>
        <div className="grid gap-2 lg:grid-cols-5">
          {stepFlow.map(item => {
            const tone =
              item.status === 'done'
                ? 'border-green-200 bg-green-50 text-green-900'
                : item.status === 'active'
                ? 'border-cyan-200 bg-cyan-50 text-cyan-900'
                : item.status === 'ready'
                ? 'border-violet-200 bg-violet-50 text-violet-900'
                : 'border-slate-200 bg-white text-slate-700';
            const badgeTone =
              item.status === 'done'
                ? 'bg-green-100 text-green-800'
                : item.status === 'active'
                ? 'bg-cyan-100 text-cyan-800'
                : item.status === 'ready'
                ? 'bg-violet-100 text-violet-800'
                : 'bg-slate-100 text-slate-600';
            const badgeLabel =
              item.status === 'done'
                ? 'erledigt'
                : item.status === 'active'
                ? 'aktuell'
                : item.status === 'ready'
                ? 'bereit'
                : 'wartet';

            return (
              <div key={item.step} className={`rounded-xl border p-3 space-y-2 ${tone}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight">{item.label}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeTone}`}>{badgeLabel}</span>
                </div>
                <p className="text-xs leading-relaxed opacity-90">{item.summary}</p>
              </div>
            );
          })}
        </div>
      </div>

      {consistencyNotice.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="w-4 h-4" />
            <p className="text-sm font-semibold">Arbeitsstand wurde konsistent gehalten</p>
            <HelpPopover helpKey="pmv2.consistency" ariaLabel="Hilfe: Konsistenzschutz" />
          </div>
          <div className="space-y-1.5">
            {consistencyNotice.map((note, index) => (
              <p key={index} className="text-sm text-amber-900/90 leading-relaxed">{note}</p>
            ))}
          </div>
        </div>
      )}

      {consistencyNotice.length === 0 && (state.cases.length > 0 || state.observations.length > 0) && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 text-green-900">
            <CheckCircle2 className="w-4 h-4" />
            <p className="text-sm font-semibold">Arbeitsstand wirkt konsistent</p>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-green-900/90">
            Discovery, Soll-Abgleich, Verbesserungsanalyse und Bericht werden bei Änderungen an der Basis automatisch neu aufgebaut.
          </p>
        </div>
      )}
    </div>
  );
}
