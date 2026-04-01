import { ArrowRightCircle, Lightbulb } from 'lucide-react';

interface Props {
  insight: string;
  nextAction: string;
  tone?: 'blue' | 'green' | 'amber' | 'violet';
}

const TONE = {
  blue: 'bg-blue-50 border-blue-200',
  green: 'bg-green-50 border-green-200',
  amber: 'bg-amber-50 border-amber-200',
  violet: 'bg-violet-50 border-violet-200',
} as const;

export function StepInsightPanel({ insight, nextAction, tone = 'blue' }: Props) {
  return (
    <div className={`rounded-xl border p-4 ${TONE[tone]}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-slate-800">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold">Wichtigste Aussage</p>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{insight}</p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-slate-800">
            <ArrowRightCircle className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-semibold">Was jetzt sinnvoll ist</p>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{nextAction}</p>
        </div>
      </div>
    </div>
  );
}
