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
  ProcessMiningAssistedV2State,
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
import { StepAnnotationEditor } from './StepAnnotationEditor';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onSaveVersion: (patch: {
    improvementItems?: ImprovementBacklogItem[];
    evidenceSources?: EvidenceSource[];
  }) => void;
  onBack: () => void;
}

function buildManagementSummary(state: ProcessMiningAssistedV2State): string {
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

export function AugmentationStep({ state, onChange, onSaveVersion, onBack }: Props) {
  const [aug, setAug] = useState<V2AugmentationState>(createEmptyAugmentation());
  const [summary, setSummary] = useState(state.augmentationNotes ?? '');
  const [summaryGenerated, setSummaryGenerated] = useState(false);
  const [transferred, setTransferred] = useState<Set<string>>(new Set());
  const [evidenceSaved, setEvidenceSaved] = useState<Set<string>>(new Set());
  const [summarySaved, setSummarySaved] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const [showDeviations, setShowDeviations] = useState(false);
  const [showHotspots, setShowHotspots] = useState(false);

  const coreSteps = state.discoverySummary?.topSteps ?? [];
  const deviations = state.conformanceSummary?.deviationNotes ?? [];
  const hotspotIssues = state.enhancementSummary?.issues ?? [];

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
    const generated = buildManagementSummary(state);
    setSummary(generated);
    setSummaryGenerated(true);
  }

  function saveSummary() {
    onChange({ augmentationNotes: summary });
    setSummarySaved(true);
    setTimeout(() => setSummarySaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800 space-y-1">
          <div className="flex items-center gap-2"><p className="font-medium">Was passiert hier?</p><HelpPopover helpKey="pmv2.augmentation" ariaLabel="Hilfe: Ergebnisse anreichern" /></div>
          <p>
            Reichere die Analyseergebnisse mit zusätzlichem Kontext an — Rollen, Systeme, Ursachen
            und Risiken. Übernimm ausgewählte Erkenntnisse explizit ins Verbesserungs-Backlog
            oder speichere sie als Evidenz.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Beobachtete Fälle', value: state.cases.length },
          { label: 'Erkannte Schritte', value: state.observations.length },
          {
            label: 'Erkannte Varianten',
            value: state.discoverySummary?.variantCount ?? '—',
          },
          {
            label: 'Gemerkter Hinweise',
            value: state.enhancementSummary?.issueCount ?? '—',
          },
        ].map(m => (
          <div key={m.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500">{m.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{m.value}</p>
          </div>
        ))}
      </div>

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
              {deviations.map((dev, i) => {
                const key = `dev-${i}`;
                const annotation = aug.deviationAnnotations.find(a => a.deviationDescription === dev) ?? {};
                return (
                  <div key={key} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                    <p className="text-sm font-medium text-slate-700">{dev}</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {([
                        { k: 'rootCause', label: 'Vermutete Ursache', ph: 'Warum tritt diese Abweichung auf?' },
                        { k: 'roles', label: 'Betroffene Rollen', ph: 'Wer ist davon betroffen?' },
                        { k: 'risks', label: 'Risiken / Auswirkungen', ph: 'Was sind die Folgen dieser Abweichung?' },
                        { k: 'evidenceNote', label: 'Quelle / Evidenz', ph: 'Woher ist das bekannt?' },
                      ] as { k: keyof typeof annotation; label: string; ph: string }[]).map(f => (
                        <div key={f.k} className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-600">{f.label}</label>
                          <textarea
                            rows={2}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                            placeholder={f.ph}
                            value={(annotation[f.k] as string) ?? ''}
                            onChange={e => updateDeviationAnnotation(dev, { [f.k]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={transferred.has(key)}
                        onClick={() => transferToBacklog(`Abweichung: ${dev.slice(0, 60)}`, dev, key)}
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
                        onClick={() => saveAsEvidence(dev, key)}
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
              {hotspotIssues.map((issue, i) => {
                const key = `hotspot-${i}`;
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
                      ] as { k: keyof typeof annotation; label: string; ph: string }[]).map(f => (
                        <div key={f.k} className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-600">{f.label}</label>
                          <textarea
                            rows={2}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                            placeholder={f.ph}
                            value={(annotation[f.k] as string) ?? ''}
                            onChange={e => updateHotspotAnnotation(issue.title, { [f.k]: e.target.value })}
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
        <textarea
          rows={8}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y font-mono"
          placeholder="Schreibe hier eine Management-Zusammenfassung der Mining-Ergebnisse, oder klicke auf 'Zusammenfassung generieren' für einen automatischen Entwurf."
          value={summary}
          onChange={e => setSummary(e.target.value)}
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
