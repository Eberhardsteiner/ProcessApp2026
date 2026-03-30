import { type ReactNode } from 'react';
import { InfoPopover } from './InfoPopover';
import { HELP_TEXTS, type HelpKey } from '../help/helpTexts';

interface FieldLabelProps {
  label: string;
  info?: {
    title?: string;
    content: ReactNode;
  };
  helpKey?: HelpKey;
  htmlFor?: string;
}

function renderHelpBody(body: string) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="space-y-2">
      {lines.map((line, idx) => (
        <p key={idx}>{line}</p>
      ))}
    </div>
  );
}

export function FieldLabel({ label, info, helpKey, htmlFor }: FieldLabelProps) {
  const resolvedInfo = info
    ? info
    : helpKey
      ? { title: HELP_TEXTS[helpKey].title, content: renderHelpBody(HELP_TEXTS[helpKey].body) }
      : null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {resolvedInfo && (
        <InfoPopover title={resolvedInfo.title}>
          {resolvedInfo.content}
        </InfoPopover>
      )}
    </div>
  );
}
