// Self-contained Mikrofon-Audioaufnahme über getUserMedia + MediaRecorder.
// Liefert Blob + tatsächlichen MIME-Type, plus einen Base64-Helfer, dessen Ausgabe
// direkt als `audioBase64` an runTranscriptionProxyRequest (transcriptionProxyClient.ts)
// übergeben werden kann.
//
// Nur Web-Standard-APIs (keine Dependency). Mikrofon-Disziplin: auf JEDEM Pfad
// (stop, cancel, Fehler) werden alle MediaStream-Tracks gestoppt -> kein offener Stream.
// Headless nicht testbar (MediaRecorder/getUserMedia existieren nur im Browser);
// das Gate ist hier typecheck.

export interface AudioRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface AudioRecorderSession {
  /** Beendet die Aufnahme, gibt das Mikrofon frei und liefert das Ergebnis. */
  stop(): Promise<AudioRecording>;
  /** Bricht die Aufnahme ab, verwirft die Daten und gibt das Mikrofon frei. */
  cancel(): void;
}

export interface StartAudioRecordingOptions {
  preferredMimeTypes?: string[];
}

export interface AudioRecordingHandlers {
  /** Unerwarteter Abbruch nach Start (z. B. Mikrofon getrennt). */
  onError?: (error: Error) => void;
}

// Whisper-freundliche Reihenfolge; greift keiner, übernimmt der Browser seinen Default.
const DEFAULT_MIME_TYPES: string[] = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function mapGetUserMediaError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return new Error('Mikrofon-Zugriff wurde verweigert.');
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.name === 'OverconstrainedError') {
      return new Error('Kein Mikrofon gefunden.');
    }
    return new Error(`Mikrofon konnte nicht geöffnet werden: ${err.message || err.name}`);
  }
  return new Error('Mikrofon konnte nicht geöffnet werden.');
}

function pickSupportedMimeType(preferred: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined; // Browser-Default verwenden
  }
  return preferred.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Gate analog zu isWebSpeechSupported(): braucht getUserMedia UND MediaRecorder. */
export function isAudioRecordingSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const hasGetUserMedia = typeof navigator.mediaDevices?.getUserMedia === 'function';
  const hasMediaRecorder = typeof window.MediaRecorder !== 'undefined';
  // Ein konkreter MIME-Type ist nicht zwingend: ohne unterstützten Default-Typ nimmt
  // MediaRecorder seinen eigenen Standard (siehe pickSupportedMimeType/start()).
  return hasGetUserMedia && hasMediaRecorder;
}

export function startAudioRecording(
  opts?: StartAudioRecordingOptions,
  handlers?: AudioRecordingHandlers,
): Promise<AudioRecorderSession> {
  return new Promise<AudioRecorderSession>((resolve, reject) => {
    if (!isAudioRecordingSupported()) {
      reject(new Error('Audioaufnahme wird von diesem Browser nicht unterstützt.'));
      return;
    }

    const chosenMime = pickSupportedMimeType(opts?.preferredMimeTypes ?? DEFAULT_MIME_TYPES);

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const stopTracks = () => stream.getTracks().forEach((track) => track.stop());

        let recorder: MediaRecorder;
        try {
          recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream);
        } catch (err) {
          stopTracks();
          reject(new Error(`MediaRecorder konnte nicht erstellt werden: ${errMsg(err)}`));
          return;
        }

        const chunks: Blob[] = [];
        let settled = false; // Start-Promise bereits resolved/rejected?
        let cancelled = false;
        let startedAt = 0;
        let finalize: ((recording: AudioRecording) => void) | null = null;

        const buildRecording = (): AudioRecording => {
          const mimeType = recorder.mimeType || chosenMime || 'audio/webm';
          const durationMs = startedAt > 0 ? Math.max(0, nowMs() - startedAt) : 0;
          return { blob: new Blob(chunks, { type: mimeType }), mimeType, durationMs };
        };

        const session: AudioRecorderSession = {
          stop(): Promise<AudioRecording> {
            return new Promise<AudioRecording>((res, rej) => {
              if (recorder.state === 'inactive') {
                stopTracks();
                res(buildRecording());
                return;
              }
              finalize = res;
              try {
                recorder.stop(); // löst finales dataavailable + onstop aus
              } catch (err) {
                stopTracks();
                rej(new Error(`Aufnahme konnte nicht beendet werden: ${errMsg(err)}`));
              }
            });
          },
          cancel(): void {
            cancelled = true;
            try {
              if (recorder.state !== 'inactive') recorder.stop();
            } catch {
              // Abbruch ist best-effort
            }
            stopTracks();
            chunks.length = 0;
          },
        };

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstart = () => {
          startedAt = nowMs();
          if (!settled) {
            settled = true;
            resolve(session);
          }
        };
        recorder.onstop = () => {
          stopTracks();
          if (cancelled) {
            chunks.length = 0;
            return;
          }
          if (finalize) {
            const done = finalize;
            finalize = null;
            done(buildRecording());
          }
        };
        recorder.onerror = () => {
          const error = new Error('Audioaufnahme wurde unerwartet unterbrochen.');
          stopTracks();
          if (!settled) {
            settled = true;
            reject(error);
          } else {
            handlers?.onError?.(error);
          }
        };

        try {
          recorder.start(); // resolved das Promise erst über recorder.onstart
        } catch (err) {
          stopTracks();
          if (!settled) {
            settled = true;
            reject(new Error(`Aufnahme konnte nicht gestartet werden: ${errMsg(err)}`));
          }
        }
      })
      .catch((err: unknown) => {
        reject(mapGetUserMediaError(err));
      });
  });
}

/**
 * Wandelt einen Audio-Blob in reines Base64 (ohne `data:<mime>;base64,`-Präfix),
 * passend direkt als `audioBase64` für runTranscriptionProxyRequest.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Audio konnte nicht als Base64 gelesen werden.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unerwartetes FileReader-Ergebnis (kein String).'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
