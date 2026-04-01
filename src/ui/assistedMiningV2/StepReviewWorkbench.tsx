import { AlertTriangle, CheckCircle2, GitMerge, Scissors, Sparkles, Wrench } from 'lucide-react';
import type { ProcessMiningObservation, ProcessMiningObservationCase } from '../../domain/process';
import {
  applyCanonicalLabelSuggestions,
  applyIssueReclassificationSuggestions,
  applySplitSuggestions,
  buildReviewOverview,
  type ReviewSuggestion,
} from './reviewSuggestions';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  onUpdate: (observations: ProcessMiningObservation[]) => void;
  onFocusCase?: (caseId: string) => void;
}

function SummaryMetric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{note}</p>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onApply,
  onFocusCase,
}: {
  suggestion: ReviewSuggestion;
  onApply: (suggestion: ReviewSuggestion) => void;
  onFocusCase?: (caseId: string) => void;
}) {
  const icon = suggestion.type === 'split'
    ? <Scissors className="w-4 h-4 text-blue-500" />
    : suggestion.type === 'reclassify'
    ? <AlertTriangle className="w-4 h-4 text-amber-500" />
    : <Sparkles className="w-4 h-4 text-violet-500" />;

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <p className="text-sm font-semibold text-slate-800">
              {suggestion.type === 'split'
                ? 'Sammelschritt aufteilen'
                : suggestion.type === 'reclassify'
                ? 'Als Reibungssignal führen'
                : 'Bezeichnung vereinheitlichen'}
            </p>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{suggestion.reason}</p>
          {suggestion.caseName && (
            <p className="text-[11px] text-slate-400">Quelle: {suggestion.caseName}</p>
          )}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <p className="text-xs text-slate-400 mb-1">Aktuell</p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 leading-relaxed">
            {suggestion.currentLabel}
          </div>
        </div>

        {suggestion.suggestedLabel && suggestion.type !== 'reclassify' && (
          <div>
            <p className="text-xs text-slate-400 mb-1">Vorschlag</p>
            <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-violet-900 leading-relaxed">
              {suggestion.suggestedLabel}
            </div>
          </div>
        )}

        {suggestion.suggestedParts && suggestion.suggestedParts.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-1">Vorgeschlagene Teilstücke</p>
            <ol className="space-y-1">
              {suggestion.suggestedParts.map((part, index) => (
                <li key={index} className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-900">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">{index + 1}</span>
                  <span>{part}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onApply(suggestion)}
          className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Vorschlag anwenden
        </button>
        {suggestion.caseId && onFocusCase && (
          <button
            type="button"
            onClick={() => onFocusCase(suggestion.caseId!)}
            className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors"
          >
            Quelle öffnen
          </button>
        )}
      </div>
    </div>
  );
}

export function StepReviewWorkbench({ cases, observations, onUpdate, onFocusCase }: Props) {
  const overview = buildReviewOverview({ cases, observations });
  const visibleSuggestions = overview.suggestions.slice(0, 6);

  function applySingleSuggestion(suggestion: ReviewSuggestion) {
    if (suggestion.type === 'rename') {
      const result = applyCanonicalLabelSuggestions(observations, [suggestion.observationId]);
      if (result.changedCount > 0) onUpdate(result.observations);
      return;
    }
    if (suggestion.type === 'reclassify') {
      const result = applyIssueReclassificationSuggestions(observations, [suggestion.observationId]);
      if (result.changedCount > 0) onUpdate(result.observations);
      return;
    }
    const result = applySplitSuggestions(observations, [suggestion.observationId]);
    if (result.changedCount > 0) onUpdate(result.observations);
  }

  function applyAllRenames() {
    const result = applyCanonicalLabelSuggestions(observations);
    if (result.changedCount > 0) onUpdate(result.observations);
  }

  function applyAllIssueReclassifications() {
    const result = applyIssueReclassificationSuggestions(observations);
    if (result.changedCount > 0) onUpdate(result.observations);
  }

  function applyAllSplits() {
    const result = applySplitSuggestions(observations);
    if (result.changedCount > 0) onUpdate(result.observations);
  }

  if (overview.stepCount === 0 && overview.issueCount === 0) return null;

  return (
    <div className="space-y-4 border border-slate-200 rounded-2xl p-5 bg-slate-50">
      <div className="flex items-start gap-3">
        <Wrench className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Prüfwerkstatt für erkannte Schritte</h3>
            <HelpPopover helpKey="pmv2.review" ariaLabel="Hilfe: Prüfwerkstatt" />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Hier können Sie die automatische Ableitung schnell schärfen. Die Vorschläge beruhen auf lokalen Heuristiken und verbessern Discovery,
            Soll-Abgleich und Hotspot-Erkennung auch ohne KI.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryMetric label="Zu prüfen" value={overview.suggestionCount} note="Empfohlene Korrekturen" />
        <SummaryMetric label="Vereinheitlichen" value={overview.renameCount} note="robustere Schrittbezeichnungen" />
        <SummaryMetric label="Aufteilen" value={overview.splitCount} note="mögliche Sammelschritte" />
        <SummaryMetric label="Reibungssignale" value={overview.reclassifyCount} note="eher Problem als Schritt" />
        <SummaryMetric label="Erfasste Probleme" value={overview.issueCount} note="bereits als Signal geführt" />
      </div>

      {(overview.renameCount > 0 || overview.reclassifyCount > 0 || overview.splitCount > 0) && (
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={applyAllRenames}
            disabled={overview.renameCount === 0}
            className="flex items-center gap-2 px-3 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {overview.renameCount === 0 ? 'Nichts zu vereinheitlichen' : `${overview.renameCount} Namen vereinheitlichen`}
          </button>
          <button
            type="button"
            onClick={applyAllSplits}
            disabled={overview.splitCount === 0}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Scissors className="w-4 h-4" />
            {overview.splitCount === 0 ? 'Keine Sammelschritte erkannt' : `${overview.splitCount} Sammelschritte aufteilen`}
          </button>
          <button
            type="button"
            onClick={applyAllIssueReclassifications}
            disabled={overview.reclassifyCount === 0}
            className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <GitMerge className="w-4 h-4" />
            {overview.reclassifyCount === 0 ? 'Keine Umklassifizierung nötig' : `${overview.reclassifyCount} als Reibungssignal führen`}
          </button>
        </div>
      )}

      {overview.suggestionCount === 0 ? (
        <div className="flex gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Die automatische Ableitung wirkt bereits konsistent. Sie können direkt weiter analysieren oder bei Bedarf einzelne Quellen manuell ergänzen.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Empfohlene Korrekturen</p>
            {overview.suggestions.length > visibleSuggestions.length && (
              <p className="text-xs text-slate-400">Es werden zunächst die wichtigsten {visibleSuggestions.length} Hinweise gezeigt.</p>
            )}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {visibleSuggestions.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onApply={applySingleSuggestion}
                onFocusCase={onFocusCase}
              />
            ))}
          </div>
        </div>
      )}

      {(overview.roles.length > 0 || overview.systems.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erkannter Kontext</p>
          <div className="flex flex-wrap gap-2">
            {overview.roles.slice(0, 6).map(role => (
              <span key={role} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-full">
                Rolle: {role}
              </span>
            ))}
            {overview.systems.slice(0, 6).map(system => (
              <span key={system} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-full">
                System: {system}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
