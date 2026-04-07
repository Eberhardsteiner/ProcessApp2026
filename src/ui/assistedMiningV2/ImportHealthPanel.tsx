import { AlertTriangle, CheckCircle2, FileStack, FileWarning, ScanSearch } from 'lucide-react';
import type { ProcessMiningAssistedV2State } from '../../domain/process';
import { evaluateImportHealth } from './importHealth';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  state: ProcessMiningAssistedV2State;
}

function toneClasses(level: ReturnType<typeof evaluateImportHealth>['level']): {
  panel: string;
  icon: string;
  label: string;
} {
  if (level === 'stable') {
    return {
      panel: 'border-emerald-200 bg-emerald-50',
      icon: 'text-emerald-600',
      label: 'Import wirkt stabil',
    };
  }
  if (level === 'attention') {
    return {
      panel: 'border-amber-200 bg-amber-50',
      icon: 'text-amber-600',
      label: 'Import braucht kurze Prüfung',
    };
  }
  return {
    panel: 'border-rose-200 bg-rose-50',
    icon: 'text-rose-600',
    label: 'Importbasis noch zu schwach',
  };
}

export function ImportHealthPanel({ state }: Props) {
  const summary = evaluateImportHealth(state);
  const tone = toneClasses(summary.level);
  const StatusIcon = summary.level === 'stable' ? CheckCircle2 : AlertTriangle;

  return (
    <div className={`rounded-2xl border p-5 shadow-sm space-y-4 ${tone.panel}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-slate-900">
            <StatusIcon className={`w-4 h-4 ${tone.icon}`} />
            <h3 className="text-sm font-semibold">Import-Gesundheit</h3>
            <HelpPopover helpKey="pmv2.importHealth" ariaLabel="Hilfe: Import-Gesundheit" />
            <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
              {tone.label}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-900">{summary.headline}</p>
          <p className="text-sm leading-relaxed text-slate-700">{summary.summary}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 min-w-[220px]">
          {[
            ['Dokumente', summary.sourceMix.documents],
            ['Freitexte', summary.sourceMix.narratives],
            ['Tabellen', summary.sourceMix.tables],
            ['Eventdaten', summary.sourceMix.eventLogs],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-white/80 bg-white/80 p-3">
              <p className="text-[11px] text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-xl border border-white/80 bg-white/80 p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-800">
            <FileStack className="w-4 h-4 text-cyan-600" />
            <p className="text-sm font-semibold">Tragfähige Quellen</p>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">
            {summary.sourcesWithSteps} von {summary.sourceCount} Quellen liefern aktuell verwertbare Prozessschritte.
          </p>
          {summary.sourcesWithoutSteps.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
              {summary.sourcesWithoutSteps.slice(0, 4).map(item => (
                <li key={item.id}>{item.label} ({item.sourceType})</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/80 bg-white/80 p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-800">
            <FileWarning className="w-4 h-4 text-violet-600" />
            <p className="text-sm font-semibold">Beleg- und Zeitbasis</p>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{summary.realTimeCoverageLabel}</p>
          {summary.sourcesWithWeakEvidence.length > 0 && (
            <p className="text-xs text-slate-600 leading-relaxed">
              Belegstellen noch schwach bei: {summary.sourcesWithWeakEvidence.slice(0, 3).map(item => item.label).join(', ')}
              {summary.sourcesWithWeakEvidence.length > 3 ? ' …' : ''}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-white/80 bg-white/80 p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-800">
            <ScanSearch className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold">Nächste sinnvolle Schritte</p>
          </div>
          {summary.recommendedActions.length > 0 ? (
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
              {summary.recommendedActions.map(action => <li key={action}>{action}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-slate-700 leading-relaxed">
              Die Importbasis wirkt bereits stabil. Weitere Quellen sind optional und dienen vor allem der Vertiefung.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
