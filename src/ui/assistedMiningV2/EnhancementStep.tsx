import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Search,
  GitBranch,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ProcessMiningAssistedV2State, ProcessMiningEnhancementSummary } from '../../domain/process';
import { computeV2Enhancement } from './enhancement';
import type { V2EnhancementResult, V2Hotspot } from './enhancement';
import { HotspotCard } from './HotspotCard';
import { getAnalysisModeLabel } from './pmShared';
import { buildEnhancementNarrative } from './stepNarratives';
import { StepNarrativePanel } from './StepNarrativePanel';
import { StepInsightPanel } from './StepInsightPanel';
import { StepGuardCard } from './StepGuardCard';
import { StepActionBar } from './StepActionBar';
import { StepStageHeader } from './StepStageHeader';
import { StepMetricGrid } from './StepMetricGrid';

interface Props {
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onNext: () => void;
  onBack: () => void;
}

function mapHotspotKind(kind: V2Hotspot['kind'], headline: string): 'timing' | 'rework' | 'handoff' | 'missing' | 'other' {
  if (kind === 'timing') return 'timing';
  if (kind === 'rework') return 'rework';
  if (kind === 'handoff') return 'handoff';
  if (kind === 'exception' && /fehl|mindestdaten|pflichtangaben|information/i.test(headline)) return 'missing';
  return 'other';
}

function buildSummary(
  result: V2EnhancementResult,
  savedHotspots: V2Hotspot[],
  notes: string,
): ProcessMiningEnhancementSummary {
  return {
    issueCount: savedHotspots.length,
    issues: savedHotspots.map(hotspot => ({
      title: hotspot.headline,
      description: hotspot.detail,
      kind: mapHotspotKind(hotspot.kind, hotspot.headline),
    })),
    analysisMode: result.analysisMode,
    sampleNotice: result.sampleNotice,
    notes: notes || undefined,
    updatedAt: result.computedAt,
  };
}

function summaryIssuesToHotspots(summary: ProcessMiningEnhancementSummary | undefined): V2Hotspot[] {
  return (
    summary?.issues.map(issue => ({
      id: crypto.randomUUID(),
      kind:
        issue.kind === 'timing'
          ? 'timing'
          : issue.kind === 'rework'
          ? 'rework'
          : issue.kind === 'handoff'
          ? 'handoff'
          : 'exception',
      stepLabel: issue.title,
      headline: issue.title,
      detail: issue.description,
      affectedCases: 0,
      affectedCasePct: 0,
      isTimeBased: issue.kind === 'timing',
      savedAsNote: true,
    })) ?? []
  );
}

export function EnhancementStep({ state, onChange, onNext, onBack }: Props) {
  const [result, setResult] = useState<V2EnhancementResult | null>(null);
  const [hotspots, setHotspots] = useState<V2Hotspot[]>([]);
  const [savedHotspots, setSavedHotspots] = useState<V2Hotspot[]>(summaryIssuesToHotspots(state.enhancementSummary));
  const [notes, setNotes] = useState(state.enhancementSummary?.notes ?? '');
  const [ran, setRan] = useState(!!state.enhancementSummary);
  const [showStructural, setShowStructural] = useState(true);

  const stepObservations = useMemo(
    () => state.observations.filter(observation => observation.kind === 'step'),
    [state.observations],
  );

  function runEnhancement() {
    const nextResult = computeV2Enhancement({
      cases: state.cases,
      observations: state.observations,
      lastDerivationSummary: state.lastDerivationSummary,
    });
    setResult(nextResult);
    setHotspots(nextResult.hotspots);
    setRan(true);
    onChange({ enhancementSummary: buildSummary(nextResult, savedHotspots, notes) });
  }

  function handleSaveNote(hotspot: V2Hotspot) {
    setSavedHotspots(previous => {
      const exists = previous.some(entry => entry.headline === hotspot.headline && entry.kind === hotspot.kind);
      const next = exists
        ? previous.map(entry => (entry.headline === hotspot.headline && entry.kind === hotspot.kind ? { ...hotspot, savedAsNote: true } : entry))
        : [...previous, { ...hotspot, savedAsNote: true }];
      const base = displayResult ?? computeV2Enhancement({
        cases: state.cases,
        observations: state.observations,
        lastDerivationSummary: state.lastDerivationSummary,
      });
      onChange({ enhancementSummary: buildSummary(base, next, notes) });
      return next;
    });
  }

  function saveNotes() {
    const base = displayResult;
    if (!base) return;
    onChange({ enhancementSummary: buildSummary(base, savedHotspots, notes) });
  }


  useEffect(() => {
    if (!ran && stepObservations.length > 0) {
      runEnhancement();
    }
  }, [ran, stepObservations.length]);

  const displayResult = result ?? (
    ran || state.enhancementSummary
      ? computeV2Enhancement({
          cases: state.cases,
          observations: state.observations,
          lastDerivationSummary: state.lastDerivationSummary,
        })
      : null
  );

  const displayHotspots = hotspots.length > 0 ? hotspots : (displayResult?.hotspots ?? summaryIssuesToHotspots(state.enhancementSummary));
  const timingHotspots = displayHotspots.filter(hotspot => hotspot.isTimeBased);
  const structuralHotspots = displayHotspots.filter(hotspot => !hotspot.isTimeBased);
  const isProcessDraft = displayResult?.analysisMode === 'process-draft';
  const primaryHotspot = displayHotspots[0];
  const insightText = displayResult
    ? primaryHotspot
      ? `${primaryHotspot.headline} ${primaryHotspot.detail}`
      : isProcessDraft
      ? 'Im aktuellen Prozessentwurf zeigt sich noch kein dominanter Verbesserungshebel.'
      : 'Aktuell hebt sich noch kein dominanter Verbesserungshebel klar von den übrigen Hinweisen ab.'
    : '';
  const nextActionText = displayResult
    ? displayResult.hasTimingData
      ? 'Prüfen Sie die wichtigsten Hotspots und übernehmen Sie relevante Punkte direkt als Verbesserungshinweise.'
      : 'Ohne belastbare Zeitangaben liegt der Fokus auf Strukturproblemen, Übergaben und fehlenden Informationen. Ergänzen Sie Zeiten nur, wenn sie verfügbar sind.'
    : '';

  if (stepObservations.length === 0) {
    return (
      <StepGuardCard
        title="Verbesserungsanalyse noch nicht bereit"
        body="Damit die App lokale Hotspots und Reibungen erkennt, braucht sie zuerst automatisch abgeleitete Prozessschritte."
        nextLabel="Zuerst in Schritt 1 eine Quelle automatisch auswerten"
        onBack={onBack}
      />
    );
  }

  const metrics = displayResult
    ? isProcessDraft
      ? [
          { label: 'Quellen analysiert', value: displayResult.totalCases },
          { label: 'Reibungssignale / Hotspots', value: displayHotspots.length },
          { label: 'Zeitangaben', value: displayResult.hasTimingData ? 'vorhanden' : 'fehlen' },
          { label: 'Analysemodus', value: 'Entwurf' },
        ]
      : [
          { label: 'Fälle analysiert', value: displayResult.totalCases },
          { label: 'Hotspots erkannt', value: displayHotspots.length },
          { label: 'Zeitbasierte Hotspots', value: timingHotspots.length },
          { label: 'Variabilität', value: `${displayResult.variantInstabilityPct} %` },
        ]
    : [];

  return (
    <div className="space-y-6">
      <StepStageHeader
        title="Verbesserungen erkennen"
        description="Die Anwendung sucht nach praktischen Verbesserungshebeln: Reibungssignale, Rücksprünge, Wartezeiten, häufige Übergaben und uneinheitliche Stellen im Ablauf. Auffällige Punkte können direkt als Verbesserungshinweise gemerkt werden."
        helpKey="pmv2.enhancement"
        tone={displayResult?.hasTimingData ? 'emerald' : 'amber'}
        actions={(
          <button
            type="button"
            onClick={runEnhancement}
            disabled={stepObservations.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ran ? (
              <><RefreshCw className="w-4 h-4" /> Erneut analysieren</>
            ) : (
              <><Search className="w-4 h-4" /> Verbesserungshebel suchen</>
            )}
          </button>
        )}
        badges={(
          <>
            <span className="rounded-full border border-white/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700">
              {stepObservations.length} erkannte Schritte im Blick
            </span>
            <span className="rounded-full border border-white/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700">
              {savedHotspots.length} gemerkte Hinweise
            </span>
          </>
        )}
        footer={stepObservations.length === 0 ? 'Kehren Sie zu Schritt 1 zurück und werten Sie zuerst mindestens eine Quelle aus.' : 'Die App prüft hier sowohl Strukturprobleme als auch, wenn möglich, zeitbasierte Hotspots.'}
      />

      {displayResult && (
        <div className="space-y-5">
          <StepInsightPanel
            insight={insightText}
            nextAction={nextActionText}
            tone={displayResult.hasTimingData ? 'green' : 'amber'}
          />

          <StepNarrativePanel
            title="Wie die Verbesserungsanalyse zu lesen ist"
            narrative={buildEnhancementNarrative(displayResult)}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-800">{getAnalysisModeLabel(displayResult.analysisMode)}</p>
            <p className="mt-1 text-slate-600 leading-relaxed">{displayResult.sampleNotice}</p>
          </div>

          <StepMetricGrid
            items={metrics.map(metric => ({
              label: metric.label,
              value: metric.value,
              tone: metric.label === 'Zeitdaten' ? (displayResult.hasTimingData ? 'green' : 'amber') : metric.label === 'Hotspots' ? 'amber' : metric.label === 'Reibungssignale' ? 'blue' : 'slate',
            }))}
          />

          {!displayResult.hasTimingData && (
            <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Keine verwertbaren Zeitangaben gefunden. Zeitbasierte Aussagen zu Warte- oder Durchlaufzeiten sind daher noch nicht belastbar.
                Der Fokus liegt aktuell auf Reibungssignalen, Übergaben und Strukturproblemen.
              </p>
            </div>
          )}

          {displayResult.hasTimingData && (
            <div className="flex gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
              <Clock className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Echte Zeitangaben erkannt. Neben Strukturproblemen werden auch zeitbasierte Hotspots berücksichtigt.
              </p>
            </div>
          )}

          {timingHotspots.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-500" />
                Zeitbasierte Erkenntnisse
              </h3>
              <div className="space-y-2">
                {timingHotspots.map(hotspot => (
                  <HotspotCard key={hotspot.id} hotspot={hotspot} onSaveNote={handleSaveNote} />
                ))}
              </div>
            </div>
          )}

          {structuralHotspots.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowStructural(show => !show)}
                className="flex items-center gap-2 font-semibold text-slate-800 text-sm w-full text-left"
              >
                {showStructural ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
                <GitBranch className="w-4 h-4 text-blue-500" />
                {isProcessDraft ? 'Reibungssignale und strukturelle Hinweise' : 'Strukturbezogene Erkenntnisse'} ({structuralHotspots.length})
              </button>
              {showStructural && (
                <div className="space-y-2">
                  {structuralHotspots.map(hotspot => (
                    <HotspotCard key={hotspot.id} hotspot={hotspot} onSaveNote={handleSaveNote} />
                  ))}
                </div>
              )}
            </div>
          )}

          {!isProcessDraft && displayResult.variantInstabilityPct >= 50 && displayResult.totalCases >= 3 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold">Hohe Variantenvielfalt:</span> In {displayResult.variantInstabilityPct} % der betrachteten Fälle gibt es eine einzigartige Abfolge.
              Das kann auf fehlende Standards oder viele Sonderfälle hinweisen.
            </div>
          )}

          {displayHotspots.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
              Keine auffälligen Hotspots erkannt. Das ausgewertete Material wirkt in dieser Sicht stabil.
            </div>
          )}
        </div>
      )}

      {savedHotspots.length > 0 && (
        <div className="bg-white border border-teal-200 rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-teal-800">Gemerkte Verbesserungshinweise ({savedHotspots.length})</h4>
          <ul className="space-y-1">
            {savedHotspots.map((hotspot, index) => (
              <li key={`${hotspot.kind}-${hotspot.headline}-${index}`} className="text-sm text-slate-700 flex gap-2">
                <span className="text-teal-600 font-semibold shrink-0">{index + 1}.</span>
                <span>{hotspot.headline}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Eigene Bewertung / Notizen</label>
        <textarea
          rows={3}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
          placeholder={isProcessDraft
            ? 'Welche Reibungssignale wirken plausibel? Welche Punkte sollten mit weiteren Fällen oder per KI nachgeschärft werden?'
            : 'Was sind die wichtigsten Verbesserungshebel? Welche Maßnahmen könnten helfen?'}
          value={notes}
          onChange={event => setNotes(event.target.value)}
          onBlur={saveNotes}
        />
      </div>

      <StepActionBar
        summaryTitle="Was als Nächstes sinnvoll ist"
        statusBadge={(
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${displayHotspots.length > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {displayHotspots.length > 0 ? 'Hotspots bereit' : 'Keine dominanten Hotspots'}
          </span>
        )}
        summary={
          displayHotspots.length > 0
            ? `${displayHotspots.length} Hotspots oder Reibungssignale sind bereit. Im nächsten Schritt können Sie Ursachen, Risiken und Übergaben ergänzen oder direkt in Backlog und Evidenz übernehmen.`
            : 'Auch ohne dominante Hotspots können Sie im nächsten Schritt eine Management-Zusammenfassung und saubere Übergaben erzeugen.'
        }
        onBack={onBack}
        onNext={onNext}
        nextLabel="Ergebnisse anreichern"
      />
    </div>
  );
}
