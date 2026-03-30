import { useState } from 'react';
import {
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronRight,
  Merge,
  Clock,
  User,
  Monitor,
} from 'lucide-react';
import type { ProcessMiningObservation } from '../../domain/process';
import { OBSERVATION_KINDS } from './types';

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
  dragHandleProps,
}: ObservationRowProps) {
  const [expanded, setExpanded] = useState(false);
  const tq = TIMESTAMP_QUALITY_LABELS[obs.timestampQuality] ?? TIMESTAMP_QUALITY_LABELS.missing;

  function updateField<K extends keyof ProcessMiningObservation>(field: K, value: ProcessMiningObservation[K]) {
    onUpdate({ ...obs, [field]: value });
  }

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
          onChange={e => updateField('label', e.target.value)}
          placeholder="Schritt benennen…"
        />

        <div className="flex items-center gap-1 shrink-0">
          <select
            value={obs.kind}
            onChange={e => updateField('kind', e.target.value as ProcessMiningObservation['kind'])}
            className="text-[10px] border border-slate-200 rounded px-1 py-0.5 text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          >
            {OBSERVATION_KINDS.map(k => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>

          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tq.color}`}>
            {obs.timestampRaw ? obs.timestampRaw : tq.label}
          </span>

          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="text-slate-300 hover:text-slate-600 transition-colors"
            title="Details"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
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

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-100 bg-slate-50 space-y-2 text-xs">
          {obs.evidenceSnippet && (
            <div className="space-y-0.5">
              <p className="font-medium text-slate-500">Ursprungssatz:</p>
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
                placeholder="z.B. Sachbearbeiterin"
                value={obs.role ?? ''}
                onChange={e => updateField('role', e.target.value || undefined)}
              />
            </div>
            <div className="space-y-0.5">
              <label className="flex items-center gap-1 font-medium text-slate-500">
                <Monitor className="w-3 h-3" /> System (optional)
              </label>
              <input
                type="text"
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                placeholder="z.B. SAP, E-Mail"
                value={obs.system ?? ''}
                onChange={e => updateField('system', e.target.value || undefined)}
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
  const caseObs = observations.filter(o => o.sourceCaseId === caseId);
  const otherObs = observations.filter(o => o.sourceCaseId !== caseId);

  function replaceCase(updated: ProcessMiningObservation[]) {
    const reindexed = updated.map((o, i) => ({ ...o, sequenceIndex: i }));
    onUpdate([...otherObs, ...reindexed]);
  }

  function handleUpdate(index: number, updated: ProcessMiningObservation) {
    const copy = [...caseObs];
    copy[index] = updated;
    replaceCase(copy);
  }

  function handleDelete(index: number) {
    replaceCase(caseObs.filter((_, i) => i !== index));
  }

  function handleMergeWithNext(index: number) {
    if (index >= caseObs.length - 1) return;
    const a = caseObs[index];
    const b = caseObs[index + 1];
    const merged: ProcessMiningObservation = {
      ...a,
      label: `${a.label} / ${b.label}`,
      evidenceSnippet: [a.evidenceSnippet, b.evidenceSnippet].filter(Boolean).join(' '),
      timestampQuality:
        a.timestampQuality === 'real' || b.timestampQuality === 'real'
          ? 'real'
          : a.timestampQuality === 'synthetic' || b.timestampQuality === 'synthetic'
          ? 'synthetic'
          : 'missing',
      timestampRaw: a.timestampRaw ?? b.timestampRaw,
      timestampIso: a.timestampIso ?? b.timestampIso,
    };
    const updated = [
      ...caseObs.slice(0, index),
      merged,
      ...caseObs.slice(index + 2),
    ];
    replaceCase(updated);
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

  if (caseObs.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Erkannte Schritte aus „{caseName}" — {caseObs.length} Schritte
      </p>
      <div className="space-y-1.5">
        {caseObs.map((obs, i) => (
          <ObservationRow
            key={obs.id}
            obs={obs}
            index={i}
            total={caseObs.length}
            onUpdate={updated => handleUpdate(i, updated)}
            onDelete={() => handleDelete(i)}
            onMergeWithNext={() => handleMergeWithNext(i)}
            onMoveUp={() => handleMoveUp(i)}
            onMoveDown={() => handleMoveDown(i)}
          />
        ))}
      </div>
    </div>
  );
}
