import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { HelpPopover } from './HelpPopover';
import type { HelpKey } from '../help/helpTexts';

interface CollapsibleCardProps {
  title: string;
  helpKey?: HelpKey;
  description?: string;
  defaultOpen?: boolean;
  right?: ReactNode;
  children: ReactNode;
}

export function CollapsibleCard({
  title,
  helpKey,
  description,
  defaultOpen = false,
  right,
  children,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="pm-card pm-card-pad">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="inline-flex items-center gap-2 text-base font-semibold text-slate-900 hover:text-slate-700 transition-colors"
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            {title}
          </button>
          {helpKey && <HelpPopover helpKey={helpKey} ariaLabel={`Hilfe: ${title}`} />}
        </div>
        {right && <div className="ml-auto">{right}</div>}
      </div>

      {description && !isOpen && (
        <p className="text-xs text-slate-500 mb-0">
          {description}
        </p>
      )}

      {isOpen && <div className="space-y-4">{children}</div>}
    </div>
  );
}
