import { useState, useRef, useEffect } from 'react';
import { Sparkles, Plus, Info, CheckCircle2, Mic, MicOff } from 'lucide-react';
import type { ProcessMiningObservationCase, ProcessMiningObservation, DerivationSummary } from '../../domain/process';
import type { DerivationResult } from './documentDerivation';
import { HelpPopover } from '../components/HelpPopover';
import { useAppSettings } from '../../settings/useAppSettings';
import { useProcessAnalysis } from './useProcessAnalysis';
import { AnalysisStatus } from './AnalysisStatus';
import {
  startTranscription,
  isTranscriptionProviderAvailable,
  type TranscriptionState,
  type TranscriptionProviderKind,
  type TranscriptionSession,
} from '../../speech/transcriptionProvider';
import { getAiApiReadiness } from '../../ai/analysisMode';

interface Props {
  existingCaseCount: number;
  onAddCase: (caseItem: ProcessMiningObservationCase) => void;
  onAddDerived: (
    caseItem: ProcessMiningObservationCase,
    observations: ProcessMiningObservation[],
    summary?: DerivationSummary,
  ) => void;
  // Nur der geführte Aufrufer aktiviert Diktat; ohne die Prop bleibt jeder andere Mount unverändert.
  enableDictation?: boolean;
  // Nur der geführte Aufrufer zeigt den Inline-KI-Schalter; ohne die Prop unverändert.
  enableInlineAiToggle?: boolean;
}

const EXAMPLE_NARRATIVE = `Beispiel: Am Montag öffnet die Sachbearbeiterin das Ticket. Sie prüft die Angaben — das dauert etwa 10 Minuten. Falls Unterlagen fehlen, schreibt sie eine E-Mail und wartet bis zu 2 Tage. Danach leitet sie den Vorgang weiter. Am Ende informiert sie den Kunden per E-Mail.`;

export function ObservationIntakePanel({ existingCaseCount, onAddCase, onAddDerived, enableDictation = false, enableInlineAiToggle = false }: Props) {
  const [name, setName] = useState('');
  const [narrative, setNarrative] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [caseRef, setCaseRef] = useState('');
  const [dateHints, setDateHints] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [lastResult, setLastResult] = useState<{ stepCount: number; confidence: string } | null>(null);

  const { settings, setSettings } = useAppSettings();
  const analysis = useProcessAnalysis();
  const isRunning = analysis.state.status === 'running';
  const caseName = () => name.trim() || `Fall ${existingCaseCount + 1}`;

  // Inline-KI-Schalter (nur im geführten Aufruf via enableInlineAiToggle).
  // Single source of truth = settings (process-app-settings-v1) über setSettings;
  // kein neues Settings-Feld, kein zweiter State. "Konfiguriert" = alles außer
  // Consent erfüllt (Endpoint/extern/api-mode) -> Consent wird hier inline eingeholt.
  const aiReadiness = getAiApiReadiness(settings);
  const aiApiConfigured = aiReadiness.missing.every((m) => m === 'consent');
  const aiOn = settings.ai.useForAnalysis === true;
  const consentGiven = Boolean(settings.ai.externalConsentGivenAt);
  const showAiToggle = enableInlineAiToggle && aiApiConfigured;
  const [showAiConsent, setShowAiConsent] = useState(false);

  function setUseForAnalysis(on: boolean) {
    setSettings({ ...settings, ai: { ...settings.ai, useForAnalysis: on } });
  }

  function handleToggleAi() {
    if (aiOn) {
      // Ausschalten — Consent NICHT löschen (bleibt wie eine Einstellung erhalten).
      setUseForAnalysis(false);
      setShowAiConsent(false);
      return;
    }
    if (consentGiven) {
      setUseForAnalysis(true);
    } else {
      // Einschalten ohne vorherige Freigabe -> Inline-Zustimmung (Consent nicht umgehen).
      setShowAiConsent(true);
    }
  }

  function handleConfirmAiConsent() {
    // Gleiche Bedeutung wie in AiApiSettingsCard: Zustimmung = ISO-Zeitstempel.
    setSettings({
      ...settings,
      ai: { ...settings.ai, externalConsentGivenAt: new Date().toISOString(), useForAnalysis: true },
    });
    setShowAiConsent(false);
  }

  function handleCancelAiConsent() {
    setShowAiConsent(false); // Schalter bleibt aus
  }

  // Diktat (nur im geführten Aufruf via enableDictation). Läuft jetzt über die
  // Provider-Abstraktion startTranscription(...): Web Speech ist der Boden/Default,
  // Whisper nur als Opt-in bei vollständiger Konfiguration. Diktierter Text wird an
  // den vorhandenen narrative-State angehängt (denselben, den handleAutoDerive liest).
  // Keine Verdrahtung zu aiRawText.
  const [dictationState, setDictationState] = useState<TranscriptionState>('idle');
  const [dictationInterim, setDictationInterim] = useState('');
  const [dictationError, setDictationError] = useState('');
  const [dictationKind, setDictationKind] = useState<TranscriptionProviderKind | null>(null);
  const dictationSessionRef = useRef<TranscriptionSession | null>(null);

  const isRecording = dictationState === 'recording';
  const isTranscribing = dictationState === 'transcribing';
  const dictationActive = isRecording || isTranscribing;

  // Provider-Auflösung aus den aktuellen Settings (Web Speech als Boden, Whisper als Upgrade).
  // Whisper nur bei providerId === 'whisper' + Endpoint + Audio-Consent + Recorder-Support;
  // sonst (inkl. Default providerId === 'none') Web-Speech-Boden -> Diktat wird NICHT abgeschaltet.
  const tx = settings.transcription;
  const whisperReady =
    tx.providerId === 'whisper' &&
    !!tx.endpointUrl &&
    !!tx.audioConsentGivenAt &&
    isTranscriptionProviderAvailable('whisper');
  const webSpeechReady = isTranscriptionProviderAvailable('web_speech');
  const resolvedDictationKind: TranscriptionProviderKind | null = whisperReady
    ? 'whisper'
    : webSpeechReady
      ? 'web_speech'
      : null;
  const dictationAvailable = resolvedDictationKind !== null;

  useEffect(() => {
    // Bei Unmount Mikrofon sauber beenden (kein weiterlaufendes Mikrofon, kein Leak).
    return () => {
      if (dictationSessionRef.current) {
        dictationSessionRef.current.abort();
        dictationSessionRef.current = null;
      }
    };
  }, []);

  async function handleStartDictation() {
    if (!enableDictation || dictationActive) return;
    const kind = resolvedDictationKind;
    if (!kind) {
      setDictationError('Diktat ist in diesem Browser nicht verfügbar.');
      return;
    }
    setDictationError('');
    setDictationInterim('');
    setDictationKind(kind);
    try {
      const session = await startTranscription(
        kind,
        {
          language: tx.language || 'de-DE',
          endpointUrl: tx.endpointUrl,
          authMode: tx.authMode,
          apiKey: tx.apiKey,
          timeoutMs: 60000,
        },
        {
          // Nur web_speech feuert onInterim (Live-Vorschau); whisper ruft es nie (Batch).
          onInterim: (text) => setDictationInterim(text),
          // Beide Provider: finalen Text nicht-destruktiv an die Beschreibung anhängen.
          onFinal: (text) => {
            const clean = text.trim();
            if (clean) {
              setNarrative((prev) => (prev.trim() ? `${prev.trim()} ${clean}` : clean));
            }
            setDictationInterim('');
          },
          // Treibt die UI: recording -> (nur whisper) transcribing -> stopped(=zurück zu idle).
          onState: (s) => {
            if (s === 'stopped') {
              setDictationState('idle');
              setDictationInterim('');
              setDictationKind(null);
              dictationSessionRef.current = null;
            } else {
              setDictationState(s);
            }
          },
          onError: (err) => {
            setDictationError(err.message || 'Diktat konnte nicht ausgeführt werden.');
            setDictationState('idle');
            setDictationInterim('');
            setDictationKind(null);
            dictationSessionRef.current = null;
          },
        },
      );
      dictationSessionRef.current = session;
    } catch (err) {
      // reject: nicht unterstützt / Berechtigung verweigert / fehlender Endpoint -> freundlich, kein Crash.
      setDictationError(err instanceof Error ? err.message : 'Diktat konnte nicht gestartet werden.');
      setDictationState('idle');
      setDictationInterim('');
      setDictationKind(null);
      dictationSessionRef.current = null;
    }
  }

  function handleStopDictation() {
    // web_speech: endet -> finaler Text + 'stopped'. whisper: -> 'transcribing' -> finaler Text + 'stopped'.
    // Ref NICHT hier nullen: das Ergebnis kommt noch über die Handler; onState('stopped') räumt auf.
    dictationSessionRef.current?.stop();
  }

  function buildCase(): ProcessMiningObservationCase {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      name: name.trim() || `Fall ${existingCaseCount + 1}`,
      narrative: narrative.trim(),
      rawText: narrative.trim(),
      inputKind: 'narrative',
      sourceType: 'narrative',
      caseRef: caseRef.trim() || undefined,
      dateHints: dateHints.trim() || undefined,
      sourceNote: sourceNote.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  function reset() {
    setName('');
    setNarrative('');
    setCaseRef('');
    setDateHints('');
    setSourceNote('');
    setLastResult(null);
  }

  function handleRawSave() {
    if (!narrative.trim()) return;
    onAddCase(buildCase());
    reset();
  }

  // Einheitliche Ergebnisverarbeitung — identisch zur bisherigen Logik. Wird von
  // KI-Ergebnis, Heuristik-Fallback UND Paste-Import gleichermaßen genutzt (Formparität).
  function applyResult(result: DerivationResult) {
    const caseItem = buildCase();
    caseItem.id = result.cases[0]?.id ?? caseItem.id;
    const caseToUse = result.cases[0] ?? caseItem;
    setLastResult({ stepCount: result.observations.length, confidence: result.confidence });
    onAddDerived(caseToUse, result.observations, result.summary);
    reset();
  }

  async function handleAutoDerive() {
    const text = narrative.trim();
    if (!text) return;
    const outcome = await analysis.run({
      text,
      sourceName: caseName(),
      sourceType: 'narrative',
      settings,
      captureMode: 'case',
    });
    if (outcome.kind === 'result') {
      applyResult(outcome.result);
    }
    // 'blocked'/'error'/'needs-paste' werden NICHT hier behandelt,
    // sondern von <AnalysisStatus> angezeigt.
  }

  const canSubmit = narrative.trim().length > 10;

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50/40 p-5 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-semibold text-slate-700">
            Prozessfall beschreiben
          </label>
          <HelpPopover helpKey="pmv2.observations.describe" ariaLabel="Hilfe: Prozessfall beschreiben" />
        </div>
        <p className="text-xs text-slate-500">
          Beschreibe einen konkreten Ablauf so, wie er in der Praxis passiert. Die App erkennt die Prozessschritte automatisch.
        </p>
      </div>

      {lastResult && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{lastResult.stepCount} Schritte automatisch erkannt · Verlässlichkeit: {lastResult.confidence === 'high' ? 'hoch' : lastResult.confidence === 'medium' ? 'mittel' : 'niedrig'}</span>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Bezeichnung (optional)</label>
          <input
            type="text"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder={`Fall ${existingCaseCount + 1}`}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Beschreibung <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={5}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            placeholder={EXAMPLE_NARRATIVE}
            value={narrative}
            onChange={e => setNarrative(e.target.value)}
          />
        </div>

        {enableDictation && (dictationAvailable ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={dictationActive ? handleStopDictation : handleStartDictation}
              disabled={isTranscribing}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isTranscribing
                  ? 'border border-slate-200 text-slate-400 cursor-not-allowed'
                  : dictationActive
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'border border-cyan-300 text-cyan-700 hover:bg-cyan-50'
              }`}
            >
              {dictationActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isTranscribing ? 'Transkribiere…' : dictationActive ? 'Aufnahme beenden' : 'Diktieren'}
            </button>
            <p className="text-xs text-slate-400">
              {resolvedDictationKind === 'whisper'
                ? 'Die Aufnahme wird nach dem Beenden an den Transkriptions-Proxy gesendet. Der erkannte Text wird an die Beschreibung angehängt.'
                : 'Die Spracherkennung läuft im Browser. Diktierter Text wird an die Beschreibung angehängt.'}
            </p>
            {isRecording && dictationKind === 'whisper' && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Aufnahme läuft…
              </div>
            )}
            {isRecording && dictationKind !== 'whisper' && dictationInterim && (
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
                <span className="mr-1 text-[11px] font-medium text-cyan-900">Live:</span>
                {dictationInterim}
              </div>
            )}
            {isTranscribing && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Transkribiere… einen Moment bitte.
              </div>
            )}
            {dictationError && <p className="text-xs text-red-600">{dictationError}</p>}
          </div>
        ) : (
          <button
            type="button"
            disabled
            title="In diesem Browser nicht verfügbar"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-400 cursor-not-allowed"
          >
            <Mic className="w-4 h-4" />
            Diktieren (in diesem Browser nicht verfügbar)
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowExtra(s => !s)}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          {showExtra ? 'Zusatzfelder ausblenden' : 'Zusatzfelder einblenden (Fall-ID, Datum, Quelle)'}
        </button>

        {showExtra && (
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Fall-ID / Ticket-Nr.</label>
              <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="z.B. TKT-1234" value={caseRef} onChange={e => setCaseRef(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Zeitraum / Datum</label>
              <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="z.B. Januar 2024" value={dateHints} onChange={e => setDateHints(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Quelle / Notiz</label>
              <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="z.B. Workshop" value={sourceNote} onChange={e => setSourceNote(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex gap-2 text-xs text-slate-500">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          „Prozess automatisch erkennen" analysiert den Text und extrahiert Prozessschritte. Je konkreter die Beschreibung, desto besser das Ergebnis.
        </span>
      </div>

      {showAiToggle && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={aiOn}
              onChange={handleToggleAi}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="text-sm font-medium text-slate-700">Mit KI analysieren</span>
            <span className="text-xs text-slate-400">{aiOn ? '(KI aktiv)' : '(lokale Vorschau)'}</span>
          </label>
          {showAiConsent && !aiOn && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
              <p className="text-xs text-amber-900 leading-relaxed">
                Bei „Mit KI analysieren" wird der eingegebene Analysetext an den konfigurierten externen Endpoint
                gesendet (Ihr Proxy → Anthropic-API). Ohne diese Zustimmung wird nichts automatisch gesendet.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmAiConsent}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Zustimmen &amp; einschalten
                </button>
                <button
                  type="button"
                  onClick={handleCancelAiConsent}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={!canSubmit || isRunning}
          onClick={handleAutoDerive}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          {isRunning ? 'Wird erkannt…' : 'Prozess automatisch erkennen'}
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleRawSave}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nur als Rohtext speichern
        </button>
      </div>

      <AnalysisStatus
        state={analysis.state}
        onUseHeuristicFallback={() =>
          applyResult(
            analysis.runHeuristicFallback({ text: narrative.trim(), sourceName: caseName(), sourceType: 'narrative' }),
          )
        }
        onImportPasted={(aiText) => {
          const r = analysis.importPasted({ aiText, originalText: narrative.trim(), sourceName: caseName(), sourceType: 'narrative' });
          if (r.ok && r.result) applyResult(r.result);
        }}
        onRetry={handleAutoDerive}
      />
    </div>
  );
}
