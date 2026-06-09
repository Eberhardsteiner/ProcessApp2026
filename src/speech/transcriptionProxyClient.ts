// Browser-Client für den Transkriptions-Proxy (Vertrag "process-transcription-proxy-v1").
// Eng an runAiProxyRequest (src/ai/aiApiClient.ts) angelehnt: fetch POST, Header je
// authMode, JSON-Body, prüft json.text, gleiche Timeout-/Fehlerbehandlung.
//
// Der Client bekommt audioBase64 + mimeType FERTIG übergeben — Aufnahme und
// Base64-Konvertierung erfolgen separat (Prompt 3/6).

export type TranscriptionProxyAuthMode = 'none' | 'bearer';

export interface TranscriptionProxyRequestV1 {
  schemaVersion: 'process-transcription-proxy-v1';
  audioBase64: string;
  mimeType: string;
  language?: string;
}

export interface TranscriptionProxyResponseV1 {
  schemaVersion: 'process-transcription-proxy-v1';
  text: string;
}

export async function runTranscriptionProxyRequest(params: {
  endpointUrl: string;
  authMode: TranscriptionProxyAuthMode;
  apiKey: string;
  timeoutMs: number;
  audioBase64: string;
  mimeType: string;
  language?: string;
}): Promise<string> {
  const { endpointUrl, authMode, apiKey, timeoutMs, audioBase64, mimeType, language } = params;

  const trimmedUrl = endpointUrl.trim();
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    throw new Error('Endpoint URL muss mit http:// oder https:// beginnen');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authMode === 'bearer' && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body: TranscriptionProxyRequestV1 = {
      schemaVersion: 'process-transcription-proxy-v1',
      audioBase64,
      mimeType,
      ...(language ? { language } : {}),
    };

    const response = await fetch(trimmedUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Transkriptions-API Fehler ${response.status}: ${errorText || response.statusText}`);
    }

    const json = (await response.json()) as Partial<TranscriptionProxyResponseV1>;

    // Anders als beim KI-Proxy ist ein leerer String gültig (z. B. Stille/keine Sprache).
    if (typeof json.text !== 'string') {
      throw new Error('Ungültige API Antwort: Feld "text" fehlt oder ist kein String');
    }

    return json.text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout nach ${timeoutMs}ms überschritten`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
