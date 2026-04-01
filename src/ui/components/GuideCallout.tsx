import { Lightbulb } from 'lucide-react';

interface GuideCalloutProps {
  title: string;
  steps: string[];
  tip?: string;
}

export function GuideCallout({ title, steps, tip }: GuideCalloutProps) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
      <h4 className="text-sm font-semibold text-slate-900 mb-2">{title}</h4>
      <ol className="space-y-1 mb-3">
        {steps.map((step, idx) => (
          <li key={idx} className="text-sm text-slate-700 flex gap-2">
            <span className="font-medium text-slate-500">{idx + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {tip && (
        <div className="flex items-start gap-2 pt-2 border-t border-slate-200">
          <Lightbulb className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-600">{tip}</p>
        </div>
      )}
    </div>
  );
}
