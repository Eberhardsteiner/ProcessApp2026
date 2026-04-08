import { AlertTriangle, ArrowLeftRight, Plus, Minus, RefreshCw } from 'lucide-react';
import type { ProcessMiningAnalysisMode } from '../../domain/process';
import type { V2Deviation, DeviationType } from './conformance';
import { canUseStrongPercentages } from './pmShared';

const TYPE_CONFIG: Record<
  DeviationType,
  { icon: React.ReactNode; color: string; label: string }
> = {
  missing_step: {
    icon: <Minus className="w-3.5 h-3.5" />,
    color: 'text-red-700 bg-red-100 border-red-200',
    label: 'Fehlender Schritt',
  },
  extra_step: {
    icon: <Plus className="w-3.5 h-3.5" />,
    color: 'text-amber-700 bg-amber-100 border-amber-200',
    label: 'Zusätzlicher Schritt',
  },
  order_change: {
    icon: <ArrowLeftRight className="w-3.5 h-3.5" />,
    color: 'text-blue-700 bg-blue-100 border-blue-200',
    label: 'Reihenfolge geändert',
  },
  loop: {
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    color: 'text-orange-700 bg-orange-100 border-orange-200',
    label: 'Wiederholung',
  },
};

interface Props {
  deviation: V2Deviation;
  rank: number;
  totalCases: number;
  analysisMode?: ProcessMiningAnalysisMode;
}

export function DeviationCard({ deviation, rank, totalCases, analysisMode = 'exploratory-mining' }: Props) {
  const config = TYPE_CONFIG[deviation.type];
  const scopeLabel = totalCases <= 1
    ? `${deviation.count} Fall`
    : canUseStrongPercentages(analysisMode, totalCases)
    ? `${deviation.pct} % der Fälle (${deviation.count})`
    : `${deviation.count} von ${totalCases} Fällen`;

  return (
    <div className={`flex gap-3 border rounded-xl px-4 py-3 ${config.color}`}>
      <div className="mt-0.5 shrink-0">{config.icon}</div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">
            {rank}. {config.label}
          </span>
          <span className="text-xs font-semibold">{scopeLabel}</span>
        </div>
        <p className="text-sm leading-relaxed">{deviation.description}</p>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  hasTarget: boolean;
}

export function NoDeviationsMessage({ hasTarget }: EmptyStateProps) {
  if (!hasTarget) {
    return (
      <div className="flex gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        <p>
          Kein Soll-Prozess vorhanden. Legen Sie einen Happy Path im Prozesserfassungsbereich an,
          oder kehren Sie zu Schritt 2 zurück. Der dort erkannte Kernprozess wird dann als Vergleich genutzt.
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <p>Keine Abweichungen erkannt. In dieser Sicht zeigt sich aktuell kein dominanter Unterschied zum Soll-Prozess.</p>
    </div>
  );
}
