import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Compass, Database, Link2, Route, Sparkles } from 'lucide-react';
import type { ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step } from './types';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';
import { MINING_STEPS } from './types';
import { computeStepFlow } from './stepFlow';
import { evaluatePilotReadiness } from './pilotReadiness';
import { HelpPopover } from '../components/HelpPopover';
import { compareReportToCurrentState } from './reportHistory';
import { computeGovernanceSummary } from './governance';
import { compareGovernanceSnapshotToCurrent, computeGovernanceWorkflow } from './governanceWorkflow';
import { computeGovernanceInsights } from './governanceInsights';
import { OperatingModePanel } from './OperatingModePanel';
import { getOperatingModeProfile } from './operatingMode';
import { evaluateIntegrationReadiness } from './integrationReadiness';
import { buildConnectorBundlePreviews, compareConnectorExportToCurrent } from './connectorBundles';
import { evaluateReleaseStability } from './releaseStability';

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
  settings,
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
  const quality = state.qualitySummary;
  const sources = quality?.totalCases ?? state.cases.length;
  const steps = quality?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length;
  const issues = quality?.issueObservationCount ?? state.observations.filter(item => item.kind === 'issue').length;
  const realTimes = quality?.observationsWithRealTime ?? state.observations.filter(item => item.timestampQuality === 'real').length;
  const releaseStability = version ? evaluateReleaseStability({ state, version, settings }) : null;
  const primaryNextAction = currentStep === 'augmentation' && releaseStability
    ? releaseStability.nextActions[0] ?? readiness.nextActions[0] ?? 'Sie können im aktuellen Schritt direkt weiterarbeiten.'
    : readiness.nextActions[0] ?? 'Sie können im aktuellen Schritt direkt weiterarbeiten.';
  const stepFlow = computeStepFlow({ state, version });
  const pilotReadiness = evaluatePilotReadiness({ state, version });
  const reportFreshness = state.reportSnapshot
    ? compareReportToCurrentState(state.reportSnapshot, state)
    : null;
  const governanceSummary = version ? computeGovernanceSummary({ state, version }) : null;
  const governanceWorkflow = version ? computeGovernanceWorkflow({ state, version }) : null;
  const latestGovernanceSnapshot = state.governance?.history?.length ? state.governance.history[state.governance.history.length - 1] : undefined;
  const governanceDelta = version ? compareGovernanceSnapshotToCurrent(latestGovernanceSnapshot, { state, version }) : null;
  const governanceInsights = version ? computeGovernanceInsights({ state, version }) : null;
  const operatingModeProfile = getOperatingModeProfile(state.operatingMode);
  const integrationReadiness = evaluateIntegrationReadiness({ state, version, settings });
  const integrationReadyCount = integrationReadiness.items.filter(item => item.status === 'ready').length;
  const integrationBlockedCount = integrationReadiness.items.filter(item => item.status === 'blocked').length;
  const connectorBundles = version ? buildConnectorBundlePreviews({
    process: {
      processId: version.processId,
      projectId: '',
      title: version.titleSnapshot,
      category: 'kern',
      managementLevel: 'fachlich',
      hierarchyLevel: 'hauptprozess',
      parentProcessId: null,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    },
    version,
    state,
    settings,
  }) : null;
  const latestConnectorExport = state.connectorToolkit?.history?.length ? state.connectorToolkit.history[state.connectorToolkit.history.length - 1] : undefined;
  const connectorExportDelta = connectorBundles ? compareConnectorExportToCurrent(latestConnectorExport, connectorBundles.bundles) : null;

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
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${pilotReadiness.level === 'pilot-ready' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : pilotReadiness.level === 'workshop-ready' ? 'bg-cyan-50 border-cyan-200 text-cyan-800' : pilotReadiness.level === 'internal-review' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
              {pilotReadiness.levelLabel}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${operatingModeProfile.badgeClass}`}>
              Modus: {operatingModeProfile.shortLabel}
            </span>
            {releaseStability && currentStep === 'augmentation' && (
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${releaseStability.level === 'release-ready' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : releaseStability.level === 'review-ready' ? 'bg-cyan-50 border-cyan-200 text-cyan-800' : releaseStability.level === 'stabilizing' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                Freigabe: {releaseStability.levelLabel}
              </span>
            )}
            {state.reportSnapshot && (
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${reportFreshness?.isAligned ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                {reportFreshness?.isAligned ? 'Bericht aktuell' : 'Bericht prüfen'}
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
            {currentStep === 'augmentation' && releaseStability ? releaseStability.summary : readiness.summary}
          </p>
        </div>

        <div className={`rounded-xl border p-4 space-y-2 ${currentStep === 'augmentation' && releaseStability ? (releaseStability.level === 'release-ready' ? 'border-emerald-200 bg-emerald-50' : releaseStability.level === 'review-ready' ? 'border-cyan-200 bg-cyan-50' : releaseStability.level === 'stabilizing' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50') : 'border-violet-200 bg-violet-50'}`}>
          <div className={`flex items-center gap-2 ${currentStep === 'augmentation' && releaseStability ? 'text-slate-800' : 'text-violet-800'}`}>
            <Sparkles className="w-4 h-4" />
            <p className="text-sm font-semibold">{currentStep === 'augmentation' && releaseStability ? 'Freigabe-Stand' : 'Aktuelle Einordnung'}</p>
          </div>
          <p className="text-sm font-medium text-slate-900">{currentStep === 'augmentation' && releaseStability ? releaseStability.headline : readiness.headline}</p>
          <p className="text-xs text-slate-600 leading-relaxed">
            {currentStep === 'augmentation' && releaseStability ? releaseStability.nextActions[0] ?? releaseStability.summary : readiness.cautionNotes[0] ?? 'Die Datenbasis wirkt im aktuellen Schritt unkritisch.'}
          </p>
          <p className={`text-xs font-medium ${currentStep === 'augmentation' && releaseStability ? 'text-slate-800' : 'text-violet-800'}`}>{currentStep === 'augmentation' && releaseStability ? `${releaseStability.levelLabel} · ${releaseStability.score}/100` : `Pilot-Stand: ${pilotReadiness.levelLabel} · ${pilotReadiness.score}/100`}</p>
        </div>
      </div>

      <OperatingModePanel value={operatingModeProfile.key} onChange={onOperatingModeChange} />

      <div className={`rounded-xl border p-4 space-y-2 ${integrationBlockedCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-cyan-200 bg-cyan-50'}`}>
        <div className="flex items-center gap-2 text-slate-900">
          <Link2 className={`w-4 h-4 ${integrationBlockedCount > 0 ? 'text-amber-600' : 'text-cyan-600'}`} />
          <p className="text-sm font-semibold">Betriebsgrenzen und Integrationswege</p>
          <HelpPopover helpKey="pmv2.integration" ariaLabel="Hilfe: Betriebsgrenzen und Integrationswege" />
        </div>
        <p className="text-sm leading-relaxed text-slate-800">{integrationReadiness.headline}</p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">Bereit: {integrationReadyCount}</span>
          <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">Teilweise: {integrationReadiness.items.filter(item => item.status === 'partial').length}</span>
          <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">Noch offen: {integrationBlockedCount}</span>
        </div>
      </div>

      {governanceSummary && (
        <div className={`rounded-xl border p-4 space-y-2 ${governanceWorkflow?.stage === 'approved' && governanceWorkflow.approvalFresh ? 'border-emerald-200 bg-emerald-50' : governanceSummary.readyForShare ? 'border-cyan-200 bg-cyan-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center gap-2 text-slate-900">
            <CheckCircle2 className={`w-4 h-4 ${governanceWorkflow?.stage === 'approved' && governanceWorkflow.approvalFresh ? 'text-emerald-600' : governanceSummary.readyForShare ? 'text-cyan-600' : 'text-amber-600'}`} />
            <p className="text-sm font-semibold">Governance-Stand</p>
            <HelpPopover helpKey="pmv2.governance" ariaLabel="Hilfe: Governance-Stand" />
          </div>
          <p className="text-sm leading-relaxed text-slate-800">{governanceWorkflow?.headline ?? governanceSummary.headline}</p>
          <div className="flex flex-wrap gap-2">
            {governanceWorkflow && (
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Status: {governanceWorkflow.stageLabel}
              </span>
            )}
            {governanceInsights && (
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Governance-Reife: {governanceInsights.score}/100
              </span>
            )}
            <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
              Offene Entscheidungen: {governanceSummary.openDecisionCount}
            </span>
            <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
              Nächster Schritt: {governanceSummary.nextAction}
            </span>
            {governanceInsights && governanceInsights.overdueDecisionCount > 0 && (
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Überfällig: {governanceInsights.overdueDecisionCount}
              </span>
            )}
            {governanceInsights && governanceInsights.missingOwnerCount > 0 && (
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Ohne Owner: {governanceInsights.missingOwnerCount}
              </span>
            )}
          </div>
          {governanceInsights && (
            <p className="text-xs font-medium leading-relaxed text-slate-700">
              Freigabe-Assistenz: {governanceInsights.nextAction}
            </p>
          )}
          {governanceDelta && (
            <p className="text-xs leading-relaxed text-slate-600">
              Letzter gemerkter Governance-Stand: {governanceDelta.summary}
            </p>
          )}
        </div>
      )}

      {state.pilotToolkit?.lastExportedAt && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-900">
            <CheckCircle2 className="w-4 h-4 text-cyan-600" />
            <p className="text-sm font-semibold">Pilot-Paket zuletzt erstellt</p>
            <HelpPopover helpKey="pmv2.pilotToolkit" ariaLabel="Hilfe: Pilot-Toolkit" />
          </div>
          <p className="text-sm leading-relaxed text-slate-800">
            Zuletzt exportiert am {new Date(state.pilotToolkit.lastExportedAt).toLocaleString('de-DE')}.
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            Wenn sich Analysebasis, Bericht oder Governance-Stand ändern, sollte das Paket vor der Weitergabe noch einmal neu erstellt werden.
          </p>
        </div>
      )}

      {state.connectorToolkit?.lastExportedAt && connectorBundles && (
        <div className={`rounded-xl border p-4 space-y-2 ${connectorExportDelta?.isAligned ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center gap-2 text-slate-900">
            <Link2 className={`w-4 h-4 ${connectorExportDelta?.isAligned ? 'text-emerald-600' : 'text-amber-600'}`} />
            <p className="text-sm font-semibold">Connector-Paket zuletzt exportiert</p>
            <HelpPopover helpKey="pmv2.connectorBundles" ariaLabel="Hilfe: Connector-Pakete und Betriebshilfen" />
          </div>
          <p className="text-sm leading-relaxed text-slate-800">
            Zuletzt exportiert am {new Date(state.connectorToolkit.lastExportedAt).toLocaleString('de-DE')}.
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            {connectorExportDelta?.summary ?? 'Der letzte Connector-Export kann im aktuellen Arbeitsstand geprüft werden.'}
          </p>
        </div>
      )}

      {reportFreshness && (
        <div className={`rounded-xl border p-4 space-y-2 ${reportFreshness.isAligned ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center gap-2 text-slate-900">
            <Sparkles className={`w-4 h-4 ${reportFreshness.isAligned ? 'text-emerald-600' : 'text-amber-600'}`} />
            <p className="text-sm font-semibold">Vergleich zum letzten Bericht</p>
          </div>
          <p className="text-sm leading-relaxed text-slate-800">{reportFreshness.summary}</p>
          {reportFreshness.metricChanges.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {reportFreshness.metricChanges.slice(0, 4).map(item => (
                <span key={item.key} className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {item.label}: {item.previousValue} → {item.currentValue} ({item.delta > 0 ? '+' : ''}{item.delta})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
