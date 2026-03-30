import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Save, Target, AlertTriangle, Focus, Shield, TrendingUp, HelpCircle, CheckCircle, Lightbulb, Plus } from 'lucide-react';
import type { Process, ProcessVersion, AssistedOptimizationGoal, AssistedOptimizationPainPoint, AssistedOptimizationBrief, SemanticQuestion, ImprovementBacklogItem, ImprovementCategory } from '../domain/process';
import type { AppSettings } from '../settings/appSettings';
import { startWebSpeechTranscription, type WebSpeechSession } from '../speech/webSpeechTranscription';
import { isWebSpeechSupported } from '../speech/transcriptionProviders';
import { generateHeuristicCandidates, type HeuristicCandidate } from '../assessment/heuristicRecommendations';

interface AssistedOptimizationCoachProps {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  onSave: (patch: Partial<ProcessVersion>) => Promise<void>;
}

const GOAL_OPTIONS: Array<{ value: AssistedOptimizationGoal; label: string }> = [
  { value: 'lead_time', label: 'Schneller' },
  { value: 'quality', label: 'Weniger Fehler' },
  { value: 'cost', label: 'Kosten senken' },
  { value: 'customer', label: 'Kundenerlebnis verbessern' },
  { value: 'compliance', label: 'Compliance/Risiko' },
  { value: 'transparency', label: 'Transparenz/Steuerung' },
  { value: 'other', label: 'Sonstiges' },
];

const PAIN_POINT_OPTIONS: Array<{ value: AssistedOptimizationPainPoint; label: string }> = [
  { value: 'waiting', label: 'Wartezeiten' },
  { value: 'handoffs', label: 'Zu viele Übergaben' },
  { value: 'rework', label: 'Nacharbeit/Korrekturen' },
  { value: 'missing_info', label: 'Fehlende Informationen' },
  { value: 'manual_work', label: 'Manuelle Arbeit' },
  { value: 'system_breaks', label: 'Systembrüche' },
  { value: 'errors', label: 'Fehler/Qualitätsprobleme' },
  { value: 'compliance_risk', label: 'Compliance-Risiken' },
  { value: 'other', label: 'Sonstiges' },
];

interface QuickWinCandidate {
  candidate: HeuristicCandidate;
  selected: boolean;
  title: string;
  category: ImprovementCategory;
}

export function AssistedOptimizationCoach({ process, version, settings, onSave }: AssistedOptimizationCoachProps) {
  const brief = version.sidecar.assistedOptimizationBrief || {};

  const [goal, setGoal] = useState<AssistedOptimizationGoal | undefined>(brief.goal);
  const [goalOtherText, setGoalOtherText] = useState(brief.goalOtherText || '');
  const [painPoints, setPainPoints] = useState<AssistedOptimizationPainPoint[]>(brief.painPoints || []);
  const [painOtherText, setPainOtherText] = useState(brief.painOtherText || '');
  const [focusStepId, setFocusStepId] = useState<string | null>(brief.focusStepId ?? null);
  const [constraints, setConstraints] = useState(brief.constraints || '');
  const [successCriteria, setSuccessCriteria] = useState(brief.successCriteria || '');

  const [saving, setSaving] = useState(false);

  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});

  const [quickWins, setQuickWins] = useState<QuickWinCandidate[]>([]);
  const [generatingQuickWins, setGeneratingQuickWins] = useState(false);

  const [recordingField, setRecordingField] = useState<'constraints' | 'successCriteria' | string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const sessionRef = useRef<WebSpeechSession | null>(null);

  const canUseSpeech =
    settings.dataHandlingMode === 'external' &&
    settings.transcription.providerId === 'web_speech' &&
    isWebSpeechSupported();

  const happyPath = version.sidecar.captureDraft?.happyPath || [];

  const openQuestions = (version.quality.semanticQuestions || []).filter(
    (q) => (q.status ?? 'open') !== 'done'
  );
  const displayedQuestions = showAllQuestions ? openQuestions.slice(0, 20) : openQuestions.slice(0, 6);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.abort();
      }
    };
  }, []);

  const handleStartRecording = (field: 'constraints' | 'successCriteria' | string) => {
    if (!canUseSpeech || recordingField) return;

    setRecordingField(field);
    setInterimTranscript('');

    const session = startWebSpeechTranscription(
      {
        language: settings.transcription.language,
        interimResults: true,
        continuous: true,
      },
      {
        onInterim: (text) => {
          setInterimTranscript(text);
        },
        onFinal: (text) => {
          if (field === 'constraints') {
            setConstraints((prev) => (prev ? `${prev} ${text}` : text));
          } else if (field === 'successCriteria') {
            setSuccessCriteria((prev) => (prev ? `${prev} ${text}` : text));
          } else {
            setQuestionAnswers((prev) => {
              const current = prev[field] || '';
              return { ...prev, [field]: current ? `${current} ${text}` : text };
            });
          }
          setInterimTranscript('');
        },
        onError: (msg) => {
          console.error('Speech recognition error:', msg);
          setRecordingField(null);
          setInterimTranscript('');
        },
        onEnd: () => {
          setRecordingField(null);
          setInterimTranscript('');
        },
      }
    );

    if (session) {
      sessionRef.current = session;
    } else {
      setRecordingField(null);
    }
  };

  const handleStopRecording = () => {
    if (sessionRef.current) {
      sessionRef.current.stop();
      sessionRef.current = null;
    }
    setRecordingField(null);
    setInterimTranscript('');
  };

  const handleTogglePainPoint = (point: AssistedOptimizationPainPoint) => {
    setPainPoints((prev) =>
      prev.includes(point)
        ? prev.filter((p) => p !== point)
        : [...prev, point]
    );
  };

  const handleMarkQuestionDone = async (question: SemanticQuestion) => {
    const answer = (questionAnswers[question.id] || '').trim();

    const updatedQuestions = version.quality.semanticQuestions.map((q) =>
      q.id === question.id
        ? { ...q, status: 'done' as const, answer: answer || undefined }
        : q
    );

    await onSave({
      quality: {
        ...version.quality,
        semanticQuestions: updatedQuestions,
      },
    });

    setQuestionAnswers((prev) => {
      const next = { ...prev };
      delete next[question.id];
      return next;
    });
  };

  const handleGenerateQuickWins = () => {
    setGeneratingQuickWins(true);
    try {
      const candidates = generateHeuristicCandidates(process, version);

      const quickWinCandidates: QuickWinCandidate[] = candidates.map((candidate) => {
        const firstSentence = candidate.text.split(/[.!?]/)[0].trim();
        const title = firstSentence || 'Verbesserungsvorschlag';

        let category: ImprovementCategory = 'automate';
        if (candidate.dimensionKey === 'standardization') {
          category = 'standardize';
        } else if (candidate.dimensionKey === 'dataIT') {
          category = 'data';
        } else if (candidate.dimensionKey === 'automation') {
          category = 'automate';
        } else if (candidate.dimensionKey === 'risk') {
          category = 'compliance';
        }

        return {
          candidate,
          selected: true,
          title,
          category,
        };
      });

      setQuickWins(quickWinCandidates);
    } finally {
      setGeneratingQuickWins(false);
    }
  };

  const handleToggleQuickWin = (index: number) => {
    setQuickWins((prev) =>
      prev.map((qw, i) => (i === index ? { ...qw, selected: !qw.selected } : qw))
    );
  };

  const handleAdoptQuickWins = async () => {
    const selectedQuickWins = quickWins.filter((qw) => qw.selected);
    if (selectedQuickWins.length === 0) return;

    const existingBacklog = version.sidecar.improvementBacklog || [];
    const existingTitlesNormalized = new Set(
      existingBacklog.map((item) => item.title.toLowerCase().trim().replace(/\s+/g, ' '))
    );

    const newItems: ImprovementBacklogItem[] = [];
    const now = new Date().toISOString();

    for (const qw of selectedQuickWins) {
      const normalizedTitle = qw.title.toLowerCase().trim().replace(/\s+/g, ' ');
      if (existingTitlesNormalized.has(normalizedTitle)) {
        continue;
      }

      let impact: 'low' | 'medium' | 'high' = 'high';
      let effort: 'low' | 'medium' | 'high' = 'medium';
      let risk: 'low' | 'medium' | 'high' = 'low';

      if (qw.candidate.dimensionKey === 'standardization') {
        impact = 'high';
        effort = 'low';
      } else if (qw.candidate.dimensionKey === 'dataIT') {
        impact = 'high';
        effort = 'medium';
      } else if (qw.candidate.dimensionKey === 'automation') {
        impact = 'high';
        effort = 'high';
      } else if (qw.candidate.dimensionKey === 'risk') {
        impact = 'medium';
        effort = 'low';
        risk = 'medium';
      }

      newItems.push({
        id: crypto.randomUUID(),
        title: qw.title,
        category: qw.category,
        scope: 'process',
        description: qw.candidate.text,
        impact,
        effort,
        risk,
        status: 'idea',
        createdAt: now,
        updatedAt: now,
      });

      existingTitlesNormalized.add(normalizedTitle);
    }

    if (newItems.length > 0) {
      await onSave({
        sidecar: {
          ...version.sidecar,
          improvementBacklog: [...existingBacklog, ...newItems],
        },
      });

      setQuickWins([]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const existing = version.sidecar.assistedOptimizationBrief || {};
      const newBrief: AssistedOptimizationBrief = {
        ...existing,
        goal,
        goalOtherText: goal === 'other' ? goalOtherText : undefined,
        painPoints: painPoints.length > 0 ? painPoints : undefined,
        painOtherText: painPoints.includes('other') ? painOtherText : undefined,
        focusStepId,
        constraints: constraints.trim() || undefined,
        successCriteria: successCriteria.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };

      await onSave({
        sidecar: {
          ...version.sidecar,
          assistedOptimizationBrief: newBrief,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pm-card pm-card-pad">
        <div className="flex items-center gap-3 mb-4">
          <Target className="w-5 h-5 text-cyan-600" />
          <h2 className="text-lg font-semibold text-slate-900">Ziel der Optimierung</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Was möchten Sie mit dieser Optimierung erreichen?
        </p>
        <div className="space-y-2">
          {GOAL_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="goal"
                value={option.value}
                checked={goal === option.value}
                onChange={() => setGoal(option.value)}
                className="w-4 h-4 text-cyan-600 focus:ring-cyan-500"
              />
              <span className="text-sm text-slate-700">{option.label}</span>
            </label>
          ))}
        </div>
        {goal === 'other' && (
          <div className="mt-4">
            <input
              type="text"
              value={goalOtherText}
              onChange={(e) => setGoalOtherText(e.target.value)}
              placeholder="Bitte beschreiben..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        )}
      </div>

      <div className="pm-card pm-card-pad">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-slate-900">Was sind die größten Probleme?</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Welche Schwachstellen beobachten Sie im aktuellen Prozess?
        </p>
        <div className="space-y-2">
          {PAIN_POINT_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={painPoints.includes(option.value)}
                onChange={() => handleTogglePainPoint(option.value)}
                className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500"
              />
              <span className="text-sm text-slate-700">{option.label}</span>
            </label>
          ))}
        </div>
        {painPoints.includes('other') && (
          <div className="mt-4">
            <input
              type="text"
              value={painOtherText}
              onChange={(e) => setPainOtherText(e.target.value)}
              placeholder="Bitte beschreiben..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        )}
      </div>

      <div className="pm-card pm-card-pad">
        <div className="flex items-center gap-3 mb-4">
          <Focus className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">Wo ist es am stärksten spürbar?</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Gibt es einen bestimmten Schritt, auf den Sie sich konzentrieren möchten?
        </p>
        <select
          value={focusStepId || ''}
          onChange={(e) => setFocusStepId(e.target.value || null)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">Gesamter Prozess</option>
          {happyPath.map((step) => (
            <option key={step.stepId} value={step.stepId}>
              {step.label}
            </option>
          ))}
        </select>
      </div>

      <div className="pm-card pm-card-pad">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Randbedingungen</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Gibt es Einschränkungen oder Vorgaben, die beachtet werden müssen?
        </p>
        <div className="relative">
          <textarea
            value={
              recordingField === 'constraints' && interimTranscript
                ? `${constraints} ${interimTranscript}`
                : constraints
            }
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="z.B. Budget, Zeitrahmen, technische Einschränkungen..."
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
          />
          {canUseSpeech && (
            <button
              type="button"
              onClick={() =>
                recordingField === 'constraints'
                  ? handleStopRecording()
                  : handleStartRecording('constraints')
              }
              className={`absolute right-2 top-2 p-2 rounded-lg transition-colors ${
                recordingField === 'constraints'
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title={recordingField === 'constraints' ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
            >
              {recordingField === 'constraints' ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
        {recordingField === 'constraints' && (
          <p className="text-xs text-red-600 mt-2">Aufnahme läuft...</p>
        )}
      </div>

      <div className="pm-card pm-card-pad">
        <div className="flex items-center gap-3 mb-4">
          <TrendingUp className="w-5 h-5 text-cyan-600" />
          <h2 className="text-lg font-semibold text-slate-900">Woran messen Sie Erfolg?</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Welche konkreten Verbesserungen würden Sie als Erfolg werten?
        </p>
        <div className="relative">
          <textarea
            value={
              recordingField === 'successCriteria' && interimTranscript
                ? `${successCriteria} ${interimTranscript}`
                : successCriteria
            }
            onChange={(e) => setSuccessCriteria(e.target.value)}
            placeholder="z.B. Durchlaufzeit um 30% reduzieren, Fehlerquote halbieren..."
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
          />
          {canUseSpeech && (
            <button
              type="button"
              onClick={() =>
                recordingField === 'successCriteria'
                  ? handleStopRecording()
                  : handleStartRecording('successCriteria')
              }
              className={`absolute right-2 top-2 p-2 rounded-lg transition-colors ${
                recordingField === 'successCriteria'
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title={recordingField === 'successCriteria' ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
            >
              {recordingField === 'successCriteria' ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
        {recordingField === 'successCriteria' && (
          <p className="text-xs text-red-600 mt-2">Aufnahme läuft...</p>
        )}
      </div>

      {openQuestions.length > 0 && (
        <div className="pm-card pm-card-pad">
          <div className="flex items-center gap-3 mb-4">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">Klärungsfragen vom System</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Diese Fragen helfen, den Prozess so zu beschreiben, dass Optimierung und Automatisierung belastbar werden.
          </p>

          <div className="space-y-4">
            {displayedQuestions.map((question) => {
              const currentAnswer = questionAnswers[question.id] || '';
              const isRecording = recordingField === question.id;
              const displayValue = isRecording && interimTranscript
                ? `${currentAnswer} ${interimTranscript}`
                : currentAnswer;

              return (
                <div key={question.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="mb-3">
                    <p className="text-sm font-medium text-slate-900 mb-1">{question.question}</p>
                    {question.relatedStepHint && (
                      <p className="text-xs text-slate-600">Bezieht sich auf: {question.relatedStepHint}</p>
                    )}
                  </div>

                  <div className="relative mb-3">
                    <textarea
                      value={displayValue}
                      onChange={(e) =>
                        setQuestionAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                      }
                      placeholder="Ihre Antwort..."
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                    />
                    {canUseSpeech && (
                      <button
                        type="button"
                        onClick={() =>
                          isRecording
                            ? handleStopRecording()
                            : handleStartRecording(question.id)
                        }
                        className={`absolute right-2 top-2 p-2 rounded-lg transition-colors ${
                          isRecording
                            ? 'bg-red-100 text-red-600 hover:bg-red-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title={isRecording ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
                      >
                        {isRecording ? (
                          <MicOff className="w-4 h-4" />
                        ) : (
                          <Mic className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                  {isRecording && (
                    <p className="text-xs text-red-600 mb-2">Aufnahme läuft...</p>
                  )}

                  <button
                    onClick={() => handleMarkQuestionDone(question)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Als geklärt markieren
                  </button>
                </div>
              );
            })}
          </div>

          {openQuestions.length > 6 && !showAllQuestions && (
            <button
              onClick={() => setShowAllQuestions(true)}
              className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
            >
              Alle anzeigen ({openQuestions.length - 6} weitere)
            </button>
          )}
        </div>
      )}

      <div className="pm-card pm-card-pad">
        <div className="flex items-center gap-3 mb-4">
          <Lightbulb className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-slate-900">Schnelle Vorschläge</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Erhalten Sie konkrete Verbesserungsvorschläge basierend auf bewährten Methoden.
        </p>

        {quickWins.length === 0 ? (
          <button
            onClick={handleGenerateQuickWins}
            disabled={generatingQuickWins}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <Lightbulb className="w-4 h-4" />
            {generatingQuickWins ? 'Erstellt...' : 'Vorschläge erstellen'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {quickWins.map((qw, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 transition-colors ${
                    qw.selected ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={qw.selected}
                      onChange={() => handleToggleQuickWin(index)}
                      className="mt-1 w-4 h-4 text-amber-600 rounded focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-slate-900 mb-1">{qw.title}</h3>
                      <p className="text-sm text-slate-700">{qw.candidate.text}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs px-2 py-1 bg-slate-200 text-slate-700 rounded">
                          {qw.category}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAdoptQuickWins}
                disabled={!quickWins.some((qw) => qw.selected)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Als Maßnahmen übernehmen
              </button>
              <button
                onClick={() => setQuickWins([])}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
              >
                Verwerfen
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="pm-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Speichert...' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}
