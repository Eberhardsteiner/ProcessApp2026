import { InfoPopover } from './InfoPopover';
import { HELP_TEXTS, type HelpKey } from '../help/helpTexts';

interface HelpPopoverProps {
  helpKey: HelpKey;
  ariaLabel?: string;
}

function renderBody(body: string) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="space-y-2">
      {lines.map((line, idx) => (
        <p key={idx}>{line}</p>
      ))}
    </div>
  );
}

export function HelpPopover({ helpKey, ariaLabel }: HelpPopoverProps) {
  const ht = HELP_TEXTS[helpKey];
  return (
    <InfoPopover title={ht.title} ariaLabel={ariaLabel ?? ht.title}>
      {renderBody(ht.body)}
    </InfoPopover>
  );
}
