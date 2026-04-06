export {};

declare global {
  interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
  }

  interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }

  interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message?: string;
  }

  interface SpeechRecognition extends EventTarget {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    maxAlternatives: number;

    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
    onend: ((this: SpeechRecognition, ev: Event) => void) | null;

    start(): void;
    stop(): void;
    abort(): void;
  }

  // eslint-disable-next-line no-var
  var SpeechRecognition: { new (): SpeechRecognition } | undefined;
  // eslint-disable-next-line no-var
  var webkitSpeechRecognition: { new (): SpeechRecognition } | undefined;
}
