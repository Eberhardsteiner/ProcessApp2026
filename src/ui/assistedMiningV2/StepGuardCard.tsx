import { ArrowLeft, ArrowRight, Info } from 'lucide-react';

interface Props {
  title: string;
  body: string;
  nextLabel: string;
  onBack: () => void;
}

export function StepGuardCard({ title, body, nextLabel, onBack }: Props) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
      <div className="flex gap-3">
        <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="text-sm leading-relaxed text-amber-900/90">{body}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </button>
        <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-100/70 px-3.5 py-2 text-sm text-amber-900">
          <ArrowRight className="h-4 w-4" />
          {nextLabel}
        </div>
      </div>
    </div>
  );
}
