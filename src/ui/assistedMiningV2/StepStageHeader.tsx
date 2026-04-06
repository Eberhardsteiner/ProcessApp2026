import type { ReactNode } from 'react';
import type { HelpKey } from '../help/helpTexts';
import { HelpPopover } from '../components/HelpPopover';

type StepStageTone = 'blue' | 'cyan' | 'emerald' | 'amber' | 'violet' | 'slate';

interface StepStageHeaderProps {
  title: string;
  description: string;
  helpKey?: HelpKey;
  tone?: StepStageTone;
  eyebrow?: string;
  actions?: ReactNode;
  badges?: ReactNode;
  footer?: ReactNode;
}

const TONE_CLASSES: Record<StepStageTone, { shell: string; eyebrow: string; title: string; text: string }> = {
  blue: {
    shell: 'border-blue-200 bg-blue-50',
    eyebrow: 'bg-white/80 text-blue-700 border-blue-200',
    title: 'text-slate-900',
    text: 'text-slate-700',
  },
  cyan: {
    shell: 'border-cyan-200 bg-cyan-50',
    eyebrow: 'bg-white/80 text-cyan-800 border-cyan-200',
    title: 'text-slate-900',
    text: 'text-slate-700',
  },
  emerald: {
    shell: 'border-emerald-200 bg-emerald-50',
    eyebrow: 'bg-white/80 text-emerald-800 border-emerald-200',
    title: 'text-slate-900',
    text: 'text-slate-700',
  },
  amber: {
    shell: 'border-amber-200 bg-amber-50',
    eyebrow: 'bg-white/80 text-amber-800 border-amber-200',
    title: 'text-slate-900',
    text: 'text-slate-700',
  },
  violet: {
    shell: 'border-violet-200 bg-violet-50',
    eyebrow: 'bg-white/80 text-violet-800 border-violet-200',
    title: 'text-slate-900',
    text: 'text-slate-700',
  },
  slate: {
    shell: 'border-slate-200 bg-slate-50',
    eyebrow: 'bg-white/80 text-slate-700 border-slate-200',
    title: 'text-slate-900',
    text: 'text-slate-700',
  },
};

export function StepStageHeader({
  title,
  description,
  helpKey,
  tone = 'blue',
  eyebrow = 'Worum es in diesem Schritt geht',
  actions,
  badges,
  footer,
}: StepStageHeaderProps) {
  const toneClasses = TONE_CLASSES[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClasses.shell}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${toneClasses.eyebrow}`}>
              {eyebrow}
            </span>
            {helpKey && <HelpPopover helpKey={helpKey} ariaLabel={`Hilfe: ${title}`} />}
          </div>
          <div className="space-y-1.5">
            <h3 className={`text-base font-semibold ${toneClasses.title}`}>{title}</h3>
            <p className={`text-sm leading-relaxed ${toneClasses.text}`}>{description}</p>
          </div>
          {footer && <div className="text-xs leading-relaxed text-slate-600">{footer}</div>}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {badges ? <div className="mt-4 flex flex-wrap gap-2">{badges}</div> : null}
    </div>
  );
}
