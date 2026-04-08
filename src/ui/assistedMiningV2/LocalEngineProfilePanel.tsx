import { Gauge, Layers3, ListChecks, ListTree, Sparkles } from 'lucide-react';
import type { DerivationSummary } from '../../domain/process';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  summary?: DerivationSummary;
}

function labelForStability(value: 'high' | 'medium' | 'low') {
  if (value === 'high') return { label: 'stabile Materialbasis', cls: 'border-green-200 bg-green-50 text-green-800' };
  if (value === 'medium') return { label: 'gemischte Materialbasis', cls: 'border-amber-200 bg-amber-50 text-amber-800' };
  return { label: 'vorsichtige Auswertung', cls: 'border-red-200 bg-red-50 text-red-800' };
}

function sectionLabel(key: string): string {
  const labels: Record<string, string> = {
    timeline: 'Zeitverlauf',
    procedural: 'Verfahrensschritte',
    communication: 'Kommunikation',
    issue: 'Reibungssignale',
    decision: 'Entscheidungen',
    knowledge: 'Erfahrungswissen',
    measure: 'Maßnahmen / Nutzen',
    governance: 'Governance / Review',
    commentary: 'Kommentar / Rahmen',
    tableLike: 'Tabellen',
    noise: 'Zusatzmaterial',
  };
  return labels[key] ?? key;
}

export function LocalEngineProfilePanel({ summary }: Props) {
  const profile = summary?.sourceProfile;
  if (!profile) return null;

  const stability = labelForStability(profile.stability);
  const sectionHighlights = Object.entries(profile.sectionCounts)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const multiCase = summary?.multiCaseSummary;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-slate-700">
            <Gauge className="h-4 w-4 text-cyan-600" />
            <p className="text-sm font-semibold">Lokales Engine-Profil</p>
            <HelpPopover helpKey="pmv2.engineProfile" ariaLabel="Hilfe: Lokales Engine-Profil" />
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            {profile.documentClassLabel ? `${profile.documentClassLabel}. ` : ''}{profile.inputProfileLabel}. {profile.extractionFocus}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {profile.documentClassLabel && (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
              {profile.documentClassLabel}
            </span>
          )}
          {profile.primaryDomainLabel && (
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800">
              Primärdomäne: {profile.primaryDomainLabel}
            </span>
          )}
          {typeof profile.processBearingSharePct === 'number' && (
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800">
              {profile.processBearingSharePct}% prozessnahes Material
            </span>
          )}
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${stability.cls}`}>
            {stability.label}
          </span>
        </div>
      </div>

      {profile.domainGateNote && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-900">
          {profile.domainGateNote}
        </div>
      )}

      {sectionHighlights.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {sectionHighlights.map(([key, value]) => (
            <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{sectionLabel(key)}</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{value} Abschnitte</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-slate-700">
            <ListChecks className="h-4 w-4" />
            <p className="text-sm font-semibold">Warum die Engine so liest</p>
          </div>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-700">
            {profile.classificationReasons && profile.classificationReasons.length > 0 ? (
              profile.classificationReasons.slice(0, 4).map(reason => (
                <p key={reason} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">{reason}</p>
              ))
            ) : (
              <p className="rounded-md border border-slate-200 bg-white px-2.5 py-2">Noch keine zusätzliche Materialbegründung verfügbar.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-slate-700">
            <Sparkles className="h-4 w-4" />
            <p className="text-sm font-semibold">Lokaler Ableitungsplan</p>
          </div>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-700">
            {profile.extractionPlan && profile.extractionPlan.length > 0 ? (
              profile.extractionPlan.map(step => (
                <p key={step} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">{step}</p>
              ))
            ) : (
              <p className="rounded-md border border-slate-200 bg-white px-2.5 py-2">Die Engine nutzt hier eine vorsichtige Standardlogik.</p>
            )}
            {typeof profile.selectedParagraphCount === 'number' && (
              <p className="text-slate-500">
                Genutzte Kernabschnitte: {profile.selectedParagraphCount}
                {typeof profile.supportParagraphCount === 'number' ? ` · ergänzende Abschnitte: ${profile.supportParagraphCount}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {multiCase && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
            <div className="flex items-center gap-2 text-cyan-800">
              <Layers3 className="h-4 w-4" />
              <p className="text-sm font-semibold">Stabile Muster</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-700">
              {multiCase.stableSteps.length > 0 ? multiCase.stableSteps.slice(0, 5).join(' · ') : 'Noch keine stabilen Schrittmuster erkennbar.'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-slate-700">
              <ListTree className="h-4 w-4" />
              <p className="text-sm font-semibold">Variable Stellen</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-700">
              {multiCase.variableSteps.length > 0 ? multiCase.variableSteps.slice(0, 5).join(' · ') : 'Bisher nur geringe Varianz zwischen den Quellen sichtbar.'}
            </p>
            {multiCase.dominantPattern && <p className="mt-2 text-[11px] text-slate-500">Dominantes Muster: {multiCase.dominantPattern}</p>}
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-amber-900">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-semibold">Wiederkehrende Reibungen</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-700">
              {multiCase.recurringSignals && multiCase.recurringSignals.length > 0 ? multiCase.recurringSignals.slice(0, 4).join(' · ') : 'Noch keine wiederkehrenden Reibungssignale über mehrere Quellen.'}
            </p>
            {multiCase.stabilityNote && <p className="mt-2 text-[11px] text-slate-500">{multiCase.stabilityNote}</p>}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 text-violet-500" />
          <p>
            Die lokale Engine zeigt hier nicht nur die erkannte Materialart, sondern auch, warum bestimmte Textteile als Prozesskern, Signal oder Kontext behandelt wurden.
            Das macht die Ableitung ohne KI nachvollziehbarer und reduziert Fehlinterpretationen bei Mischdokumenten.
          </p>
        </div>
      </div>
    </div>
  );
}
