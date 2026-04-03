import { useState } from 'react';
import {
  ArrowLeft,
  Info,
  Layers,
  GitBranch,
  AlertTriangle,
  BookMarked,
  PackagePlus,
  Save,
  Check,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type {
  Process,
  ProcessMiningAssistedV2State,
  ProcessVersion,
  ImprovementBacklogItem,
  EvidenceSource,
} from '../../domain/process';
import type { V2AugmentationState } from './augmentation';
import {
  createEmptyAugmentation,
  upsertStepAnnotation,
  upsertDeviationAnnotation,
  upsertHotspotAnnotation,
} from './augmentation';
import { buildProcessMiningReport } from './reporting';
import { StepAnnotationEditor } from './StepAnnotationEditor';
import { ProcessMiningReportPanel } from './ProcessMiningReportPanel';
import { GovernancePanel } from './GovernancePanel';
import { PilotReadinessPanel } from './PilotReadinessPanel';
import { evaluatePilotReadiness } from './pilotReadiness';
import { WorkspaceSnapshotPanel } from './WorkspaceSnapshotPanel';
import { pushReportSnapshot } from './reportHistory';
import { HelpPopover } from '../components/HelpPopover';
import { StepGuardCard } from './StepGuardCard';

interface Props {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onSaveVersion: (patch: {
    improvementItems?: ImprovementBacklogItem[];
    evidenceSources?: EvidenceSource[];
  }) => void;
  onRestoreState: (nextState: ProcessMiningAssistedV2State) => void;
  onBack: () => void;
}

function buildFallbackManagementSummary(state: ProcessMiningAssistedV2State): string {
  const lines: string[] = [];
  if (state.discoverySummary) {
    const d = state.discoverySummary;
    lines.push(`Kernprozess (${d.caseCount} Fälle, ${d.mainVariantShare ?? 0} % Abdeckung):`);
    (d.topSteps ?? []).forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }
  if (state.conformanceSummary) {
    const c = state.conformanceSummary;
    lines.push(`\nAbgleich mit Soll: ${c.deviationCount} Abweichungstypen erkannt.`);
    (c.deviationNotes ?? []).slice(0, 3).forEach(n => lines.push(`  - ${n}`));
  }
  if (state.enhancementSummary) {
    const e = state.enhancementSummary;
    lines.push(`\nVerbesserungshebel (${e.issueCount} gemerkt):`);
    e.issues.slice(0, 3).forEach(i => lines.push(`  - ${i.title}`));
  }
  return lines.join('\n');
}

export function AugmentationStep({
  process,
  version,
  state,
  onChange,
  onSaveVersion,
  onRestoreState,
  onBack,
}: Props) {
  const [aug, setAug] = useState<V2AugmentationState>(createEmptyAugmentation());
  const [summary, setSummary] = useState(state.augmentationNotes ?? state.reportSnapshot?.executiveSummary ?? '');
  const [summaryGenerated, setSummaryGenerated] = useState(Boolean(state.reportSnapshot?.executiveSummary));
  const [transferred, setTransferred] = useState<Set<string>>(new Set());
  const [evidenceSaved, setEvidenceSaved] = useState<Set<string>>(new Set());
  const [summarySaved, setSummarySaved] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const [showDeviations, setShowDeviations] = useState(false);
  const [showHotspots, setShowHotspots] = useState(false);

  const coreSteps = state.discoverySummary?.topSteps ?? [];
  const deviations = state.conformanceSummary?.deviationNotes ?? [];
  const hotspotIssues = state.enhancementSummary?.issues ?? [];
  const pilotReadiness = evaluatePilotReadiness({ state, version });

  function updateStepAnnotation(label: string, patch: Parameters<typeof upsertStepAnnotation>[2]) {
    setAug(prev => upsertStepAnnotation(prev, label, patch));
  }

  function updateDeviationAnnotation(desc: string, patch: Parameters<typeof upsertDeviationAnnotation>[2]) {
    setAug(prev => upsertDeviationAnnotation(prev, desc, patch));
  }

  function updateHotspotAnnotation(headline: string, patch: Parameters<typeof upsertHotspotAnnotation>[2]) {
    setAug(prev => upsertHotspotAnnotation(prev, headline, patch));
  }

  function transferToBacklog(title: string, description: string, key: string) {
    const now = new Date().toISOString();
    const item: ImprovementBacklogItem = {
      id: crypto.randomUUID(),
      title,
      category: 'standardize' as const,
      scope: 'process' as const,
      description,
      impact: 'medium' as const,
      effort: 'medium' as const,
      risk: 'low' as const,
      status: 'idea' as const,
      createdAt: now,
      updatedAt: now,
    };
    onSaveVersion({ improvementItems: [item] });
    setTransferred(prev => new Set([...prev, key]));
  }

  function saveAsEvidence(text: string, key: string) {
    const now = new Date().toISOString();
    const source: EvidenceSource = {
      refId: crypto.randomUUID(),
      kind: 'workshop',
      text,
      createdAt: now,
      updatedAt: now,
    };
    onSaveVersion({ evidenceSources: [source] });
    setEvidenceSaved(prev => new Set([...prev, key]));
  }

  function generateSummary() {
    if (state.reportSnapshot?.executiveSummary) {
      setSummary(state.reportSnapshot.executiveSummary);
      setSummaryGenerated(true);
      return;
    }
    const fallback = buildFallbackManagementSummary(state);
    setSummary(fallback);
    setSummaryGenerated(true);
  }

  function handleGenerateReport() {
    const generated = buildProcessMiningReport({ process, version, state });
    onChange({
      reportSnapshot: generated.snapshot,
      reportHistory: pushReportSnapshot(state.reportHistory, generated.snapshot),
      handoverDrafts: generated.handovers,
    });
    if (!summary.trim()) {
      setSummary(generated.snapshot.executiveSummary);
      setSummaryGenerated(true);
    }
  }

  function saveSummary() {
    onChange({ augmentationNotes: summary });
    setSummarySaved(true);
    setTimeout(() => setSummarySaved(false), 2000);
  }

  const stepCount = state.observations.filter(observation => observation.kind === 'step').length;

  if (stepCount === 0) {
    return (
      <StepGuardCard
        title="Bericht und Übergaben noch nicht bereit"
        body="Für Berichte, Zusammenfassungen und Übergaben braucht die App zuerst automatisch erkannte Prozessschritte aus mindestens einer Quelle."
        nextLabel="Zuerst in Schritt 1 eine Quelle auswerten"
        onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800 space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">Was passiert hier?</p>
            <HelpPopover helpKey="pmv2.augmentation" ariaLabel="Hilfe: Ergebnisse anreichern" />
          </div>
          <p>
            Reichere die Analyseergebnisse mit zusätzlichem Kontext an, formuliere eine gut lesbare
            Zusammenfassung und leite daraus konkrete Übergaben für Management, Prozessverantwortung,
            operatives Team oder Workshop ab.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Beobachtete Fälle', value: state.cases.length },
          { label: 'Erkannte Schritte', value: stepCount },
          {
            label: 'Erkannte Varianten',
            value: state.discoverySummary?.variantCount ?? '—',
          },
          {
            label: 'Gemerkte Hinweise',
            value: state.enhancementSummary?.issueCount ?? '—',
          },
        ].map(metric => (
          <div key={metric.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500">{metric.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{metric.value}</p>
          </div>
        ))}
      </div>

      <PilotReadinessPanel state={state} version={version} />

      <ProcessMiningReportPanel
        report={state.reportSnapshot}
        history={state.reportHistory}
        currentState={state}
        handovers={state.handoverDrafts}
        onGenerate={handleGenerateReport}
        onSaveEvidence={saveAsEvidence}
        onAdoptSummary={text => {
          setSummary(text);
          setSummaryGenerated(true);
        }}
      />

      <GovernancePanel
        state={state}
        version={version}
        onChange={onChange}
        onSaveEvidence={saveAsEvidence}
      />

      <WorkspaceSnapshotPanel
        process={process}
        version={version}
        state={state}
        readiness={pilotReadiness}
        onRestoreState={onRestoreState}
      />

      {coreSteps.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowSteps(s => !s)}
            className="flex items-center gap-2 font-semibold text-slate-800 text-sm w-full text-left"
          >
            {showSteps ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            <Layers className="w-4 h-4 text-blue-500" />
            Kernprozess-Schritte anreichern ({coreSteps.length})
          </button>
          {showSteps && (
            <div className="space-y-2 pl-2">
              {coreSteps.map(step => {
                const annotation = aug.stepAnnotations.find(a => a.stepLabel === step) ?? {};
                return (
                  <StepAnnotationEditor
                    key={step}
                    stepLabel={step}
                    annotation={annotation}
                    onChange={patch => updateStepAnnotation(step, patch)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {deviations.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowDeviations(s => !s)}
            className="flex items-center gap-2 font-semibold text-slate-800 text-sm w-full text-left"
          >
            {showDeviations ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            <GitBranch className="w-4 h-4 text-red-500" />
            Abweichungen anreichern und übernehmen ({deviations.length})
          </button>
          {showDeviations && (
            <div className="space-y-3 pl-2">
              {deviations.map((deviation, index) => {
                const key = `dev-${index}`;
                const annotation = aug.deviationAnnotations.find(a => a.deviationDescription === deviation) ?? {};
                return (
                  <div key={key} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                    <p className="text-sm font-medium text-slate-700">{deviation}</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {([
                        { k: 'rootCause', label: 'Vermutete Ursache', ph: 'Warum tritt diese Abweichung auf?' },
                        { k: 'roles', label: 'Betroffene Rollen', ph: 'Wer ist davon betroffen?' },
                        { k: 'risks', label: 'Risiken / Auswirkungen', ph: 'Was sind die Folgen dieser Abweichung?' },
                        { k: 'evidenceNote', label: 'Quelle / Evidenz', ph: 'Woher ist das bekannt?' },
                      ] as { k: keyof typeof annotation; label: string; ph: string }[]).map(field => (
                        <div key={field.k} className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-600">{field.label}</label>
                          <textarea
                            rows={2}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                            placeholder={field.ph}
                            value={(annotation[field.k] as string) ?? ''}
                            onChange={event => updateDeviationAnnotation(deviation, { [field.k]: event.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={transferred.has(key)}
                        onClick={() => transferToBacklog(`Abweichung: ${deviation.slice(0, 60)}`, deviation, key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          transferred.has(key)
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                      >
                        {transferred.has(key) ? <><Check className="w-3.5 h-3.5" />Übernommen</> : <><PackagePlus className="w-3.5 h-3.5" />Als Verbesserungsmaßnahme übernehmen</>}
                      </button>
                      <button
                        type="button"
                        disabled={evidenceSaved.has(key)}
                        onClick={() => saveAsEvidence(deviation, key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          evidenceSaved.has(key)
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {evidenceSaved.has(key) ? <><Check className="w-3.5 h-3.5" />Gespeichert</> : <><BookMarked className="w-3.5 h-3.5" />Als Evidenz übernehmen</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {hotspotIssues.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowHotspots(s => !s)}
            className="flex items-center gap-2 font-semibold text-slate-800 text-sm w-full text-left"
          >
            {showHotspots ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Verbesserungshinweise übernehmen ({hotspotIssues.length})
          </button>
          {showHotspots && (
            <div className="space-y-3 pl-2">
              {hotspotIssues.map((issue, index) => {
                const key = `hotspot-${index}`;
                const annotation = aug.hotspotAnnotations.find(a => a.hotspotHeadline === issue.title) ?? {};
                return (
                  <div key={key} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                    <p className="text-sm font-semibold text-slate-800">{issue.title}</p>
                    <p className="text-xs text-slate-500">{issue.description}</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {([
                        { k: 'rootCause', label: 'Vermutete Ursache', ph: 'Was steckt dahinter?' },
                        { k: 'roles', label: 'Betroffene Rollen', ph: 'Wer ist betroffen?' },
                        { k: 'risks', label: 'Risiken', ph: 'Welche Folgen hat das?' },
                        { k: 'evidenceNote', label: 'Quelle', ph: 'Woher ist das bekannt?' },
                      ] as { k: keyof typeof annotation; label: string; ph: string }[]).map(field => (
                        <div key={field.k} className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-600">{field.label}</label>
                          <textarea
                            rows={2}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                            placeholder={field.ph}
                            value={(annotation[field.k] as string) ?? ''}
                            onChange={event => updateHotspotAnnotation(issue.title, { [field.k]: event.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={transferred.has(key)}
                        onClick={() => transferToBacklog(issue.title, issue.description, key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          transferred.has(key)
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                      >
                        {transferred.has(key) ? <><Check className="w-3.5 h-3.5" />Übernommen</> : <><PackagePlus className="w-3.5 h-3.5" />Als Verbesserungsmaßnahme übernehmen</>}
                      </button>
                      <button
                        type="button"
                        disabled={evidenceSaved.has(key)}
                        onClick={() => saveAsEvidence(`${issue.title}: ${issue.description}`, key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          evidenceSaved.has(key)
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {evidenceSaved.has(key) ? <><Check className="w-3.5 h-3.5" />Gespeichert</> : <><BookMarked className="w-3.5 h-3.5" />Als Evidenz übernehmen</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Mining-Zusammenfassung</h3>
            <HelpPopover helpKey="pmv2.story" ariaLabel="Hilfe: Zusammenfassung und Story" />
          </div>
          {!summaryGenerated && (
            <button
              type="button"
              onClick={generateSummary}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors"
            >
              Zusammenfassung generieren
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Nutzen Sie die Kurzfassung für Ihre eigene Verdichtung oder übernehmen Sie oben direkt die lokal erzeugte
          Management-Zusammenfassung aus dem Bericht.
        </p>
        <textarea
          rows={8}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y font-mono"
          placeholder="Schreibe hier eine Management-Zusammenfassung der Mining-Ergebnisse oder nutze 'Zusammenfassung generieren' für einen lokalen Entwurf."
          value={summary}
          onChange={event => setSummary(event.target.value)}
        />
        <div className="flex items-center justify-end gap-2">
          {summarySaved && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="w-3.5 h-3.5" />Gespeichert
            </span>
          )}
          <button
            type="button"
            onClick={saveSummary}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            Mining-Zusammenfassung speichern
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-slate-600 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>
        <div className="text-xs text-slate-400 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-green-500" />
          Alle 5 Schritte abgeschlossen
        </div>
      </div>
    </div>
  );
}
