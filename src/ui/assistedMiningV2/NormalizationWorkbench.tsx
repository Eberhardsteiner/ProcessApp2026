import { useEffect, useState } from 'react';
import { CheckCircle2, Monitor, Sparkles, User, Wrench } from 'lucide-react';
import type { ReviewNormalizationGroup } from './reviewNormalization';

interface Props {
  groups: ReviewNormalizationGroup[];
  onApply: (group: ReviewNormalizationGroup, preferredValue: string) => void;
}

function GroupIcon({ kind }: { kind: ReviewNormalizationGroup['kind'] }) {
  if (kind === 'step') return <Sparkles className="h-4 w-4 text-violet-500" />;
  if (kind === 'role') return <User className="h-4 w-4 text-blue-500" />;
  return <Monitor className="h-4 w-4 text-emerald-500" />;
}

export function NormalizationWorkbench({ groups, onApply }: Props) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraftValues(current => {
      const next = { ...current };
      groups.forEach(group => {
        if (!next[group.id]) next[group.id] = group.suggestedValue;
      });
      return next;
    });
  }, [groups]);

  if (groups.length === 0) {
    return (
      <div className="flex gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Begriffe, Rollen und Systeme wirken aktuell konsistent. Eine zusätzliche Vereinheitlichung ist im Moment nicht nötig.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">Begriffe, Rollen und Systeme vereinheitlichen</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          Diese Regeln gelten für den aktuellen Arbeitsstand und werden für spätere Ergänzungen in dieser Version mitgemerkt.
        </p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {groups.map(group => {
          const draftValue = draftValues[group.id] ?? group.suggestedValue;
          const affectedCount = group.variants.reduce((sum, variant) => sum + variant.count, 0);
          return (
            <div key={group.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <GroupIcon kind={group.kind} />
                    <p className="text-sm font-semibold text-slate-800">{group.label}</p>
                    {group.activeRule && (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800">
                        Regel aktiv
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">{group.note}</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {affectedCount} Treffer
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aktuelle Varianten</p>
                <div className="flex flex-wrap gap-2">
                  {group.variants.map(variant => (
                    <span key={variant.value} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                      {variant.value} · {variant.count}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bevorzugte Bezeichnung</label>
                <input
                  type="text"
                  value={draftValue}
                  onChange={event => setDraftValues(current => ({ ...current, [group.id]: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <p className="text-[11px] text-slate-400">
                  Die Regel wird sofort angewendet und für neue Ergänzungen in dieser Version gemerkt.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onApply(group, draftValue)}
                disabled={!draftValue.trim()}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Wrench className="h-4 w-4" />
                Vereinheitlichen und merken
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
