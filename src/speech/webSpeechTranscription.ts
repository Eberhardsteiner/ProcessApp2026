import { isWebSpeechSupported } from './transcriptionProviders';

export interface WebSpeechSession {
  stop: () => void;
  abort: () => void;
}

export interface WebSpeechHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export function startWebSpeechTranscription(
  opts: { language: string; interimResults?: boolean; continuous?: boolean },
  h: WebSpeechHandlers
): WebSpeechSession | null {
  if (!isWebSpeechSupported()) {
    h.onError('Web Speech API wird von diesem Browser nicht unterstützt.');
    return null;
  }

  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    h.onError('Web Speech API ist nicht verfügbar.');
    return null;
  }

  const recognition = new Ctor();
  recognition.lang = opts.language;
  recognition.interimResults = opts.interimResults ?? true;
  recognition.continuous = opts.continuous ?? true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (ev: SpeechRecognitionEvent) => {
    const interimParts: string[] = [];

    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      const alt = res[0];
      const t = (alt?.transcript ?? '').trim();
      if (!t) continue;

      if (res.isFinal) {
        h.onFinal(t);
      } else {
        interimParts.push(t);
      }
    }

    const interimText = interimParts.join(' ').trim();
    h.onInterim(interimText);
  };

  recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
    const msg = ev.message ? `${ev.error}: ${ev.message}` : ev.error;
    h.onError(`Spracherkennung konnte nicht gestartet/fortgesetzt werden (${msg}).`);
  };

  recognition.onend = () => {
    h.onEnd();
  };

  try {
    recognition.start();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    h.onError(`Spracherkennung konnte nicht gestartet werden (${msg}).`);
    return null;
  }

  return {
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}
