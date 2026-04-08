import { useEffect, useState } from 'react';
import type { Process, ProcessVersion } from '../domain/process';
import type { CaptureDraftDecision, CaptureDraftDecisionBranch, GatewayType, CaptureElementStatus } from '../domain/capture';
import { findEvidenceContexts } from './evidence/findEvidenceInSource';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

interface DraftDecisionsEditorProps {
  process: Process;
  version: ProcessVersion;
  onSave: (updatedVersionPatch: Partial<ProcessVersion>) => Promise<void>;
}

export function DraftDecisionsEditor({ version, onSave }: DraftDecisionsEditorProps) {
  const draft = version.sidecar.captureDraft;
  const happyPath = draft?.happyPath || [];
  const [decisions, setDecisions] = useState<CaptureDraftDecision[]>(draft?.decisions || []);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceModalTitle, setEvidenceModalTitle] = useState('');
  const [evidenceModalText, setEvidenceModalText] = useState('');
  const [evidenceModalRefId, setEvidenceModalRefId] = useState('');

  useEffect(() => {
    if (hasChanges) return;
    setDecisions(draft?.decisions || []);
  }, [draft?.decisions, hasChanges]);

  const hasBlockingErrors = decisions.some((d) =>
    d.branches.some((b) => !b.conditionLabel.trim())
  );

  const handleAddDecision = () => {
    const lastStep = happyPath[happyPath.length - 1];
    const newDecision: CaptureDraftDecision = {
      decisionId: crypto.randomUUID(),
      afterStepId: lastStep?.stepId || '',
      gatewayType: 'xor',
      question: '',
      branches: [
        {
          branchId: crypto.randomUUID(),
          conditionLabel: 'Ja',
          nextStepId: undefined,
          endsProcess: false,
        },
        {
          branchId: crypto.randomUUID(),
          conditionLabel: 'Nein',
          nextStepId: undefined,
          endsProcess: false,
        },
      ],
    };
    setDecisions([...decisions, newDecision]);
    setHasChanges(true);
  };

  const handleRemoveDecision = (decisionId: string) => {
    setDecisions(decisions.filter((d) => d.decisionId !== decisionId));
    setHasChanges(true);
  };

  const handleUpdateDecision = (decisionId: string, updates: Partial<CaptureDraftDecision>) => {
    setDecisions(
      decisions.map((d) => (d.decisionId === decisionId ? { ...d, ...updates } : d))
    );
    setHasChanges(true);
  };

  const handleAddBranch = (decisionId: string) => {
    const newBranch: CaptureDraftDecisionBranch = {
      branchId: crypto.randomUUID(),
      conditionLabel: 'Weitere Bedingung',
      nextStepId: undefined,
      endsProcess: false,
    };
    setDecisions(
      decisions.map((d) =>
        d.decisionId === decisionId
          ? { ...d, branches: [...d.branches, newBranch] }
          : d
      )
    );
    setHasChanges(true);
  };

  const handleRemoveBranch = (decisionId: string, branchId: string) => {
    setDecisions(
      decisions.map((d) =>
        d.decisionId === decisionId
          ? { ...d, branches: d.branches.filter((b) => b.branchId !== branchId) }
          : d
      )
    );
    setHasChanges(true);
  };

  const handleUpdateBranch = (
    decisionId: string,
    branchId: string,
    updates: Partial<CaptureDraftDecisionBranch>
  ) => {
    setDecisions(
      decisions.map((d) =>
        d.decisionId === decisionId
          ? {
              ...d,
              branches: d.branches.map((b) =>
                b.branchId === branchId ? { ...b, ...updates } : b
              ),
            }
          : d
      )
    );
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (hasBlockingErrors) return;

    setSaving(true);
    try {
      await onSave({
        sidecar: {
          ...version.sidecar,
          captureDraft: {
            ...draft!,
            decisions,
          },
        },
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving decisions:', error);
      alert('Fehler beim Speichern der Entscheidungen');
    } finally {
      setSaving(false);
    }
  };

  const getDecisionSnippet = (d: CaptureDraftDecision): string => {
    const s = d.evidence?.[0]?.snippet;
    return typeof s === 'string' ? s : '';
  };

  const getDecisionRefId = (d: CaptureDraftDecision): string => {
    const r = d.evidence?.[0]?.refId;
    return typeof r === 'string' ? r : '';
  };

  const patchDecisionSnippet = (decisionId: string, raw: string) => {
    const cleaned = raw.trim();
    const decision = decisions.find((d) => d.decisionId === decisionId);
    const existingRefId = decision?.evidence?.[0]?.refId;

    handleUpdateDecision(decisionId, {
      evidence: cleaned || existingRefId ? [{ type: 'text' as const, snippet: cleaned, refId: existingRefId }] : undefined,
    });
  };

  const patchDecisionRefId = (decisionId: string, raw: string) => {
    const cleaned = raw.trim();
    const decision = decisions.find((d) => d.decisionId === decisionId);
    const existingSnippet = decision?.evidence?.[0]?.snippet;

    handleUpdateDecision(decisionId, {
      evidence: cleaned || existingSnippet ? [{ type: 'text' as const, snippet: existingSnippet || '', refId: cleaned || undefined }] : undefined,
    });
  };

  const getValidationWarnings = (decision: CaptureDraftDecision): string[] => {
    const warnings: string[] = [];
    if (!decision.question.trim()) {
      warnings.push('Frage fehlt');
    }
    decision.branches.forEach((branch, idx) => {
      if (!branch.conditionLabel.trim()) {
        warnings.push(`Branch ${idx + 1}: Bedingung fehlt`);
      }
      if (!branch.endsProcess && !branch.nextStepId) {
        warnings.push(`Branch ${idx + 1}: Weder Folgeschritt noch Prozessende definiert`);
      }
    });
    return warnings;
  };

  const getStepLabel = (stepId: string): string => {
    const step = happyPath.find((s) => s.stepId === stepId);
    return step ? `${step.order}. ${step.label}` : 'Unbekannter Schritt';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Entscheidungen</h3>
          <p className="text-sm text-slate-600 mt-1">
            Definieren Sie Verzweigungen im Prozessablauf
          </p>
        </div>
        <button
          onClick={handleAddDecision}
          disabled={happyPath.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Entscheidung hinzufügen
        </button>
      </div>

      {happyPath.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            Bitte erfassen Sie zuerst Prozessschritte im Happy Path, bevor Sie Entscheidungen hinzufügen.
          </p>
        </div>
      )}

      {decisions.length === 0 && happyPath.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-600">
            Noch keine Entscheidungen erfasst. Klicken Sie auf "Entscheidung hinzufügen", um zu beginnen.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {decisions.map((decision) => {
          const warnings = getValidationWarnings(decision);
          return (
            <div
              id={`decision-${decision.decisionId}`}
              key={decision.decisionId}
              className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Nach Schritt
                      </label>
                      <select
                        value={decision.afterStepId}
                        onChange={(e) =>
                          handleUpdateDecision(decision.decisionId, {
                            afterStepId: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Bitte wählen</option>
                        {happyPath.map((step) => (
                          <option key={step.stepId} value={step.stepId}>
                            {step.order}. {step.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Gateway-Typ
                      </label>
                      <select
                        value={decision.gatewayType}
                        onChange={(e) =>
                          handleUpdateDecision(decision.decisionId, {
                            gatewayType: e.target.value as GatewayType,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="xor">XOR (Exklusiv)</option>
                        <option value="and">AND (Parallel)</option>
                        <option value="or">OR (Inklusiv)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Status
                      </label>
                      <select
                        value={decision.status ?? 'unclear'}
                        onChange={(e) =>
                          handleUpdateDecision(decision.decisionId, {
                            status: e.target.value as CaptureElementStatus,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="unclear">Unklar</option>
                        <option value="confirmed">Bestätigt</option>
                        <option value="derived">Abgeleitet</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Frage / Entscheidungskriterium
                    </label>
                    <input
                      type="text"
                      value={decision.question}
                      onChange={(e) =>
                        handleUpdateDecision(decision.decisionId, {
                          question: e.target.value,
                        })
                      }
                      placeholder="z.B. Ist der Betrag über 1000 EUR?"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Evidence
                    </label>
                    <div className="mb-2">
                      <label className="block text-xs text-slate-600 mb-1">Quelle (Label)</label>
                      <input
                        type="text"
                        value={getDecisionRefId(decision)}
                        onChange={(e) => patchDecisionRefId(decision.decisionId, e.target.value)}
                        placeholder="z.B. Workshop 17.02.2026, SOP v3"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <textarea
                      value={getDecisionSnippet(decision)}
                      onChange={(e) => patchDecisionSnippet(decision.decisionId, e.target.value)}
                      rows={2}
                      placeholder="optional (z.B. Zitat aus Workshop)"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const snip = getDecisionSnippet(decision);
                        const refId = getDecisionRefId(decision);
                        if (!snip && !refId) return;
                        setEvidenceModalTitle(`Entscheidung: ${decision.question || '(ohne Frage)'}`);
                        setEvidenceModalText(snip);
                        setEvidenceModalRefId(refId);
                        setEvidenceModalOpen(true);
                      }}
                      disabled={!getDecisionSnippet(decision) && !getDecisionRefId(decision)}
                      className="mt-2 px-3 py-2 bg-slate-600 text-white rounded text-xs hover:bg-slate-700 disabled:bg-slate-300"
                    >
                      Quelle anzeigen
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => handleRemoveDecision(decision.decisionId)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  title="Entscheidung löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800 mb-1">
                      Validierungshinweise:
                    </p>
                    <ul className="text-sm text-amber-700 space-y-1">
                      {warnings.map((warning, idx) => (
                        <li key={idx}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Verzweigungen ({decision.branches.length})
                  </h4>
                  <button
                    onClick={() => handleAddBranch(decision.decisionId)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Branch hinzufügen
                  </button>
                </div>

                <div className="space-y-3">
                  {decision.branches.map((branch) => (
                    <div
                      key={branch.branchId}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Bedingung / Label *
                            </label>
                            <input
                              type="text"
                              value={branch.conditionLabel}
                              onChange={(e) =>
                                handleUpdateBranch(decision.decisionId, branch.branchId, {
                                  conditionLabel: e.target.value,
                                })
                              }
                              placeholder="z.B. Ja, Nein, > 1000 EUR"
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Folgeschritt
                            </label>
                            <select
                              value={branch.nextStepId || ''}
                              onChange={(e) =>
                                handleUpdateBranch(decision.decisionId, branch.branchId, {
                                  nextStepId: e.target.value || undefined,
                                  endsProcess: false,
                                })
                              }
                              disabled={branch.endsProcess}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                            >
                              <option value="">Noch nicht definiert</option>
                              {happyPath.map((step) => (
                                <option key={step.stepId} value={step.stepId}>
                                  {step.order}. {step.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`ends-${branch.branchId}`}
                              checked={branch.endsProcess || false}
                              onChange={(e) =>
                                handleUpdateBranch(decision.decisionId, branch.branchId, {
                                  endsProcess: e.target.checked,
                                  nextStepId: e.target.checked ? undefined : branch.nextStepId,
                                })
                              }
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label
                              htmlFor={`ends-${branch.branchId}`}
                              className="text-sm text-slate-700"
                            >
                              Prozess endet hier
                            </label>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            handleRemoveBranch(decision.decisionId, branch.branchId)
                          }
                          disabled={decision.branches.length <= 1}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Branch entfernen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {branch.nextStepId && (
                        <div className="text-xs text-slate-600 bg-white rounded px-2 py-1 border border-slate-200">
                          → {getStepLabel(branch.nextStepId)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {decisions.length > 0 && (
        <>
          {hasBlockingErrors && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800 mb-1">
                  Speichern nicht möglich
                </p>
                <p className="text-sm text-red-700">
                  Bitte füllen Sie bei allen Branches das Feld „Bedingung/Label“ aus. Ohne diese
                  Information ist kein sauberer Export möglich.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="text-sm text-slate-600">
              {hasBlockingErrors ? (
                <span className="text-red-600 font-medium">Bitte Pflichtfelder ausfüllen</span>
              ) : hasChanges ? (
                <span className="text-amber-600 font-medium">Ungespeicherte Änderungen</span>
              ) : (
                <span className="text-green-600">Alle Änderungen gespeichert</span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving || hasBlockingErrors}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {saving ? 'Speichern...' : 'Entscheidungen speichern'}
            </button>
          </div>
        </>
      )}

      {evidenceModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg border border-slate-200 w-full max-w-2xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Evidence</div>
                <div className="text-xs text-slate-600 mt-1">{evidenceModalTitle}</div>
              </div>
              <button
                type="button"
                onClick={() => setEvidenceModalOpen(false)}
                className="px-3 py-2 rounded-md bg-slate-200 text-slate-700 text-sm hover:bg-slate-300"
              >
                Schließen
              </button>
            </div>

            {evidenceModalRefId && (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-700 mb-1">Quelle:</div>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-sm text-blue-900">
                  {evidenceModalRefId}
                </div>
              </div>
            )}

            {evidenceModalText && (
              <div className="mt-3">
                <div className="text-xs font-medium text-slate-700 mb-1">Snippet:</div>
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-800 whitespace-pre-wrap">
                  {evidenceModalText}
                </div>
              </div>
            )}

            {(() => {
              if (!evidenceModalRefId || !version?.sidecar.evidenceSources) return null;

              const source = version.sidecar.evidenceSources.find((s) => s.refId === evidenceModalRefId);

              if (!source) {
                return (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                    Kein Quelltext für diese Quelle gespeichert.
                  </div>
                );
              }

              if (!evidenceModalText.trim()) {
                return (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-600">
                    Snippet leer – kann keine Fundstellen anzeigen.
                  </div>
                );
              }

              const matches = findEvidenceContexts(source.text, evidenceModalText, 3);

              if (matches.length === 0) {
                return (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                    Snippet im Quelltext nicht gefunden (evtl. paraphrasiert).
                  </div>
                );
              }

              return (
                <div className="mt-3">
                  <div className="text-xs font-medium text-slate-700 mb-2">
                    Fundstellen im Quelltext ({matches.length}):
                  </div>
                  <div className="space-y-2">
                    {matches.map((m, idx) => (
                      <div key={idx} className="bg-green-50 border border-green-200 rounded-md p-3 text-sm">
                        <div className="text-xs text-green-800 mb-1">
                          Zeile {m.line}, Position {m.charIndex}
                        </div>
                        <div className="text-slate-800">
                          <span className="text-slate-500">{m.contextBefore}</span>
                          <mark className="bg-yellow-200 font-semibold">{m.match}</mark>
                          <span className="text-slate-500">{m.contextAfter}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="mt-3 text-xs text-slate-600">
              Evidence ist rein textbasiert. Audio-Quellen folgen später.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
