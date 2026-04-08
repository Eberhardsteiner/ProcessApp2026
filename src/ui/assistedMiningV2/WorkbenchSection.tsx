import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { HelpPopover } from '../components/HelpPopover';
import type { HelpKey } from '../help/helpTexts';

interface WorkbenchSectionProps {
  title: string;
  description?: string;
  helpKey?: HelpKey;
  badge?: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}

export function WorkbenchSection({
  title,
  description,
  helpKey,
  badge,
  actions,
  collapsible = false,
  open = true,
  onToggle,
  children,
  bodyClassName = '',
  className = '',
}: WorkbenchSectionProps) {
  const contentVisible = !collapsible || open;

  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`.trim()}>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {collapsible && onToggle ? (
              <button
                type="button"
                onClick={onToggle}
                className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 text-left text-slate-900 transition-colors hover:bg-slate-50"
              >
                {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="text-sm font-semibold">{title}</span>
              </button>
            ) : (
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            )}
            {helpKey && <HelpPopover helpKey={helpKey} ariaLabel={`Hilfe: ${title}`} />}
          </div>
          {description ? <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p> : null}
        </div>
        {(badge || actions) && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {badge}
            {actions}
          </div>
        )}
      </div>
      {contentVisible && <div className={`px-4 py-4 sm:px-5 ${bodyClassName}`.trim()}>{children}</div>}
    </section>
  );
}
