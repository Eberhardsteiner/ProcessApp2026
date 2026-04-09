import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Eye, FileText, PlayCircle, RefreshCw } from 'lucide-react';
import type { DerivationSummary, ProcessMiningObservation, ProcessMiningObservationCase } from '../../domain/process';
import { buildReviewOverview } from './reviewSuggestions';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  lastDerivationSummary?: DerivationSummary;
  expandedCaseId?: string | null;
  onFocusCase: (caseId: string) => void;
  onReanalyzeCase: (caseId: string) => void;
}


function stateIssueCountFallback(summary?: DerivationSummary): number | undefined {
  return summary?.issueSignals?.length;
}

function getSourceLabel(sourceType?: ProcessMiningObservationCase['sourceType']): string {
  if (sourceType === 'pdf') return 'PDF';
  if (sourceType === 'docx') return 'DOCX';
  if (sourceType === 'csv-row') return 'CSV';
  if (sourceType === 'xlsx-row') return 'XLSX';
  if (sourceType === 'eventlog') return 'Ereignistabelle';
  return 'Freitext';
}

function getStatus(params: {
  stepCount: number;
  suggestionCount: number;
  hasText: boolean;
}): { label: string; tone: string; icon: ReactNode } {
  const { stepCount, suggestionCount, hasText } = params;
  if (stepCount === 0 && hasText) {
    return {
      label: 'Noch nicht ausgewertet',
      tone: 'bg-amber-50 border-amber-200 text-amber-800',
      icon: <PlayCircle className="w-3.5 h-3.5" />,
    };
  }
  if (stepCount === 0) {
    return {
      label: 'Noch leer',
      tone: 'bg-slate-50 border-slate-200 text-slate-600',
      icon: <FileText className="w-3.5 h-3.5" />,
    };
  }
  if (suggestionCount > 0) {
    return {
      label: 'Kurze Prüfung empfohlen',
      tone: 'bg-amber-50 border-amber-200 text-amber-800',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    };
  }
  return {
    label: 'Bereit für Analyse',
    tone: 'bg-green-50 border-green-200 text-green-800',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  };
}

export function SourceOverviewPanel({
  cases,
  observations,
  lastDerivationSummary,
  expandedCaseId,
  onFocusCase,
  onReanalyzeCase,
}: Props) {
  if (cases.length === 0) return null;

  const reviewOverview = buildReviewOverview({ cases, observations });
  const suggestionCounts = new Map<string, number>();
  for (const suggestion of reviewOverview.suggestions) {
    if (!suggestion.caseId) continue;
    suggestionCounts.set(suggestion.caseId, (suggestionCounts.get(suggestion.caseId) ?? 0) + 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Quellenübersicht</h3>
            <HelpPopover helpKey="pmv2.sources" ariaLabel="Hilfe: Quellenübersicht" />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Hier sehen Sie sofort, welche Quellen schon analysiert wurden und wo eine kurze Prüfung noch sinnvoll ist.
          </p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {cases.map(caseItem => {
          const caseObservations = observations.filter(observation => observation.sourceCaseId === caseItem.id);
          const stepObservations = caseObservations.filter(observation => observation.kind === 'step');
          const stepCount = stepObservations.length;
          const issueCount = caseObservations.filter(observation => observation.kind === 'issue').length
            || (cases.length === 1 ? (stateIssueCountFallback(lastDerivationSummary) ?? 0) : 0);
          const evidenceCount = stepObservations.filter(observation => Boolean(observation.evidenceSnippet?.trim())).length;
          const roleCount = stepObservations.filter(observation => Boolean(observation.role?.trim())).length;
          const systemCount = stepObservations.filter(observation => Boolean(observation.system?.trim())).length;
          const realTimeCount = stepObservations.filter(observation => observation.timestampQuality === 'real').length;
          const suggestionCount = suggestionCounts.get(caseItem.id) ?? 0;
          const hasText = Boolean((caseItem.rawText || caseItem.narrative || '').trim());
          const status = getStatus({ stepCount, suggestionCount, hasText });
          const isOpen = expandedCaseId === caseItem.id;

          return (
            <div key={caseItem.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800 truncate">{caseItem.name}</p>
                    <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {getSourceLabel(caseItem.sourceType)}
                    </span>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${status.tone}`}>
                    {status.icon}
                    {status.label}
                  </div>
                </div>
                {isOpen && (
                  <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    Im Detail geöffnet
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Schritte</p>
                  <p className="text-lg font-bold text-slate-800">{stepCount}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Reibungen</p>
                  <p className="text-lg font-bold text-slate-800">{issueCount}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Prüfhinweise</p>
                  <p className="text-lg font-bold text-slate-800">{suggestionCount}</p>
                </div>
              </div>

              {caseItem.derivedStepLabels && caseItem.derivedStepLabels.length > 0 && (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Hauptlinie: {caseItem.derivedStepLabels.slice(0, 4).join(' → ')}
                  {caseItem.derivedStepLabels.length > 4 ? ' → …' : ''}
                </p>
              )}

              {stepCount > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                    Belegstellen: {evidenceCount}/{stepCount}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                    Rollen: {roleCount}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                    Systeme: {systemCount}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                    Echte Zeiten: {realTimeCount}
                  </span>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onFocusCase(caseItem.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Prüfen
                </button>
                {hasText && (
                  <button
                    type="button"
                    onClick={() => onReanalyzeCase(caseItem.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Erneut auswerten
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
