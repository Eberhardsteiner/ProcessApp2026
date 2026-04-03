import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Redo2,
  Scissors,
  Sparkles,
  Undo2,
  Wrench,
} from 'lucide-react';
import type {
  ProcessMiningObservation,
  ProcessMiningObservationCase,
  ProcessMiningReviewState,
} from '../../domain/process';
import {
  applyCanonicalLabelSuggestions,
  applyIssueReclassificationSuggestions,
  applySplitSuggestions,
  buildReviewOverview,
  type ReviewSuggestion,
} from './reviewSuggestions';
import { buildReviewNormalizationGroups, upsertNormalizationRule, type ReviewNormalizationGroup } from './reviewNormalization';
import { NormalizationWorkbench } from './NormalizationWorkbench';
import { RepairJournalPanel } from './RepairJournalPanel';
import { HelpPopover } from '../components/HelpPopover';

export interface ReviewWorkbenchChange {
  observations?: ProcessMiningObservation[];
  reviewState?: ProcessMiningReviewState;
  historyLabel: string;
  repairNotes?: string[];
  journalEntry?: {
    title: string;
    detail?: string;
  };
}

interface Props {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  reviewState?: ProcessMiningReviewState;
  onApplyChange: (change: ReviewWorkbenchChange) => void;
  onFocusCase?: (caseId: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  sessionStatusLabel?: string;
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

function SessionToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  statusLabel,
}: {
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  statusLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">Reparaturen sicher ausprobieren</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Rückgängig und Wiederholen gelten für diese Sitzung der Prüfwerkstatt. Freie Texteingaben bleiben bewusst außen vor.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {statusLabel && <span className="text-xs text-slate-500">{statusLabel}</span>}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" />
          Rückgängig
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Redo2 className="h-4 w-4" />
          Wiederholen
        </button>
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  selected,
  onToggle,
  onApply,
  onFocusCase,
}: {
  suggestion: ReviewSuggestion;
  selected: boolean;
  onToggle: (suggestionId: string) => void;
  onApply: (suggestion: ReviewSuggestion) => void;
  onFocusCase?: (caseId: string) => void;
}) {
  const icon = suggestion.type === 'split'
    ? <Scissors className="w-4 h-4 text-blue-500" />
    : suggestion.type === 'reclassify'
    ? <AlertTriangle className="w-4 h-4 text-amber-500" />
    : <Sparkles className="w-4 h-4 text-violet-500" />;

  return (
    <div className={`border rounded-xl p-4 bg-white space-y-3 transition-colors ${selected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
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
          {suggestion.caseName && <p className="text-[11px] text-slate-400">Quelle: {suggestion.caseName}</p>}
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(suggestion.id)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
          />
          auswählen
        </label>
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

export function StepReviewWorkbench({
  cases,
  observations,
  reviewState,
  onApplyChange,
  onFocusCase,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  sessionStatusLabel,
}: Props) {
  const overview = useMemo(() => buildReviewOverview({ cases, observations }), [cases, observations]);
  const visibleSuggestions = overview.suggestions.slice(0, 8);
  const normalizationGroups = useMemo(
    () => buildReviewNormalizationGroups({ observations, rules: reviewState?.normalizationRules }),
    [observations, reviewState?.normalizationRules],
  );
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedSuggestionIds(current => current.filter(id => visibleSuggestions.some(suggestion => suggestion.id === id)));
  }, [visibleSuggestions]);

  function buildRepairNotes(stats: { renamed: number; reclassified: number; split: number }): string[] {
    const notes: string[] = [];
    if (stats.renamed > 0) notes.push(`${stats.renamed} ${stats.renamed === 1 ? 'Schrittbezeichnung wurde' : 'Schrittbezeichnungen wurden'} vereinheitlicht.`);
    if (stats.split > 0) notes.push(`${stats.split} ${stats.split === 1 ? 'Sammelschritt wurde' : 'Sammelschritte wurden'} aufgeteilt.`);
    if (stats.reclassified > 0) notes.push(`${stats.reclassified} ${stats.reclassified === 1 ? 'Eintrag wurde' : 'Einträge wurden'} als Reibungssignal statt als Prozessschritt geführt.`);
    return notes;
  }

  function applySuggestionIds(suggestionIds: string[]) {
    if (suggestionIds.length === 0) return;
    const selectedSuggestions = overview.suggestions.filter(suggestion => suggestionIds.includes(suggestion.id));
    let nextObservations = observations;
    const stats = { renamed: 0, reclassified: 0, split: 0 };

    (['split', 'reclassify', 'rename'] as Array<ReviewSuggestion['type']>).forEach(type => {
      const targetIds = selectedSuggestions
        .filter(suggestion => suggestion.type === type)
        .map(suggestion => suggestion.observationId);
      if (targetIds.length === 0) return;
      if (type === 'split') {
        const result = applySplitSuggestions(nextObservations, targetIds);
        nextObservations = result.observations;
        stats.split += result.changedCount;
        return;
      }
      if (type === 'reclassify') {
        const result = applyIssueReclassificationSuggestions(nextObservations, targetIds);
        nextObservations = result.observations;
        stats.reclassified += result.changedCount;
        return;
      }
      const result = applyCanonicalLabelSuggestions(nextObservations, targetIds);
      nextObservations = result.observations;
      stats.renamed += result.changedCount;
    });

    const repairNotes = buildRepairNotes(stats);
    if (repairNotes.length === 0) return;

    onApplyChange({
      observations: nextObservations,
      historyLabel: suggestionIds.length === 1 ? 'Prüfhinweis angewendet' : `${suggestionIds.length} Prüfhinweise angewendet`,
      repairNotes,
      journalEntry: {
        title: suggestionIds.length === 1 ? 'Ein Prüfhinweis angewendet' : `${suggestionIds.length} Prüfhinweise angewendet`,
        detail: repairNotes.join(' '),
      },
    });
    setSelectedSuggestionIds([]);
  }

  function applyAllRenames() {
    const result = applyCanonicalLabelSuggestions(observations);
    if (result.changedCount > 0) {
      onApplyChange({
        observations: result.observations,
        historyLabel: 'Schrittbezeichnungen vereinheitlicht',
        repairNotes: [`${result.changedCount} ${result.changedCount === 1 ? 'Schrittbezeichnung wurde' : 'Schrittbezeichnungen wurden'} vereinheitlicht.`],
        journalEntry: {
          title: 'Schrittbezeichnungen vereinheitlicht',
          detail: `${result.changedCount} Bezeichnungen wurden auf lokale Standardbegriffe gebracht.`,
        },
      });
    }
  }

  function applyAllIssueReclassifications() {
    const result = applyIssueReclassificationSuggestions(observations);
    if (result.changedCount > 0) {
      onApplyChange({
        observations: result.observations,
        historyLabel: 'Reibungssignale bereinigt',
        repairNotes: [`${result.changedCount} ${result.changedCount === 1 ? 'Eintrag wurde' : 'Einträge wurden'} als Reibungssignal statt als Prozessschritt geführt.`],
        journalEntry: {
          title: 'Reibungssignale bereinigt',
          detail: `${result.changedCount} Hinweise werden nun als Problem statt als Ablauf-Schritt behandelt.`,
        },
      });
    }
  }

  function applyAllSplits() {
    const result = applySplitSuggestions(observations);
    if (result.changedCount > 0) {
      onApplyChange({
        observations: result.observations,
        historyLabel: 'Sammelschritte aufgeteilt',
        repairNotes: [`${result.changedCount} ${result.changedCount === 1 ? 'Sammelschritt wurde' : 'Sammelschritte wurden'} lokal aufgeteilt.`],
        journalEntry: {
          title: 'Sammelschritte aufgeteilt',
          detail: `${result.changedCount} längere Sammelschritte wurden in einzelne Handlungseinheiten zerlegt.`,
        },
      });
    }
  }

  function applyNormalizationGroup(group: ReviewNormalizationGroup, preferredValue: string) {
    const cleaned = preferredValue.trim();
    if (!cleaned) return;
    const now = new Date().toISOString();
    const nextRules = upsertNormalizationRule(reviewState?.normalizationRules, {
      id: group.activeRule?.id ?? crypto.randomUUID(),
      kind: group.kind,
      key: group.key,
      preferredValue: cleaned,
      examples: group.variants.map(variant => variant.value).slice(0, 5),
      createdAt: group.activeRule?.createdAt ?? now,
      updatedAt: now,
    });

    onApplyChange({
      reviewState: {
        normalizationRules: nextRules,
        repairJournal: reviewState?.repairJournal ?? [],
      },
      historyLabel: `${group.kind === 'step' ? 'Begriffe' : group.kind === 'role' ? 'Rollen' : 'Systeme'} vereinheitlicht`,
      repairNotes: [`${group.kind === 'step' ? 'Begriffe' : group.kind === 'role' ? 'Rollen' : 'Systeme'} werden nun mit „${cleaned}“ vereinheitlicht.`],
      journalEntry: {
        title: `${group.kind === 'step' ? 'Begriffe' : group.kind === 'role' ? 'Rollen' : 'Systeme'} vereinheitlicht`,
        detail: `Die Varianten ${group.variants.map(variant => variant.value).join(', ')} werden auf „${cleaned}“ zusammengeführt.`,
      },
    });
  }

  if (overview.stepCount === 0 && overview.issueCount === 0) return null;

  const selectedCount = selectedSuggestionIds.length;
  const activeRulesCount = reviewState?.normalizationRules?.length ?? 0;
  const journalEntries = reviewState?.repairJournal ?? [];

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
            Hier schärfen Sie die lokale Ableitung ohne KI. Neu sind Mehrfachauswahl, sichere Sitzungsschritte mit Rückgängig und gemerkte
            Vereinheitlichungsregeln für Begriffe, Rollen und Systeme.
          </p>
        </div>
      </div>

      <SessionToolbar canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} statusLabel={sessionStatusLabel} />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <SummaryMetric label="Zu prüfen" value={overview.suggestionCount} note="Empfohlene Korrekturen" />
        <SummaryMetric label="Vereinheitlichen" value={overview.renameCount} note="robustere Schrittbezeichnungen" />
        <SummaryMetric label="Aufteilen" value={overview.splitCount} note="mögliche Sammelschritte" />
        <SummaryMetric label="Reibungssignale" value={overview.reclassifyCount} note="eher Problem als Schritt" />
        <SummaryMetric label="Aktive Regeln" value={activeRulesCount} note="gemerkte Vereinheitlichungen" />
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
          <button
            type="button"
            onClick={() => applySuggestionIds(selectedSuggestionIds)}
            disabled={selectedCount === 0}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            {selectedCount === 0 ? 'Nichts ausgewählt' : `${selectedCount} ausgewählte Hinweise anwenden`}
          </button>
        </div>
      )}

      {overview.suggestionCount === 0 ? (
        <div className="flex gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Die automatische Ableitung wirkt bereits konsistent. Sie können direkt weiter analysieren oder bei Bedarf einzelne Quellen manuell ergänzen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Empfohlene Korrekturen</p>
            {overview.suggestions.length > visibleSuggestions.length ? (
              <p className="text-xs text-slate-400">Es werden zunächst die wichtigsten {visibleSuggestions.length} Hinweise gezeigt.</p>
            ) : (
              <p className="text-xs text-slate-400">Mehrfachauswahl ist direkt auf den Karten möglich.</p>
            )}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {visibleSuggestions.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                selected={selectedSuggestionIds.includes(suggestion.id)}
                onToggle={suggestionId => setSelectedSuggestionIds(current => current.includes(suggestionId) ? current.filter(id => id !== suggestionId) : [...current, suggestionId])}
                onApply={suggestion => applySuggestionIds([suggestion.id])}
                onFocusCase={onFocusCase}
              />
            ))}
          </div>
        </div>
      )}

      <NormalizationWorkbench groups={normalizationGroups} onApply={applyNormalizationGroup} />

      <RepairJournalPanel entries={journalEntries} />

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
