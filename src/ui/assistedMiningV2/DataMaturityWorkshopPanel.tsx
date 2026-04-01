import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  ListChecks,
  Route,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ProcessVersion } from '../../domain/process';
import type { ProcessMiningAssistedV2State } from './types';
import { computeDataMaturity, type DataMaturityActionId, type DataMaturityItem, type DataMaturityStatus } from './dataMaturity';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  reviewSuggestionCount?: number;
  compact?: boolean;
  onAction?: (actionId: DataMaturityActionId) => void;
}

function getStatusTone(status: DataMaturityStatus) {
  if (status === 'good') {
    return {
      panel: 'border-green-200 bg-green-50',
      badge: 'bg-green-100 text-green-800',
      icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
      label: 'gut abgesichert',
    };
  }
  if (status === 'attention') {
    return {
      panel: 'border-amber-200 bg-amber-50',
      badge: 'bg-amber-100 text-amber-800',
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      label: 'kurz prüfen',
    };
  }
  return {
    panel: 'border-slate-200 bg-slate-50',
    badge: 'bg-slate-200 text-slate-700',
    icon: <FileText className="h-4 w-4 text-slate-400" />,
    label: 'noch aufbauen',
  };
}

function getItemIcon(key: DataMaturityItem['key']) {
  if (key === 'material') return <Database className="h-4 w-4 text-cyan-700" />;
  if (key === 'clarity') return <ListChecks className="h-4 w-4 text-violet-700" />;
  if (key === 'ordering') return <Route className="h-4 w-4 text-blue-700" />;
  if (key === 'evidence') return <FileCheck2 className="h-4 w-4 text-emerald-700" />;
  if (key === 'context') return <Users className="h-4 w-4 text-indigo-700" />;
  return <Clock3 className="h-4 w-4 text-amber-700" />;
}

function getLevelTone(level: ReturnType<typeof computeDataMaturity>['level']) {
  if (level === 'strong') return 'bg-green-100 text-green-800 border-green-200';
  if (level === 'solid') return 'bg-cyan-100 text-cyan-800 border-cyan-200';
  if (level === 'usable') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export function DataMaturityWorkshopPanel({
  state,
  version,
  reviewSuggestionCount = 0,
  compact = false,
  onAction,
}: Props) {
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex items-center gap-2 text-slate-700">
            <Sparkles className="h-4 w-4 text-cyan-600" />
            <p className="text-sm font-semibold">Qualität &amp; Datenreife</p>
            <HelpPopover helpKey="pmv2.maturity" ariaLabel="Hilfe: Qualität und Datenreife" />
          </div>
          <p className="text-base font-semibold text-slate-900">{maturity.headline}</p>
          <p className="text-sm text-slate-600 leading-relaxed">{maturity.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getLevelTone(maturity.level)}`}>
            {maturity.levelLabel}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
            {maturity.blockers === 0 ? 'keine Blocker' : `${maturity.blockers} ${maturity.blockers === 1 ? 'Blocker' : 'Blocker'}`}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {maturity.items.map(item => {
          const tone = getStatusTone(item.status);
          return (
            <div key={item.key} className={`rounded-xl border p-4 space-y-2 ${tone.panel}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {getItemIcon(item.key)}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                    {item.metric && <p className="text-xs text-slate-500">{item.metric}</p>}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                  {tone.icon}
                  {tone.label}
                </span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">{item.summary}</p>
              <p className="text-xs text-slate-600 leading-relaxed">{item.detail}</p>
            </div>
          );
        })}
      </div>

      {!compact && maturity.strengths.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-sm font-semibold">Was bereits gut trägt</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {maturity.strengths.map(strength => (
              <span
                key={strength}
                className="rounded-full border border-green-200 bg-white px-2.5 py-1 text-xs font-medium text-green-800"
              >
                {strength}
              </span>
            ))}
          </div>
        </div>
      )}

      {!compact && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-700">
              <ArrowRight className="h-4 w-4 text-violet-600" />
              <p className="text-sm font-semibold">Was jetzt am meisten stärkt</p>
            </div>
            {maturity.actions.length > 0 ? (
              <div className="space-y-3">
                {maturity.actions.map(action => (
                  <div key={action.key} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{action.label}</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{action.detail}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          action.emphasis === 'high'
                            ? 'bg-red-100 text-red-700'
                            : action.emphasis === 'medium'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {action.emphasis === 'high' ? 'wichtig' : action.emphasis === 'medium' ? 'hilfreich' : 'optional'}
                      </span>
                    </div>
                    {action.actionId && onAction && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => onAction(action.actionId!)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          Direkt öffnen
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Die Datenbasis wirkt aktuell ausreichend stabil. Sie können direkt mit Discovery, Soll-Abgleich und Verbesserungsanalyse weiterarbeiten.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-800">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-semibold">Wofür diese Werkstatt gut ist</p>
            </div>
            <div className="space-y-2 text-sm text-slate-700 leading-relaxed">
              <p>Sie macht sichtbar, warum Ergebnisse schon belastbar sind oder wo noch Vorsicht sinnvoll bleibt.</p>
              <p>Die Hinweise sind bewusst handlungsnah formuliert, damit Sie direkt zur passenden Stelle springen können.</p>
              <p>Damit bleibt die Analyse auch ohne KI nachvollziehbar und lokal schrittweise stärker.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
