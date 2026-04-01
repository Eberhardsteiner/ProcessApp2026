import { AlertCircle, ClipboardList, Compass, ShieldAlert, Workflow } from 'lucide-react';
import type { DomainInsightResult } from './domainInsights';
import { formatMissingFieldCount } from './domainInsights';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  insights: DomainInsightResult;
  compact?: boolean;
}

function toneClasses(confidence: DomainInsightResult['confidence']) {
  if (confidence === 'high') return 'bg-emerald-50 border-emerald-200 text-emerald-800';
  if (confidence === 'medium') return 'bg-amber-50 border-amber-200 text-amber-800';
  return 'bg-slate-50 border-slate-200 text-slate-700';
}

export function DomainInsightPanel({ insights, compact = false }: Props) {
  if (insights.packId === 'generic' && insights.findings.length === 0 && insights.missingFields.length === 0) {
    return null;
  }

  const topFindings = insights.findings.slice(0, compact ? 2 : 3);
  const missingFields = insights.missingFields.filter(field => field.status === 'missing').slice(0, compact ? 3 : 5);
  const recommendations = insights.topRecommendations.slice(0, compact ? 2 : 4);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-slate-700">
            <Compass className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold">Fachliche Muster ohne KI</p>
            <HelpPopover helpKey="pmv2.domain" ariaLabel="Hilfe: Fachliche Muster ohne KI" />
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${toneClasses(insights.confidence)}`}>
              {insights.packLabel}
            </span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">{insights.summary}</p>
        </div>
        <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${toneClasses(insights.confidence)}`}>
          {insights.confidence === 'high' ? 'Hohe Passung' : insights.confidence === 'medium' ? 'Mittlere Passung' : 'Vorläufige Passung'}
        </div>
      </div>

      <div className={`grid gap-3 ${compact ? 'lg:grid-cols-3' : 'lg:grid-cols-[1.1fr_0.95fr_1fr]'}`}>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-800">
            <ShieldAlert className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Erkannte Fachmuster</h3>
          </div>
          {topFindings.length > 0 ? (
            <div className="space-y-2">
              {topFindings.map(finding => (
                <div key={finding.id} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2">
                  <p className="text-sm font-medium text-slate-900">{finding.title}</p>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{finding.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">Noch keine klaren domänenspezifischen Muster erkannt.</p>
          )}
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertCircle className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Wichtige Informationslücken</h3>
          </div>
          <p className="text-xs text-slate-600">{formatMissingFieldCount(insights.missingFields)}</p>
          {missingFields.length > 0 ? (
            <ul className="space-y-2">
              {missingFields.map(field => (
                <li key={field.key} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2">
                  <p className="text-sm font-medium text-slate-900">{field.label}</p>
                  {field.evidence && <p className="mt-1 text-xs text-slate-600 leading-relaxed">{field.evidence}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">Aus dem aktuellen Material sind keine dominanten Pflichtlücken ableitbar.</p>
          )}
        </div>

        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-cyan-800">
            <ClipboardList className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Lokal empfohlene nächste Schritte</h3>
          </div>
          {recommendations.length > 0 ? (
            <ul className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <li key={index} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-800 leading-relaxed">
                  {recommendation}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">Mit mehr Material oder klareren Quellen werden fachliche Empfehlungen konkreter.</p>
          )}
        </div>
      </div>

      {!compact && insights.roleActions.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-700">
            <Workflow className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold">Rollenbezogene Hinweise</h3>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {insights.roleActions.map(entry => (
              <div key={entry.role} className="rounded-lg border border-white bg-white px-3 py-3">
                <p className="text-sm font-medium text-slate-900">{entry.role}</p>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600 leading-relaxed">
                  {entry.actions.map((action, index) => (
                    <li key={index}>• {action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
