import { History } from 'lucide-react';
import type { ProcessMiningRepairJournalEntry } from '../../domain/process';

interface Props {
  entries: ProcessMiningRepairJournalEntry[];
}

function formatTimestamp(value: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function RepairJournalPanel({ entries }: Props) {
  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-slate-500" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Letzte Reparaturen</p>
          <p className="text-xs text-slate-500">Damit bleibt sichtbar, welche lokalen Korrekturen bereits vorgenommen wurden.</p>
        </div>
      </div>
      <div className="space-y-2">
        {entries.slice(0, 6).map(entry => (
          <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">{entry.title}</p>
              <span className="text-[11px] text-slate-400">{formatTimestamp(entry.createdAt)}</span>
            </div>
            {entry.detail && <p className="mt-1 text-xs leading-relaxed text-slate-500">{entry.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
