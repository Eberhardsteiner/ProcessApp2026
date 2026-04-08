import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, Wrench } from 'lucide-react';
import type { WorkspaceIntegrityReport } from './workspaceIntegrity';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  report: WorkspaceIntegrityReport;
}

function toneFromSeverity(severity: WorkspaceIntegrityReport['severity']) {
  if (severity === 'healthy') {
    return {
      panel: 'border-emerald-200 bg-emerald-50',
      icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
      badge: 'border-emerald-200 bg-white/80 text-emerald-800',
      label: 'stabil',
    };
  }
  if (severity === 'repaired') {
    return {
      panel: 'border-amber-200 bg-amber-50',
      icon: <Wrench className="h-4 w-4 text-amber-600" />,
      badge: 'border-amber-200 bg-white/80 text-amber-800',
      label: 'automatisch stabilisiert',
    };
  }
  return {
    panel: 'border-rose-200 bg-rose-50',
    icon: <ShieldAlert className="h-4 w-4 text-rose-600" />,
    badge: 'border-rose-200 bg-white/80 text-rose-800',
    label: 'kritisch prüfen',
  };
}

export function WorkspaceIntegrityPanel({ report }: Props) {
  const tone = toneFromSeverity(report.severity);
  const visibleIssues = report.issues.slice(0, 4);

  return (
    <div className={`rounded-2xl border p-4 shadow-sm space-y-3 ${tone.panel}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-slate-900">
            {tone.icon}
            <p className="text-sm font-semibold">Arbeitsstand-Härtung</p>
            <HelpPopover helpKey="pmv2.hardening" ariaLabel="Hilfe: Arbeitsstand-Härtung" />
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone.badge}`}>
              {tone.label}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-900">{report.headline}</p>
          <p className="text-sm leading-relaxed text-slate-700">{report.summary}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
            Reparaturen: {report.repairedCount}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
            Kritisch: {report.criticalCount}
          </span>
        </div>
      </div>

      {visibleIssues.length > 0 ? (
        <div className="space-y-2">
          {visibleIssues.map(issue => (
            <div key={issue.id} className="rounded-xl border border-white/80 bg-white/80 px-3.5 py-3 text-sm text-slate-800 flex items-start gap-2">
              {issue.level === 'critical' ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-600 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-slate-400 shrink-0" />
              )}
              <span>{issue.message}</span>
            </div>
          ))}
          {report.issues.length > visibleIssues.length && (
            <p className="text-xs text-slate-600">
              Weitere Hinweise: {report.issues.length - visibleIssues.length}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-white/80 bg-white/80 px-3.5 py-3 text-sm text-slate-700">
          Kein akuter Reparaturbedarf erkannt. Die Kernobjekte wirken im aktuellen Arbeitsstand stimmig.
        </div>
      )}
    </div>
  );
}
