import { useEffect, useState } from 'react';
import type { Process, ProcessVersion } from '../domain/process';
import type { CaptureDraftException, ExceptionType, CaptureElementStatus } from '../domain/capture';
import { findEvidenceContexts } from './evidence/findEvidenceInSource';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { isIsoDuration } from '../utils/isoDuration';

interface DraftExceptionsEditorProps {
  process: Process;
  version: ProcessVersion;
  onSave: (updatedVersionPatch: Partial<ProcessVersion>) => Promise<void>;
}

const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  missing_data: 'Fehlende Daten',
  timeout: 'Zeitüberschreitung',
  error: 'Fehler / Störung',
  cancellation: 'Abbruch',
  compliance: 'Compliance-Verstoß',
  other: 'Sonstiges',
};

export function DraftExceptionsEditor({ version, onSave }: DraftExceptionsEditorProps) {
  const draft = version.sidecar.captureDraft;
  const happyPath = draft?.happyPath || [];
  const [exceptions, setExceptions] = useState<CaptureDraftException[]>(draft?.exceptions || []);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceModalTitle, setEvidenceModalTitle] = useState('');
  const [evidenceModalText, setEvidenceModalText] = useState('');
  const [evidenceModalRefId, setEvidenceModalRefId] = useState('');

  useEffect(() => {
    if (hasChanges) return;
    setExceptions(draft?.exceptions || []);
  }, [draft?.exceptions, hasChanges]);

  const hasBlockingErrors = exceptions.some(
    (e) => !e.description.trim() || !e.handling.trim()
  );

  const handleAddException = () => {
    const newException: CaptureDraftException = {
      exceptionId: crypto.randomUUID(),
      relatedStepId: undefined,
      type: 'error',
      description: '',
      handling: '',
    };
    setExceptions([...exceptions, newException]);
    setHasChanges(true);
  };

  const handleRemoveException = (exceptionId: string) => {
    setExceptions(exceptions.filter((e) => e.exceptionId !== exceptionId));
    setHasChanges(true);
  };

  const handleUpdateException = (
    exceptionId: string,
    updates: Partial<CaptureDraftException>
  ) => {
    setExceptions(
      exceptions.map((e) => (e.exceptionId === exceptionId ? { ...e, ...updates } : e))
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
            exceptions,
          },
        },
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving exceptions:', error);
      alert('Fehler beim Speichern der Ausnahmen');
    } finally {
      setSaving(false);
    }
  };

  const getExceptionSnippet = (ex: CaptureDraftException): string => {
    const s = ex.evidence?.[0]?.snippet;
    return typeof s === 'string' ? s : '';
  };

  const getExceptionRefId = (ex: CaptureDraftException): string => {
    const r = ex.evidence?.[0]?.refId;
    return typeof r === 'string' ? r : '';
  };

  const patchExceptionSnippet = (exceptionId: string, raw: string) => {
    const cleaned = raw.trim();
    const exception = exceptions.find((ex) => ex.exceptionId === exceptionId);
    const existingRefId = exception?.evidence?.[0]?.refId;

    handleUpdateException(exceptionId, {
      evidence: cleaned || existingRefId ? [{ type: 'text' as const, snippet: cleaned, refId: existingRefId }] : undefined,
    });
  };

  const patchExceptionRefId = (exceptionId: string, raw: string) => {
    const cleaned = raw.trim();
    const exception = exceptions.find((ex) => ex.exceptionId === exceptionId);
    const existingSnippet = exception?.evidence?.[0]?.snippet;

    handleUpdateException(exceptionId, {
      evidence: cleaned || existingSnippet ? [{ type: 'text' as const, snippet: existingSnippet || '', refId: cleaned || undefined }] : undefined,
    });
  };

  const getValidationWarnings = (exception: CaptureDraftException): string[] => {
    const warnings: string[] = [];
    if (!exception.description.trim()) {
      warnings.push('Beschreibung fehlt');
    }
    if (!exception.handling.trim()) {
      warnings.push('Handling fehlt');
    }
    if (exception.type === 'timeout' && exception.timeoutDurationIso && !isIsoDuration(exception.timeoutDurationIso)) {
      warnings.push('Timeout-Dauer ist keine gültige ISO-8601 Duration (z.B. PT1H, P2D)');
    }
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
          <h3 className="text-lg font-semibold text-slate-900">Ausnahmen</h3>
          <p className="text-sm text-slate-600 mt-1">
            Dokumentieren Sie mögliche Fehler und Störungen im Prozess
          </p>
        </div>
        <button
          onClick={handleAddException}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Ausnahme hinzufügen
        </button>
      </div>

      {exceptions.length === 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-600">
            Noch keine Ausnahmen erfasst. Klicken Sie auf "Ausnahme hinzufügen", um zu beginnen.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {exceptions.map((exception) => {
          const warnings = getValidationWarnings(exception);
          return (
            <div
              id={`exception-${exception.exceptionId}`}
              key={exception.exceptionId}
              className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Bezugsschritt (optional)
                      </label>
                      <select
                        value={exception.relatedStepId || ''}
                        onChange={(e) =>
                          handleUpdateException(exception.exceptionId, {
                            relatedStepId: e.target.value || undefined,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Kein spezifischer Schritt</option>
                        {happyPath.map((step) => (
                          <option key={step.stepId} value={step.stepId}>
                            {step.order}. {step.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Typ *
                      </label>
                      <select
                        value={exception.type}
                        onChange={(e) =>
                          handleUpdateException(exception.exceptionId, {
                            type: e.target.value as ExceptionType,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {Object.entries(EXCEPTION_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Status
                      </label>
                      <select
                        value={exception.status ?? 'unclear'}
                        onChange={(e) =>
                          handleUpdateException(exception.exceptionId, {
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

                  {exception.type === 'timeout' && (
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Timeout-Einstellungen</h4>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Timeout-Dauer (ISO 8601)
                          </label>
                          <input
                            type="text"
                            value={exception.timeoutDurationIso ?? ''}
                            onChange={(e) =>
                              handleUpdateException(exception.exceptionId, {
                                timeoutDurationIso: e.target.value || undefined,
                              })
                            }
                            placeholder="z.B. PT30M, PT4H, P2D"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex flex-wrap gap-2 mt-2">
                            {['PT30M', 'PT1H', 'PT4H', 'P1D', 'P2D'].map((duration) => (
                              <button
                                key={duration}
                                type="button"
                                onClick={() =>
                                  handleUpdateException(exception.exceptionId, {
                                    timeoutDurationIso: duration,
                                  })
                                }
                                className="px-2 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700"
                              >
                                {duration}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Timer-Verhalten
                          </label>
                          <select
                            value={(exception.timeoutInterrupting ?? true) ? 'interrupting' : 'non_interrupting'}
                            onChange={(e) =>
                              handleUpdateException(exception.exceptionId, {
                                timeoutInterrupting: e.target.value === 'interrupting',
                              })
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="interrupting">Unterbrechend (Standard)</option>
                            <option value="non_interrupting">Nicht unterbrechend</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Beschreibung *
                    </label>
                    <textarea
                      value={exception.description}
                      onChange={(e) =>
                        handleUpdateException(exception.exceptionId, {
                          description: e.target.value,
                        })
                      }
                      placeholder="Was genau kann schiefgehen?"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Handling / Maßnahmen *
                    </label>
                    <textarea
                      value={exception.handling}
                      onChange={(e) =>
                        handleUpdateException(exception.exceptionId, {
                          handling: e.target.value,
                        })
                      }
                      placeholder="Wie wird die Ausnahme behandelt?"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
                        value={getExceptionRefId(exception)}
                        onChange={(e) => patchExceptionRefId(exception.exceptionId, e.target.value)}
                        placeholder="z.B. Workshop 17.02.2026, SOP v3"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <textarea
                      value={getExceptionSnippet(exception)}
                      onChange={(e) => patchExceptionSnippet(exception.exceptionId, e.target.value)}
                      rows={2}
                      placeholder="optional (z.B. Zitat aus Workshop)"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const snip = getExceptionSnippet(exception);
                        const refId = getExceptionRefId(exception);
                        if (!snip && !refId) return;
                        setEvidenceModalTitle(`Ausnahme: ${EXCEPTION_TYPE_LABELS[exception.type]}`);
                        setEvidenceModalText(snip);
                        setEvidenceModalRefId(refId);
                        setEvidenceModalOpen(true);
                      }}
                      disabled={!getExceptionSnippet(exception) && !getExceptionRefId(exception)}
                      className="mt-2 px-3 py-2 bg-slate-600 text-white rounded text-xs hover:bg-slate-700 disabled:bg-slate-300"
                    >
                      Quelle anzeigen
                    </button>
                  </div>

                  {exception.relatedStepId && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                      <p className="text-xs text-slate-600">
                        Bezieht sich auf: <span className="font-medium">{getStepLabel(exception.relatedStepId)}</span>
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleRemoveException(exception.exceptionId)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  title="Ausnahme löschen"
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
            </div>
          );
        })}
      </div>

      {exceptions.length > 0 && (
        <>
          {hasBlockingErrors && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800 mb-1">
                  Speichern nicht möglich
                </p>
                <p className="text-sm text-red-700">
                  Bitte ergänzen Sie bei allen Ausnahmen Beschreibung und Handling. Unvollständige
                  Ausnahmen sind für Automatisierung und Review nicht nutzbar.
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
              {saving ? 'Speichern...' : 'Ausnahmen speichern'}
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
