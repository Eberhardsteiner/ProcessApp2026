import type { AiApiAuthMode } from '../settings/appSettings';

export interface AiProxyRequestV1 {
  schemaVersion: 'process-ai-proxy-v1';
  prompt: string;
}

export interface AiProxyResponseV1 {
  schemaVersion: 'process-ai-proxy-v1';
  text: string;
}

export async function runAiProxyRequest(params: {
  endpointUrl: string;
  authMode: AiApiAuthMode;
  apiKey: string;
  timeoutMs: number;
  prompt: string;
}): Promise<string> {
  const { endpointUrl, authMode, apiKey, timeoutMs, prompt } = params;

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
    } else if (authMode === 'x_api_key' && apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const body: AiProxyRequestV1 = {
      schemaVersion: 'process-ai-proxy-v1',
      prompt,
    };

    const response = await fetch(trimmedUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API Fehler ${response.status}: ${errorText || response.statusText}`);
    }

    const json = await response.json() as Partial<AiProxyResponseV1>;

    if (!json.text || typeof json.text !== 'string') {
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
