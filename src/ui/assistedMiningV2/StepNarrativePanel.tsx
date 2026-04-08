import { Lightbulb, AlertTriangle } from 'lucide-react';
import type { StepNarrative } from './stepNarratives';

interface Props {
  title: string;
  narrative: StepNarrative;
}

export function StepNarrativePanel({ title, narrative }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2 text-slate-700">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-slate-900">{narrative.headline}</p>
        <p className="text-sm leading-relaxed text-slate-600">{narrative.summary}</p>
      </div>

      {narrative.bullets.length > 0 && (
        <ul className="space-y-2">
          {narrative.bullets.map((bullet, index) => (
            <li key={index} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {narrative.caution && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{narrative.caution}</p>
        </div>
      )}
    </div>
  );
}
