import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ClipboardCopy, Download, ShieldCheck, TimerReset } from 'lucide-react';
import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import { downloadTextFile } from '../../utils/downloadTextFile';
import { HelpPopover } from '../components/HelpPopover';
import { buildGovernanceAssistantBrief, computeGovernanceInsights } from './governanceInsights';

interface Props {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}

function toneClass(tone: 'good' | 'attention' | 'critical') {
  if (tone === 'good') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (tone === 'attention') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-rose-200 bg-rose-50 text-rose-900';
}

function severityBadge(severity: 'high' | 'medium' | 'low') {
  if (severity === 'high') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function sanitizeFilename(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]+/g, '')
    .replace(/\s+/g, '_')
    .trim() || 'governance';
}

export function GovernanceInsightsPanel({ state, version }: Props) {
  const [copied, setCopied] = useState(false);
  const insights = useMemo(() => computeGovernanceInsights({ state, version }), [state, version]);
  const brief = useMemo(() => buildGovernanceAssistantBrief({ state, version }), [state, version]);

  async function handleCopy() {
    await navigator.clipboard.writeText(brief);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="h-4 w-4 text-cyan-600" />
            <p className="text-sm font-semibold">Freigabe-Assistenz und Governance-Auswertung</p>
            <HelpPopover helpKey="pmv2.governanceInsights" ariaLabel="Hilfe: Freigabe-Assistenz und Governance-Auswertung" />
          </div>
          <p className="text-sm leading-relaxed text-slate-800">{insights.headline}</p>
          <p className="text-xs leading-relaxed text-slate-600">{insights.summary}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass(insights.tone)}`}>
          Governance-Reife {insights.score}/100
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {insights.metrics.map(metric => (
          <div key={metric.key} className={`rounded-xl border p-3 ${toneClass(metric.tone)}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{metric.label}</p>
            <p className="mt-1 text-lg font-bold">{metric.value}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-slate-900">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold">Priorisierte Governance-Punkte</p>
          </div>
          {insights.priorities.length > 0 ? (
            <div className="space-y-2">
              {insights.priorities.map(item => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityBadge(item.severity)}`}>
                      {item.severity === 'high' ? 'hoch' : item.severity === 'medium' ? 'mittel' : 'niedrig'}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">{item.detail}</p>
                  <p className="text-xs font-medium text-slate-600">Nächster sinnvoller Schritt: {item.nextAction}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              Aktuell sind keine priorisierten Governance-Punkte offen. Der Freigabepfad wirkt ruhig und konsistent.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-cyan-900">
              <TimerReset className="h-4 w-4" />
              <p className="text-sm font-semibold">Steuerung auf einen Blick</p>
            </div>
            <p className="text-sm text-slate-800">{insights.nextAction}</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Überfällig: {insights.overdueDecisionCount}
              </span>
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Zeitnah fällig: {insights.dueSoonDecisionCount}
              </span>
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Ohne Owner: {insights.missingOwnerCount}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">Trend zum letzten gemerkten Governance-Stand: {insights.trendSummary}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Kurzbrief für Freigabe oder Review</p>
              <p className="text-xs text-slate-500">Kompakte Einordnung für Management, Team-Review oder Pilot-Weitergabe.</p>
            </div>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">{brief}</pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}
                Kopieren
              </button>
              <button
                type="button"
                onClick={() => downloadTextFile({
                  filename: `${sanitizeFilename(version.titleSnapshot || 'governance')}_freigabe_assistenz.txt`,
                  content: brief,
                  mimeType: 'text/plain;charset=utf-8',
                })}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Text laden
              </button>
              <button
                type="button"
                onClick={() => downloadTextFile({
                  filename: `${sanitizeFilename(version.titleSnapshot || 'governance')}_freigabe_assistenz.json`,
                  content: JSON.stringify({ insights, brief }, null, 2),
                  mimeType: 'application/json;charset=utf-8',
                })}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                JSON laden
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
