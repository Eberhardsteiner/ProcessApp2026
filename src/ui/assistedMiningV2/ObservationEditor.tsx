import { useMemo, useState } from 'react';
import {
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronRight,
  Merge,
  Clock,
  User,
  Monitor,
  Plus,
  Sparkles,
  AlertTriangle,
  Scissors,
} from 'lucide-react';
import type { ProcessMiningObservation } from '../../domain/process';
import { OBSERVATION_KINDS } from './types';
import {
  applyCanonicalLabelSuggestions,
  applyIssueReclassificationSuggestions,
  applySplitSuggestions,
  getCanonicalLabelSuggestion,
  getSplitSuggestion,
  insertManualStep,
  shouldSuggestIssueReclassification,
} from './reviewSuggestions';

const TIMESTAMP_QUALITY_LABELS: Record<string, { label: string; color: string }> = {
  real: { label: 'Echte Zeit', color: 'text-green-700 bg-green-100' },
  synthetic: { label: 'Relative Zeit', color: 'text-amber-700 bg-amber-100' },
  missing: { label: 'Keine Zeitangabe', color: 'text-slate-500 bg-slate-100' },
};

interface ObservationRowProps {
  obs: ProcessMiningObservation;
  index: number;
  total: number;
  onUpdate: (updated: ProcessMiningObservation) => void;
  onDelete: () => void;
  onMergeWithNext: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertAfter: () => void;
  onApplyRename: () => void;
  onApplySplit: () => void;
  onMarkIssue: () => void;
  canonicalSuggestion: string | null;
  splitSuggestion: string[] | null;
  issueSuggestion: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
}

function ObservationRow({
  obs,
  index,
  total,
  onUpdate,
  onDelete,
  onMergeWithNext,
  onMoveUp,
  onMoveDown,
  onInsertAfter,
  onApplyRename,
  onApplySplit,
  onMarkIssue,
  canonicalSuggestion,
  splitSuggestion,
  issueSuggestion,
  dragHandleProps,
}: ObservationRowProps) {
  const [expanded, setExpanded] = useState(false);
  const tq = TIMESTAMP_QUALITY_LABELS[obs.timestampQuality] ?? TIMESTAMP_QUALITY_LABELS.missing;

  function updateField<K extends keyof ProcessMiningObservation>(field: K, value: ProcessMiningObservation[K]) {
    onUpdate({ ...obs, [field]: value });
  }

  const hasSuggestion = Boolean(canonicalSuggestion || splitSuggestion || issueSuggestion);

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-2">
        <span
          {...dragHandleProps}
          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none shrink-0"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </span>

        <span className="text-xs text-slate-400 font-mono w-5 shrink-0 text-center">{index + 1}</span>

        <input
          type="text"
          className="flex-1 text-sm text-slate-800 bg-transparent border-0 focus:outline-none focus:bg-slate-50 focus:border focus:border-blue-300 rounded px-1 py-0.5 min-w-0"
          value={obs.label}
          onChange={event => updateField('label', event.target.value)}
          placeholder="Schritt benennen…"
        />

        <div className="flex items-center gap-1 shrink-0">
          <select
            value={obs.kind}
            onChange={event => updateField('kind', event.target.value as ProcessMiningObservation['kind'])}
            className="text-[10px] border border-slate-200 rounded px-1 py-0.5 text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          >
            {OBSERVATION_KINDS.map(kind => (
              <option key={kind.value} value={kind.value}>{kind.label}</option>
            ))}
          </select>

          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tq.color}`}>
            {obs.timestampRaw ? obs.timestampRaw : tq.label}
          </span>

          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            className="text-slate-300 hover:text-slate-600 transition-colors"
            title="Details"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onInsertAfter}
            className="text-slate-300 hover:text-blue-600 transition-colors"
            title="Neuen Schritt darunter einfügen"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={index === 0}
              className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors text-xs px-0.5"
              title="Nach oben"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors text-xs px-0.5"
              title="Nach unten"
            >
              ↓
            </button>
          </div>

          {index < total - 1 && (
            <button
              type="button"
              onClick={onMergeWithNext}
              className="text-slate-300 hover:text-blue-500 transition-colors"
              title="Mit nächstem Schritt zusammenführen"
            >
              <Merge className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onDelete}
            className="text-slate-300 hover:text-red-500 transition-colors"
            title="Löschen"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {hasSuggestion && (
        <div className="px-3 pb-3 pt-0 space-y-2">
          {canonicalSuggestion && (
            <div className="flex items-start justify-between gap-3 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-xs text-violet-900">
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Bezeichnung vereinheitlichen</p>
                <p className="mt-1 leading-relaxed">Vorschlag: <span className="font-medium">{canonicalSuggestion}</span></p>
              </div>
              <button type="button" onClick={onApplyRename} className="px-2 py-1 bg-white border border-violet-200 rounded-md text-violet-800 font-medium hover:bg-violet-100 transition-colors">
                Übernehmen
              </button>
            </div>
          )}
          {splitSuggestion && splitSuggestion.length > 0 && (
            <div className="flex items-start justify-between gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900">
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-1.5"><Scissors className="w-3.5 h-3.5" /> Sammelschritt aufteilen</p>
                <p className="mt-1 leading-relaxed">Vorgeschlagene Teilstücke: {splitSuggestion.join(' · ')}</p>
              </div>
              <button type="button" onClick={onApplySplit} className="px-2 py-1 bg-white border border-blue-200 rounded-md text-blue-800 font-medium hover:bg-blue-100 transition-colors">
                Aufteilen
              </button>
            </div>
          )}
          {issueSuggestion && (
            <div className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Eher Problem als Prozessschritt</p>
                <p className="mt-1 leading-relaxed">Dieser Eintrag beschreibt vermutlich ein Reibungssignal. Das verbessert Hotspot-Erkennung und hält den Ablauf sauber.</p>
              </div>
              <button type="button" onClick={onMarkIssue} className="px-2 py-1 bg-white border border-amber-200 rounded-md text-amber-800 font-medium hover:bg-amber-100 transition-colors">
                Umstellen
              </button>
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-100 bg-slate-50 space-y-2 text-xs">
          {obs.evidenceSnippet && (
            <div className="space-y-0.5">
              <p className="font-medium text-slate-500">Belegstelle</p>
              <p className="text-slate-600 italic bg-white border border-slate-200 rounded px-2 py-1">
                {obs.evidenceSnippet}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <label className="flex items-center gap-1 font-medium text-slate-500">
                <User className="w-3 h-3" /> Rolle (optional)
              </label>
              <input
                type="text"
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                placeholder="z.B. Sachbearbeitung"
                value={obs.role ?? ''}
                onChange={event => updateField('role', event.target.value || undefined)}
              />
            </div>
            <div className="space-y-0.5">
              <label className="flex items-center gap-1 font-medium text-slate-500">
                <Monitor className="w-3 h-3" /> System (optional)
              </label>
              <input
                type="text"
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                placeholder="z.B. CRM, ERP, E-Mail"
                value={obs.system ?? ''}
                onChange={event => updateField('system', event.target.value || undefined)}
              />
            </div>
          </div>
          {obs.timestampRaw && (
            <div className="flex items-center gap-1 text-slate-500">
              <Clock className="w-3 h-3" />
              <span>Erkannte Zeit: <span className="font-medium text-slate-700">{obs.timestampRaw}</span></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  observations: ProcessMiningObservation[];
  onUpdate: (observations: ProcessMiningObservation[]) => void;
  caseId: string;
  caseName: string;
}

export function ObservationEditor({ observations, onUpdate, caseId, caseName }: Props) {
  const caseObs = useMemo(
    () => observations.filter(observation => observation.sourceCaseId === caseId).sort((a, b) => a.sequenceIndex - b.sequenceIndex),
    [observations, caseId],
  );
  const otherObs = useMemo(
    () => observations.filter(observation => observation.sourceCaseId !== caseId),
    [observations, caseId],
  );

  const renameTargets = useMemo(
    () => caseObs.filter(observation => Boolean(getCanonicalLabelSuggestion(observation))).map(observation => observation.id),
    [caseObs],
  );
  const splitTargets = useMemo(
    () => caseObs.filter(observation => Boolean(getSplitSuggestion(observation, true))).map(observation => observation.id),
    [caseObs],
  );
  const issueTargets = useMemo(
    () => caseObs.filter(observation => shouldSuggestIssueReclassification(observation)).map(observation => observation.id),
    [caseObs],
  );

  function replaceCase(updated: ProcessMiningObservation[]) {
    const reindexed = updated.map((observation, index) => ({ ...observation, sequenceIndex: index, sourceCaseId: caseId }));
    onUpdate([...otherObs, ...reindexed]);
  }

  function handleUpdate(index: number, updated: ProcessMiningObservation) {
    const copy = [...caseObs];
    copy[index] = updated;
    replaceCase(copy);
  }

  function handleDelete(index: number) {
    replaceCase(caseObs.filter((_, candidateIndex) => candidateIndex !== index));
  }

  function handleMergeWithNext(index: number) {
    if (index >= caseObs.length - 1) return;
    const current = caseObs[index];
    const next = caseObs[index + 1];
    const merged: ProcessMiningObservation = {
      ...current,
      label: `${current.label} / ${next.label}`,
      evidenceSnippet: [current.evidenceSnippet, next.evidenceSnippet].filter(Boolean).join(' '),
      timestampQuality:
        current.timestampQuality === 'real' || next.timestampQuality === 'real'
          ? 'real'
          : current.timestampQuality === 'synthetic' || next.timestampQuality === 'synthetic'
          ? 'synthetic'
          : 'missing',
      timestampRaw: current.timestampRaw ?? next.timestampRaw,
      timestampIso: current.timestampIso ?? next.timestampIso,
    };
    replaceCase([
      ...caseObs.slice(0, index),
      merged,
      ...caseObs.slice(index + 2),
    ]);
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const copy = [...caseObs];
    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
    replaceCase(copy);
  }

  function handleMoveDown(index: number) {
    if (index >= caseObs.length - 1) return;
    const copy = [...caseObs];
    [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
    replaceCase(copy);
  }

  function handleInsertAfter(index?: number) {
    onUpdate(insertManualStep(observations, { caseId, afterIndex: index, label: 'Neuer Prozessschritt' }));
  }

  function applyRenameTargets(targetIds?: string[]) {
    const result = applyCanonicalLabelSuggestions(observations, targetIds);
    if (result.changedCount > 0) onUpdate(result.observations);
  }

  function applySplitTargets(targetIds?: string[]) {
    const result = applySplitSuggestions(observations, targetIds);
    if (result.changedCount > 0) onUpdate(result.observations);
  }

  function applyIssueTargets(targetIds?: string[]) {
    const result = applyIssueReclassificationSuggestions(observations, targetIds);
    if (result.changedCount > 0) onUpdate(result.observations);
  }

  if (caseObs.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Erkannte Schritte aus „{caseName}“
          </p>
          <p className="text-sm text-slate-600 mt-1">
            {caseObs.length} Schritte. Hier können Sie Reihenfolge, Bezeichnungen und Problemhinweise schnell nachschärfen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleInsertAfter(caseObs.length - 1)}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Schritt ergänzen
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => applyRenameTargets(renameTargets)}
          disabled={renameTargets.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          {renameTargets.length === 0 ? 'Namen wirken konsistent' : `${renameTargets.length} Namen vereinheitlichen`}
        </button>
        <button
          type="button"
          onClick={() => applySplitTargets(splitTargets)}
          disabled={splitTargets.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Scissors className="w-4 h-4" />
          {splitTargets.length === 0 ? 'Keine Sammelschritte erkannt' : `${splitTargets.length} Sammelschritte aufteilen`}
        </button>
        <button
          type="button"
          onClick={() => applyIssueTargets(issueTargets)}
          disabled={issueTargets.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <AlertTriangle className="w-4 h-4" />
          {issueTargets.length === 0 ? 'Keine Problemhinweise erkannt' : `${issueTargets.length} als Reibungssignal führen`}
        </button>
      </div>

      <div className="space-y-1.5">
        {caseObs.map((observation, index) => {
          const canonicalSuggestion = getCanonicalLabelSuggestion(observation);
          const splitSuggestion = getSplitSuggestion(observation, true);
          const issueSuggestion = shouldSuggestIssueReclassification(observation);
          return (
            <ObservationRow
              key={observation.id}
              obs={observation}
              index={index}
              total={caseObs.length}
              onUpdate={updated => handleUpdate(index, updated)}
              onDelete={() => handleDelete(index)}
              onMergeWithNext={() => handleMergeWithNext(index)}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              onInsertAfter={() => handleInsertAfter(index)}
              onApplyRename={() => applyRenameTargets([observation.id])}
              onApplySplit={() => applySplitTargets([observation.id])}
              onMarkIssue={() => applyIssueTargets([observation.id])}
              canonicalSuggestion={canonicalSuggestion}
              splitSuggestion={splitSuggestion}
              issueSuggestion={issueSuggestion}
            />
          );
        })}
      </div>
    </div>
  );
}
