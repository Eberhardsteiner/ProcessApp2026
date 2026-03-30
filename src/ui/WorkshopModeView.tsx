import { useState, useEffect, useMemo, useRef } from 'react';
import type { Process, ProcessVersion, SemanticQuestion, SemanticQuestionStatus, ImprovementBacklogItem, ImprovementCategory, ImprovementStatus } from '../domain/process';
import type { CaptureDraftStep, CaptureDraftDecision, CaptureDraftException, CaptureElementStatus } from '../domain/capture';
import type { AppSettings } from '../settings/appSettings';
import { OpenIssuesDashboard } from './OpenIssuesDashboard';
import { FileText, TrendingUp, AlertCircle, MessageCircle, GitBranch, AlertTriangle, Plus, X, Check } from 'lucide-react';

interface WorkshopModeViewProps {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
  onGoToDraft: () => void;
  onGoToReview: () => void;
  onGoToMining: () => void;
  onOpenSearchWithQuery: (query: string) => void;
  onGoToStep: (stepId: string) => void;
  onSetMiningFilter?: (activityKeyOrText: string) => void;
}

interface WorkshopStepFocusPanelProps {
  step: CaptureDraftStep;
  version: ProcessVersion;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
  onGoToStep: (stepId: string) => void;
  onGoToDraft: () => void;
}

const IMPROVEMENT_CATEGORY_LABELS: Record<ImprovementCategory, string> = {
  standardize: 'Standardisierung',
  digitize: 'Digitalisierung',
  automate: 'Automatisierung',
  ai: 'KI',
  data: 'Daten',
  governance: 'Governance',
  customer: 'Kunde',
  compliance: 'Compliance',
  kpi: 'KPI',
};

const IMPROVEMENT_STATUS_LABELS: Record<ImprovementStatus, string> = {
  idea: 'Idee',
  planned: 'Geplant',
  in_progress: 'In Arbeit',
  done: 'Erledigt',
  discarded: 'Verworfen',
};

const GATEWAY_LABELS: Record<string, string> = {
  xor: 'XOR',
  and: 'AND',
  or: 'OR',
};

const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  missing_data: 'Fehlende Daten',
  timeout: 'Timeout',
  error: 'Fehler',
  cancellation: 'Abbruch',
  compliance: 'Compliance',
  other: 'Sonstige',
};

function WorkshopStepFocusPanel({
  step,
  version,
  onSave,
  onGoToStep,
  onGoToDraft,
}: WorkshopStepFocusPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const draft = version.sidecar.captureDraft;

  const allQuestions = version.quality.semanticQuestions ?? [];
  const stepQuestions = allQuestions.filter((q) => q.relatedStepId === step.stepId);
  const openQuestions = stepQuestions.filter((q) => (q.status ?? 'open') !== 'done');

  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [questionMessage, setQuestionMessage] = useState<string>('');

  const stepDecisions: CaptureDraftDecision[] = useMemo(() => {
    if (!draft) return [];
    return draft.decisions.filter((d) => d.afterStepId === step.stepId);
  }, [draft, step.stepId]);

  const stepExceptions: CaptureDraftException[] = useMemo(() => {
    if (!draft) return [];
    return draft.exceptions.filter((e) => e.relatedStepId === step.stepId);
  }, [draft, step.stepId]);

  const stepBacklog: ImprovementBacklogItem[] = useMemo(() => {
    return (version.sidecar.improvementBacklog ?? []).filter(
      (item) => item.scope === 'step' && item.relatedStepId === step.stepId
    );
  }, [version.sidecar.improvementBacklog, step.stepId]);

  const [showAddMassnahme, setShowAddMassnahme] = useState(false);
  const [newMassnahme, setNewMassnahme] = useState({
    title: '',
    category: 'standardize' as ImprovementCategory,
    description: '',
    impact: 'medium' as 'low' | 'medium' | 'high',
    effort: 'medium' as 'low' | 'medium' | 'high',
  });
  const [savingMassnahme, setSavingMassnahme] = useState(false);

  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [editingExceptionId, setEditingExceptionId] = useState<string | null>(null);
  const [decisionDraftQuestion, setDecisionDraftQuestion] = useState('');
  const [exceptionDraftDesc, setExceptionDraftDesc] = useState('');
  const [exceptionDraftHandling, setExceptionDraftHandling] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [savingException, setSavingException] = useState(false);

  const lastInitializedStepIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastInitializedStepIdRef.current === step.stepId) return;
    lastInitializedStepIdRef.current = step.stepId;

    const initial: Record<string, string> = {};
    openQuestions.forEach((q) => {
      initial[q.id] = q.answer ?? '';
    });

    setAnswerDrafts(initial);
    setQuestionMessage('');
    setShowAddMassnahme(false);
    setEditingDecisionId(null);
    setEditingExceptionId(null);
  }, [step.stepId, openQuestions]);

  async function handleStatusChange(newStatus: CaptureElementStatus) {
    if (!draft) return;
    setIsSaving(true);
    try {
      const updatedHappyPath = draft.happyPath.map((s) =>
        s.stepId === step.stepId ? { ...s, status: newStatus } : s
      );
      await onSave({
        sidecar: {
          ...version.sidecar,
          captureDraft: { ...draft, happyPath: updatedHappyPath },
        },
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSemanticQuestion(id: string, patch: Partial<SemanticQuestion>) {
    setSavingQuestionId(id);
    setQuestionMessage('');
    try {
      const updated = (version.quality.semanticQuestions ?? []).map((q) =>
        q.id === id ? { ...q, ...patch } : q
      );
      await onSave({ quality: { ...version.quality, semanticQuestions: updated } });
      setQuestionMessage('Gespeichert');
      setTimeout(() => setQuestionMessage(''), 1500);
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function handleAddMassnahme() {
    if (!newMassnahme.title.trim()) return;
    setSavingMassnahme(true);
    try {
      const item: ImprovementBacklogItem = {
        id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: newMassnahme.title.trim(),
        category: newMassnahme.category,
        scope: 'step',
        relatedStepId: step.stepId,
        description: newMassnahme.description.trim() || undefined,
        impact: newMassnahme.impact,
        effort: newMassnahme.effort,
        risk: 'low',
        status: 'idea',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const existing = version.sidecar.improvementBacklog ?? [];
      await onSave({
        sidecar: { ...version.sidecar, improvementBacklog: [...existing, item] },
      });
      setNewMassnahme({ title: '', category: 'standardize', description: '', impact: 'medium', effort: 'medium' });
      setShowAddMassnahme(false);
    } finally {
      setSavingMassnahme(false);
    }
  }

  function startEditDecision(d: CaptureDraftDecision) {
    setEditingDecisionId(d.decisionId);
    setDecisionDraftQuestion(d.question);
  }

  async function saveDecisionQuestion(decisionId: string) {
    if (!draft) return;
    setSavingDecision(true);
    try {
      const updated = draft.decisions.map((d) =>
        d.decisionId === decisionId ? { ...d, question: decisionDraftQuestion } : d
      );
      await onSave({
        sidecar: { ...version.sidecar, captureDraft: { ...draft, decisions: updated } },
      });
      setEditingDecisionId(null);
    } finally {
      setSavingDecision(false);
    }
  }

  async function saveDecisionStatus(decisionId: string, status: CaptureElementStatus) {
    if (!draft) return;
    const updated = draft.decisions.map((d) =>
      d.decisionId === decisionId ? { ...d, status } : d
    );
    await onSave({
      sidecar: { ...version.sidecar, captureDraft: { ...draft, decisions: updated } },
    });
  }

  function startEditException(e: CaptureDraftException) {
    setEditingExceptionId(e.exceptionId);
    setExceptionDraftDesc(e.description);
    setExceptionDraftHandling(e.handling);
  }

  async function saveExceptionInline(exceptionId: string) {
    if (!draft) return;
    setSavingException(true);
    try {
      const updated = draft.exceptions.map((e) =>
        e.exceptionId === exceptionId
          ? { ...e, description: exceptionDraftDesc, handling: exceptionDraftHandling }
          : e
      );
      await onSave({
        sidecar: { ...version.sidecar, captureDraft: { ...draft, exceptions: updated } },
      });
      setEditingExceptionId(null);
    } finally {
      setSavingException(false);
    }
  }

  async function saveExceptionStatus(exceptionId: string, status: CaptureElementStatus) {
    if (!draft) return;
    const updated = draft.exceptions.map((e) =>
      e.exceptionId === exceptionId ? { ...e, status } : e
    );
    await onSave({
      sidecar: { ...version.sidecar, captureDraft: { ...draft, exceptions: updated } },
    });
  }

  const hasEvidence = step.evidence && step.evidence.length > 0;
  const firstEvidence = hasEvidence ? step.evidence![0] : null;
  const hasKpis =
    (step.processingTime && step.processingTime !== 'unknown') ||
    (step.waitingTime && step.waitingTime !== 'unknown') ||
    (step.volume && step.volume !== 'unknown') ||
    (step.rework && step.rework !== 'unknown');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Fokus: Schritt {step.order}
          </h3>
          <p className="text-sm text-slate-600 mt-1">{step.label}</p>
        </div>
        <button
          onClick={() => { onGoToDraft(); onGoToStep(step.stepId); }}
          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
        >
          Im Draft öffnen
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Status</label>
          <select
            value={step.status || 'unclear'}
            onChange={(e) => handleStatusChange(e.target.value as CaptureElementStatus)}
            disabled={isSaving || !draft}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
          >
            <option value="unclear">Unklar</option>
            <option value="confirmed">Bestätigt</option>
            <option value="derived">Abgeleitet</option>
          </select>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              Evidence
            </h4>
            <button
              onClick={() => { onGoToDraft(); onGoToStep(step.stepId); }}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Bearbeiten…
            </button>
          </div>
          {hasEvidence && firstEvidence ? (
            <div className="bg-slate-50 rounded-lg p-3 space-y-1">
              {firstEvidence.refId && (
                <div className="text-xs text-slate-600">Quelle: {firstEvidence.refId}</div>
              )}
              {firstEvidence.snippet && (
                <div className="text-xs text-slate-700 line-clamp-3">{firstEvidence.snippet}</div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">Keine Evidence vorhanden</div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              Kennzahlen
            </h4>
            <button
              onClick={() => { onGoToDraft(); onGoToStep(step.stepId); }}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Bearbeiten…
            </button>
          </div>
          {hasKpis ? (
            <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-xs">
              {step.processingTime && step.processingTime !== 'unknown' && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Bearbeitungszeit:</span>
                  <span className="text-slate-900 font-medium">{step.processingTime}</span>
                </div>
              )}
              {step.waitingTime && step.waitingTime !== 'unknown' && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Wartezeit:</span>
                  <span className="text-slate-900 font-medium">{step.waitingTime}</span>
                </div>
              )}
              {step.volume && step.volume !== 'unknown' && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Volumen:</span>
                  <span className="text-slate-900 font-medium">{step.volume}</span>
                </div>
              )}
              {step.rework && step.rework !== 'unknown' && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Nacharbeit:</span>
                  <span className="text-slate-900 font-medium">{step.rework}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">Keine Kennzahlen erfasst</div>
          )}
        </div>

        {(step.painPointHint || step.toBeHint) && (
          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Hinweise
              </h4>
              <button
                onClick={() => { onGoToDraft(); onGoToStep(step.stepId); }}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Bearbeiten…
              </button>
            </div>
            <div className="space-y-2">
              {step.painPointHint && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <div className="text-xs font-medium text-amber-900 mb-1">Pain Point:</div>
                  <div className="text-xs text-amber-800 line-clamp-3">{step.painPointHint}</div>
                </div>
              )}
              {step.toBeHint && (
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-xs font-medium text-green-900 mb-1">To-Be:</div>
                  <div className="text-xs text-green-800 line-clamp-3">{step.toBeHint}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
              <GitBranch className="w-4 h-4" />
              Entscheidungen
              {stepDecisions.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-100 text-slate-700 rounded">
                  {stepDecisions.length}
                </span>
              )}
            </h4>
            <button
              onClick={() => { onGoToDraft(); onGoToStep(step.stepId); }}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Bearbeiten…
            </button>
          </div>
          {stepDecisions.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Keine Entscheidungen für diesen Schritt</div>
          ) : (
            <div className="space-y-2">
              {stepDecisions.map((d) => (
                <div key={d.decisionId} className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500 shrink-0">
                      [{GATEWAY_LABELS[d.gatewayType] ?? d.gatewayType}]
                    </span>
                    <div className="flex-1 min-w-0">
                      {editingDecisionId === d.decisionId ? (
                        <input
                          type="text"
                          value={decisionDraftQuestion}
                          onChange={(e) => setDecisionDraftQuestion(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <div className="text-xs text-slate-900 font-medium">{d.question}</div>
                      )}
                    </div>
                  </div>
                  {d.branches.length > 0 && (
                    <div className="space-y-1 pl-2 border-l-2 border-slate-200">
                      {d.branches.map((b) => (
                        <div key={b.branchId} className="text-xs text-slate-600">
                          → {b.conditionLabel || <span className="italic text-slate-400">kein Label</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <select
                      value={d.status ?? 'unclear'}
                      onChange={(e) => saveDecisionStatus(d.decisionId, e.target.value as CaptureElementStatus)}
                      className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="unclear">Unklar</option>
                      <option value="confirmed">Bestätigt</option>
                      <option value="derived">Abgeleitet</option>
                    </select>
                    {editingDecisionId === d.decisionId ? (
                      <>
                        <button
                          onClick={() => saveDecisionQuestion(d.decisionId)}
                          disabled={savingDecision}
                          className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingDecisionId(null)}
                          className="px-2 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded border border-slate-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEditDecision(d)}
                        className="px-2 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded border border-slate-300"
                      >
                        Frage bearbeiten
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Ausnahmen
              {stepExceptions.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-100 text-slate-700 rounded">
                  {stepExceptions.length}
                </span>
              )}
            </h4>
            <button
              onClick={() => { onGoToDraft(); onGoToStep(step.stepId); }}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Bearbeiten…
            </button>
          </div>
          {stepExceptions.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Keine Ausnahmen für diesen Schritt</div>
          ) : (
            <div className="space-y-2">
              {stepExceptions.map((e) => (
                <div key={e.exceptionId} className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-orange-700 shrink-0">
                      {EXCEPTION_TYPE_LABELS[e.type] ?? e.type}
                    </span>
                  </div>
                  {editingExceptionId === e.exceptionId ? (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Beschreibung</label>
                        <textarea
                          value={exceptionDraftDesc}
                          onChange={(ev) => setExceptionDraftDesc(ev.target.value)}
                          rows={2}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Umgang / Handling</label>
                        <textarea
                          value={exceptionDraftHandling}
                          onChange={(ev) => setExceptionDraftHandling(ev.target.value)}
                          rows={2}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {e.description && (
                        <div className="text-xs text-slate-800 line-clamp-2">{e.description}</div>
                      )}
                      {e.handling && (
                        <div className="text-xs text-slate-500 line-clamp-2">
                          <span className="font-medium">Handling:</span> {e.handling}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <select
                      value={e.status ?? 'unclear'}
                      onChange={(ev) => saveExceptionStatus(e.exceptionId, ev.target.value as CaptureElementStatus)}
                      className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="unclear">Unklar</option>
                      <option value="confirmed">Bestätigt</option>
                      <option value="derived">Abgeleitet</option>
                    </select>
                    {editingExceptionId === e.exceptionId ? (
                      <>
                        <button
                          onClick={() => saveExceptionInline(e.exceptionId)}
                          disabled={savingException}
                          className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingExceptionId(null)}
                          className="px-2 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded border border-slate-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEditException(e)}
                        className="px-2 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded border border-slate-300"
                      >
                        Bearbeiten
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4" />
              Semantikfragen
              {openQuestions.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 rounded">
                  {openQuestions.length}
                </span>
              )}
            </h4>
          </div>

          {openQuestions.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Keine offenen Fragen für diesen Schritt</div>
          ) : (
            <div className="space-y-3">
              {openQuestions.map((q) => (
                <div key={q.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <div className="text-sm text-slate-900 font-medium">{q.question}</div>
                  <textarea
                    value={answerDrafts[q.id] ?? ''}
                    onChange={(e) => setAnswerDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Antwort oder Notiz..."
                    rows={2}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveSemanticQuestion(q.id, { answer: answerDrafts[q.id] })}
                      disabled={savingQuestionId !== null}
                      className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Speichern
                    </button>
                    <button
                      onClick={() => saveSemanticQuestion(q.id, { answer: answerDrafts[q.id], status: 'done' as SemanticQuestionStatus })}
                      disabled={savingQuestionId !== null}
                      className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Erledigt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {savingQuestionId && (
            <div className="mt-2 text-xs text-slate-500">Speichere…</div>
          )}
          {questionMessage && !savingQuestionId && (
            <div className="mt-2 text-xs text-green-600">{questionMessage}</div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Maßnahmen
              {stepBacklog.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-100 text-slate-700 rounded">
                  {stepBacklog.length}
                </span>
              )}
            </h4>
            {!showAddMassnahme && (
              <button
                onClick={() => setShowAddMassnahme(true)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="w-3 h-3" />
                Hinzufügen
              </button>
            )}
          </div>

          {stepBacklog.length > 0 && (
            <div className="space-y-2 mb-3">
              {stepBacklog.map((item) => (
                <div key={item.id} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-900 flex-1">{item.title}</span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {IMPROVEMENT_STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">
                      {IMPROVEMENT_CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${item.impact === 'high' ? 'bg-red-100 text-red-700' : item.impact === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      Impact: {item.impact === 'high' ? 'Hoch' : item.impact === 'medium' ? 'Mittel' : 'Niedrig'}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${item.effort === 'high' ? 'bg-slate-200 text-slate-700' : item.effort === 'medium' ? 'bg-slate-100 text-slate-600' : 'bg-green-100 text-green-700'}`}>
                      Aufwand: {item.effort === 'high' ? 'Hoch' : item.effort === 'medium' ? 'Mittel' : 'Niedrig'}
                    </span>
                  </div>
                  {item.description && (
                    <div className="text-xs text-slate-600 mt-1 line-clamp-2">{item.description}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAddMassnahme && (
            <div className="bg-blue-50 rounded-lg p-3 space-y-2 border border-blue-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-blue-900">Neue Maßnahme</span>
                <button onClick={() => setShowAddMassnahme(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <input
                type="text"
                value={newMassnahme.title}
                onChange={(e) => setNewMassnahme((p) => ({ ...p, title: e.target.value }))}
                placeholder="Titel der Maßnahme..."
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={newMassnahme.category}
                onChange={(e) => setNewMassnahme((p) => ({ ...p, category: e.target.value as ImprovementCategory }))}
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(IMPROVEMENT_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <textarea
                value={newMassnahme.description}
                onChange={(e) => setNewMassnahme((p) => ({ ...p, description: e.target.value }))}
                placeholder="Beschreibung (optional)..."
                rows={2}
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-slate-600 mb-0.5">Impact</label>
                  <select
                    value={newMassnahme.impact}
                    onChange={(e) => setNewMassnahme((p) => ({ ...p, impact: e.target.value as 'low' | 'medium' | 'high' }))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Niedrig</option>
                    <option value="medium">Mittel</option>
                    <option value="high">Hoch</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-600 mb-0.5">Aufwand</label>
                  <select
                    value={newMassnahme.effort}
                    onChange={(e) => setNewMassnahme((p) => ({ ...p, effort: e.target.value as 'low' | 'medium' | 'high' }))}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Niedrig</option>
                    <option value="medium">Mittel</option>
                    <option value="high">Hoch</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleAddMassnahme}
                disabled={savingMassnahme || !newMassnahme.title.trim()}
                className="w-full px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded border border-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingMassnahme ? 'Wird gespeichert…' : 'Maßnahme hinzufügen'}
              </button>
            </div>
          )}

          {stepBacklog.length === 0 && !showAddMassnahme && (
            <div className="text-xs text-slate-500 italic">Keine Maßnahmen für diesen Schritt</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkshopModeView({
  version,
  onSave,
  onGoToDraft,
  onGoToReview,
  onGoToMining,
  onOpenSearchWithQuery,
  onGoToStep,
  onSetMiningFilter,
}: WorkshopModeViewProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showOnlyUnclear, setShowOnlyUnclear] = useState(false);
  const [showOnlyNoEvidence, setShowOnlyNoEvidence] = useState(false);

  const draft = version.sidecar.captureDraft;
  const steps = useMemo(() => draft?.happyPath ?? [], [draft]);

  const stepMap = useMemo(() => {
    const map = new Map<string, CaptureDraftStep>();
    steps.forEach((s) => map.set(s.stepId, s));
    return map;
  }, [steps]);

  const openQuestionCountByStepId = useMemo(() => {
    const map = new Map<string, number>();
    (version.quality.semanticQuestions ?? []).forEach((q) => {
      if (!q.relatedStepId) return;
      if ((q.status ?? 'open') === 'done') return;
      map.set(q.relatedStepId, (map.get(q.relatedStepId) ?? 0) + 1);
    });
    return map;
  }, [version.quality.semanticQuestions]);

  const filteredSteps = useMemo(() => {
    let result = steps;
    if (showOnlyUnclear) {
      result = result.filter((s) => (s.status ?? 'unclear') !== 'confirmed');
    }
    if (showOnlyNoEvidence) {
      result = result.filter((s) => !s.evidence || s.evidence.length === 0);
    }
    return result;
  }, [steps, showOnlyUnclear, showOnlyNoEvidence]);

  useEffect(() => {
    if (!selectedStepId && steps.length > 0) {
      setSelectedStepId(steps[0].stepId);
    }
  }, [selectedStepId, steps]);

  const selectedStep = selectedStepId ? stepMap.get(selectedStepId) : null;

  function getStatusBadge(status?: CaptureElementStatus) {
    const st = status ?? 'unclear';
    if (st === 'confirmed') {
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded">
          Bestätigt
        </span>
      );
    }
    if (st === 'derived') {
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
          Abgeleitet
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 rounded">
        Unklar
      </span>
    );
  }

  function getEvidenceBadge(step: CaptureDraftStep) {
    const hasEvidence = step.evidence && step.evidence.length > 0;
    if (hasEvidence) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
          Evidence ✓
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
        Evidence ✕
      </span>
    );
  }

  function getKpiBadge(step: CaptureDraftStep) {
    const hasKpis =
      (step.processingTime && step.processingTime !== 'unknown') ||
      (step.waitingTime && step.waitingTime !== 'unknown') ||
      (step.volume && step.volume !== 'unknown') ||
      (step.rework && step.rework !== 'unknown');
    if (hasKpis) {
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
          KPI ✓
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded">
        KPI –
      </span>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Workshop Mode</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenSearchWithQuery('')}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors"
          >
            Suche
          </button>
          <button
            onClick={onGoToDraft}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors"
          >
            Zum Draft
          </button>
          <button
            onClick={onGoToReview}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors"
          >
            Zum Review
          </button>
          <button
            onClick={onGoToMining}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors"
          >
            Zum Mining
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 2xl:grid-cols-12 gap-4">
            <div className="lg:col-span-5 2xl:col-span-4 bg-white rounded-lg border border-slate-200 p-5 max-h-[75vh] overflow-auto">
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Agenda</h3>
              <div className="text-sm">
                <OpenIssuesDashboard
                  version={version}
                  onGoToReview={onGoToReview}
                  onGoToDraft={onGoToDraft}
                  onGoToMining={onGoToMining}
                  onGoToStep={(stepId) => { setSelectedStepId(stepId); }}
                  onGoToDecision={() => { onGoToDraft(); }}
                  onGoToException={() => { onGoToDraft(); }}
                  onGoToMiningActivity={(activityKey) => {
                    onGoToMining();
                    onSetMiningFilter?.(activityKey);
                  }}
                  onOpenSearchWithQuery={onOpenSearchWithQuery}
                />
              </div>
            </div>

            <div className="lg:col-span-7 2xl:col-span-4 bg-white rounded-lg border border-slate-200 p-5 max-h-[75vh] overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-900">Happy Path</h3>
                <span className="text-xs text-slate-500">
                  {filteredSteps.length} / {steps.length}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setShowOnlyUnclear(!showOnlyUnclear)}
                  className={
                    'px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ' +
                    (showOnlyUnclear
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50')
                  }
                >
                  Nur Unklare
                </button>
                <button
                  onClick={() => setShowOnlyNoEvidence(!showOnlyNoEvidence)}
                  className={
                    'px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ' +
                    (showOnlyNoEvidence
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50')
                  }
                >
                  Nur ohne Evidence
                </button>
              </div>

              <div className="space-y-2">
                {filteredSteps.map((step) => (
                  <button
                    key={step.stepId}
                    onClick={() => setSelectedStepId(step.stepId)}
                    className={
                      'w-full text-left p-3 rounded-lg border transition-colors ' +
                      (selectedStepId === step.stepId
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200')
                    }
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-sm font-medium text-slate-900 shrink-0">{step.order}.</span>
                      <span className="text-sm text-slate-900 flex-1 truncate">{step.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {getStatusBadge(step.status)}
                      {getEvidenceBadge(step)}
                      {getKpiBadge(step)}
                      {(() => {
                        const qCount = openQuestionCountByStepId.get(step.stepId) ?? 0;
                        return qCount > 0 ? (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded">
                            Fragen {qCount}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </button>
                ))}
              </div>

              {filteredSteps.length === 0 && (
                <div className="text-sm text-slate-500 text-center py-8">
                  Keine Schritte gefunden
                </div>
              )}
            </div>

            <div className="lg:col-span-12 2xl:col-span-4 bg-white rounded-lg border border-slate-200 p-5 min-h-[60vh] overflow-auto">
              {selectedStep ? (
                <WorkshopStepFocusPanel
                  step={selectedStep}
                  version={version}
                  onSave={onSave}
                  onGoToStep={onGoToStep}
                  onGoToDraft={onGoToDraft}
                />
              ) : (
                <div className="text-sm text-slate-500 text-center py-8">
                  Wählen Sie einen Schritt aus
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
