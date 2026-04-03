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
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <div className="flex flex-wrap gap-2">
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
      </div>
      {items.some(item => item.hint) && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {items.filter(item => item.hint).map(item => (
            <span key={`${item.id}-hint`}>
              <span className="font-medium text-slate-600">{item.label}:</span> {item.hint}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
