import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Route } from 'lucide-react';
import type { ReactNode } from 'react';

export type QuickJumpItem = {
  id: string;
  label: string;
  hint?: string;
  badge?: ReactNode;
  onClick: () => void;
};

interface StepQuickJumpBarProps {
  title?: string;
  items: QuickJumpItem[];
}

export function StepQuickJumpBar({ title = 'Schnellzugriff', items }: StepQuickJumpBarProps) {
  const [showHints, setShowHints] = useState(false);
  const hintItems = useMemo(() => items.filter(item => item.hint), [items]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-slate-700">
            <Route className="h-4 w-4 text-slate-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Der Hauptpfad bleibt sichtbar. Zusätzliche Hinweise können Sie nur bei Bedarf einblenden.
          </p>
        </div>
        {hintItems.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHints(current => !current)}
            className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            {showHints ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {showHints ? 'Hinweise ausblenden' : 'Hinweise einblenden'}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <span>{item.label}</span>
            {item.badge}
          </button>
        ))}
      </div>

      {showHints && hintItems.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {hintItems.map(item => (
            <div key={`${item.id}-hint`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
              <span className="font-medium text-slate-700">{item.label}:</span> {item.hint}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
