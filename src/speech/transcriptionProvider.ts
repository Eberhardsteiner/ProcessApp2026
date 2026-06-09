// Einheitliche Ausführungs-Abstraktion fürs Diktat.
//
// Der Aufrufer (Prompt 6) startet eine Transkription über EINEN Vertrag und muss
// nicht zwischen STREAMING (Web Speech) und BATCH (Whisper) unterscheiden:
//   - web_speech: liefert laufend `onInterim` (Zwischenstand) + mehrfach `onFinal`.
//   - whisper:    nimmt Audio auf (`recording`), transkribiert nach `stop()`
//                 (`transcribing`) und liefert EINMALIG `onFinal` (kein `onInterim`).
//
// Diese Datei KOMPONIERT nur vorhandene Bausteine:
//   - webSpeechTranscription.ts   (Streaming-Spracherkennung)
//   - audioRecorder.ts            (Mikrofon-Aufnahme als Blob)
//   - transcriptionProxyClient.ts (Upload an den Whisper-Proxy)
//
// Rein additiv, nirgends verdrahtet, keine neue Dependency. Browserabhängig
// (Web Speech + MediaRecorder + fetch) -> typecheck ist das Gate; der echte Test
// folgt mit der Verdrahtung in Prompt 6.
//
// Robustheit:
//   - Doppel-stop() und stop() nach abort() sind idempotent (No-op).
//   - Nach abort()/Termination feuern KEINE Handler mehr (kein onFinal/onState),
//     auch wenn eine Whisper-Transkription noch unterwegs war.
//   - Mikrofon/Recognition werden auf jedem Pfad freigegeben (stützt sich auf die
//     Cleanup-Disziplin von audioRecorder/webSpeechTranscription).

import { isWebSpeechSupported } from './transcriptionProviders';
import { startWebSpeechTranscription } from './webSpeechTranscription';
import { isAudioRecordingSupported, startAudioRecording, blobToBase64 } from './audioRecorder';
import { runTranscriptionProxyRequest } from './transcriptionProxyClient';

export type TranscriptionState = 'idle' | 'recording' | 'transcribing' | 'stopped';

// Eigene, von der Metadaten-Registry (transcriptionProviders.ts) entkoppelte Union.
// Dropdown/Settings (settings.transcription.providerId ist `string`) kommen in Prompt 5.
export type TranscriptionProviderKind = 'web_speech' | 'whisper';

export interface TranscriptionHandlers {
  /** Zwischenstand (nur streaming/web_speech; bei whisper nie aufgerufen). */
  onInterim?: (text: string) => void;
  /**
   * Anhängbarer finaler Text. Kann bei streaming MEHRFACH feuern, bei whisper
   * EINMAL. Der Aufrufer hängt jeden Aufruf an.
   */
  onFinal: (text: string) => void;
  onState?: (state: TranscriptionState) => void;
  onError?: (error: Error) => void;
}

export interface TranscriptionConfig {
  language: string;
  // whisper-spezifisch (für web_speech irrelevant):
  endpointUrl?: string;
  authMode?: 'none' | 'bearer';
  apiKey?: string;
  timeoutMs?: number;
}

export interface TranscriptionSession {
  /** Beendet die Erfassung sauber (whisper: transkribiert noch, Ergebnis via onFinal). */
  stop(): void;
  /** Bricht sofort ab, gibt Ressourcen frei, liefert KEIN Ergebnis mehr. */
  abort(): void;
}

const DEFAULT_TIMEOUT_MS = 60000;

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// Zentrale Emissions-Schleuse: nach Termination (done) wird NICHTS mehr durchgereicht.
// Der terminale Zustand 'stopped' wird ausschließlich über finalizeStopped() und
// genau EINMAL emittiert.
interface EmitContext {
  emitInterim(text: string): void;
  emitFinal(text: string): void;
  emitError(error: Error): void;
  emitState(state: TranscriptionState): void;
  finalizeStopped(): void;
  isDone(): boolean;
}

function createEmitContext(handlers: TranscriptionHandlers): EmitContext {
  let done = false;
  return {
    emitInterim(text: string): void {
      if (!done) handlers.onInterim?.(text);
    },
    emitFinal(text: string): void {
      if (!done) handlers.onFinal(text);
    },
    emitError(error: Error): void {
      if (!done) handlers.onError?.(error);
    },
    emitState(state: TranscriptionState): void {
      if (!done) handlers.onState?.(state);
    },
    finalizeStopped(): void {
      if (done) return;
      // done VOR dem Emit setzen: ein reentranter stop()/abort() aus dem
      // onState-Callback heraus wird so sauber als No-op behandelt.
      done = true;
      handlers.onState?.('stopped');
    },
    isDone(): boolean {
      return done;
    },
  };
}

/**
 * Verfügbarkeit eines Providers (reine Capability-Prüfung).
 * Die Endpoint-KONFIGURATION ist Settings-Sache und wird hier bewusst NICHT geprüft.
 */
export function isTranscriptionProviderAvailable(kind: TranscriptionProviderKind): boolean {
  if (kind === 'web_speech') return isWebSpeechSupported();
  if (kind === 'whisper') return isAudioRecordingSupported();
  return false;
}

/**
 * Startet die Erfassung. Resolved, sobald sie läuft; rejected bei
 * „nicht unterstützt" / Berechtigungsfehler / fehlendem Endpoint (whisper).
 */
export async function startTranscription(
  kind: TranscriptionProviderKind,
  config: TranscriptionConfig,
  handlers: TranscriptionHandlers,
): Promise<TranscriptionSession> {
  if (kind === 'web_speech') return startWebSpeechProvider(config, handlers);
  if (kind === 'whisper') return startWhisperProvider(config, handlers);
  throw new Error(`Unbekannter Transkriptions-Provider: ${String(kind)}`);
}

// --- web_speech (streaming) -------------------------------------------------

async function startWebSpeechProvider(
  config: TranscriptionConfig,
  handlers: TranscriptionHandlers,
): Promise<TranscriptionSession> {
  const ctx = createEmitContext(handlers);
  let started = false;
  let startupError: string | null = null;
  let stopRequested = false;

  // startWebSpeechTranscription ruft h.onError SYNCHRON auf den null-Pfaden auf.
  // Solange `started` false ist, fangen wir die Meldung ab und rejecten damit
  // (statt zusätzlich handlers.onError zu feuern).
  const webSession = startWebSpeechTranscription(
    { language: config.language, interimResults: true, continuous: true },
    {
      onInterim: (text: string) => ctx.emitInterim(text),
      onFinal: (text: string) => ctx.emitFinal(text),
      onError: (message: string) => {
        if (!started) {
          startupError = message;
          return;
        }
        ctx.emitError(new Error(message));
      },
      onEnd: () => ctx.finalizeStopped(),
    },
  );

  if (!webSession) {
    throw new Error(startupError ?? 'Web Speech API wird von diesem Browser nicht unterstützt.');
  }

  const session: TranscriptionSession = {
    stop(): void {
      if (ctx.isDone() || stopRequested) return;
      stopRequested = true;
      try {
        webSession.stop(); // löst später onEnd -> finalizeStopped() aus
      } catch {
        // best-effort
      }
    },
    abort(): void {
      if (ctx.isDone()) return;
      try {
        webSession.abort(); // Recognition sofort beenden (Ressource frei)
      } catch {
        // best-effort
      }
      ctx.finalizeStopped(); // 'stopped' + ab hier keine Handler mehr
    },
  };

  started = true;
  ctx.emitState('recording');
  return session;
}

// --- whisper (batch) --------------------------------------------------------

async function startWhisperProvider(
  config: TranscriptionConfig,
  handlers: TranscriptionHandlers,
): Promise<TranscriptionSession> {
  const endpointUrl = config.endpointUrl?.trim();
  if (!endpointUrl) {
    throw new Error('Whisper-Transkription benötigt eine Endpoint-URL (config.endpointUrl).');
  }

  const ctx = createEmitContext(handlers);

  // Unerwarteter Abbruch nach Start (z. B. Mikrofon getrennt): Fehler melden + beenden.
  const recorderSession = await startAudioRecording(undefined, {
    onError: (err: Error) => {
      ctx.emitError(err);
      ctx.finalizeStopped();
    },
  });

  let stopRequested = false;

  // Fire-and-forget: WIRFT NIE; jedes Ergebnis und jeder Fehler läuft über Handler.
  const runStopPipeline = async (): Promise<void> => {
    try {
      ctx.emitState('transcribing');
      const recording = await recorderSession.stop(); // gibt Mikro über onstop frei
      if (ctx.isDone()) return; // zwischenzeitlich abgebrochen
      const audioBase64 = await blobToBase64(recording.blob);
      if (ctx.isDone()) return;
      const text = await runTranscriptionProxyRequest({
        endpointUrl,
        authMode: config.authMode ?? 'none',
        apiKey: config.apiKey ?? '',
        timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        audioBase64,
        mimeType: recording.mimeType,
        language: config.language,
      });
      if (ctx.isDone()) return;
      ctx.emitFinal(text); // EINMALIG
    } catch (err) {
      ctx.emitError(toError(err));
    } finally {
      ctx.finalizeStopped();
    }
  };

  const session: TranscriptionSession = {
    stop(): void {
      if (ctx.isDone() || stopRequested) return;
      stopRequested = true;
      void runStopPipeline();
    },
    abort(): void {
      if (ctx.isDone()) return;
      // Läuft die Aufnahme noch: cancel() gibt das Mikro frei und verwirft die Daten.
      // Ist stop() schon unterwegs, gibt der Recorder das Mikro über onstop selbst frei
      // (kein zweites recorder.stop() provozieren); finalizeStopped() unterdrückt das
      // schwebende Transkriptionsergebnis.
      if (!stopRequested) {
        recorderSession.cancel();
      }
      ctx.finalizeStopped(); // 'stopped', KEINE Transkription
    },
  };

  ctx.emitState('recording');
  return session;
}
