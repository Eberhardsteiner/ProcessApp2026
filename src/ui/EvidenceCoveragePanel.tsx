import type { ProcessVersion } from '../domain/process';

interface EvidenceCoveragePanelProps {
  version: ProcessVersion;
  onGoToDraft: () => void;
  onGoToStep?: (stepId: string) => void;
  onGoToDecision?: (decisionId: string) => void;
  onGoToException?: (exceptionId: string) => void;
}

export function EvidenceCoveragePanel({ version, onGoToDraft, onGoToStep, onGoToDecision, onGoToException }: EvidenceCoveragePanelProps) {
  const draft = version.sidecar.captureDraft;

  if (!draft) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Evidence Coverage</h2>
        <p className="text-sm text-slate-600">Kein Draft vorhanden</p>
      </div>
    );
  }

  function hasEvidence(evidence?: Array<{ type: string; snippet?: string; refId?: string }>): boolean {
    if (!evidence || !Array.isArray(evidence) || evidence.length === 0) return false;
    const first = evidence[0];
    return !!(first && ((first.snippet && first.snippet.trim()) || (first.refId && first.refId.trim())));
  }

  const stepsWithEvidence = draft.happyPath.filter((s) => hasEvidence(s.evidence));
  const stepsTotal = draft.happyPath.length;

  const decisionsWithEvidence = (draft.decisions || []).filter((d) => hasEvidence(d.evidence));
  const decisionsTotal = (draft.decisions || []).length;

  const exceptionsWithEvidence = (draft.exceptions || []).filter((ex) => hasEvidence(ex.evidence));
  const exceptionsTotal = (draft.exceptions || []).length;

  const missingSteps = draft.happyPath.filter((s) => !hasEvidence(s.evidence));
  const missingDecisions = (draft.decisions || []).filter((d) => !hasEvidence(d.evidence));
  const missingExceptions = (draft.exceptions || []).filter((ex) => !hasEvidence(ex.evidence));

  const hasMissing = missingSteps.length > 0 || missingDecisions.length > 0 || missingExceptions.length > 0;

  const stepsPercent = stepsTotal > 0 ? Math.round((stepsWithEvidence.length / stepsTotal) * 100) : 0;
  const decisionsPercent = decisionsTotal > 0 ? Math.round((decisionsWithEvidence.length / decisionsTotal) * 100) : 0;
  const exceptionsPercent = exceptionsTotal > 0 ? Math.round((exceptionsWithEvidence.length / exceptionsTotal) * 100) : 0;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Evidence Coverage</h2>

      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-700">Happy Path:</span>
          <span className="font-medium text-slate-900">
            {stepsWithEvidence.length} / {stepsTotal} ({stepsPercent}%)
          </span>
        </div>

        {decisionsTotal > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700">Entscheidungen:</span>
            <span className="font-medium text-slate-900">
              {decisionsWithEvidence.length} / {decisionsTotal} ({decisionsPercent}%)
            </span>
          </div>
        )}

        {exceptionsTotal > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700">Ausnahmen:</span>
            <span className="font-medium text-slate-900">
              {exceptionsWithEvidence.length} / {exceptionsTotal} ({exceptionsPercent}%)
            </span>
          </div>
        )}
      </div>

      {hasMissing && (
        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Fehlende Evidence</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {missingSteps.map((step) => (
              onGoToStep ? (
                <button
                  key={step.stepId}
                  onClick={() => onGoToStep(step.stepId)}
                  className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:underline"
                >
                  • Schritt {step.order}: {step.label}
                </button>
              ) : (
                <div key={step.stepId} className="text-sm text-slate-600">
                  • Schritt {step.order}: {step.label}
                </div>
              )
            ))}

            {missingDecisions.map((decision) => (
              onGoToDecision ? (
                <button
                  key={decision.decisionId}
                  onClick={() => onGoToDecision(decision.decisionId)}
                  className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:underline"
                >
                  • Entscheidung: {decision.question || '(ohne Frage)'}
                </button>
              ) : (
                <div key={decision.decisionId} className="text-sm text-slate-600">
                  • Entscheidung: {decision.question || '(ohne Frage)'}
                </div>
              )
            ))}

            {missingExceptions.map((exception) => (
              onGoToException ? (
                <button
                  key={exception.exceptionId}
                  onClick={() => onGoToException(exception.exceptionId)}
                  className="w-full text-left text-sm text-slate-700 hover:text-slate-900 hover:underline"
                >
                  • Ausnahme: {exception.description.slice(0, 60)}...
                </button>
              ) : (
                <div key={exception.exceptionId} className="text-sm text-slate-600">
                  • Ausnahme: {exception.description.slice(0, 60)}...
                </div>
              )
            ))}
          </div>

          <button
            onClick={onGoToDraft}
            className="mt-4 w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm"
          >
            Zum Draft (Evidence ergänzen)
          </button>
        </div>
      )}

      {!hasMissing && (
        <div className="border-t border-slate-200 pt-4">
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
            ✓ Alle Elemente haben Evidence (Quelle oder Snippet)
          </div>
        </div>
      )}
    </div>
  );
}
