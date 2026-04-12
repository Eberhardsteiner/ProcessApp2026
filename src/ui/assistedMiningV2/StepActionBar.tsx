import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface StepActionBarProps {
  summary: ReactNode;
  summaryTitle?: string;
  statusBadge?: ReactNode;
  backLabel?: string;
  nextLabel: string;
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextIcon?: ReactNode;
}

export function StepActionBar({
  summary,
  summaryTitle = 'Nächster sinnvoller Schritt',
  statusBadge,
  backLabel = 'Zurück',
  nextLabel,
  onBack,
  onNext,
  nextDisabled = false,
  nextIcon,
}: StepActionBarProps) {
  return (
    <div className="sticky bottom-3 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-md backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2 lg:max-w-[70%]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{summaryTitle}</p>
            {statusBadge}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-700">
            {summary}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {nextLabel}
            {nextIcon ?? <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
