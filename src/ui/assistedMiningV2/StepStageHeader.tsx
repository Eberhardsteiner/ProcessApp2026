import type { ReactNode } from 'react';
import { HelpPopover } from '../components/HelpPopover';
import type { HelpKey } from '../help/helpTexts';

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

const TONE_CLASSES: Record<StepStageTone, { shell: string; eyebrow: string; title: string; text: string; footer: string }> = {
  blue: {
    shell: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white',
    eyebrow: 'border-blue-200 bg-white text-blue-700',
    title: 'text-slate-900',
    text: 'text-slate-700',
    footer: 'text-blue-800/80',
  },
  cyan: {
    shell: 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-white',
    eyebrow: 'border-cyan-200 bg-white text-cyan-800',
    title: 'text-slate-900',
    text: 'text-slate-700',
    footer: 'text-cyan-900/80',
  },
  emerald: {
    shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white',
    eyebrow: 'border-emerald-200 bg-white text-emerald-800',
    title: 'text-slate-900',
    text: 'text-slate-700',
    footer: 'text-emerald-900/80',
  },
  amber: {
    shell: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
    eyebrow: 'border-amber-200 bg-white text-amber-800',
    title: 'text-slate-900',
    text: 'text-slate-700',
    footer: 'text-amber-900/80',
  },
  violet: {
    shell: 'border-violet-200 bg-gradient-to-br from-violet-50 to-white',
    eyebrow: 'border-violet-200 bg-white text-violet-800',
    title: 'text-slate-900',
    text: 'text-slate-700',
    footer: 'text-violet-900/80',
  },
  slate: {
    shell: 'border-slate-200 bg-gradient-to-br from-slate-50 to-white',
    eyebrow: 'border-slate-200 bg-white text-slate-700',
    title: 'text-slate-900',
    text: 'text-slate-700',
    footer: 'text-slate-700/80',
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
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClasses.shell}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${toneClasses.eyebrow}`}>
              {eyebrow}
            </span>
            {helpKey && <HelpPopover helpKey={helpKey} ariaLabel={`Hilfe: ${title}`} />}
          </div>
          <div className="space-y-2">
            <h3 className={`text-lg font-semibold leading-tight ${toneClasses.title}`}>{title}</h3>
            <p className={`max-w-3xl text-sm leading-relaxed ${toneClasses.text}`}>{description}</p>
          </div>
          {footer && <div className={`text-xs leading-relaxed ${toneClasses.footer}`}>{footer}</div>}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
      </div>
      {badges ? <div className="mt-4 flex flex-wrap gap-2">{badges}</div> : null}
    </div>
  );
}
