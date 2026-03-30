import type { ProcessVersion } from '../domain/process';
import { EvidenceCoveragePanel } from './EvidenceCoveragePanel';

interface OpenIssuesDashboardProps {
  version: ProcessVersion;
  onGoToReview: () => void;
  onGoToDraft: () => void;
  onGoToMining: () => void;
  onGoToStep: (stepId: string) => void;
  onGoToDecision: (decisionId: string) => void;
  onGoToException: (exceptionId: string) => void;
  onGoToMiningActivity: (activityKey: string) => void;
  onOpenSearchWithQuery: (query: string) => void;
}

export function OpenIssuesDashboard({
  version,
  onGoToReview,
  onGoToDraft,
  onGoToMining,
  onGoToStep,
  onGoToDecision,
  onGoToException,
  onGoToMiningActivity,
  onOpenSearchWithQuery,
}: OpenIssuesDashboardProps) {
  const questions = version.quality.semanticQuestions ?? [];
  const openQuestions = questions.filter((q) => (q.status ?? 'open') !== 'done');

  const notes = version.sidecar.aiImportNotes ?? [];
  const sortedNotes = [...notes].sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const mining = version.sidecar.processMining;
  const unmappedActivities = mining
    ? mining.activityMappings.filter((a) => !a.stepId).sort((a, b) => b.count - a.count)
    : [];

  const draft = version.sidecar.captureDraft;

  function getStepLabel(stepId: string): string {
    if (!draft) return '(Schritt nicht gefunden)';
    const step = draft.happyPath.find((s) => s.stepId === stepId);
    if (!step) return '(Schritt nicht gefunden)';
    return `${step.order}. ${step.label}`;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Open Issues</h1>
        <p className="text-sm text-slate-600">
          Übersicht über offene Punkte im aktuellen Prozessmodell
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Semantikfragen Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Semantische Prüffragen
          </h2>

          {openQuestions.length === 0 ? (
            <div className="text-sm text-slate-600 mb-4">
              Keine offenen semantischen Fragen vorhanden.
            </div>
          ) : (
            <>
              <div className="text-sm text-slate-700 mb-4">
                <span className="font-medium">Offene Fragen:</span> {openQuestions.length}
              </div>

              <div className="space-y-3 mb-6 max-h-80 overflow-y-auto">
                {openQuestions.slice(0, 8).map((q) => (
                  <div key={q.id} className="border-l-2 border-slate-300 pl-3 py-1">
                    <div className="text-sm text-slate-900 font-medium mb-1">
                      {q.question}
                    </div>

                    {q.relatedStepId && (
                      <div className="text-xs text-slate-600 mb-2">
                        Schritt: {getStepLabel(q.relatedStepId)}
                      </div>
                    )}

                    {!q.relatedStepId && q.relatedStepHint && (
                      <div className="text-xs text-slate-600">
                        Hinweis: {q.relatedStepHint}
                      </div>
                    )}

                    {q.answer && (
                      <div className="text-xs text-slate-500 mt-1">
                        Notiz: {q.answer.slice(0, 120)}
                        {q.answer.length > 120 ? '...' : ''}
                      </div>
                    )}

                    {q.relatedStepId && (
                      <button
                        onClick={() => onGoToStep(q.relatedStepId!)}
                        className="mt-2 px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
                      >
                        Zum Schritt
                      </button>
                    )}
                  </div>
                ))}

                {openQuestions.length > 8 && (
                  <div className="text-xs text-slate-500 italic">
                    ... und {openQuestions.length - 8} weitere
                  </div>
                )}
              </div>
            </>
          )}

          <button
            onClick={onGoToReview}
            className="w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm"
          >
            Im Review bearbeiten
          </button>
        </div>

        {/* Import Notes Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Import-Hinweise
          </h2>

          {sortedNotes.length === 0 ? (
            <div className="text-sm text-slate-600 mb-4">
              Keine Import-Hinweise vorhanden.
            </div>
          ) : (
            <>
              <div className="text-sm text-slate-700 mb-4">
                <span className="font-medium">Hinweise:</span> {sortedNotes.length}
              </div>

              <div className="space-y-3 mb-6 max-h-80 overflow-y-auto">
                {sortedNotes.slice(0, 6).map((note, idx) => (
                  <div key={idx} className="border-l-2 border-amber-300 pl-3 py-1">
                    <div className="text-xs text-slate-500 mb-1">
                      {note.createdAt
                        ? new Date(note.createdAt).toLocaleString('de-DE')
                        : 'Datum unbekannt'}
                      {note.sourceRefId && (
                        <span className="ml-2">
                          (Ref: {note.sourceRefId.slice(0, 8)}...)
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-900 mb-2">{note.message}</div>

                    {note.sourceRefId && (
                      <button
                        onClick={() => onOpenSearchWithQuery(note.sourceRefId!)}
                        className="px-2 py-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100"
                      >
                        Quelle in Suche öffnen
                      </button>
                    )}
                  </div>
                ))}

                {sortedNotes.length > 6 && (
                  <div className="text-xs text-slate-500 italic">
                    ... und {sortedNotes.length - 6} weitere
                  </div>
                )}
              </div>
            </>
          )}

          <button
            onClick={onGoToReview}
            className="w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm"
          >
            Im Review ansehen
          </button>
        </div>
      </div>

      {/* Evidence Coverage Panel - Full Width */}
      <div>
        <div className="text-sm text-slate-600 mb-3">
          Evidence ist Grundlage für Freigaben im Workshop.
        </div>
        <EvidenceCoveragePanel
          version={version}
          onGoToDraft={onGoToDraft}
          onGoToStep={onGoToStep}
          onGoToDecision={onGoToDecision}
          onGoToException={onGoToException}
        />
      </div>

      {/* Mining Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Process Mining
        </h2>

        {!mining ? (
          <>
            <div className="text-sm text-slate-600 mb-4">
              Kein Event Log importiert.
            </div>
            <button
              onClick={onGoToMining}
              className="w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm"
            >
              Zum Process Mining
            </button>
          </>
        ) : (
          <>
            {unmappedActivities.length === 0 ? (
              <>
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3 mb-4">
                  ✓ Alle Aktivitäten sind gemappt
                </div>
                <button
                  onClick={onGoToMining}
                  className="w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm"
                >
                  Zum Process Mining
                </button>
              </>
            ) : (
              <>
                <div className="text-sm text-slate-700 mb-4">
                  <span className="font-medium">Ungemappte Aktivitäten:</span>{' '}
                  {unmappedActivities.length}
                </div>

                <div className="space-y-2 mb-6 max-h-80 overflow-y-auto">
                  {unmappedActivities.slice(0, 10).map((activity, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border-l-2 border-orange-300 pl-3 py-1"
                    >
                      <div className="text-sm text-slate-900 flex-1">
                        {activity.example}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-slate-600 bg-slate-100 rounded px-2 py-0.5">
                          {activity.count}×
                        </div>
                        <button
                          onClick={() => onGoToMiningActivity(activity.activityKey)}
                          className="px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
                        >
                          Zum Mapping
                        </button>
                      </div>
                    </div>
                  ))}

                  {unmappedActivities.length > 10 && (
                    <div className="text-xs text-slate-500 italic">
                      ... und {unmappedActivities.length - 10} weitere
                    </div>
                  )}
                </div>

                <button
                  onClick={onGoToMining}
                  className="w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm"
                >
                  Zum Mapping
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
