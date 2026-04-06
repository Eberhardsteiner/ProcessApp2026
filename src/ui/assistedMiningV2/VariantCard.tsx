import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { useState } from 'react';
import type { V2Variant } from './discovery';

interface Props {
  variant: V2Variant;
  rank: number;
}

export function VariantCard({ variant, rank }: Props) {
  const [expanded, setExpanded] = useState(variant.isCore);

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-shadow ${
        variant.isCore
          ? 'border-blue-300 bg-blue-50 shadow-sm'
          : 'border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="shrink-0">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </span>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {variant.isCore && (
            <Star className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          )}
          <span className={`font-semibold text-sm ${variant.isCore ? 'text-blue-800' : 'text-slate-700'}`}>
            {variant.isCore ? 'Kernprozess' : `Variante ${rank}`}
          </span>
          <span className="text-xs text-slate-500">
            {variant.steps.length} Schritte
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <div
              className={`h-2 rounded-full ${variant.isCore ? 'bg-blue-500' : 'bg-slate-400'}`}
              style={{ width: `${Math.max(variant.share * 0.8, 4)}px`, maxWidth: '80px', minWidth: '4px' }}
            />
            <span className={`text-sm font-bold ${variant.isCore ? 'text-blue-700' : 'text-slate-600'}`}>
              {variant.share} %
            </span>
          </div>
          <span className="text-xs text-slate-400">
            {variant.caseCount} {variant.caseCount === 1 ? 'Fall' : 'Fälle'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          <ol className="space-y-1">
            {variant.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    variant.isCore
                      ? 'bg-blue-200 text-blue-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-sm text-slate-700 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
