import { ChevronDown, ChevronRight, Compass, Database, Route, Sparkles } from 'lucide-react';
import type { ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step } from './types';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';
import { MINING_STEPS } from './types';
import { computeStepFlow } from './stepFlow';
import { OperatingModePanel } from './OperatingModePanel';
import { getOperatingModeProfile } from './operatingMode';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  settings: AppSettings;
  currentStep: ProcessMiningAssistedV2Step;
  detailsOpen: boolean;
  consistencyNotice?: string[];
  onToggleDetails: () => void;
  onOperatingModeChange: (mode: 'quick-check' | 'standard' | 'pilot') => void;
}

export function MiningWorkspaceOverview({
  state,
  version,
  settings: _settings,
  currentStep,
  detailsOpen,
  consistencyNotice = [],
  onToggleDetails,
  onOperatingModeChange,
}: Props) {
  const readiness = computeMiningReadiness({ state, version });
  const reviewSuggestionCount = buildReviewOverview({ cases: state.cases, observations: state.observations }).suggestionCount;
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount });
  const currentStepIndex = MINING_STEPS.findIndex(step => step.id === currentStep);
  const currentStepDef = MINING_STEPS[currentStepIndex];
  const stepFlow = computeStepFlow({ state, version });
  const operatingModeProfile = getOperatingModeProfile(state.operatingMode);

  const stats = [
    {
      label: 'Quellen',
      value: state.cases.length,
      hint: state.cases.length === 1 ? 'eine aktive Quelle' : 'aktive Quellen',
    },
    {
      label: 'Schritte',
      value: state.observations.filter(item => item.kind === 'step').length,
      hint: 'lokal erkannt',
    },
    {
      label: 'Hinweise',
      value: state.lastDerivationSummary?.issueSignals?.length ?? state.observations.filter(item => item.kind === 'issue').length,
      hint: 'Reibung und Probleme',
    },
    {
      label: 'Review',
      value: reviewSuggestionCount,
      hint: reviewSuggestionCount > 0 ? 'offene Korrekturvorschläge' : 'keine lokalen Vorschläge',
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-slate-700">
            <Compass className="h-4 w-4 text-cyan-600" />
            <p className="text-sm font-semibold">Arbeitsbereich auf einen Blick</p>
            <HelpPopover helpKey="pmv2.workspace" ariaLabel="Hilfe: Arbeitsbereich" />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
              Schritt {currentStepIndex + 1} von {MINING_STEPS.length}
            </span>
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[11px] font-medium text-cyan-800">
              {readiness.analysisModeLabel}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${operatingModeProfile.badgeClass}`}>
              Modus: {operatingModeProfile.shortLabel}
            </span>
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">{currentStepDef?.label}</p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
              {currentStepDef?.description}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            {readiness.headline} · {maturity.levelLabel}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleDetails}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          {detailsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {detailsOpen ? 'Weniger Einordnung zeigen' : 'Mehr Einordnung zeigen'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-cyan-800">
            <Route className="h-4 w-4" />
            <p className="text-sm font-semibold">Was jetzt sinnvoll ist</p>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">
            {readiness.nextActions[0] ?? 'Die aktuelle Analysebasis kann im nächsten Schritt weiter vertieft werden.'}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">{readiness.summary}</p>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-violet-800">
            <Sparkles className="h-4 w-4" />
            <p className="text-sm font-semibold">Datenreife</p>
          </div>
          <p className="text-sm font-medium text-slate-900">{maturity.headline}</p>
          <p className="text-xs text-slate-600 leading-relaxed">{maturity.summary}</p>
          <p className="text-xs font-medium text-violet-800">
            {maturity.levelLabel} · {maturity.blockers} {maturity.blockers === 1 ? 'Blocker' : 'Blocker'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-1.5 text-slate-500">
              <Database className="h-3.5 w-3.5" />
              <p className="text-xs">{stat.label}</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-800">{stat.value}</p>
            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{stat.hint}</p>
          </div>
        ))}
      </div>

      {detailsOpen && (
        <div className="space-y-4">
          <OperatingModePanel value={operatingModeProfile.key} onChange={onOperatingModeChange} />

          {consistencyNotice.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-900">Lokale Hinweise zur Arbeitskonsistenz</p>
              <div className="space-y-1">
                {consistencyNotice.slice(0, 4).map((note, index) => (
                  <p key={`${index}-${note}`} className="text-xs leading-relaxed text-amber-900/90">
                    {note}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-slate-700">
              <Route className="h-4 w-4 text-violet-600" />
              <p className="text-sm font-semibold">Status der Arbeitsschritte</p>
              <HelpPopover helpKey="pmv2.flow" ariaLabel="Hilfe: Status der Arbeitsschritte" />
            </div>
            <div className="grid gap-2 lg:grid-cols-5">
              {stepFlow.map(item => {
                const tone =
                  item.status === 'done'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : item.status === 'active'
                    ? 'border-cyan-200 bg-cyan-50 text-cyan-900'
                    : item.status === 'ready'
                    ? 'border-violet-200 bg-violet-50 text-violet-900'
                    : 'border-slate-200 bg-white text-slate-700';

                return (
                  <div key={item.step} className={`rounded-xl border p-3 ${tone}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide">{item.label}</p>
                    <p className="mt-2 text-xs leading-relaxed">{item.summary}</p>
                    {item.actionLabel && (
                      <p className="mt-2 text-[11px] font-medium opacity-80">{item.actionLabel}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-900">Nächste sinnvolle Schritte</p>
            <div className="space-y-1">
              {maturity.actions.slice(0, 4).map(action => (
                <p key={action.key} className="text-xs leading-relaxed text-slate-700">
                  {action.label}: {action.detail}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}